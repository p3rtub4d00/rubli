import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { ChatMessage, Conversation, Demand, DemandType, Proposal, User, UserRole } from '@rubli/shared';
import { DEMAND_CATEGORIES, distanceKm, isValidCoordinates } from '@rubli/shared';
import { getConversations, getDemands, getMessages, getProposals, getUser, saveConversations, saveDemands, saveMessages, saveProposals, saveUser } from './src/storage/localStore';

const BRAND = '#081B33';
const ACCENT = '#F28C28';
const BG = '#F7F9FC';
const DEFAULT_RADIUS = 10;
const RADIUS_OPTIONS = [5, 10, 20, 50, 100] as const;

type Screen = 'home' | 'create' | 'profile' | 'chat';

const TYPE_LABELS: Record<DemandType, string> = { service: 'Serviço', purchase: 'Compra', delivery: 'Entrega', freight: 'Frete' };
const STATUS_LABELS: Record<Demand['status'], string> = { draft: 'Rascunho', open: 'Aberta', negotiating: 'Recebendo propostas', accepted: 'Aceita', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada' };
const PROPOSAL_LABELS: Record<Proposal['status'], string> = { pending: 'Pendente', accepted: 'Aceita', rejected: 'Recusada', withdrawn: 'Retirada' };

function newId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
function money(value?: number) { return typeof value === 'number' ? `R$ ${value.toFixed(2).replace('.', ',')}` : 'Valor aberto'; }
function formatDistance(km: number) { return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`; }

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [demands, setDemands] = useState<Demand[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [screen, setScreen] = useState<Screen>('home');
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);

  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('customer');
  const [type, setType] = useState<DemandType>('service');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [budget, setBudget] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [isUrgent, setIsUrgent] = useState(false);

  const [providerRadius, setProviderRadius] = useState(DEFAULT_RADIUS);
  const [providerLatitude, setProviderLatitude] = useState<number | undefined>();
  const [providerLongitude, setProviderLongitude] = useState<number | undefined>();
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<DemandType | 'all'>('all');
  const [proposalAmounts, setProposalAmounts] = useState<Record<string, string>>({});
  const [proposalMessages, setProposalMessages] = useState<Record<string, string>>({});
  const [profileName, setProfileName] = useState('');

  useEffect(() => {
    Promise.all([getUser(), getDemands(), getProposals(), getConversations(), getMessages()]).then(([storedUser, storedDemands, storedProposals, storedConversations, storedMessages]) => {
      setUser(storedUser);
      setDemands(storedDemands);
      setProposals(storedProposals);
      setConversations(storedConversations);
      setMessages(storedMessages);
      if (storedUser) {
        setProviderRadius(storedUser.serviceRadiusKm ?? DEFAULT_RADIUS);
        setProfileName(storedUser.name);
      }
    });
  }, []);

  const categories = useMemo(() => DEMAND_CATEGORIES[type] as readonly string[], [type]);

  const providerFeed = useMemo(() => {
    if (!user || user.role !== 'provider') return [] as Array<{ demand: Demand; distanceKm?: number }>;
    return demands
      .filter((demand) => demand.requesterId !== user.id)
      .filter((demand) => ['open', 'negotiating'].includes(demand.status))
      .filter((demand) => selectedTypeFilter === 'all' || demand.type === selectedTypeFilter)
      .filter((demand) => !urgentOnly || demand.isUrgent)
      .map((demand) => {
        if (isValidCoordinates(providerLatitude, providerLongitude) && isValidCoordinates(demand.latitude, demand.longitude)) {
          return { demand, distanceKm: distanceKm({ latitude: providerLatitude!, longitude: providerLongitude! }, { latitude: demand.latitude!, longitude: demand.longitude! }) };
        }
        return { demand, distanceKm: undefined };
      })
      .filter((item) => item.distanceKm === undefined || item.distanceKm <= providerRadius)
      .sort((a, b) => {
        if (Boolean(b.demand.isUrgent) !== Boolean(a.demand.isUrgent)) return Number(Boolean(b.demand.isUrgent)) - Number(Boolean(a.demand.isUrgent));
        return (a.distanceKm ?? Number.MAX_SAFE_INTEGER) - (b.distanceKm ?? Number.MAX_SAFE_INTEGER);
      });
  }, [demands, providerLatitude, providerLongitude, providerRadius, urgentOnly, selectedTypeFilter, user]);

  async function createLocalUser() {
    if (!name.trim()) return Alert.alert('Nome obrigatório', 'Informe seu nome para continuar.');
    const newUser: User = { id: newId('usr'), name: name.trim(), role, serviceRadiusKm: role === 'provider' ? DEFAULT_RADIUS : undefined, createdAt: new Date().toISOString() };
    await saveUser(newUser);
    setUser(newUser);
    setProviderRadius(newUser.serviceRadiusKm ?? DEFAULT_RADIUS);
    setProfileName(newUser.name);
  }

  async function captureLocationForDemand() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') return Alert.alert('Localização', 'Permissão não concedida. Informe o bairro/endereço manualmente.');
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLatitude(current.coords.latitude);
      setLongitude(current.coords.longitude);
      if (!locationLabel.trim()) setLocationLabel('Localização atual');
    } catch { Alert.alert('Localização', 'Não foi possível obter sua localização.'); }
  }

  async function captureProviderLocation() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') return Alert.alert('Localização', 'Permissão não concedida.');
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setProviderLatitude(current.coords.latitude);
      setProviderLongitude(current.coords.longitude);
    } catch { Alert.alert('Localização', 'Não foi possível obter sua localização.'); }
  }

  async function createDemand() {
    if (!user) return;
    const parsedBudget = budget.trim() ? Number(budget.replace(',', '.')) : undefined;
    if (!title.trim() || !description.trim() || !category || !locationLabel.trim()) return Alert.alert('Complete os dados', 'Preencha título, descrição, categoria e localização.');
    if (parsedBudget !== undefined && (!Number.isFinite(parsedBudget) || parsedBudget <= 0)) return Alert.alert('Valor inválido', 'Informe um valor maior que zero ou deixe o campo vazio.');
    const now = new Date().toISOString();
    const next: Demand = { id: newId('dem'), requesterId: user.id, type, title: title.trim(), description: description.trim(), category, budgetType: parsedBudget ? 'fixed' : 'open', budget: parsedBudget, locationLabel: locationLabel.trim(), latitude, longitude, isUrgent, status: 'open', createdAt: now, updatedAt: now };
    const nextDemands = [next, ...demands];
    setDemands(nextDemands); await saveDemands(nextDemands);
    setTitle(''); setDescription(''); setBudget(''); setLocationLabel(''); setCategory(''); setLatitude(undefined); setLongitude(undefined); setIsUrgent(false); setScreen('home');
    Alert.alert('Demanda publicada', isUrgent ? 'Sua demanda foi publicada como PRECISO AGORA.' : 'Sua demanda foi publicada.');
  }

  async function ensureConversation(demandId: string, providerId: string) {
    if (!user) return null;
    const existing = conversations.find((item) => item.demandId === demandId && item.customerId === user.id && item.providerId === providerId);
    if (existing) return existing;
    const now = new Date().toISOString();
    const conversation: Conversation = { id: newId('conv'), demandId, customerId: user.id, providerId, createdAt: now, updatedAt: now };
    const next = [conversation, ...conversations]; setConversations(next); await saveConversations(next); return conversation;
  }

  async function openProposalChat(proposal: Proposal) {
    const demand = demands.find((item) => item.id === proposal.demandId); if (!demand) return;
    const customerId = demand.requesterId; const providerId = proposal.providerId;
    let conversation = conversations.find((item) => item.demandId === demand.id && item.customerId === customerId && item.providerId === providerId);
    if (!conversation) { const now = new Date().toISOString(); conversation = { id: newId('conv'), demandId: demand.id, customerId, providerId, createdAt: now, updatedAt: now }; const next = [conversation, ...conversations]; setConversations(next); await saveConversations(next); }
    setActiveConversation(conversation); setScreen('chat');
  }

  async function submitProposal(demand: Demand) {
    if (!user) return;
    const amount = Number((proposalAmounts[demand.id] ?? '').replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) return Alert.alert('Valor inválido', 'Informe seu preço.');
    if (proposals.some((item) => item.demandId === demand.id && item.providerId === user.id && item.status === 'pending')) return Alert.alert('Proposta já enviada', 'Você já possui uma proposta pendente para esta demanda.');
    const proposal: Proposal = { id: newId('pro'), demandId: demand.id, providerId: user.id, amount: Math.round(amount * 100) / 100, message: proposalMessages[demand.id]?.trim() || undefined, status: 'pending', createdAt: new Date().toISOString() };
    const nextProposals = [proposal, ...proposals]; const nextDemands = demands.map((item) => item.id === demand.id ? { ...item, status: 'negotiating' as const, updatedAt: new Date().toISOString() } : item);
    setProposals(nextProposals); setDemands(nextDemands); await saveProposals(nextProposals); await saveDemands(nextDemands);
    setProposalAmounts((state) => ({ ...state, [demand.id]: '' })); setProposalMessages((state) => ({ ...state, [demand.id]: '' }));
    Alert.alert('Proposta enviada', 'O cliente poderá abrir a conversa e negociar com você.');
  }

  async function acceptProposal(proposal: Proposal) {
    if (!user) return;
    const demand = demands.find((item) => item.id === proposal.demandId); if (!demand || demand.requesterId !== user.id || proposal.status !== 'pending') return;
    const nextProposals = proposals.map((item) => item.demandId === demand.id ? { ...item, status: item.id === proposal.id ? ('accepted' as const) : item.status === 'pending' ? ('rejected' as const) : item.status } : item);
    const nextDemands = demands.map((item) => item.id === demand.id ? { ...item, status: 'accepted' as const, updatedAt: new Date().toISOString() } : item);
    setProposals(nextProposals); setDemands(nextDemands); await saveProposals(nextProposals); await saveDemands(nextDemands);
    const conversation = await ensureConversation(demand.id, proposal.providerId); if (conversation) { setActiveConversation(conversation); setScreen('chat'); }
  }

  async function sendMessage(text: string) {
    if (!user || !activeConversation || !text.trim()) return;
    const message: ChatMessage = { id: newId('msg'), conversationId: activeConversation.id, senderId: user.id, text: text.trim(), createdAt: new Date().toISOString() };
    const nextMessages = [...messages, message]; const nextConversations = conversations.map((item) => item.id === activeConversation.id ? { ...item, updatedAt: message.createdAt, lastMessageAt: message.createdAt } : item);
    setMessages(nextMessages); setConversations(nextConversations); await saveMessages(nextMessages); await saveConversations(nextConversations);
  }

  async function updateProviderSettings(radius: number) {
    if (!user) return; const nextUser = { ...user, serviceRadiusKm: radius }; await saveUser(nextUser); setUser(nextUser); setProviderRadius(radius);
  }

  async function updateProfileName() {
    if (!user || !profileName.trim()) return; const nextUser = { ...user, name: profileName.trim() }; await saveUser(nextUser); setUser(nextUser);
  }

  async function createNewTestIdentity() {
    await saveUser(null as unknown as User);
    setUser(null); setName(''); setRole('customer'); setProfileName(''); setScreen('home');
    Alert.alert('Novo perfil', 'Crie outra identidade de teste. Suas demandas e propostas existentes foram preservadas.');
  }

  if (!user) return <SafeAreaView style={styles.safe}><StatusBar style="light" /><ScrollView contentContainerStyle={styles.onboarding}><Text style={styles.logo}>Rubli</Text><Text style={styles.tagline}>Quem precisa, encontra quem resolve.</Text><Text style={styles.heading}>Crie seu perfil de teste</Text><Text style={styles.mutedLight}>Nesta fase, os dados ficam no aparelho. O MongoDB entra depois.</Text><TextInput value={name} onChangeText={setName} placeholder="Seu nome" placeholderTextColor="#718096" style={styles.inputDark} /><View style={styles.rowWrap}><RoleButton label="Quero contratar" active={role === 'customer'} onPress={() => setRole('customer')} /><RoleButton label="Quero trabalhar" active={role === 'provider'} onPress={() => setRole('provider')} /></View><TouchableOpacity style={styles.primaryButton} onPress={createLocalUser}><Text style={styles.primaryText}>Entrar no Rubli</Text></TouchableOpacity></ScrollView></SafeAreaView>;

  if (screen === 'chat' && activeConversation) return <ChatView conversation={activeConversation} currentUserId={user.id} messages={messages.filter((item) => item.conversationId === activeConversation.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))} onBack={() => setScreen('home')} onSend={sendMessage} />;

  return <SafeAreaView style={styles.safeLight}><StatusBar style="dark" /><View style={styles.header}><View><Text style={styles.brand}>Rubli</Text><Text style={styles.headerSubtitle}>Olá, {user.name}</Text></View><TouchableOpacity onPress={() => setScreen('profile')} style={styles.avatar}><Text style={styles.avatarText}>{user.name[0]?.toUpperCase()}</Text></TouchableOpacity></View>
    {screen === 'home' && user.role === 'customer' && <CustomerHome user={user} demands={demands} proposals={proposals} onCreate={(selectedType) => { setType(selectedType); setCategory(''); setScreen('create'); }} onAccept={acceptProposal} onChat={openProposalChat} />}
    {screen === 'home' && user.role === 'provider' && <ProviderHome user={user} feed={providerFeed} providerRadius={providerRadius} providerLatitude={providerLatitude} urgentOnly={urgentOnly} selectedTypeFilter={selectedTypeFilter} proposalAmounts={proposalAmounts} proposalMessages={proposalMessages} setUrgentOnly={setUrgentOnly} setSelectedTypeFilter={setSelectedTypeFilter} setProposalAmounts={setProposalAmounts} setProposalMessages={setProposalMessages} onLocate={captureProviderLocation} onRadius={updateProviderSettings} onProposal={submitProposal} />}
    {screen === 'create' && <ScrollView contentContainerStyle={styles.content}><TouchableOpacity onPress={() => setScreen('home')}><Text style={styles.back}>‹ Voltar</Text></TouchableOpacity><Text style={styles.headingDark}>Criar demanda</Text><Text style={styles.muted}>Defina um valor ou deixe para negociação.</Text><View style={styles.rowWrap}>{(Object.keys(TYPE_LABELS) as DemandType[]).map((key) => <RoleButton key={key} label={TYPE_LABELS[key]} active={type === key} onPress={() => { setType(key); setCategory(''); }} />)}</View><TextInput value={title} onChangeText={setTitle} placeholder="Ex.: Instalar fechadura na porta" style={styles.inputLight} /><TextInput value={description} onChangeText={setDescription} placeholder="Descreva os detalhes" multiline style={[styles.inputLight, styles.multiline]} /><Text style={styles.label}>Categoria</Text><View style={styles.rowWrap}>{categories.map((item) => <RoleButton key={item} label={item} active={category === item} onPress={() => setCategory(item)} />)}</View><TextInput value={budget} onChangeText={setBudget} placeholder="Quanto pretende pagar? (opcional)" keyboardType="decimal-pad" style={styles.inputLight} /><TextInput value={locationLabel} onChangeText={setLocationLabel} placeholder="Bairro / endereço" style={styles.inputLight} /><TouchableOpacity style={styles.locationButton} onPress={captureLocationForDemand}><Text style={styles.locationText}>{latitude ? '✓ Localização capturada' : 'Usar minha localização atual'}</Text></TouchableOpacity><TouchableOpacity style={[styles.urgentButton, isUrgent && styles.urgentButtonActive]} onPress={() => setIsUrgent((value) => !value)}><Text style={[styles.urgentButtonText, isUrgent && styles.urgentButtonTextActive]}>{isUrgent ? '⚡ PRECISO AGORA ATIVADO' : '⚡ PRECISO AGORA'}</Text></TouchableOpacity><TouchableOpacity style={styles.primaryButton} onPress={createDemand}><Text style={styles.primaryText}>Publicar demanda</Text></TouchableOpacity></ScrollView>}
    {screen === 'profile' && <ProfileScreen user={user} profileName={profileName} providerRadius={providerRadius} onNameChange={setProfileName} onSaveName={updateProfileName} onRadius={updateProviderSettings} onNewIdentity={createNewTestIdentity} onBack={() => setScreen('home')} />}
    <View style={styles.nav}><TouchableOpacity onPress={() => setScreen('home')}><Text style={styles.navItem}>Início</Text></TouchableOpacity>{user.role === 'customer' && <TouchableOpacity onPress={() => { setType('service'); setCategory(''); setScreen('create'); }}><Text style={styles.navItem}>+ Demanda</Text></TouchableOpacity>}<TouchableOpacity onPress={() => setScreen('profile')}><Text style={styles.navItem}>Perfil</Text></TouchableOpacity></View>
  </SafeAreaView>;
}

function CustomerHome({ user, demands, proposals, onCreate, onAccept, onChat }: { user: User; demands: Demand[]; proposals: Proposal[]; onCreate: (type: DemandType) => void; onAccept: (proposal: Proposal) => Promise<void>; onChat: (proposal: Proposal) => Promise<void> }) {
  const ownDemands = demands.filter((item) => item.requesterId === user.id);
  return <ScrollView contentContainerStyle={styles.content}><View style={styles.heroBox}><Text style={styles.hero}>O que você precisa resolver hoje?</Text><Text style={styles.muted}>Publique uma necessidade e receba propostas.</Text></View><View style={styles.grid}>{(Object.keys(TYPE_LABELS) as DemandType[]).map((key) => <TouchableOpacity key={key} style={styles.card} onPress={() => onCreate(key)}><Text style={styles.cardTitle}>{TYPE_LABELS[key]}</Text><Text style={styles.cardBody}>Publicar uma nova demanda</Text></TouchableOpacity>)}</View><Text style={styles.sectionTitle}>Minhas demandas</Text>{ownDemands.length === 0 ? <Text style={styles.empty}>Você ainda não publicou nenhuma demanda.</Text> : ownDemands.map((demand) => { const demandProposals = proposals.filter((item) => item.demandId === demand.id); return <View style={styles.demand} key={demand.id}><View style={styles.demandTop}><Text style={styles.demandType}>{TYPE_LABELS[demand.type]}</Text><Text style={styles.status}>{STATUS_LABELS[demand.status]}</Text></View>{demand.isUrgent && <Text style={styles.urgentBadge}>⚡ PRECISO AGORA</Text>}<Text style={styles.demandTitle}>{demand.title}</Text><Text style={styles.mutedSmall}>{demand.locationLabel} · {money(demand.budget)}</Text>{demandProposals.length > 0 && <><Text style={styles.subheading}>Propostas ({demandProposals.length})</Text>{demandProposals.map((proposal) => <View style={styles.proposal} key={proposal.id}><View style={styles.proposalTop}><Text style={styles.proposalAmount}>{money(proposal.amount)}</Text><Text style={styles.status}>{PROPOSAL_LABELS[proposal.status]}</Text></View>{proposal.message && <Text style={styles.mutedSmall}>{proposal.message}</Text>}<View style={styles.actionRow}>{proposal.status === 'pending' && <TouchableOpacity style={styles.smallButton} onPress={() => onAccept(proposal)}><Text style={styles.smallButtonText}>Aceitar</Text></TouchableOpacity>}<TouchableOpacity style={styles.outlineSmallButton} onPress={() => onChat(proposal)}><Text style={styles.outlineSmallButtonText}>Conversar</Text></TouchableOpacity></View></View>)}</>}</View>; })}</ScrollView>;
}

function ProviderHome({ user, feed, providerRadius, providerLatitude, urgentOnly, selectedTypeFilter, proposalAmounts, proposalMessages, setUrgentOnly, setSelectedTypeFilter, setProposalAmounts, setProposalMessages, onLocate, onRadius, onProposal }: { user: User; feed: Array<{ demand: Demand; distanceKm?: number }>; providerRadius: number; providerLatitude?: number; urgentOnly: boolean; selectedTypeFilter: DemandType | 'all'; proposalAmounts: Record<string, string>; proposalMessages: Record<string, string>; setUrgentOnly: (value: boolean) => void; setSelectedTypeFilter: (value: DemandType | 'all') => void; setProposalAmounts: React.Dispatch<React.SetStateAction<Record<string, string>>>; setProposalMessages: React.Dispatch<React.SetStateAction<Record<string, string>>>; onLocate: () => Promise<void>; onRadius: (value: number) => Promise<void>; onProposal: (demand: Demand) => Promise<void> }) {
  return <ScrollView contentContainerStyle={styles.content}><View style={styles.heroBox}><Text style={styles.hero}>Demandas perto de você</Text><Text style={styles.muted}>Raio atual: {providerRadius} km. As urgentes aparecem primeiro.</Text></View><View style={styles.filterBox}><Text style={styles.label}>Raio de atendimento</Text><View style={styles.rowWrap}>{RADIUS_OPTIONS.map((radius) => <RoleButton key={radius} label={`${radius} km`} active={providerRadius === radius} onPress={() => onRadius(radius)} />)}</View><TouchableOpacity style={styles.locationButton} onPress={onLocate}><Text style={styles.locationText}>{providerLatitude ? '✓ Localização ativa' : 'Usar minha localização'}</Text></TouchableOpacity><Text style={styles.label}>Categoria do feed</Text><View style={styles.rowWrap}>{(['all', ...Object.keys(TYPE_LABELS)] as Array<DemandType | 'all'>).map((value) => <RoleButton key={value} label={value === 'all' ? 'Todas' : TYPE_LABELS[value]} active={selectedTypeFilter === value} onPress={() => setSelectedTypeFilter(value)} />)}</View><TouchableOpacity style={[styles.urgentButton, urgentOnly && styles.urgentButtonActive]} onPress={() => setUrgentOnly(!urgentOnly)}><Text style={[styles.urgentButtonText, urgentOnly && styles.urgentButtonTextActive]}>{urgentOnly ? '⚡ Somente urgentes' : '⚡ Mostrar só urgentes'}</Text></TouchableOpacity></View><Text style={styles.sectionTitle}>Demandas disponíveis</Text>{feed.length === 0 ? <Text style={styles.empty}>{providerLatitude ? 'Nenhuma demanda dentro do seu raio com os filtros atuais.' : 'Ative sua localização para organizar o feed por proximidade.'}</Text> : feed.map(({ demand, distanceKm: itemDistance }) => <View style={styles.demand} key={demand.id}><View style={styles.demandTop}><Text style={styles.demandType}>{TYPE_LABELS[demand.type]}</Text>{itemDistance !== undefined ? <Text style={styles.distance}>{formatDistance(itemDistance)}</Text> : <Text style={styles.status}>Distância indisponível</Text>}</View>{demand.isUrgent && <Text style={styles.urgentBadge}>⚡ PRECISO AGORA</Text>}<Text style={styles.demandTitle}>{demand.title}</Text><Text style={styles.mutedSmall}>{demand.category} · {demand.locationLabel}</Text><Text style={styles.mutedSmall}>{demand.description}</Text><Text style={styles.budgetHint}>{demand.budget ? `Cliente informa: ${money(demand.budget)}` : 'Cliente deixou o valor aberto'}</Text><TextInput value={proposalAmounts[demand.id] ?? ''} onChangeText={(value) => setProposalAmounts((state) => ({ ...state, [demand.id]: value }))} placeholder="Seu preço" keyboardType="decimal-pad" style={styles.inputLight} /><TextInput value={proposalMessages[demand.id] ?? ''} onChangeText={(value) => setProposalMessages((state) => ({ ...state, [demand.id]: value }))} placeholder="Mensagem ao cliente (opcional)" multiline style={styles.inputLight} /><TouchableOpacity style={styles.primaryButton} onPress={() => onProposal(demand)}><Text style={styles.primaryText}>Enviar proposta</Text></TouchableOpacity></View>)}</ScrollView>;
}

function ProfileScreen({ user, profileName, providerRadius, onNameChange, onSaveName, onRadius, onNewIdentity, onBack }: { user: User; profileName: string; providerRadius: number; onNameChange: (value: string) => void; onSaveName: () => Promise<void>; onRadius: (value: number) => Promise<void>; onNewIdentity: () => Promise<void>; onBack: () => void }) {
  return <ScrollView contentContainerStyle={styles.content}><TouchableOpacity onPress={onBack}><Text style={styles.back}>‹ Voltar</Text></TouchableOpacity><Text style={styles.headingDark}>Meu perfil</Text><Text style={styles.label}>Nome</Text><TextInput value={profileName} onChangeText={onNameChange} style={styles.inputLight} /><TouchableOpacity style={styles.secondaryButton} onPress={onSaveName}><Text style={styles.secondaryText}>Salvar nome</Text></TouchableOpacity><Text style={styles.label}>Perfil atual</Text><Text style={styles.value}>{user.role === 'customer' ? 'Cliente' : 'Prestador'}</Text>{user.role === 'provider' && <><Text style={styles.label}>Raio de atendimento</Text><View style={styles.rowWrap}>{RADIUS_OPTIONS.map((radius) => <RoleButton key={radius} label={`${radius} km`} active={providerRadius === radius} onPress={() => onRadius(radius)} />)}</View></>}<View style={styles.infoBox}><Text style={styles.infoTitle}>Modo local-first</Text><Text style={styles.muted}>Demandas, propostas e conversas permanecem no aparelho. O MongoDB entra depois.</Text></View><TouchableOpacity style={styles.secondaryButton} onPress={onNewIdentity}><Text style={styles.secondaryText}>Criar nova identidade de teste</Text></TouchableOpacity></ScrollView>;
}

function ChatView({ conversation, currentUserId, messages, onBack, onSend }: { conversation: Conversation; currentUserId: string; messages: ChatMessage[]; onBack: () => void; onSend: (text: string) => Promise<void> }) {
  const [text, setText] = useState('');
  return <KeyboardAvoidingView style={styles.chatContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><StatusBar style="dark" /><View style={styles.chatHeader}><TouchableOpacity onPress={onBack} style={styles.chatBack}><Text style={styles.chatBackText}>‹</Text></TouchableOpacity><View style={styles.chatHeaderText}><Text style={styles.chatTitle}>Negociação Rubli</Text><Text style={styles.chatSubtitle}>Demanda {conversation.demandId.slice(-6)}</Text></View></View><ScrollView contentContainerStyle={styles.chatMessages}><View style={styles.notice}><Text style={styles.noticeTitle}>Conversa vinculada à demanda</Text><Text style={styles.noticeText}>Negocie valores e detalhes antes de aceitar.</Text></View>{messages.length === 0 ? <Text style={styles.empty}>Nenhuma mensagem ainda.</Text> : messages.map((message) => { const mine = message.senderId === currentUserId; return <View key={message.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}><Text style={mine ? styles.mineText : styles.theirsText}>{message.text}</Text><Text style={mine ? styles.mineTime : styles.theirsTime}>{new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text></View>; })}</ScrollView><View style={styles.composer}><TextInput value={text} onChangeText={setText} placeholder="Digite sua mensagem..." multiline style={styles.chatInput} /><TouchableOpacity style={styles.sendButton} onPress={async () => { const value = text; setText(''); await onSend(value); }}><Text style={styles.sendText}>Enviar</Text></TouchableOpacity></View></KeyboardAvoidingView>;
}

function RoleButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <TouchableOpacity onPress={onPress} style={[styles.pill, active && styles.pillActive]}><Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text></TouchableOpacity>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BRAND }, safeLight: { flex: 1, backgroundColor: BG }, onboarding: { flexGrow: 1, padding: 28, justifyContent: 'center' }, content: { padding: 20, paddingBottom: 96 }, logo: { color: '#FFF', fontSize: 42, fontWeight: '800', marginBottom: 4 }, tagline: { color: '#DDE7F5', fontSize: 16, marginBottom: 42 }, heading: { color: '#FFF', fontSize: 28, fontWeight: '800', marginBottom: 10 }, headingDark: { color: BRAND, fontSize: 28, fontWeight: '800', marginBottom: 8 }, muted: { color: '#68778C', lineHeight: 20, marginBottom: 12 }, mutedLight: { color: '#DDE7F5', lineHeight: 20, marginBottom: 18 }, mutedSmall: { color: '#68778C', lineHeight: 19, marginBottom: 7 }, inputDark: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 14, fontSize: 16 }, inputLight: { backgroundColor: '#FFF', borderColor: '#D8E0EA', borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10, fontSize: 16 }, multiline: { minHeight: 100, textAlignVertical: 'top' }, rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }, pill: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 99, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: '#FFF' }, pillActive: { backgroundColor: BRAND, borderColor: BRAND }, pillText: { color: '#526174', fontWeight: '600' }, pillTextActive: { color: '#FFF' }, primaryButton: { backgroundColor: ACCENT, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 6 }, primaryText: { color: '#FFF', fontSize: 16, fontWeight: '800' }, secondaryButton: { borderWidth: 1, borderColor: BRAND, borderRadius: 14, padding: 15, alignItems: 'center', marginBottom: 14 }, secondaryText: { color: BRAND, fontWeight: '800' }, locationButton: { borderWidth: 1, borderColor: '#AAB7C6', borderRadius: 14, padding: 14, alignItems: 'center', marginBottom: 8 }, locationText: { color: BRAND, fontWeight: '800' }, urgentButton: { borderWidth: 1, borderColor: '#D0D7E2', borderRadius: 14, padding: 14, alignItems: 'center', marginBottom: 8, backgroundColor: '#FFF' }, urgentButtonActive: { backgroundColor: '#FFF1E6', borderColor: ACCENT }, urgentButtonText: { color: BRAND, fontWeight: '900' }, urgentButtonTextActive: { color: ACCENT }, urgentBadge: { color: ACCENT, fontWeight: '900', marginBottom: 7 }, header: { backgroundColor: '#FFF', padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E9EEF5' }, brand: { color: BRAND, fontSize: 25, fontWeight: '900' }, headerSubtitle: { color: '#6B7788', marginTop: 2 }, avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#FFF', fontWeight: '800' }, heroBox: { backgroundColor: '#EAF1F8', borderRadius: 18, padding: 18, marginBottom: 18 }, hero: { color: BRAND, fontSize: 27, fontWeight: '800', marginBottom: 6 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 25 }, card: { backgroundColor: '#FFF', borderRadius: 18, padding: 17, width: '47%', minHeight: 108, borderWidth: 1, borderColor: '#E7ECF2' }, cardTitle: { color: BRAND, fontWeight: '800', fontSize: 17, marginBottom: 8 }, cardBody: { color: '#718096', lineHeight: 18 }, sectionTitle: { color: BRAND, fontSize: 20, fontWeight: '800', marginBottom: 12, marginTop: 6 }, subheading: { color: BRAND, fontWeight: '800', marginTop: 12, marginBottom: 8 }, empty: { color: '#718096', backgroundColor: '#FFF', padding: 18, borderRadius: 15, marginBottom: 14 }, demand: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E7ECF2' }, demandTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }, demandType: { color: ACCENT, fontWeight: '800' }, status: { color: '#607086', fontSize: 12, fontWeight: '700' }, distance: { color: BRAND, fontSize: 12, fontWeight: '800' }, demandTitle: { color: BRAND, fontSize: 17, fontWeight: '800', marginBottom: 6 }, back: { color: ACCENT, fontWeight: '800', marginBottom: 16 }, label: { color: BRAND, fontWeight: '800', marginBottom: 7, marginTop: 8 }, value: { backgroundColor: '#FFF', padding: 15, borderRadius: 12, marginBottom: 8, color: '#27364A' }, infoBox: { backgroundColor: '#EAF1F8', borderRadius: 15, padding: 16, marginBottom: 18 }, infoTitle: { color: BRAND, fontWeight: '800', marginBottom: 6 }, filterBox: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E7ECF2' }, budgetHint: { color: '#465A73', fontWeight: '700', marginTop: 2, marginBottom: 9 }, proposal: { borderTopWidth: 1, borderTopColor: '#E8EDF3', paddingTop: 10, marginTop: 6 }, proposalTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }, proposalAmount: { color: BRAND, fontWeight: '900', fontSize: 16 }, actionRow: { flexDirection: 'row', gap: 8, marginTop: 5 }, smallButton: { backgroundColor: BRAND, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10 }, smallButtonText: { color: '#FFF', fontWeight: '800' }, outlineSmallButton: { borderWidth: 1, borderColor: BRAND, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10 }, outlineSmallButtonText: { color: BRAND, fontWeight: '800' }, nav: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 68, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5EAF0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }, navItem: { color: BRAND, fontWeight: '800' }, chatContainer: { flex: 1, backgroundColor: BG }, chatHeader: { backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5EAF0', padding: 14, flexDirection: 'row', alignItems: 'center' }, chatBack: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, chatBackText: { color: ACCENT, fontSize: 34, lineHeight: 36 }, chatHeaderText: { flex: 1 }, chatTitle: { color: BRAND, fontSize: 18, fontWeight: '800' }, chatSubtitle: { color: '#738096', marginTop: 2 }, chatMessages: { padding: 16, paddingBottom: 24 }, notice: { backgroundColor: '#EAF1F8', borderRadius: 14, padding: 14, marginBottom: 16 }, noticeTitle: { color: BRAND, fontWeight: '800', marginBottom: 4 }, noticeText: { color: '#5F6F83', lineHeight: 19 }, bubble: { maxWidth: '82%', paddingHorizontal: 13, paddingVertical: 10, borderRadius: 16, marginBottom: 9 }, mine: { alignSelf: 'flex-end', backgroundColor: BRAND, borderBottomRightRadius: 5 }, theirs: { alignSelf: 'flex-start', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E1E7EE', borderBottomLeftRadius: 5 }, mineText: { color: '#FFF', fontSize: 15, lineHeight: 20 }, theirsText: { color: '#26364A', fontSize: 15, lineHeight: 20 }, mineTime: { color: '#D8E3F0', fontSize: 10, marginTop: 4, textAlign: 'right' }, theirsTime: { color: '#8A96A6', fontSize: 10, marginTop: 4, textAlign: 'right' }, composer: { backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5EAF0', padding: 10, flexDirection: 'row', alignItems: 'flex-end', gap: 8 }, chatInput: { flex: 1, maxHeight: 100, minHeight: 45, backgroundColor: '#F3F6FA', borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11, color: '#26364A' }, sendButton: { backgroundColor: ACCENT, paddingHorizontal: 15, paddingVertical: 12, borderRadius: 13 }, sendText: { color: '#FFF', fontWeight: '800' },
});
