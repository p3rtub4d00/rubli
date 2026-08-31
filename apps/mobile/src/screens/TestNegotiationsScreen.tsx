import { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ChatMessage, Conversation, Demand, Proposal, User } from '@rubli/shared';
import { getConversations, getDemands, getMessages, getProposals, saveConversations } from '../storage/localStore';
import { ChatScreen } from './ChatScreen';

const BRAND = '#081B33';
const ACCENT = '#F28C28';

interface Props {
  user: User;
  profiles: User[];
  onClose: () => void;
}

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function money(value: number) {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

export function TestNegotiationsScreen({ user, profiles, onClose }: Props) {
  const [demands, setDemands] = useState<Demand[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);

  async function reload() {
    const [nextDemands, nextProposals, nextConversations] = await Promise.all([
      getDemands(),
      getProposals(),
      getConversations(),
    ]);
    setDemands(nextDemands);
    setProposals(nextProposals);
    setConversations(nextConversations);
  }

  useEffect(() => {
    reload().catch(() => Alert.alert('Erro', 'Não foi possível carregar as negociações.'));
  }, [user.id]);

  const myProposals = proposals.filter((item) => item.providerId === user.id);
  const myDemands = demands.filter((item) => item.requesterId === user.id);

  async function openConversation(demand: Demand, providerId: string) {
    let conversation = conversations.find(
      (item) => item.demandId === demand.id && item.customerId === demand.requesterId && item.providerId === providerId,
    );

    if (!conversation) {
      const now = new Date().toISOString();
      conversation = {
        id: id('conv'),
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

  if (activeConversation) {
    return (
      <ChatScreen
        conversation={activeConversation}
        currentUserId={user.id}
        otherUserName={
          user.id === activeConversation.customerId
            ? profiles.find((item) => item.id === activeConversation.providerId)?.name
            : profiles.find((item) => item.id === activeConversation.customerId)?.name
        }
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
            {user.role === 'provider' ? 'Suas propostas e conversas' : 'Suas demandas e propostas recebidas'}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>Fechar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {user.role === 'provider' ? (
          myProposals.length === 0 ? (
            <Text style={styles.empty}>Você ainda não enviou propostas.</Text>
          ) : (
            myProposals.map((proposal) => {
              const demand = demands.find((item) => item.id === proposal.demandId);
              if (!demand) return null;
              const customer = profiles.find((item) => item.id === demand.requesterId);
              return (
                <View key={proposal.id} style={styles.card}>
                  <View style={styles.row}>
                    <Text style={styles.category}>{demand.category}</Text>
                    <Text style={styles.status}>{proposal.status}</Text>
                  </View>
                  {demand.isUrgent && <Text style={styles.urgent}>⚡ PRECISO AGORA</Text>}
                  <Text style={styles.cardTitle}>{demand.title}</Text>
                  <Text style={styles.meta}>{customer?.name ?? 'Cliente'} · sua proposta {money(proposal.amount)}</Text>
                  {proposal.message && <Text style={styles.message}>{proposal.message}</Text>}
                  <View style={styles.actions}>
                    <TouchableOpacity style={styles.primary} onPress={() => openConversation(demand, user.id).catch(() => Alert.alert('Erro', 'Não foi possível abrir a conversa.'))}>
                      <Text style={styles.primaryText}>Conversar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )
        ) : (
          myDemands.length === 0 ? (
            <Text style={styles.empty}>Você ainda não publicou demandas.</Text>
          ) : (
            myDemands.map((demand) => {
              const demandProposals = proposals.filter((item) => item.demandId === demand.id);
              return (
                <View key={demand.id} style={styles.card}>
                  <View style={styles.row}>
                    <Text style={styles.category}>{demand.category}</Text>
                    <Text style={styles.status}>{demand.status}</Text>
                  </View>
                  {demand.isUrgent && <Text style={styles.urgent}>⚡ PRECISO AGORA</Text>}
                  <Text style={styles.cardTitle}>{demand.title}</Text>
                  {demandProposals.length === 0 ? (
                    <Text style={styles.emptyInline}>Ainda não há propostas.</Text>
                  ) : (
                    demandProposals.map((proposal) => {
                      const provider = profiles.find((item) => item.id === proposal.providerId);
                      return (
                        <View key={proposal.id} style={styles.proposal}>
                          <Text style={styles.amount}>{money(proposal.amount)}</Text>
                          <Text style={styles.meta}>{provider?.name ?? 'Prestador'} · {proposal.status}</Text>
                          {proposal.message && <Text style={styles.message}>{proposal.message}</Text>}
                          <View style={styles.actions}>
                            <TouchableOpacity style={styles.outline} onPress={() => openConversation(demand, proposal.providerId).catch(() => Alert.alert('Erro', 'Não foi possível abrir a conversa.'))}>
                              <Text style={styles.outlineText}>Conversar</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              );
            })
          )
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  header: { backgroundColor: '#FFF', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E5EAF0', flexDirection: 'row', alignItems: 'center' },
  headerText: { flex: 1 },
  title: { color: BRAND, fontSize: 24, fontWeight: '900' },
  subtitle: { color: '#718096', marginTop: 3 },
  closeButton: { backgroundColor: BRAND, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9 },
  closeText: { color: '#FFF', fontWeight: '800' },
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E3E9F0', borderRadius: 16, padding: 15, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  category: { color: ACCENT, fontWeight: '900' },
  status: { color: '#637389', fontSize: 12, fontWeight: '700' },
  urgent: { color: ACCENT, fontWeight: '900', marginBottom: 6 },
  cardTitle: { color: BRAND, fontSize: 18, fontWeight: '900', marginBottom: 6 },
  meta: { color: '#68778C', marginBottom: 6 },
  message: { color: '#34465D', lineHeight: 19, marginBottom: 8 },
  proposal: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E8EDF3' },
  amount: { color: BRAND, fontWeight: '900', fontSize: 17, marginBottom: 3 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  primary: { backgroundColor: ACCENT, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 10 },
  primaryText: { color: '#FFF', fontWeight: '900' },
  outline: { borderWidth: 1, borderColor: BRAND, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 9 },
  outlineText: { color: BRAND, fontWeight: '900' },
  empty: { color: '#718096', textAlign: 'center', padding: 24 },
  emptyInline: { color: '#718096', marginTop: 4 },
});
