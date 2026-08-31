import { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Conversation, Demand, Proposal, ServiceRating, User } from '@rubli/shared';
import { getConversations, getDemands, getProposals, getRatings, saveConversations, saveDemands, saveRatings } from '../storage/localStore';
import { ChatScreen } from './ChatScreen';

const BRAND = '#081B33';
const ACCENT = '#F28C28';
const STATUS: Record<Demand['status'], string> = {
  draft: 'Rascunho', open: 'Aberta', negotiating: 'Negociando', accepted: 'Aceita',
  in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada',
};

interface Props { user: User; profiles: User[]; onClose: () => void; }

function id(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
function money(value: number) { return `R$ ${value.toFixed(2).replace('.', ',')}`; }

export function TestNegotiationsScreen({ user, profiles, onClose }: Props) {
  const [demands, setDemands] = useState<Demand[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [ratings, setRatings] = useState<ServiceRating[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [ratingDemand, setRatingDemand] = useState<Demand | null>(null);
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingComment, setRatingComment] = useState('');

  async function reload() {
    const [nextDemands, nextProposals, nextConversations, nextRatings] = await Promise.all([
      getDemands(), getProposals(), getConversations(), getRatings(),
    ]);
    setDemands(nextDemands);
    setProposals(nextProposals);
    setConversations(nextConversations);
    setRatings(nextRatings);
  }

  useEffect(() => { reload().catch(() => Alert.alert('Erro', 'Não foi possível carregar as negociações.')); }, [user.id]);

  const myProposals = proposals.filter((item) => item.providerId === user.id);
  const myDemands = demands.filter((item) => item.requesterId === user.id);

  async function openConversation(demand: Demand, providerId: string) {
    let conversation = conversations.find((item) => item.demandId === demand.id && item.customerId === demand.requesterId && item.providerId === providerId);
    if (!conversation) {
      const now = new Date().toISOString();
      conversation = { id: id('conv'), demandId: demand.id, customerId: demand.requesterId, providerId, createdAt: now, updatedAt: now };
      const next = [conversation, ...conversations];
      setConversations(next);
      await saveConversations(next);
    }
    setActiveConversation(conversation);
  }

  async function updateDemandStatus(demand: Demand, status: Demand['status']) {
    const next = demands.map((item) => item.id === demand.id ? { ...item, status, updatedAt: new Date().toISOString() } : item);
    setDemands(next);
    await saveDemands(next);
  }

  async function startService(demand: Demand) {
    if (demand.status !== 'accepted') return;
    await updateDemandStatus(demand, 'in_progress');
    Alert.alert('Serviço iniciado', 'A demanda agora está marcada como Em andamento.');
  }

  async function completeService(demand: Demand) {
    if (demand.status !== 'in_progress') return;
    await updateDemandStatus(demand, 'completed');
    Alert.alert('Serviço concluído', 'O cliente já pode avaliar o atendimento.');
  }

  async function submitRating() {
    if (!ratingDemand) return;
    const accepted = proposals.find((item) => item.demandId === ratingDemand.id && item.status === 'accepted');
    if (!accepted) return;
    if (ratings.some((item) => item.demandId === ratingDemand.id && item.customerId === user.id)) {
      Alert.alert('Avaliação já enviada', 'Esta demanda já foi avaliada.');
      setRatingDemand(null);
      return;
    }
    const rating: ServiceRating = {
      id: id('rating'),
      demandId: ratingDemand.id,
      providerId: accepted.providerId,
      customerId: user.id,
      rating: ratingValue,
      comment: ratingComment.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    const next = [rating, ...ratings];
    await saveRatings(next);
    setRatings(next);
    setRatingDemand(null);
    setRatingComment('');
    setRatingValue(5);
    Alert.alert('Avaliação enviada', 'Obrigado por avaliar o atendimento.');
  }

  if (activeConversation) {
    return (
      <ChatScreen
        conversation={activeConversation}
        currentUserId={user.id}
        otherUserName={user.id === activeConversation.customerId ? profiles.find((item) => item.id === activeConversation.providerId)?.name : profiles.find((item) => item.id === activeConversation.customerId)?.name}
        onBack={() => { setActiveConversation(null); reload().catch(() => undefined); }}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Negociações</Text>
          <Text style={styles.subtitle}>{user.role === 'provider' ? 'Propostas, serviços e conversas' : 'Demandas, propostas e avaliações'}</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}><Text style={styles.closeText}>Fechar</Text></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {user.role === 'provider' ? (
          myProposals.length === 0 ? <Text style={styles.empty}>Você ainda não enviou propostas.</Text> :
          myProposals.map((proposal) => {
            const demand = demands.find((item) => item.id === proposal.demandId);
            if (!demand) return null;
            const customer = profiles.find((item) => item.id === demand.requesterId);
            return (
              <View key={proposal.id} style={styles.card}>
                <View style={styles.row}><Text style={styles.category}>{demand.category}</Text><Text style={styles.status}>{STATUS[demand.status]}</Text></View>
                {demand.isUrgent && <Text style={styles.urgent}>⚡ PRECISO AGORA</Text>}
                <Text style={styles.cardTitle}>{demand.title}</Text>
                <Text style={styles.meta}>{customer?.name ?? 'Cliente'} · sua proposta {money(proposal.amount)}</Text>
                {proposal.message && <Text style={styles.message}>{proposal.message}</Text>}
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.outline} onPress={() => openConversation(demand, user.id).catch(() => Alert.alert('Erro', 'Não foi possível abrir a conversa.'))}><Text style={styles.outlineText}>Conversar</Text></TouchableOpacity>
                  {proposal.status === 'accepted' && demand.status === 'accepted' && <TouchableOpacity style={styles.primary} onPress={() => startService(demand)}><Text style={styles.primaryText}>Iniciar serviço</Text></TouchableOpacity>}
                  {proposal.status === 'accepted' && demand.status === 'in_progress' && <TouchableOpacity style={styles.primary} onPress={() => completeService(demand)}><Text style={styles.primaryText}>Concluir serviço</Text></TouchableOpacity>}
                </View>
              </View>
            );
          })
        ) : (
          myDemands.length === 0 ? <Text style={styles.empty}>Você ainda não publicou demandas.</Text> :
          myDemands.map((demand) => {
            const demandProposals = proposals.filter((item) => item.demandId === demand.id);
            const accepted = demandProposals.find((item) => item.status === 'accepted');
            const rated = ratings.some((item) => item.demandId === demand.id && item.customerId === user.id);
            return (
              <View key={demand.id} style={styles.card}>
                <View style={styles.row}><Text style={styles.category}>{demand.category}</Text><Text style={styles.status}>{STATUS[demand.status]}</Text></View>
                {demand.isUrgent && <Text style={styles.urgent}>⚡ PRECISO AGORA</Text>}
                <Text style={styles.cardTitle}>{demand.title}</Text>
                {demandProposals.length === 0 ? <Text style={styles.emptyInline}>Ainda não há propostas.</Text> : demandProposals.map((proposal) => {
                  const provider = profiles.find((item) => item.id === proposal.providerId);
                  return (
                    <View key={proposal.id} style={styles.proposal}>
                      <Text style={styles.amount}>{money(proposal.amount)}</Text>
                      <Text style={styles.meta}>{provider?.name ?? 'Prestador'} · {proposal.status}</Text>
                      {proposal.message && <Text style={styles.message}>{proposal.message}</Text>}
                      <View style={styles.actions}>
                        <TouchableOpacity style={styles.outline} onPress={() => openConversation(demand, proposal.providerId).catch(() => Alert.alert('Erro', 'Não foi possível abrir a conversa.'))}><Text style={styles.outlineText}>Conversar</Text></TouchableOpacity>
                        {proposal.status === 'accepted' && demand.status === 'completed' && !rated && <TouchableOpacity style={styles.primary} onPress={() => setRatingDemand(demand)}><Text style={styles.primaryText}>Avaliar</Text></TouchableOpacity>}
                        {proposal.status === 'accepted' && rated && <Text style={styles.rated}>★ Avaliado</Text>}
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={Boolean(ratingDemand)} transparent animationType="slide" onRequestClose={() => setRatingDemand(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.ratingCard}>
            <Text style={styles.ratingTitle}>Avalie o atendimento</Text>
            <Text style={styles.ratingSubtitle}>{ratingDemand?.title}</Text>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((value) => (
                <TouchableOpacity key={value} onPress={() => setRatingValue(value)}>
                  <Text style={[styles.star, value <= ratingValue && styles.starActive]}>★</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput value={ratingComment} onChangeText={setRatingComment} placeholder="Conte como foi o atendimento (opcional)" multiline style={styles.commentInput} />
            <TouchableOpacity style={styles.primaryFull} onPress={() => submitRating().catch(() => Alert.alert('Erro', 'Não foi possível salvar a avaliação.'))}><Text style={styles.primaryText}>Enviar avaliação</Text></TouchableOpacity>
            <TouchableOpacity style={styles.cancel} onPress={() => setRatingDemand(null)}><Text style={styles.cancelText}>Cancelar</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  actions: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' },
  primary: { backgroundColor: ACCENT, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 10 },
  primaryFull: { backgroundColor: ACCENT, borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 8 },
  primaryText: { color: '#FFF', fontWeight: '900' },
  outline: { borderWidth: 1, borderColor: BRAND, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 9 },
  outlineText: { color: BRAND, fontWeight: '900' },
  empty: { color: '#718096', textAlign: 'center', padding: 24 },
  emptyInline: { color: '#718096', marginTop: 4 },
  rated: { color: ACCENT, fontWeight: '900', paddingVertical: 9 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  ratingCard: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 30 },
  ratingTitle: { color: BRAND, fontSize: 25, fontWeight: '900' },
  ratingSubtitle: { color: '#68778C', marginTop: 4, marginBottom: 14 },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 10 },
  star: { color: '#D6DEE8', fontSize: 38 },
  starActive: { color: ACCENT },
  commentInput: { minHeight: 100, textAlignVertical: 'top', borderWidth: 1, borderColor: '#D8E0EA', borderRadius: 14, padding: 14, color: '#27364A', marginTop: 8 },
  cancel: { alignItems: 'center', padding: 13, marginTop: 2 },
  cancelText: { color: '#66768B', fontWeight: '800' },
});
