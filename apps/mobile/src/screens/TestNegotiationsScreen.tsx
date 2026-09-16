import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Conversation, Demand, Proposal, Rating, User } from '@rubli/shared';
import {
  getConversations,
  getDemands,
  getProposals,
  saveConversations,
  saveDemands,
  saveProposals,
} from '../storage/localStore';
import { getRatings } from '../profile/profileStore';
import { ChatScreen } from './ChatScreen';
import { PublicProfileScreen } from './PublicProfileScreen';
import { apiAcceptProposal, apiConfirmProposal, apiCounterProposal, apiServiceAction } from '../api/client';

const BRAND = '#081B33';
const ACCENT = '#F28C28';

interface Props {
  user: User;
  profiles: User[];
  onClose: () => void;
}

const makeId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const money = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`;

const isOperationalDemand = (demand: Demand) =>
  !['completed', 'cancelled'].includes(demand.status);

export function TestNegotiationsScreen({ user, profiles, onClose }: Props) {
  const [demands, setDemands] = useState<Demand[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [activeConversation, setActiveConversation] =
    useState<Conversation | null>(null);
  const [profileTarget, setProfileTarget] = useState<User | null>(null);

  async function reload() {
    const [storedDemands, storedProposals, storedConversations, storedRatings] =
      await Promise.all([
        getDemands(),
        getProposals(),
        getConversations(),
        getRatings(),
      ]);

    setDemands(storedDemands);
    setProposals(storedProposals);
    setConversations(storedConversations);
    setRatings(storedRatings);
  }

  useEffect(() => {
    reload().catch(() =>
      Alert.alert('Erro', 'Não foi possível carregar as negociações.')
    );
  }, [user.id]);

  const myProposals = proposals.filter((proposal) => {
    if (proposal.providerId !== user.id) return false;
    const demand = demands.find((item) => item.id === proposal.demandId);
    return Boolean(demand && isOperationalDemand(demand));
  });

  const myDemands = demands.filter(
    (demand) => demand.requesterId === user.id && isOperationalDemand(demand)
  );

  async function openConversation(demand: Demand, providerId: string) {
    let conversation = conversations.find(
      (item) =>
        item.demandId === demand.id &&
        item.customerId === demand.requesterId &&
        item.providerId === providerId
    );

    if (!conversation) {
      const now = new Date().toISOString();
      conversation = {
        id: makeId('conv'),
        demandId: demand.id,
        customerId: demand.requesterId,
        providerId,
        createdAt: now,
        updatedAt: now,
      };

      const next = [conversation, ...conversations];
      setConversations(next);
      await saveConversations(next);
    }

    setActiveConversation(conversation);
  }

  async function acceptProposal(proposal: Proposal) {
    const demand = demands.find((item) => item.id === proposal.demandId);
    if (!demand || proposal.status !== 'pending') {
      throw new Error('Proposta inválida.');
    }

    const result = await apiAcceptProposal(proposal.id, user.id);
    const nextProposals = proposals.map((item) => item.id === result.proposal.id ? result.proposal : item);
    const nextDemands = demands.map((item) => item.id === result.demand.id ? result.demand : item);

    await saveProposals(nextProposals);
    await saveDemands(nextDemands);
    setProposals(nextProposals);
    setDemands(nextDemands);
  }

  async function confirmProvider(proposal: Proposal) {
    if (proposal.status !== 'pending' && proposal.status !== 'accepted') throw new Error('A proposta não pode ser confirmada.');

    const result = await apiConfirmProposal(proposal.id, user.id);
    const nextProposals = proposals.map((item) => item.id === result.proposal.id ? result.proposal : item);
    const nextDemands = demands.map((item) => item.id === result.demand.id ? result.demand : item);

    await saveProposals(nextProposals);
    await saveDemands(nextDemands);
    setProposals(nextProposals);
    setDemands(nextDemands);
  }

  async function counterProposal(
    proposal: Proposal,
    amount: number,
    message?: string
  ) {
    if (proposal.status !== 'pending') {
      throw new Error('Só é possível contrapropor uma negociação pendente.');
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Informe um valor válido.');
    }

    const demand = demands.find((item) => item.id === proposal.demandId);
    if (
      !demand ||
      (user.id !== demand.requesterId && user.id !== proposal.providerId)
    ) {
      throw new Error('Sem permissão.');
    }

    const result = await apiCounterProposal(proposal.id, { userId: user.id, amount, message });
    const nextProposals = proposals.map((item) => item.id === proposal.id ? result.supersededProposal : item);
    nextProposals.unshift(result.proposal);
    const nextDemands = demands.map((item) => item.id === result.demand.id ? result.demand : item);

    await saveProposals(nextProposals);
    await saveDemands(nextDemands);
    setProposals(nextProposals);
    setDemands(nextDemands);
  }

  async function updateServiceStage(demand: Demand, action: 'en_route' | 'arrived' | 'start' | 'request_confirmation' | 'confirm_completion'): Promise<Demand> {
    const remoteAction = action === 'request_confirmation' ? 'request_completion' : action;
    const updated = await apiServiceAction(demand.id, { userId: user.id, action: remoteAction });
    const nextDemands = demands.map((item) => item.id === updated.id ? updated : item);
    await saveDemands(nextDemands);
    setDemands(nextDemands.filter(isOperationalDemand));
    return updated;
  }

  if (activeConversation) {
    const demand = demands.find(
      (item) => item.id === activeConversation.demandId
    );

    const currentProposal = proposals
      .filter(
        (item) =>
          item.demandId === activeConversation.demandId &&
          item.providerId === activeConversation.providerId
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    return (
      <ChatScreen
        conversation={activeConversation}
        currentUserId={user.id}
        otherUserName={
          user.id === activeConversation.customerId
            ? profiles.find((item) => item.id === activeConversation.providerId)?.name
            : profiles.find((item) => item.id === activeConversation.customerId)?.name
        }
        onAcceptProposal={currentProposal ? acceptProposal : undefined}
        onConfirmAgreement={currentProposal ? confirmProvider : undefined}
        onCounterProposal={currentProposal ? counterProposal : undefined}
        onServiceAction={demand ? updateServiceStage : undefined}
        onBack={() => {
          setActiveConversation(null);
          reload().catch(() => undefined);
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Negociações</Text>
          <Text style={styles.subtitle}>
            {user.role === 'provider'
              ? 'Suas propostas e conversas'
              : 'Suas demandas e propostas recebidas'}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>Fechar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {user.role === 'provider' ? (
          myProposals.length ? (
            myProposals.map((proposal) => {
              const demand = demands.find((item) => item.id === proposal.demandId);
              if (!demand) return null;
              const customer = profiles.find(
                (item) => item.id === demand.requesterId
              );

              return (
                <View key={proposal.id} style={styles.card}>
                  <Text style={styles.category}>{demand.category}</Text>
                  <Text style={styles.cardTitle}>{demand.title}</Text>
                  <Text style={styles.meta}>
                    {customer?.name ?? 'Cliente'} · {money(proposal.amount)} · {proposal.status}
                  </Text>
                  <TouchableOpacity
                    style={styles.primary}
                    onPress={() => openConversation(demand, user.id).catch(() => undefined)}
                  >
                    <Text style={styles.primaryText}>Conversar</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          ) : (
            <Text style={styles.empty}>Você ainda não possui negociações ativas.</Text>
          )
        ) : myDemands.length ? (
          myDemands.map((demand) => (
            <View key={demand.id} style={styles.card}>
              <Text style={styles.category}>{demand.category}</Text>
              <Text style={styles.cardTitle}>{demand.title}</Text>
              {proposals
                .filter((proposal) => proposal.demandId === demand.id)
                .map((proposal) => {
                  const provider = profiles.find(
                    (item) => item.id === proposal.providerId
                  );
                  return (
                    <View key={proposal.id} style={styles.proposal}>
                      <Text style={styles.amount}>{money(proposal.amount)}</Text>
                      <Text style={styles.meta}>
                        {provider?.name ?? 'Prestador'} · {proposal.status}
                      </Text>
                      <View style={styles.actions}>
                        {provider && (
                          <TouchableOpacity
                            style={styles.outline}
                            onPress={() => setProfileTarget(provider)}
                          >
                            <Text style={styles.outlineText}>Ver perfil</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={styles.outline}
                          onPress={() =>
                            openConversation(demand, proposal.providerId).catch(() => undefined)
                          }
                        >
                          <Text style={styles.outlineText}>Conversar</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
            </View>
          ))
        ) : (
          <Text style={styles.empty}>Você não possui demandas ativas.</Text>
        )}
      </ScrollView>

      {profileTarget && (
        <PublicProfileScreen
          user={profileTarget}
          ratings={ratings}
          visible
          onClose={() => setProfileTarget(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  header: {
    backgroundColor: '#FFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5EAF0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: { flex: 1 },
  title: { color: BRAND, fontSize: 24, fontWeight: '900' },
  subtitle: { color: '#718096', marginTop: 3 },
  closeButton: {
    backgroundColor: BRAND,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  closeText: { color: '#FFF', fontWeight: '800' },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E3E9F0',
    borderRadius: 16,
    padding: 15,
    marginBottom: 12,
  },
  category: { color: ACCENT, fontWeight: '900' },
  cardTitle: { color: BRAND, fontSize: 18, fontWeight: '900', marginTop: 5 },
  meta: { color: '#68778C', marginBottom: 7 },
  proposal: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E8EDF3',
  },
  amount: { color: BRAND, fontWeight: '900', fontSize: 17 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  primary: {
    backgroundColor: ACCENT,
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  primaryText: { color: '#FFF', fontWeight: '900' },
  outline: {
    borderWidth: 1,
    borderColor: BRAND,
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  outlineText: { color: BRAND, fontWeight: '900' },
  empty: { color: '#718096', textAlign: 'center', padding: 24 },
});
