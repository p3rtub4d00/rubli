import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Conversation, Demand, Proposal, ServiceRating, User } from '@rubli/shared';
import { getDemands, getProposals, getRatings, getUsers, saveDemands, saveProposals } from '../storage/localStore';
import { subscribeRealtime } from '../api/realtime';
import { ChatScreen } from './ChatScreen';

interface Props { user: User; conversation: Conversation; onBack: () => void; }
const BRAND = '#081B33';
const ACCENT = '#F28C28';
const BG = '#F7F9FC';
function money(value: number) { return `R$ ${value.toFixed(2).replace('.', ',')}`; }

export function NegotiationChatScreen({ user, conversation, onBack }: Props) {
  const [demands, setDemands] = useState<Demand[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [providerProfile, setProviderProfile] = useState<User | null>(null);
  const [providerRatings, setProviderRatings] = useState<ServiceRating[]>([]);
  const [firstAmount, setFirstAmount] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [sendingFirst, setSendingFirst] = useState(false);

  async function reload() {
    const [nextDemands, nextProposals, users, ratings] = await Promise.all([getDemands(), getProposals(), getUsers(), getRatings()]);
    setDemands(nextDemands); setProposals(nextProposals);
    const providerId = conversation.providerId;
    setProviderProfile(users.find((item) => item.id === providerId) ?? null);
    setProviderRatings(ratings.filter((item) => item.providerId === providerId));
  }

  useEffect(() => {
    let active = true;
    const run = async () => { try { await reload(); } catch { if (active) Alert.alert('Erro', 'Não foi possível carregar a negociação.'); } };
    run();
    const interval = setInterval(() => { reload().catch(() => undefined); }, 5000);
    const unsubscribe = subscribeRealtime((event) => {
      if (!event.demandId || event.demandId === conversation.demandId || event.proposalId) reload().catch(() => undefined);
    });
    return () => { active = false; clearInterval(interval); unsubscribe(); };
  }, [conversation.id, conversation.demandId, conversation.providerId]);

  const demand = demands.find((item) => item.id === conversation.demandId) ?? null;
  const demandProposals = proposals.filter((item) => item.demandId === conversation.demandId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const conversationProposals = demandProposals.filter((item) => item.providerId === conversation.providerId);
  const currentProposal = conversationProposals.at(-1) ?? null;
  const acceptedProviderId = demand?.acceptedProviderId ?? currentProposal?.providerId;
  const effectiveConversation: Conversation = acceptedProviderId && acceptedProviderId !== conversation.providerId ? { ...conversation, providerId: acceptedProviderId } : conversation;

  async function sendFirstProposal() {
    if (!demand || user.id !== conversation.providerId || currentProposal || sendingFirst) return;
    const amount = Number(firstAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) return Alert.alert('Valor inválido', 'Informe um valor maior que zero.');
    const now = new Date().toISOString();
    const proposal: Proposal = { id: `pro_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, demandId: demand.id, providerId: conversation.providerId, amount: Math.round(amount * 100) / 100, message: firstMessage.trim() || undefined, status: 'pending', version: 1, offeredBy: 'provider', createdAt: now };
    const nextProposals = [proposal, ...proposals];
    const nextDemands = demands.map((item) => item.id === demand.id ? { ...item, status: 'negotiating' as const, updatedAt: now } : item);
    setSendingFirst(true);
    try { await saveProposals(nextProposals); await saveDemands(nextDemands); setProposals(nextProposals); setDemands(nextDemands); setFirstAmount(''); setFirstMessage(''); }
    catch { Alert.alert('Erro', 'Não foi possível enviar sua proposta.'); }
    finally { setSendingFirst(false); }
  }

  async function acceptProposal(proposal: Proposal) {
    if (proposal.status !== 'pending') throw new Error('Esta oferta não está mais disponível para aceite.');
    const offerSide = proposal.offeredBy ?? 'provider';
    const recipientId = offerSide === 'provider' ? effectiveConversation.customerId : effectiveConversation.providerId;
    if (user.id !== recipientId) throw new Error('Somente quem recebeu a oferta pode aceitá-la.');
    const now = new Date().toISOString();
    const nextProposals = proposals.map((item) => item.id === proposal.id
      ? { ...item, customerConfirmedAt: user.id === effectiveConversation.customerId ? (item.customerConfirmedAt ?? now) : item.customerConfirmedAt, providerConfirmedAt: user.id === effectiveConversation.providerId ? (item.providerConfirmedAt ?? now) : item.providerConfirmedAt }
      : item);
    const updated = nextProposals.find((item) => item.id === proposal.id)!;
    const bothConfirmed = Boolean(updated.customerConfirmedAt && updated.providerConfirmedAt);
    const nextDemands = demands.map((item) => item.id === effectiveConversation.demandId ? { ...item, status: bothConfirmed ? 'accepted' as const : 'negotiating' as const, acceptedProviderId: bothConfirmed ? proposal.providerId : item.acceptedProviderId, updatedAt: now } : item);
    await saveProposals(nextProposals); await saveDemands(nextDemands); setProposals(nextProposals); setDemands(nextDemands);
  }

  async function confirmAgreement(proposal: Proposal) {
    if (proposal.status !== 'pending' && proposal.status !== 'accepted') throw new Error('A oferta ainda não pode ser confirmada.');
    if (user.id !== effectiveConversation.customerId && user.id !== effectiveConversation.providerId) throw new Error('Usuário não participa desta negociação.');
    const now = new Date().toISOString();
    const nextProposals = proposals.map((item) => item.id !== proposal.id ? item : user.id === effectiveConversation.customerId ? { ...item, customerConfirmedAt: item.customerConfirmedAt ?? now } : { ...item, providerConfirmedAt: item.providerConfirmedAt ?? now });
    const updatedProposal = nextProposals.find((item) => item.id === proposal.id)!;
    const bothConfirmed = Boolean(updatedProposal.customerConfirmedAt && updatedProposal.providerConfirmedAt);
    const nextDemands = demands.map((item) => item.id === effectiveConversation.demandId ? { ...item, status: bothConfirmed ? 'accepted' as const : 'negotiating' as const, acceptedProviderId: bothConfirmed ? proposal.providerId : item.acceptedProviderId, updatedAt: now } : item);
    await saveProposals(nextProposals); await saveDemands(nextDemands); setProposals(nextProposals); setDemands(nextDemands);
  }

  async function sendCounterProposal(proposal: Proposal, amount: number, message?: string) {
    if (proposal.status !== 'pending') throw new Error('Somente propostas pendentes podem receber contraproposta.');
    const participant = user.id === effectiveConversation.customerId || user.id === effectiveConversation.providerId;
    if (!participant) throw new Error('Usuário não participa desta negociação.');
    const offerSide = proposal.offeredBy ?? 'provider';
    const authorId = offerSide === 'provider' ? effectiveConversation.providerId : effectiveConversation.customerId;
    if (user.id === authorId) throw new Error('Quem enviou a oferta atual deve aguardar a resposta do outro lado.');
    const now = new Date().toISOString();
    const version = Math.max(0, ...proposals.filter((item) => item.demandId === effectiveConversation.demandId).map((item) => item.version ?? 1)) + 1;
    const counter: Proposal = { id: `pro_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, demandId: effectiveConversation.demandId, providerId: effectiveConversation.providerId, amount, message, status: 'pending', version, parentProposalId: proposal.id, offeredBy: user.id === effectiveConversation.customerId ? 'customer' : 'provider', createdAt: now };
    const nextProposals = proposals.map((item) => item.id === proposal.id ? { ...item, status: 'superseded' as const } : item); nextProposals.unshift(counter);
    const nextDemands = demands.map((item) => item.id === effectiveConversation.demandId ? { ...item, status: 'negotiating' as const, updatedAt: now } : item);
    await saveProposals(nextProposals); await saveDemands(nextDemands); setProposals(nextProposals); setDemands(nextDemands);
  }

  async function updateServiceStage(nextDemand: Demand, action: 'en_route' | 'arrived' | 'start' | 'request_confirmation' | 'confirm_completion') {
    const now = new Date().toISOString(); const isProvider = user.id === nextDemand.acceptedProviderId; const isCustomer = user.id === effectiveConversation.customerId;
    if (!isProvider && !isCustomer) throw new Error('Usuário não participa deste serviço.');
    const acceptedProposal = proposals.find((item) => item.demandId === nextDemand.id && item.providerId === nextDemand.acceptedProviderId && item.status === 'accepted');
    const bothConfirmed = Boolean(acceptedProposal?.customerConfirmedAt && acceptedProposal?.providerConfirmedAt);
    if (!bothConfirmed) throw new Error('O serviço só pode iniciar após a confirmação dos dois lados.');
    let status: Demand['status'] = nextDemand.status;
    if (action === 'en_route') { if (!isProvider || nextDemand.status !== 'accepted') throw new Error('Somente o prestador contratado pode informar que está a caminho.'); status = 'provider_en_route'; }
    if (action === 'arrived') { if (!isProvider || nextDemand.status !== 'provider_en_route') throw new Error('O prestador deve estar a caminho para registrar a chegada.'); status = 'provider_arrived'; }
    if (action === 'start') { if (!isProvider || nextDemand.status !== 'provider_arrived') throw new Error('Registre a chegada antes de iniciar o serviço.'); status = 'in_progress'; }
    if (action === 'request_confirmation') { if (!isProvider || nextDemand.status !== 'in_progress') throw new Error('Somente o prestador pode solicitar a confirmação da conclusão.'); status = 'awaiting_customer_confirmation'; }
    if (action === 'confirm_completion') { if (!isCustomer || nextDemand.status !== 'awaiting_customer_confirmation') throw new Error('Somente o cliente pode confirmar a conclusão.'); status = 'completed'; }
    const next = demands.map((item) => item.id === nextDemand.id ? { ...item, status, acceptedProviderId: item.acceptedProviderId ?? acceptedProviderId, ...(action === 'en_route' ? { enRouteAt: now } : {}), ...(action === 'arrived' ? { arrivedAt: now } : {}), ...(action === 'start' ? { startedAt: now } : {}), ...(action === 'request_confirmation' ? { completionRequestedAt: now } : {}), ...(action === 'confirm_completion' ? { customerConfirmedCompletionAt: now, completedAt: now } : {}), updatedAt: now } : item);
    await saveDemands(next); setDemands(next);
  }

  if (!demand) return <View style={styles.emptyScreen}><Text style={styles.emptyTitle}>Negociação indisponível</Text><TouchableOpacity style={styles.backButton} onPress={onBack}><Text style={styles.backText}>Voltar</Text></TouchableOpacity></View>;

  if (!currentProposal) {
    const providerCanOffer = user.id === conversation.providerId && ['open', 'negotiating'].includes(demand.status);
    return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}><TouchableOpacity style={styles.iconButton} onPress={onBack}><Text style={styles.iconText}>‹</Text></TouchableOpacity><View style={styles.headerText}><Text style={styles.title}>{providerCanOffer ? 'Enviar proposta' : 'Aguardando proposta'}</Text><Text style={styles.subtitle}>{demand.title}</Text></View></View>
      <ScrollView contentContainerStyle={styles.content}><View style={styles.demandCard}><Text style={styles.category}>{demand.category}</Text><Text style={styles.demandTitle}>{demand.title}</Text><Text style={styles.description}>{demand.description}</Text><Text style={styles.location}>📍 {demand.locationLabel}</Text>{demand.budget ? <Text style={styles.budget}>Cliente informa: {money(demand.budget)}</Text> : <Text style={styles.budget}>Cliente deixou o valor em aberto</Text>}</View>{providerCanOffer ? <View style={styles.offerCard}><Text style={styles.offerTitle}>Sua primeira proposta</Text><Text style={styles.help}>Informe quanto você cobra e, se quiser, deixe uma mensagem para o cliente.</Text><TextInput value={firstAmount} onChangeText={setFirstAmount} keyboardType="decimal-pad" placeholder="Ex.: 350,00" style={styles.input} /><TextInput value={firstMessage} onChangeText={setFirstMessage} placeholder="Mensagem ao cliente (opcional)" multiline style={[styles.input, styles.multiline]} /><TouchableOpacity style={styles.primary} onPress={() => sendFirstProposal().catch(() => undefined)} disabled={sendingFirst}><Text style={styles.primaryText}>{sendingFirst ? 'Enviando...' : 'Enviar primeira proposta'}</Text></TouchableOpacity></View> : <View style={styles.waitCard}><Text style={styles.waitTitle}>⏳ Aguardando o prestador</Text><Text style={styles.help}>Assim que uma proposta for enviada, a negociação aparecerá aqui.</Text></View>}</ScrollView>
    </KeyboardAvoidingView>;
  }

  return <ChatScreen conversation={effectiveConversation} currentUserId={user.id} otherUserName={user.id === effectiveConversation.customerId ? (providerProfile?.name ?? 'Prestador') : 'Cliente'} providerProfile={providerProfile} providerRatings={providerRatings} isCustomer={user.id === effectiveConversation.customerId} onBack={onBack} onAcceptProposal={acceptProposal} onConfirmAgreement={confirmAgreement} onCounterProposal={sendCounterProposal} onServiceAction={updateServiceStage} />;
}

const styles = StyleSheet.create({ screen:{flex:1,backgroundColor:BG},emptyScreen:{flex:1,backgroundColor:BG,alignItems:'center',justifyContent:'center',padding:24},emptyTitle:{color:BRAND,fontSize:21,fontWeight:'900',marginBottom:14},header:{backgroundColor:'#FFF',borderBottomWidth:1,borderBottomColor:'#E5EAF0',padding:14,flexDirection:'row',alignItems:'center'},iconButton:{width:42,height:42,borderRadius:21,backgroundColor:'#F3F6FA',alignItems:'center',justifyContent:'center'},iconText:{fontSize:30,color:BRAND},backText:{color:'#FFF',fontWeight:'900'},headerText:{flex:1,marginLeft:10},title:{color:BRAND,fontSize:20,fontWeight:'900'},subtitle:{color:'#718096',marginTop:3},content:{padding:16,paddingBottom:36},demandCard:{backgroundColor:'#FFF',borderRadius:18,padding:17,borderWidth:1,borderColor:'#E1E7EE',marginBottom:14},category:{color:ACCENT,fontWeight:'900',fontSize:12},demandTitle:{color:BRAND,fontWeight:'900',fontSize:22,marginTop:6},description:{color:'#56677A',lineHeight:21,marginTop:8},location:{color:'#405366',fontWeight:'700',marginTop:12},budget:{color:BRAND,fontWeight:'900',fontSize:16,marginTop:10},offerCard:{backgroundColor:'#FFF',borderRadius:18,padding:18,borderWidth:1,borderColor:'#E1E7EE'},offerTitle:{color:BRAND,fontSize:18,fontWeight:'900'},help:{color:'#718096',lineHeight:19,marginTop:6,marginBottom:12},input:{borderWidth:1,borderColor:'#D5DEE9',borderRadius:13,padding:13,fontSize:16,backgroundColor:'#FFF',marginBottom:10,color:BRAND},multiline:{minHeight:90,textAlignVertical:'top'},primary:{backgroundColor:ACCENT,borderRadius:13,paddingVertical:15,alignItems:'center'},primaryText:{color:'#FFF',fontWeight:'900',fontSize:15},waitCard:{backgroundColor:'#FFF8EF',borderRadius:18,padding:18,borderWidth:1,borderColor:'#F3D3A5'},waitTitle:{color:'#A56216',fontWeight:'900',fontSize:17},backButton:{backgroundColor:BRAND,borderRadius:12,paddingHorizontal:16,paddingVertical:11}});
