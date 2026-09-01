import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { ChatMessage, Conversation, Proposal, Demand, ServiceRating, User } from '@rubli/shared';
import { getDemands, getMessages, getProposals, saveMessages } from '../storage/localStore';
import { subscribeRealtime } from '../api/realtime';

const BRAND = '#081B33';
const ACCENT = '#F28C28';

interface ChatScreenProps {
  conversation: Conversation;
  currentUserId: string;
  otherUserName?: string;
  providerProfile?: User | null;
  providerRatings?: ServiceRating[];
  isCustomer?: boolean;
  onBack: () => void;
  onAcceptProposal?: (proposal: Proposal) => Promise<void>;
  onConfirmAgreement?: (proposal: Proposal) => Promise<void>;
  onCounterProposal?: (proposal: Proposal, amount: number, message?: string) => Promise<void>;
  onServiceAction?: (demand: Demand, action: 'en_route' | 'arrived' | 'start' | 'request_confirmation' | 'confirm_completion') => Promise<void>;
}

function newMessageId() { return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
function money(value: number) { return `R$ ${value.toFixed(2).replace('.', ',')}`; }

export function ChatScreen({ conversation, currentUserId, otherUserName = 'Usuário', providerProfile = null, providerRatings = [], isCustomer = false, onBack, onAcceptProposal, onConfirmAgreement, onCounterProposal, onServiceAction }: ChatScreenProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [proposalHistory, setProposalHistory] = useState<Proposal[]>([]);
  const [demand, setDemand] = useState<Demand | null>(null);
  const [working, setWorking] = useState(false);
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterAmount, setCounterAmount] = useState('');
  const [counterMessage, setCounterMessage] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);

  async function reload() {
    const [messageItems, proposalItems, demandItems] = await Promise.all([getMessages(), getProposals(), getDemands()]);
    const demandItem = demandItems.find((item) => item.id === conversation.demandId) ?? null;
    const demandProposals = proposalItems.filter((item) => item.demandId === conversation.demandId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const preferredProviderId = demandItem?.acceptedProviderId ?? conversation.providerId;
    const providerScoped = demandProposals.filter((item) => item.providerId === preferredProviderId);
    const matching = providerScoped.length > 0 ? providerScoped : demandProposals;
    setMessages(messageItems.filter((item) => item.conversationId === conversation.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    setProposalHistory(matching);
    setProposal(matching[matching.length - 1] ?? null);
    setDemand(demandItem);
  }

  useEffect(() => { reload().catch(() => Alert.alert('Erro', 'Não foi possível carregar a conversa.')); }, [conversation.id, conversation.demandId, conversation.providerId]);
  useEffect(() => subscribeRealtime((event) => {
    if (!event.demandId || event.demandId === conversation.demandId || event.conversationId === conversation.id || event.proposalId === proposal?.id) {
      reload().catch(() => undefined);
    }
  }), [conversation.id, conversation.demandId, proposal?.id]);

  const currentConversationMessages = useMemo(() => messages.filter((item) => item.conversationId === conversation.id), [messages, conversation.id]);
  const offerSide = proposal?.offeredBy ?? 'provider';
  const offerAuthorId = offerSide === 'customer' ? conversation.customerId : conversation.providerId;
  const recipientId = offerSide === 'customer' ? conversation.providerId : conversation.customerId;
  const isOfferAuthor = Boolean(proposal && currentUserId === offerAuthorId);
  const canRespondToOffer = Boolean(proposal && proposal.status === 'pending' && currentUserId === recipientId);
  const customerConfirmed = Boolean(proposal?.customerConfirmedAt);
  const providerConfirmed = Boolean(proposal?.providerConfirmedAt);
  const bothConfirmed = customerConfirmed && providerConfirmed;
  const agreementInProgress = proposal?.status === 'accepted' || Boolean(demand && ['accepted', 'provider_en_route', 'provider_arrived', 'in_progress', 'awaiting_customer_confirmation', 'completed'].includes(demand.status));
  const agreementClosed = bothConfirmed || agreementInProgress;
  const canCounter = Boolean(canRespondToOffer && onCounterProposal && !agreementClosed);
  const pendingStatus = isOfferAuthor ? 'AGUARDANDO RESPOSTA' : 'SUA RESPOSTA';
  const fallbackAcceptedLabel = Boolean(demand && ['accepted', 'provider_en_route', 'provider_arrived', 'in_progress', 'awaiting_customer_confirmation', 'completed'].includes(demand.status));

  async function sendMessage() {
    const normalized = text.trim(); if (!normalized) return;
    const message: ChatMessage = { id: newMessageId(), conversationId: conversation.id, senderId: currentUserId, text: normalized, createdAt: new Date().toISOString() };
    const allMessages = (await getMessages()).concat(message); await saveMessages(allMessages); setMessages(allMessages); setText('');
  }

  async function accept() {
    if (!proposal || working || !canRespondToOffer || !onAcceptProposal || agreementClosed) return;
    setWorking(true); try { await onAcceptProposal(proposal); await reload(); } catch { Alert.alert('Erro', 'Não foi possível aceitar a oferta.'); } finally { setWorking(false); }
  }

  async function confirmAgreement() {
    if (!proposal || working || agreementClosed || !onConfirmAgreement) return;
    if (proposal.status !== 'pending' && proposal.status !== 'accepted') return;
    setWorking(true); try { await onConfirmAgreement(proposal); await reload(); } catch { Alert.alert('Erro', 'Não foi possível confirmar o acordo.'); } finally { setWorking(false); }
  }

  async function sendCounter() {
    if (!proposal || !onCounterProposal || !canRespondToOffer || agreementClosed) return;
    const amount = Number(counterAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) return Alert.alert('Valor inválido', 'Informe um valor maior que zero.');
    if (Math.abs(amount - proposal.amount) < 0.01) return Alert.alert('Valor igual', 'Informe um valor diferente do valor atual.');
    setWorking(true);
    try { await onCounterProposal(proposal, amount, counterMessage.trim() || undefined); setCounterOpen(false); setCounterAmount(''); setCounterMessage(''); await reload(); } catch { Alert.alert('Erro', 'Não foi possível enviar a contraproposta.'); } finally { setWorking(false); }
  }

  async function runServiceAction(action: 'en_route' | 'arrived' | 'start' | 'request_confirmation' | 'confirm_completion') {
    if (!demand || !bothConfirmed || agreementClosed && demand.status !== 'accepted' && demand.status !== 'provider_en_route' && demand.status !== 'provider_arrived' && demand.status !== 'in_progress' && demand.status !== 'awaiting_customer_confirmation' || working || !onServiceAction) return;
    setWorking(true); try { await onServiceAction(demand, action); await reload(); } catch { Alert.alert('Erro', 'Não foi possível atualizar a etapa do serviço.'); } finally { setWorking(false); }
  }

  const executionMessage = !demand || !bothConfirmed ? null
    : demand.status === 'accepted' ? (isCustomer ? 'Aguardando o prestador informar que está a caminho.' : 'Serviço contratado. Informe quando estiver a caminho.')
    : demand.status === 'provider_en_route' ? (isCustomer ? '🚗 O prestador está a caminho.' : '🚗 Você informou que está a caminho.')
    : demand.status === 'provider_arrived' ? (isCustomer ? '📍 O prestador chegou ao local.' : '📍 Chegada registrada. Você já pode iniciar o serviço.')
    : demand.status === 'in_progress' ? (isCustomer ? '🛠 Serviço em andamento.' : '🛠 Serviço em andamento. Solicite a confirmação quando terminar.')
    : demand.status === 'awaiting_customer_confirmation' ? (isCustomer ? '✓ O prestador informou que concluiu. Confira e confirme a conclusão.' : '⏳ Aguardando o cliente confirmar a conclusão.')
    : demand.status === 'completed' ? '✓ Serviço concluído e confirmado pelo cliente.' : null;

  return <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.header}><TouchableOpacity onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹</Text></TouchableOpacity><View style={styles.headerText}><Text style={styles.title}>{otherUserName}</Text><Text style={styles.subtitle}>{agreementClosed ? (demand?.status === 'completed' ? 'Serviço concluído' : 'Serviço contratado') : 'Negociação pelo Rubli'}</Text></View>{isCustomer && <TouchableOpacity style={styles.profileHeaderButton} onPress={() => setProfileOpen(true)}><Text style={styles.profileHeaderButtonText}>★ Perfil</Text></TouchableOpacity>}</View>
    <ScrollView contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled">
      {proposal ? <View style={styles.proposalCard}>
        <View style={styles.proposalTop}><Text style={styles.proposalLabel}>VALOR ATUAL</Text><Text style={styles.proposalStatus}>{agreementClosed ? 'ACORDO CONFIRMADO' : proposal.status === 'accepted' ? 'OFERTA ACEITA' : proposal.status === 'superseded' ? 'SUBSTITUÍDA' : pendingStatus}</Text></View>
        <Text style={styles.proposalAmount}>{money(proposal.amount)}</Text>{proposal.message && <Text style={styles.proposalMessage}>“{proposal.message}”</Text>}
        <View style={styles.confirmationBox}><Text style={styles.confirmationText}>{customerConfirmed ? '✓ Cliente confirmado' : '○ Cliente ainda não confirmou'}</Text><Text style={styles.confirmationText}>{providerConfirmed ? '✓ Prestador confirmado' : '○ Prestador ainda não confirmou'}</Text></View>
        {proposal.status === 'pending' && canRespondToOffer && !agreementClosed && <View style={styles.actionGrid}>{canCounter && <TouchableOpacity style={styles.secondaryAction} onPress={() => { setCounterAmount(String(proposal.amount).replace('.', ',')); setCounterMessage(''); setCounterOpen(true); }}><Text style={styles.secondaryActionText}>↔ Contraproposta</Text></TouchableOpacity>}{onAcceptProposal && <TouchableOpacity style={styles.acceptButton} onPress={() => accept().catch(() => undefined)} disabled={working}><Text style={styles.acceptButtonText}>{working ? 'Aceitando...' : `✓ Aceitar por ${money(proposal.amount)}`}</Text></TouchableOpacity>}</View>}
        {proposal.status === 'pending' && isOfferAuthor && !agreementClosed && <Text style={styles.acceptedText}>⏳ Você enviou esta oferta. Aguardando resposta do outro lado.</Text>}
        {!agreementClosed && proposal.status === 'pending' && ((customerConfirmed && !isCustomer) || (providerConfirmed && isCustomer)) && onConfirmAgreement && <TouchableOpacity style={styles.providerConfirmButton} onPress={() => confirmAgreement().catch(() => undefined)} disabled={working}><Text style={styles.providerConfirmText}>{working ? 'Confirmando...' : '✓ Confirmar acordo e serviço'}</Text></TouchableOpacity>}
        {bothConfirmed && <Text style={styles.acceptedText}>✓ Os dois lados confirmaram. Serviço contratado.</Text>}
      </View> : fallbackAcceptedLabel ? <View style={styles.proposalCard}><View style={styles.proposalTop}><Text style={styles.proposalLabel}>ACORDO ATUAL</Text><Text style={styles.proposalStatus}>ACORDO CONFIRMADO</Text></View><Text style={styles.proposalAmount}>{demand?.budget ? money(demand.budget) : 'Valor acordado'}</Text><View style={styles.confirmationBox}><Text style={styles.confirmationText}>✓ Cliente confirmado</Text><Text style={styles.confirmationText}>✓ Prestador confirmado</Text></View><Text style={styles.acceptedText}>✓ Serviço contratado. A negociação permanece registrada no histórico.</Text></View> : null}
      {proposalHistory.length > 1 && <View style={styles.historyCard}><Text style={styles.historyTitle}>Histórico da negociação</Text>{proposalHistory.map((item, index) => <View key={item.id} style={styles.historyRow}><Text style={styles.historyVersion}>#{item.version ?? index + 1}</Text><View style={styles.historyText}><Text style={styles.historyAmount}>{money(item.amount)}</Text><Text style={styles.historyMeta}>{item.offeredBy === 'customer' ? 'Cliente' : 'Prestador'} · {item.status === 'superseded' ? 'substituída' : item.status === 'accepted' ? 'aceita' : 'pendente'}</Text>{item.message && <Text style={styles.historyMessage}>{item.message}</Text>}</View></View>)}</View>}
      {demand && <View style={styles.executionCard}><Text style={styles.executionTitle}>Acompanhamento do serviço</Text>
        <View style={styles.stepRow}><Text style={[styles.stepDot, bothConfirmed ? styles.stepDone : styles.stepPending]}>1</Text><Text style={styles.stepText}>Acordo confirmado</Text></View>
        <View style={styles.stepRow}><Text style={[styles.stepDot, ['provider_en_route','provider_arrived','in_progress','awaiting_customer_confirmation','completed'].includes(demand.status) ? styles.stepDone : styles.stepPending]}>2</Text><Text style={styles.stepText}>Prestador a caminho</Text></View>
        <View style={styles.stepRow}><Text style={[styles.stepDot, ['provider_arrived','in_progress','awaiting_customer_confirmation','completed'].includes(demand.status) ? styles.stepDone : styles.stepPending]}>3</Text><Text style={styles.stepText}>Chegada ao local</Text></View>
        <View style={styles.stepRow}><Text style={[styles.stepDot, ['in_progress','awaiting_customer_confirmation','completed'].includes(demand.status) ? styles.stepDone : styles.stepPending]}>4</Text><Text style={styles.stepText}>Serviço em andamento</Text></View>
        <View style={styles.stepRow}><Text style={[styles.stepDot, ['awaiting_customer_confirmation','completed'].includes(demand.status) ? styles.stepDone : styles.stepPending]}>5</Text><Text style={styles.stepText}>Aguardando confirmação do cliente</Text></View>
        <View style={styles.stepRow}><Text style={[styles.stepDot, demand.status === 'completed' ? styles.stepDone : styles.stepPending]}>6</Text><Text style={styles.stepText}>Serviço concluído</Text></View>
        {executionMessage && <Text style={styles.executionStatus}>{executionMessage}</Text>}
        {!isCustomer && bothConfirmed && demand.status === 'accepted' && onServiceAction && <TouchableOpacity style={styles.actionButton} onPress={() => runServiceAction('en_route').catch(() => undefined)} disabled={working}><Text style={styles.actionText}>{working ? 'Atualizando...' : '🚗 Estou a caminho'}</Text></TouchableOpacity>}
        {!isCustomer && demand.status === 'provider_en_route' && onServiceAction && <TouchableOpacity style={styles.actionButton} onPress={() => runServiceAction('arrived').catch(() => undefined)} disabled={working}><Text style={styles.actionText}>{working ? 'Atualizando...' : '📍 Cheguei ao local'}</Text></TouchableOpacity>}
        {!isCustomer && demand.status === 'provider_arrived' && onServiceAction && <TouchableOpacity style={styles.actionButton} onPress={() => runServiceAction('start').catch(() => undefined)} disabled={working}><Text style={styles.actionText}>{working ? 'Iniciando...' : '▶ Iniciar serviço'}</Text></TouchableOpacity>}
        {!isCustomer && demand.status === 'in_progress' && onServiceAction && <TouchableOpacity style={styles.completeButton} onPress={() => runServiceAction('request_confirmation').catch(() => undefined)} disabled={working}><Text style={styles.actionText}>{working ? 'Enviando...' : '✓ Solicitar confirmação do cliente'}</Text></TouchableOpacity>}
        {isCustomer && demand.status === 'awaiting_customer_confirmation' && onServiceAction && <TouchableOpacity style={styles.completeButton} onPress={() => runServiceAction('confirm_completion').catch(() => undefined)} disabled={working}><Text style={styles.actionText}>{working ? 'Confirmando...' : '✓ Confirmar conclusão do serviço'}</Text></TouchableOpacity>}
      </View>}
      <View style={styles.notice}><Text style={styles.noticeTitle}>Negociação vinculada à demanda</Text><Text style={styles.noticeText}>Combine valor, horário e detalhes aqui. Cada contraproposta fica registrada no histórico.</Text></View>
      {currentConversationMessages.length === 0 ? <Text style={styles.empty}>Nenhuma mensagem ainda. Comece a conversa.</Text> : currentConversationMessages.map((message) => { const mine = message.senderId === currentUserId; return <View key={message.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}><Text style={mine ? styles.mineText : styles.theirsText}>{message.text}</Text><Text style={mine ? styles.mineTime : styles.theirsTime}>{new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text></View>; })}
    </ScrollView>
    <View style={styles.composer}><TextInput value={text} onChangeText={setText} placeholder="Digite sua mensagem..." placeholderTextColor="#7A8798" multiline maxLength={1000} style={styles.input} /><TouchableOpacity onPress={() => sendMessage().catch(() => Alert.alert('Erro', 'Não foi possível salvar a mensagem.'))} style={styles.sendButton}><Text style={styles.sendText}>Enviar</Text></TouchableOpacity></View>
    <Modal visible={profileOpen} animationType="slide" onRequestClose={() => setProfileOpen(false)}><View style={styles.profileModal}><View style={styles.profileModalHeader}><TouchableOpacity onPress={() => setProfileOpen(false)} style={styles.backButton}><Text style={styles.backText}>‹</Text></TouchableOpacity><Text style={styles.profileModalTitle}>Perfil do prestador</Text><View style={{ width: 40 }} /></View><ScrollView contentContainerStyle={styles.profileContent}><View style={styles.profileHero}><View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>{(providerProfile?.name ?? otherUserName).charAt(0).toUpperCase()}</Text></View><Text style={styles.profileName}>{providerProfile?.name ?? otherUserName}</Text><Text style={styles.profileRole}>Prestador de serviços</Text>{providerRatings.length > 0 ? <><Text style={styles.ratingBig}>★ {(providerRatings.reduce((sum, item) => sum + item.rating, 0) / providerRatings.length).toFixed(1).replace('.', ',')}</Text><Text style={styles.ratingCount}>{providerRatings.length} avaliação{providerRatings.length === 1 ? '' : 'ões'}</Text></> : <><Text style={styles.newProvider}>★ Novo no Rubli</Text><Text style={styles.ratingCount}>Ainda não possui avaliações</Text></>}</View><View style={styles.profileInfoCard}><Text style={styles.profileSectionTitle}>Informações profissionais</Text>{providerProfile?.serviceCategories?.length ? <Text style={styles.profileInfoText}>🔧 {providerProfile.serviceCategories.join(' • ')}</Text> : null}{providerProfile?.city ? <Text style={styles.profileInfoText}>📍 {providerProfile.city}</Text> : null}{providerProfile?.serviceRadiusKm ? <Text style={styles.profileInfoText}>📡 Atende em até {providerProfile.serviceRadiusKm} km</Text> : null}{providerProfile?.bio ? <><Text style={styles.profileBioLabel}>SOBRE</Text><Text style={styles.profileBio}>{providerProfile.bio}</Text></> : <Text style={styles.profileInfoMuted}>Este profissional ainda não adicionou uma apresentação.</Text>}</View><View style={styles.profileInfoCard}><Text style={styles.profileSectionTitle}>Avaliações dos clientes</Text>{providerRatings.length === 0 ? <Text style={styles.profileInfoMuted}>Este profissional é novo na plataforma. As avaliações aparecerão após serviços concluídos.</Text> : providerRatings.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((rating) => <View key={rating.id} style={styles.ratingRow}><Text style={styles.ratingStars}>{'★'.repeat(Math.round(rating.rating))}{'☆'.repeat(5 - Math.round(rating.rating))}</Text>{rating.comment ? <Text style={styles.ratingComment}>“{rating.comment}”</Text> : <Text style={styles.profileInfoMuted}>Cliente avaliou o serviço sem comentário.</Text>}<Text style={styles.ratingDate}>{new Date(rating.createdAt).toLocaleDateString('pt-BR')}</Text></View>)}</View></ScrollView></View></Modal>
    <Modal visible={counterOpen} transparent animationType="fade" onRequestClose={() => setCounterOpen(false)}><View style={styles.backdrop}><View style={styles.counterCard}><Text style={styles.counterTitle}>Contraproposta</Text><Text style={styles.counterSub}>Valor atual: {proposal ? money(proposal.amount) : '—'}</Text><TextInput value={counterAmount} onChangeText={setCounterAmount} placeholder="Novo valor" keyboardType="decimal-pad" style={styles.counterInput} /><TextInput value={counterMessage} onChangeText={setCounterMessage} placeholder="Mensagem (opcional)" multiline style={[styles.counterInput, styles.counterMultiline]} /><View style={styles.modalActions}><TouchableOpacity style={styles.cancelButton} onPress={() => setCounterOpen(false)}><Text style={styles.cancelText}>Cancelar</Text></TouchableOpacity><TouchableOpacity style={styles.counterButton} onPress={() => sendCounter().catch(() => undefined)} disabled={working}><Text style={styles.counterText}>{working ? 'Enviando...' : 'Enviar'}</Text></TouchableOpacity></View></View></View></Modal>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:'#F7F9FC'},
  profileHeaderButton:{borderWidth:1,borderColor:'#D8E0EA',borderRadius:12,paddingHorizontal:10,paddingVertical:8,backgroundColor:'#FFF8F0'},profileHeaderButtonText:{color:'#B96712',fontWeight:'900',fontSize:12},profileModal:{flex:1,backgroundColor:'#F7F9FC'},profileModalHeader:{backgroundColor:'#FFF',borderBottomWidth:1,borderBottomColor:'#E5EAF0',padding:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},profileModalTitle:{color:BRAND,fontSize:18,fontWeight:'900'},profileContent:{padding:16,paddingBottom:36},profileHero:{backgroundColor:'#081B33',borderRadius:22,padding:24,alignItems:'center',marginBottom:14},profileAvatar:{width:78,height:78,borderRadius:39,backgroundColor:'#F28C28',alignItems:'center',justifyContent:'center',marginBottom:12},profileAvatarText:{color:'#FFF',fontSize:30,fontWeight:'900'},profileName:{color:'#FFF',fontSize:23,fontWeight:'900'},profileRole:{color:'#C9D6E6',marginTop:4},ratingBig:{color:'#FFD166',fontSize:28,fontWeight:'900',marginTop:15},ratingCount:{color:'#738096',fontSize:13,marginTop:4},newProvider:{color:'#FFD166',fontWeight:'900',fontSize:17,marginTop:15},profileInfoCard:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#E1E7EE',borderRadius:18,padding:16,marginBottom:12},profileSectionTitle:{color:BRAND,fontSize:17,fontWeight:'900',marginBottom:11},profileInfoText:{color:'#405366',marginBottom:8,lineHeight:20},profileInfoMuted:{color:'#718096',lineHeight:20},profileBioLabel:{color:'#718096',fontSize:11,fontWeight:'900',marginTop:8,marginBottom:5},profileBio:{color:'#405366',lineHeight:21},ratingRow:{paddingVertical:11,borderBottomWidth:1,borderBottomColor:'#EEF1F5'},ratingStars:{color:'#F28C28',fontSize:16,fontWeight:'900'},ratingComment:{color:'#405366',lineHeight:20,marginTop:5},ratingDate:{color:'#8A96A6',fontSize:11,marginTop:5},header:{backgroundColor:'#FFF',borderBottomWidth:1,borderBottomColor:'#E4EAF1',padding:14,flexDirection:'row',alignItems:'center'},backButton:{width:40,height:40,borderRadius:20,backgroundColor:'#F7F9FC',alignItems:'center',justifyContent:'center'},backText:{fontSize:30,color:BRAND,marginTop:-3},headerText:{flex:1,paddingHorizontal:10},title:{color:BRAND,fontWeight:'900',fontSize:20},subtitle:{color:'#718096',fontSize:12,marginTop:2},messages:{padding:16,paddingBottom:120},proposalCard:{backgroundColor:'#FFF8F0',borderWidth:1,borderColor:'#FDBF7D',borderRadius:18,padding:18,marginBottom:14},proposalTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},proposalLabel:{color:ACCENT,fontWeight:'900',fontSize:13},proposalStatus:{color:'#68778C',fontWeight:'900',fontSize:11},proposalAmount:{fontSize:29,color:BRAND,fontWeight:'900',marginTop:8},proposalMessage:{color:'#68778C',marginTop:2,fontStyle:'italic'},confirmationBox:{backgroundColor:'#FFF',borderRadius:14,padding:12,marginTop:12,gap:5},confirmationText:{color:'#53657A',fontWeight:'800'},actionGrid:{flexDirection:'row',gap:10,marginTop:12},secondaryAction:{flex:1,borderWidth:1,borderColor:ACCENT,borderRadius:12,paddingVertical:13,alignItems:'center'},secondaryActionText:{color:'#B96712',fontWeight:'900',fontSize:12},acceptButton:{flex:1,backgroundColor:ACCENT,borderRadius:12,paddingVertical:13,alignItems:'center'},acceptButtonText:{color:'#FFF',fontWeight:'900',fontSize:12},acceptedText:{color:'#397550',fontWeight:'900',marginTop:12},providerConfirmButton:{backgroundColor:BRAND,borderRadius:12,padding:14,alignItems:'center',marginTop:12},providerConfirmText:{color:'#FFF',fontWeight:'900'},historyCard:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#E1E7EE',borderRadius:18,padding:16,marginBottom:14},historyTitle:{color:BRAND,fontWeight:'900',fontSize:17,marginBottom:8},historyRow:{flexDirection:'row',paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#EEF1F5'},historyVersion:{color:ACCENT,fontWeight:'900',width:34},historyText:{flex:1},historyAmount:{color:BRAND,fontWeight:'900',fontSize:17},historyMeta:{color:'#718096',fontSize:12,marginTop:2},historyMessage:{color:'#5D6B7A',fontSize:12,marginTop:3},executionCard:{backgroundColor:'#EDF7F0',borderWidth:1,borderColor:'#B9DCC4',borderRadius:18,padding:16,marginBottom:14},executionTitle:{color:'#356848',fontWeight:'900',fontSize:18,marginBottom:7},stepRow:{flexDirection:'row',alignItems:'center',marginTop:8},stepDot:{width:28,height:28,borderRadius:14,alignItems:'center',justifyContent:'center',textAlign:'center',paddingTop:6,fontWeight:'900'},stepDone:{backgroundColor:'#D7E8DB',color:'#397550'},stepPending:{backgroundColor:'#E9EFEA',color:'#8A9A8E'},stepText:{color:'#536B5C',marginLeft:9,fontSize:13},executionStatus:{color:'#356848',fontWeight:'800',marginTop:12,lineHeight:19},actionButton:{backgroundColor:BRAND,borderRadius:12,paddingVertical:14,alignItems:'center',marginTop:12},completeButton:{backgroundColor:'#397550',borderRadius:12,paddingVertical:14,alignItems:'center',marginTop:12},actionText:{color:'#FFF',fontWeight:'900'},notice:{backgroundColor:'#EAF1F8',borderRadius:14,padding:14,marginBottom:12},noticeTitle:{color:BRAND,fontWeight:'900'},noticeText:{color:'#63758A',fontSize:12,lineHeight:18,marginTop:4},empty:{textAlign:'center',color:'#718096',padding:28},bubble:{maxWidth:'83%',padding:11,borderRadius:14,marginTop:8},mine:{alignSelf:'flex-end',backgroundColor:BRAND,borderBottomRightRadius:5},theirs:{alignSelf:'flex-start',backgroundColor:'#FFF',borderWidth:1,borderColor:'#E1E7EE',borderBottomLeftRadius:5},mineText:{color:'#FFF',fontSize:14},theirsText:{color:'#34495E',fontSize:14},mineTime:{color:'#BAC9DA',fontSize:10,marginTop:4,textAlign:'right'},theirsTime:{color:'#8A96A6',fontSize:10,marginTop:4},composer:{position:'absolute',left:0,right:0,bottom:0,padding:10,backgroundColor:'#FFF',borderTopWidth:1,borderTopColor:'#E5EAF0',flexDirection:'row',alignItems:'flex-end',gap:8},input:{flex:1,backgroundColor:'#F4F7FA',borderRadius:14,paddingHorizontal:13,paddingVertical:12,maxHeight:100,color:BRAND},sendButton:{backgroundColor:ACCENT,borderRadius:12,paddingHorizontal:17,paddingVertical:13},sendText:{color:'#FFF',fontWeight:'900'},backdrop:{flex:1,backgroundColor:'rgba(0,0,0,0.38)',justifyContent:'center',padding:20},counterCard:{backgroundColor:'#FFF',borderRadius:20,padding:20},counterTitle:{color:BRAND,fontWeight:'900',fontSize:20},counterSub:{color:'#718096',marginTop:3,marginBottom:12},counterInput:{borderWidth:1,borderColor:'#D6DEE8',borderRadius:12,padding:12,marginTop:9,color:BRAND},counterMultiline:{minHeight:80,textAlignVertical:'top'},modalActions:{flexDirection:'row',gap:9,marginTop:14},cancelButton:{flex:1,borderWidth:1,borderColor:'#D6DEE8',borderRadius:12,paddingVertical:13,alignItems:'center'},cancelText:{color:'#526173',fontWeight:'900'},counterButton:{flex:1,backgroundColor:ACCENT,borderRadius:12,paddingVertical:13,alignItems:'center'},counterText:{color:'#FFF',fontWeight:'900'}
});
