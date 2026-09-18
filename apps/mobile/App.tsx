import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import { Alert, ImageBackground, KeyboardAvoidingView, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { ChatMessage, Conversation, Demand, DemandType, Proposal, ProviderPlan, ProviderType, Rating, ServiceAddress, User, UserRole } from '@rubli/shared';
import { DEMAND_CATEGORIES, isValidCoordinates } from '@rubli/shared';
import { connectRealtime, disconnectRealtime, subscribeRealtime } from './src/core/realtime/client';
import { apiAcceptProposal, apiCancelDemand, apiConfirmProposal, apiCreateDemand, apiCurrentUser, apiGetUserProfile, apiListCategories, apiListPremiumProviders, apiListProviderOpportunities, apiLogin, apiLogout, apiRegister, apiSimulateProviderSubscription, apiUpdateUserProfile, hasAuthenticatedSession, onAuthenticationLost, type PremiumProviderSearchItem, type PublicProfessionalProfile, type PublicProvider, type RemoteDemandCategory } from './src/core/api/client';
import { clearLocalData, getConversations, getDemands, getMessages, getProposals, getUser, getUsers, saveConversations, saveDemands, saveMessages, saveProposals, saveUser } from './src/core/storage/localStore';
import { NegotiationChatScreen } from './src/screens/NegotiationChatScreen';
import { NotificationCenterScreen } from './src/screens/NotificationCenterScreen';
import { CompletionRatingModal } from './src/screens/CompletionRatingModal';
import { CreateDemandFlowScreen } from './src/screens/CreateDemandFlowScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { SupportScreen } from './src/screens/SupportScreen';
import { LegalDocumentModal } from './src/screens/LegalDocumentModal';
import { OpportunityScreen } from './src/screens/OpportunityScreen';
import { MyProfileScreen } from './src/screens/MyProfileScreen';
import { PublicProfileScreen } from './src/screens/PublicProfileScreen';
import { getHistoryDemands, getRatings } from './src/profile/profileStore';
import { CustomerApp } from './src/features/customer/CustomerApp';
import { ProviderApp } from './src/features/provider/ProviderApp';
import { useProviderFeed } from './src/features/provider/hooks/useProviderFeed';
import { FormField } from './src/shared/components/FormField';

const BRAND = '#0B3B82';
const ACCENT = '#0B66FF';
const BG = '#F6F9FE';
const AUTH_FIELD_LABEL = { color: '#DDE7F5' } as const;
const WELCOME_BACKGROUND = require('./assets/rubli-welcome.png');
const SERVICE_COMPLETE_BACKGROUND = require('./assets/rubli-service-complete.png');
const DEFAULT_RADIUS = 10;
const RADIUS_OPTIONS = [5, 10, 20, 50, 100] as const;
const navigationStyles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', minWidth: 58 },
  icon: { color: BRAND, fontSize: 17, lineHeight: 19 },
});

type Screen = 'home' | 'create' | 'profile' | 'chat' | 'negotiation' | 'opportunity';
const TYPE_LABELS: Record<DemandType, string> = { service: 'Serviço', purchase: 'Compra', delivery: 'Entrega', freight: 'Frete' };
const STATUS_LABELS: Record<Demand['status'], string> = { draft: 'Rascunho', open: 'Aberta', negotiating: 'Recebendo propostas', accepted: 'Acordo confirmado', provider_en_route: 'Prestador a caminho', provider_arrived: 'Prestador chegou', in_progress: 'Em andamento', awaiting_customer_confirmation: 'Aguardando sua confirmação', completed: 'Concluída', cancelled: 'Cancelada' };
const PROPOSAL_LABELS: Record<Proposal['status'], string> = { pending: 'Pendente', accepted: 'Aceita', rejected: 'Recusada', withdrawn: 'Retirada', superseded: 'Substituída' };
function newId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
function money(value?: number) { return typeof value === 'number' ? `R$ ${value.toFixed(2).replace('.', ',')}` : 'Valor aberto'; }
function formatDistance(km: number) { return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`; }

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [demands, setDemands] = useState<Demand[]>([]);
  const [targetProviderId, setTargetProviderId] = useState<string | undefined>();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [screen, setScreen] = useState<Screen>('home');
  const [entryStep, setEntryStep] = useState<'welcome' | 'role' | 'providerType' | 'auth'>('welcome');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [legalDocument, setLegalDocument] = useState<'terms' | 'privacy' | null>(null);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [providerProfileOpen, setProviderProfileOpen] = useState<PublicProfessionalProfile | null>(null);
  const [providerProfileRatings, setProviderProfileRatings] = useState<Rating[]>([]);
  const [knownUsers, setKnownUsers] = useState<User[]>([]);
  const [pendingRatingDemand, setPendingRatingDemand] = useState<Demand | null>(null);
  const [completionCelebrationVisible, setCompletionCelebrationVisible] = useState(false);
  const [dismissedRatingDemandIds, setDismissedRatingDemandIds] = useState<string[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState<{ demand: Demand; distanceKm?: number } | null>(null);
  const [newDemandPopup, setNewDemandPopup] = useState<{ demand: Demand; distanceKm?: number } | null>(null);
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState(''); const [taxDocument, setTaxDocument] = useState(''); const [taxDocumentType, setTaxDocumentType] = useState<'cpf' | 'cnpj'>('cpf'); const [businessName, setBusinessName] = useState(''); const [issuesInvoice, setIssuesInvoice] = useState(false); const [professionalTitle, setProfessionalTitle] = useState(''); const [password, setPassword] = useState(''); const [passwordConfirmation, setPasswordConfirmation] = useState(''); const [termsAccepted, setTermsAccepted] = useState(false); const [authMode, setAuthMode] = useState<'register' | 'login'>('register'); const [selectedPlan, setSelectedPlan] = useState<ProviderPlan>('standard'); const [authBusy, setAuthBusy] = useState(false); const [role, setRole] = useState<UserRole>('customer'); const [type, setType] = useState<DemandType>('service'); const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [category, setCategory] = useState(''); const [budget, setBudget] = useState(''); const [locationLabel, setLocationLabel] = useState(''); const [latitude, setLatitude] = useState<number | undefined>(); const [longitude, setLongitude] = useState<number | undefined>(); const [isUrgent, setIsUrgent] = useState(false);
  const [demandPhotoUris, setDemandPhotoUris] = useState<string[]>([]);
  const [providerType, setProviderType] = useState<ProviderType | null>(null);
  const [serviceAddress, setServiceAddress] = useState<Partial<ServiceAddress>>({});
  const [pickupAddress, setPickupAddress] = useState<Partial<ServiceAddress>>({});
  const [dropoffAddress, setDropoffAddress] = useState<Partial<ServiceAddress>>({});
  const [remoteCategories, setRemoteCategories] = useState<RemoteDemandCategory[]>([]);
  const [providerRadius, setProviderRadius] = useState(DEFAULT_RADIUS); const [providerLatitude, setProviderLatitude] = useState<number | undefined>(); const [providerLongitude, setProviderLongitude] = useState<number | undefined>(); const [profileName, setProfileName] = useState('');

  async function findPendingRating() {
    if (!user || pendingRatingDemand) return;
    const [history, ratings] = await Promise.all([getHistoryDemands(), getRatings()]);
    const next = history.find((demand) => demand.status === 'completed' && (demand.requesterId === user.id || demand.acceptedProviderId === user.id) && !dismissedRatingDemandIds.includes(demand.id) && !ratings.some((rating) => rating.demandId === demand.id && rating.fromUserId === user.id));
    if (next) setPendingRatingDemand(next);
  }

  useEffect(() => { (async () => {
    let storedUser = await getUser();
    if (storedUser) {
      if (!await hasAuthenticatedSession()) { await clearLocalData(); storedUser = null; }
      else try { storedUser = (await apiCurrentUser()).user; await saveUser(storedUser); }
      catch (error) {
        if (error instanceof Error && error.message.includes('UNAUTHORIZED')) { await clearLocalData(); storedUser = null; }
        // Sem conexão, mantém o cache somente como fallback offline.
      }
    }
    const [storedDemands, storedProposals, storedConversations, storedMessages, storedUsers] = await Promise.all([getDemands(), getProposals(), getConversations(), getMessages(), getUsers()]);
    setUser(storedUser); setDemands(storedDemands); setProposals(storedProposals); setConversations(storedConversations); setMessages(storedMessages); setKnownUsers(storedUsers);
    if (storedUser) { saveUser(storedUser).catch(() => undefined); setProviderRadius(storedUser.serviceRadiusKm ?? DEFAULT_RADIUS); setProviderLatitude(storedUser.serviceLatitude); setProviderLongitude(storedUser.serviceLongitude); setProfileName(storedUser.name); }
  })().catch(() => undefined); }, []);

  useEffect(() => onAuthenticationLost(() => {
    void clearLocalData().catch(() => undefined);
    setUser(null); setDemands([]); setProposals([]); setConversations([]); setMessages([]); setKnownUsers([]); setScreen('home'); setEntryStep('welcome');
  }), []);

  async function refreshCategories() {
    try { setRemoteCategories(await apiListCategories()); } catch { /* Mantém as categorias originais quando o servidor estiver indisponível. */ }
  }

  useEffect(() => { refreshCategories(); }, []);
  useEffect(() => { if (screen === 'create') refreshCategories(); }, [screen]);

  useEffect(() => {
    if (!user) { disconnectRealtime(); return; }
    connectRealtime(user.id);
    const unsubscribe = subscribeRealtime((event) => {
      if (event.type === 'admin.data_purged') {
        if (event.scope === 'users') {
          void clearLocalData().catch(() => undefined);
          setUser(null); setDemands([]); setProposals([]); setConversations([]); setMessages([]); setKnownUsers([]); setScreen('home'); setEntryStep('welcome');
        } else {
          void Promise.all([saveDemands([]), saveProposals([]), saveConversations([]), saveMessages([])]).catch(() => undefined);
          setDemands([]); setProposals([]); setConversations([]); setMessages([]); setScreen('home');
        }
        return;
      }
      if (event.type === 'category.updated') {
        refreshCategories().catch(() => undefined);
        return;
      }
      const refreshDemandData = async () => {
        const [nextDemands, nextProposals] = await Promise.all([getDemands(), getProposals()]);
        setDemands(nextDemands); setProposals(nextProposals);
        if (user.role === 'provider' && user.isAvailable !== false && event.type === 'demand.created' && event.actorUserId !== user.id) {
          // O popup é apenas uma apresentação do feed autenticado. Não fazemos
          // uma segunda regra local de categoria/raio, que poderia divergir do
          // matching central usado para distribuir o evento e o push.
          const opportunities = await apiListProviderOpportunities().catch(() => null);
          const newDemand = opportunities?.items.find((item) => item.id === event.demandId);
          if (newDemand) setNewDemandPopup({ demand: newDemand, distanceKm: newDemand.distanceKm });
        }
        await findPendingRating();
      };
      if (event.type === 'message.created') {
        Promise.all([getConversations(), getMessages()]).then(([nextConversations, nextMessages]) => { setConversations(nextConversations); setMessages(nextMessages); }).catch(() => undefined);
      } else if (event.demandId || event.proposalId || event.type === 'rating.created' || event.type === 'rating.requested') {
        refreshDemandData().catch(() => undefined);
      }
    });
    return unsubscribe;
  }, [user, providerLatitude, providerLongitude, providerRadius]);

  useEffect(() => { findPendingRating().catch(() => undefined); }, [user?.id]);
  useEffect(() => {
    if (!completionCelebrationVisible) return;
    const timeout = setTimeout(() => setCompletionCelebrationVisible(false), 5000);
    return () => clearTimeout(timeout);
  }, [completionCelebrationVisible]);

  const categories = useMemo(() => {
    const fromServer = remoteCategories.filter((item) => item.active && item.type === type).map((item) => item.name);
    return fromServer.length ? fromServer : DEMAND_CATEGORIES[type] as readonly string[];
  }, [remoteCategories, type]);
  const providerFeed = useProviderFeed(user, demands, providerLatitude, providerLongitude, providerRadius);

  async function enterWithUser(nextUser: User) { await saveUser(nextUser); setUser(nextUser); setProviderRadius(nextUser.serviceRadiusKm ?? DEFAULT_RADIUS); setProviderLatitude(nextUser.serviceLatitude); setProviderLongitude(nextUser.serviceLongitude); setProfileName(nextUser.name); setPassword(''); setPasswordConfirmation(''); }
  async function createAccount(simulatePayment = false) {
    if (!name.trim() || !email.trim() || !phone.trim() || !taxDocument.trim() || !password) return Alert.alert('Complete o cadastro', 'Informe nome, telefone, CPF/CNPJ, e-mail e senha.');
    if (role === 'provider' && !providerType) return Alert.alert('Modalidade profissional', 'Selecione como você quer trabalhar no Rubli.');
    if (!termsAccepted) return Alert.alert('Aceite necessário', 'Para criar sua conta, leia e aceite os Termos de Uso e a Política de Privacidade.');
    if (password.length < 8) return Alert.alert('Senha fraca', 'Use ao menos 8 caracteres.');
    if (password !== passwordConfirmation) return Alert.alert('Senhas diferentes', 'Confirme a mesma senha nos dois campos.');
    setAuthBusy(true);
    try {
      const registered = await apiRegister({ name: name.trim(), email: email.trim(), phone, password, role: role as 'customer' | 'provider', providerType: role === 'provider' ? providerType ?? undefined : undefined, providerPlan: role === 'provider' ? selectedPlan : undefined, taxDocument, taxDocumentType: role === 'provider' ? taxDocumentType : 'cpf', businessName: role === 'provider' && taxDocumentType === 'cnpj' ? businessName : undefined, issuesInvoice: role === 'provider' ? issuesInvoice : undefined, professionalTitle: role === 'provider' ? professionalTitle : undefined });
      const nextUser = simulatePayment && role === 'provider' ? (await apiSimulateProviderSubscription(registered.user.id, selectedPlan)).user : registered.user;
      await enterWithUser(nextUser);
      Alert.alert(simulatePayment ? 'Pagamento simulado' : 'Conta criada', simulatePayment ? `Plano ${selectedPlan === 'premium_verified' ? 'Premium Verificado' : 'Comum'} ativado apenas para teste. Nenhuma cobrança foi realizada.` : role === 'provider' ? 'Você ganhou 7 dias grátis para conhecer o Rubli.' : 'Sua conta foi criada com segurança.');
    } catch (error) { Alert.alert('Não foi possível criar a conta', error instanceof Error ? error.message : 'Tente novamente.'); } finally { setAuthBusy(false); }
  }
  async function login() {
    if (!email.trim() || !password) return Alert.alert('Dados obrigatórios', 'Informe e-mail e senha.');
    setAuthBusy(true);
    try { await enterWithUser((await apiLogin({ email: email.trim(), password })).user); } catch (error) { Alert.alert('Não foi possível entrar', error instanceof Error ? error.message : 'Tente novamente.'); } finally { setAuthBusy(false); }
  }
  async function captureLocationForDemand(kind: 'service' | 'pickup' | 'dropoff' = 'service') { try { const permission = await Location.requestForegroundPermissionsAsync(); if (permission.status !== 'granted') return Alert.alert('Localização', 'Permissão não concedida. Você pode preencher o endereço manualmente.'); const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }); const [place] = await Location.reverseGeocodeAsync(current.coords).catch(() => []); const currentAddress = kind === 'service' ? serviceAddress : kind === 'pickup' ? pickupAddress : dropoffAddress; const next = { ...currentAddress, latitude: current.coords.latitude, longitude: current.coords.longitude, street: place?.street ?? currentAddress.street, number: place?.streetNumber ?? currentAddress.number, neighborhood: place?.district ?? currentAddress.neighborhood, city: place?.city ?? currentAddress.city, state: place?.region ?? currentAddress.state, postalCode: place?.postalCode ?? currentAddress.postalCode }; if (kind === 'service') setServiceAddress(next); else if (kind === 'pickup') setPickupAddress(next); else setDropoffAddress(next); if (kind !== 'dropoff') { setLatitude(current.coords.latitude); setLongitude(current.coords.longitude); } if (!locationLabel.trim() && next.neighborhood && next.city && next.state) setLocationLabel(`${next.neighborhood} · ${next.city} - ${next.state}`); } catch { Alert.alert('Localização', 'Não foi possível obter sua localização.'); } }
  async function pickDemandPhotos() { try { const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!permission.granted) return Alert.alert('Fotos', 'Permita o acesso à galeria para adicionar fotos do serviço.'); const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 5, quality: 0.2, base64: true }); if (result.canceled) return; const allUris = result.assets.map((asset) => asset.base64 ? `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}` : asset.uri).filter(Boolean); const nextUris = allUris.filter((uri) => uri.length <= 1_500_000); if (nextUris.length !== allUris.length) Alert.alert('Foto muito grande', 'Algumas fotos foram removidas para que a demanda seja enviada. Escolha imagens menores ou recorte a foto antes de adicionar.'); setDemandPhotoUris((current) => [...current, ...nextUris].slice(0, 5)); } catch { Alert.alert('Fotos', 'Não foi possível abrir a galeria.'); } }
  function removeDemandPhoto(uri: string) { setDemandPhotoUris((current) => current.filter((item) => item !== uri)); }
  async function captureProviderLocation() {
    try {
      if (!user || user.role !== 'provider') return;
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') return Alert.alert('Localização', 'Permissão não concedida.');
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const nextUser = await apiUpdateUserProfile(user.id, {
        serviceLatitude: current.coords.latitude,
        serviceLongitude: current.coords.longitude,
      });
      setProviderLatitude(nextUser.serviceLatitude);
      setProviderLongitude(nextUser.serviceLongitude);
      await saveUser(nextUser);
      setUser(nextUser);
    } catch { Alert.alert('Localização', 'Não foi possível salvar sua localização para encontrar chamados próximos.'); }
  }
  async function createDemand() { if (!user) return; const parsedBudget = budget.trim() ? Number(budget.replace(',', '.')) : undefined; const routeDemand = type === 'delivery' || type === 'freight'; const hasAddress = (address: Partial<ServiceAddress>) => Boolean(address.postalCode?.trim() && address.street?.trim() && address.number?.trim() && address.neighborhood?.trim() && address.city?.trim() && address.state?.trim() && Number.isFinite(address.latitude) && Number.isFinite(address.longitude)); const completeAddress = type === 'service' ? hasAddress(serviceAddress) : routeDemand ? hasAddress(pickupAddress) && hasAddress(dropoffAddress) : true; if (!title.trim() || !description.trim() || !category || !completeAddress) return Alert.alert('Informe os endereços', routeDemand ? 'Preencha coleta e destino completos e confirme a localização de cada ponto.' : 'Para serviços presenciais, preencha CEP, rua, número, bairro, cidade, UF e confirme a localização.'); if (parsedBudget !== undefined && (!Number.isFinite(parsedBudget) || parsedBudget <= 0)) return Alert.alert('Valor inválido', 'Informe um valor maior que zero ou deixe o campo vazio.'); const address = type === 'service' ? serviceAddress as ServiceAddress : undefined; const pickup = routeDemand ? pickupAddress as ServiceAddress : undefined; const dropoff = routeDemand ? dropoffAddress as ServiceAddress : undefined; const now = new Date().toISOString(); const draft: Demand = { id: newId('dem'), requesterId: user.id, type, title: title.trim(), description: description.trim(), category, budgetType: parsedBudget ? 'fixed' : 'open', budget: parsedBudget, locationLabel: address ? `${address.neighborhood} · ${address.city} - ${address.state}` : pickup ? `${pickup.neighborhood} → ${dropoff!.neighborhood}` : locationLabel.trim(), latitude: address?.latitude ?? pickup?.latitude ?? latitude, longitude: address?.longitude ?? pickup?.longitude ?? longitude, serviceAddress: address, pickupAddress: pickup, dropoffAddress: dropoff, isUrgent, photoUris: demandPhotoUris, status: 'open', createdAt: now, updatedAt: now, targetProviderId }; try { const next = await apiCreateDemand(draft); const nextDemands = [next, ...demands]; setDemands(nextDemands); await saveDemands(nextDemands); setTitle(''); setDescription(''); setBudget(''); setLocationLabel(''); setServiceAddress({}); setPickupAddress({}); setDropoffAddress({}); setCategory(''); setLatitude(undefined); setLongitude(undefined); setIsUrgent(false); setDemandPhotoUris([]); setTargetProviderId(undefined); setScreen('home'); Alert.alert('Demanda publicada', targetProviderId ? 'Sua solicitação foi enviada diretamente ao profissional escolhido.' : isUrgent ? 'Sua demanda foi publicada como PRECISO AGORA.' : 'Sua demanda foi publicada.'); } catch (error) { Alert.alert('Não foi possível publicar', error instanceof Error ? error.message : 'Tente novamente.'); } }
  async function ensureConversation(demandId: string, providerId: string) { const demand = demands.find((item) => item.id === demandId); if (!demand) return null; const existing = conversations.find((item) => item.demandId === demandId && item.customerId === demand.requesterId && item.providerId === providerId); if (existing) return existing; const now = new Date().toISOString(); const conversation: Conversation = { id: newId('conv'), demandId, customerId: demand.requesterId, providerId, createdAt: now, updatedAt: now }; const next = [conversation, ...conversations]; setConversations(next); await saveConversations(next); return conversation; }
  async function openProposalChat(proposal: Proposal) { const conversation = await ensureConversation(proposal.demandId, proposal.providerId); if (!conversation) return; setActiveConversation(conversation); setScreen('negotiation'); }
  async function openProposalProviderProfile(proposal: Proposal) {
    try {
      const [provider, ratings] = await Promise.all([apiGetUserProfile(proposal.providerId), getRatings()]);
      setProviderProfileRatings(ratings);
      setProviderProfileOpen(provider);
    } catch (error) {
      Alert.alert('Perfil indisponível', error instanceof Error ? error.message : 'Não foi possível carregar o perfil deste prestador agora.');
    }
  }
  async function openSearchProviderProfile(providerId: string) {
    try { const [provider, ratings] = await Promise.all([apiGetUserProfile(providerId), getRatings()]); setProviderProfileRatings(ratings); setProviderProfileOpen(provider); }
    catch (error) { Alert.alert('Perfil indisponível', error instanceof Error ? error.message : 'Não foi possível carregar o perfil deste prestador agora.'); }
  }
  function openOpportunity(demand: Demand, distanceKm?: number) { setSelectedOpportunity({ demand, distanceKm }); setScreen('opportunity'); }
  async function openOpportunityNegotiation() { if (!user || !selectedOpportunity) return; const conversation = await ensureConversation(selectedOpportunity.demand.id, user.id); if (!conversation) return; setActiveConversation(conversation); setScreen('negotiation'); }
  async function acceptProposal(proposal: Proposal) {
    if (!user || proposal.status !== 'pending') return;
    const demand = demands.find((item) => item.id === proposal.demandId);
    if (!demand || demand.requesterId !== user.id) return;

    try {
      // Compatibilidade com negociações criadas antes da correção: nelas o
      // prestador já confirmou a oferta de orçamento do cliente, então ao
      // cliente cabe a confirmação final, e não aceitar a própria oferta.
      const legacyBudgetAcceptance = proposal.offeredBy === 'customer' && Boolean(proposal.providerConfirmedAt) && !proposal.customerConfirmedAt;
      const result = legacyBudgetAcceptance
        ? await apiConfirmProposal(proposal.id)
        : await apiAcceptProposal(proposal.id);
      setProposals((current) => current.map((item) => item.id === result.proposal.id ? result.proposal : item));
      setDemands((current) => current.map((item) => item.id === result.demand.id ? result.demand : item));

      const conversation = await ensureConversation(result.demand.id, result.proposal.providerId);
      if (conversation) {
        setActiveConversation(conversation);
        setScreen('negotiation');
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Não foi possível registrar o aceite.';
      Alert.alert('Não foi possível avançar', detail);
    }
  }
  async function cancelDemand(demand: Demand) {
    if (!user || demand.requesterId !== user.id) return;
    const cancelled = await apiCancelDemand(demand.id);
    const nextDemands = demands.map((item) => item.id === cancelled.id ? cancelled : item);
    await saveDemands(nextDemands);
    setDemands(nextDemands.filter((item) => item.status !== 'cancelled'));
  }

  async function sendMessage(text: string) { if (!user || !activeConversation || !text.trim()) return; const message: ChatMessage = { id: newId('msg'), conversationId: activeConversation.id, senderId: user.id, text: text.trim(), createdAt: new Date().toISOString() }; const nextMessages = [...messages, message]; const nextConversations = conversations.map((item) => item.id === activeConversation.id ? { ...item, updatedAt: message.createdAt, lastMessageAt: message.createdAt } : item); setMessages(nextMessages); setConversations(nextConversations); await saveMessages(nextMessages); await saveConversations(nextConversations); }
  async function updateProviderSettings(radius: number) { if (!user) return; const nextUser = { ...user, serviceRadiusKm: radius }; await saveUser(nextUser); setUser(nextUser); setProviderRadius(radius); }
  async function updateProfileName() { if (!user || !profileName.trim()) return; const nextUser = { ...user, name: profileName.trim() }; await saveUser(nextUser); setUser(nextUser); }
  async function signOut() { disconnectRealtime(); await apiLogout().catch(() => undefined); await saveUser(null); setUser(null); setName(''); setEmail(''); setPassword(''); setPasswordConfirmation(''); setRole('customer'); setProfileName(''); setAuthMode('login'); setEntryStep('welcome'); setScreen('home'); }
  function showServiceCompletion() { setPendingRatingDemand(null); setHistoryOpen(false); setActiveConversation(null); setSelectedOpportunity(null); setScreen('home'); setCompletionCelebrationVisible(true); }
  async function simulatePlan(plan: ProviderPlan) { if (!user || user.role !== 'provider') return; try { const result = await apiSimulateProviderSubscription(user.id, plan); await enterWithUser(result.user); Alert.alert('Pagamento simulado', `Plano ${plan === 'premium_verified' ? 'Premium Verificado' : 'Comum'} ativado para teste. Nenhuma cobrança foi realizada.`); } catch (error) { Alert.alert('Simulação indisponível', error instanceof Error ? error.message : 'Tente novamente.'); } }

  if (!user && entryStep === 'welcome') return <WelcomeScreen onStart={() => setEntryStep('role')} onLogin={() => { setAuthMode('login'); setEntryStep('auth'); }} />;
  if (!user && entryStep === 'role') return <RoleEntryScreen onBack={() => setEntryStep('welcome')} onSelectCustomer={() => { setRole('customer'); setProviderType(null); setAuthMode('register'); setEntryStep('auth'); }} onSelectProvider={() => { setRole('provider'); setAuthMode('register'); setEntryStep('providerType'); }} onLogin={() => { setAuthMode('login'); setEntryStep('auth'); }} />;
  if (!user && entryStep === 'providerType') return <ProviderTypeEntryScreen onBack={() => setEntryStep('role')} onSelect={(nextType) => { setProviderType(nextType); setEntryStep('auth'); }} />;
  if (!user) return <SafeAreaView style={styles.safe}><StatusBar style="light" /><ScrollView contentContainerStyle={styles.onboarding}>
    <Text style={styles.logo}>Rubli</Text><Text style={styles.tagline}>Quem precisa, encontra quem resolve.</Text>
    <Text style={styles.heading}>{authMode === 'register' ? 'Crie sua conta' : 'Entre na sua conta'}</Text><Text style={styles.mutedLight}>Seu cadastro fica protegido por senha no servidor.</Text>
    {authMode === 'register' && <FormField label="Nome completo" value={name} onChangeText={setName} placeholder="Ex.: João da Silva" autoCapitalize="words" style={styles.inputDark} labelStyle={AUTH_FIELD_LABEL} />}
    <FormField label="E-mail" value={email} onChangeText={setEmail} placeholder="voce@email.com" autoCapitalize="none" keyboardType="email-address" style={styles.inputDark} labelStyle={AUTH_FIELD_LABEL} />
    {authMode === 'register' && <><FormField label="Celular" value={phone} onChangeText={setPhone} placeholder="(69) 99999-9999" keyboardType="phone-pad" style={styles.inputDark} labelStyle={AUTH_FIELD_LABEL} /><FormField label={role === 'provider' && taxDocumentType === 'cnpj' ? 'CNPJ' : 'CPF'} value={taxDocument} onChangeText={setTaxDocument} placeholder={role === 'provider' && taxDocumentType === 'cnpj' ? '00.000.000/0001-00' : '000.000.000-00'} keyboardType="numeric" style={styles.inputDark} labelStyle={AUTH_FIELD_LABEL} /></>}
    <FormField label="Senha" value={password} onChangeText={setPassword} placeholder="Digite sua senha" secureTextEntry style={styles.inputDark} labelStyle={AUTH_FIELD_LABEL} />
    {authMode === 'register' && <><FormField label="Confirmar senha" value={passwordConfirmation} onChangeText={setPasswordConfirmation} placeholder="Digite novamente" secureTextEntry style={styles.inputDark} labelStyle={AUTH_FIELD_LABEL} />
      <TouchableOpacity onPress={() => setEntryStep('role')}><Text style={{ color: '#BFD9FF', fontWeight: '800', marginTop: -2, marginBottom: 12 }}>Cadastro como {role === 'provider' ? 'prestador de serviços' : 'cliente'} · Alterar</Text></TouchableOpacity>
      {role === 'provider' && <><FormField label="Profissão ou especialidade" value={professionalTitle} onChangeText={setProfessionalTitle} placeholder="Ex.: Eletricista residencial" style={styles.inputDark} labelStyle={AUTH_FIELD_LABEL} /><View style={styles.rowWrap}><RoleButton label="Autônomo (CPF)" active={taxDocumentType === 'cpf'} onPress={() => setTaxDocumentType('cpf')} /><RoleButton label="Empresa (CNPJ)" active={taxDocumentType === 'cnpj'} onPress={() => setTaxDocumentType('cnpj')} /></View>{taxDocumentType === 'cnpj' && <FormField label="Razão social ou nome da empresa" value={businessName} onChangeText={setBusinessName} placeholder="Ex.: Empresa Silva LTDA" style={styles.inputDark} labelStyle={AUTH_FIELD_LABEL} />}<TouchableOpacity style={[styles.value, issuesInvoice && { borderWidth: 2, borderColor: ACCENT }]} onPress={() => setIssuesInvoice((value) => !value)}><Text style={styles.label}>{issuesInvoice ? '✓' : '○'} Emite nota fiscal</Text></TouchableOpacity></>}
      {role === 'provider' && <View style={styles.infoBox}><Text style={styles.infoTitle}>Escolha seu plano de prestador</Text>
        <TouchableOpacity style={[styles.value, selectedPlan === 'standard' && { borderWidth: 2, borderColor: ACCENT }]} onPress={() => setSelectedPlan('standard')}><Text style={styles.label}>Comum · R$ 49,90/mês</Text><Text style={styles.muted}>Receba oportunidades e envie propostas.</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.value, selectedPlan === 'premium_verified' && { borderWidth: 2, borderColor: ACCENT }]} onPress={() => setSelectedPlan('premium_verified')}><Text style={styles.label}>Premium Verificado · R$ 69,90/mês</Text><Text style={styles.muted}>Selo verificado, prioridade nos chamados e perfil disponível para busca direta do cliente.</Text></TouchableOpacity>
      </View>}<TouchableOpacity style={[styles.value, termsAccepted && { borderWidth: 2, borderColor: ACCENT }]} onPress={() => setTermsAccepted((value) => !value)}><Text style={styles.label}>{termsAccepted ? '✓' : '○'} Aceito os Termos de Uso e a Política de Privacidade</Text><Text style={styles.muted}>A Rubli Tecnologia LTDA atua como intermediadora entre clientes e prestadores.</Text></TouchableOpacity></>}
    <TouchableOpacity style={styles.primaryButton} disabled={authBusy} onPress={() => authMode === 'register' ? createAccount(false) : login()}><Text style={styles.primaryText}>{authBusy ? 'Aguarde...' : authMode === 'register' ? 'Criar conta' : 'Entrar'}</Text></TouchableOpacity>
    {authMode === 'login' && <TouchableOpacity onPress={() => Alert.alert('Recuperar senha', 'A recuperação por e-mail será liberada junto da configuração do serviço de envio seguro. Por enquanto, entre em contato com a administração do Rubli para validar sua identidade e redefinir o acesso.')} hitSlop={10}><Text style={{ color: '#BFD9FF', fontWeight: '800', textAlign: 'center', marginTop: 16, marginBottom: 8 }}>Esqueci minha senha</Text></TouchableOpacity>}
    {authMode === 'register' && role === 'provider' && <TouchableOpacity style={styles.secondaryButton} disabled={authBusy} onPress={() => createAccount(true)}><Text style={styles.secondaryText}>Simular pagamento de {selectedPlan === 'premium_verified' ? 'R$ 69,90' : 'R$ 49,90'}</Text></TouchableOpacity>}
    <TouchableOpacity onPress={() => { if (authMode === 'register') { setAuthMode('login'); } else { setEntryStep('role'); } setPasswordConfirmation(''); }}><Text style={styles.mutedLight}>{authMode === 'register' ? 'Já tem cadastro? Entre' : 'Ainda não possui conta? Criar cadastro'}</Text></TouchableOpacity>
    <Text style={styles.mutedLight}>A simulação não cobra nenhum valor e serve apenas para testar os planos.</Text>
  </ScrollView></SafeAreaView>;
  if (completionCelebrationVisible) return <ServiceCompletionScreen />;
  if (screen === 'negotiation' && activeConversation) return <NegotiationChatScreen user={user} conversation={activeConversation} onBack={() => setScreen(selectedOpportunity ? 'opportunity' : 'home')} onRatingSaved={showServiceCompletion} />;
  if (screen === 'opportunity' && selectedOpportunity) return <OpportunityScreen user={user} demand={selectedOpportunity.demand} distanceKm={selectedOpportunity.distanceKm} onBack={() => { setSelectedOpportunity(null); setScreen('home'); }} onViewDemand={openOpportunityNegotiation} onIgnore={() => { setSelectedOpportunity(null); setScreen('home'); }} />;
  if (screen === 'chat' && activeConversation) return <ChatView conversation={activeConversation} currentUserId={user.id} messages={messages.filter((item) => item.conversationId === activeConversation.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))} onBack={() => setScreen('home')} onSend={sendMessage} />;
  if (screen === 'create') return <SafeAreaView style={styles.safeLight}><StatusBar style="dark" /><CreateDemandFlowScreen type={type} category={category} categories={categories} title={title} description={description} budget={budget} locationLabel={locationLabel} address={serviceAddress} pickupAddress={pickupAddress} dropoffAddress={dropoffAddress} isUrgent={isUrgent} photoUris={demandPhotoUris} onBack={() => setScreen('home')} onType={(nextType) => { setType(nextType); setCategory(''); }} onCategory={setCategory} onTitle={setTitle} onDescription={setDescription} onBudget={setBudget} onLocation={setLocationLabel} onAddress={setServiceAddress} onPickupAddress={setPickupAddress} onDropoffAddress={setDropoffAddress} onLocate={captureLocationForDemand} onUrgent={() => setIsUrgent((value) => !value)} onPickPhotos={pickDemandPhotos} onRemovePhoto={removeDemandPhoto} onPublish={createDemand} /></SafeAreaView>;
  return <SafeAreaView style={styles.safeLight}><StatusBar style="dark" /><View style={styles.header}><View><Text style={styles.brand}>Rubli</Text><Text style={styles.headerSubtitle}>Olá, {user.name}</Text></View><TouchableOpacity onPress={() => setScreen('profile')} style={styles.avatar}><Text style={styles.avatarText}>{user.name[0]?.toUpperCase()}</Text></TouchableOpacity></View>
    {screen === 'home' && user.role === 'customer' && <CustomerApp user={user} demands={demands} proposals={proposals} onCreate={(selectedType) => { setTargetProviderId(undefined); setType(selectedType); setCategory(''); setScreen('create'); }} onAccept={acceptProposal} onCancel={cancelDemand} onChat={openProposalChat} onViewProvider={openProposalProviderProfile} onOpenProvider={(provider) => openSearchProviderProfile(provider.id)} onRequestProvider={(provider: PremiumProviderSearchItem) => { setTargetProviderId(provider.id); setType(provider.providerType === 'courier' ? 'delivery' : provider.providerType === 'freight' ? 'freight' : 'service'); setCategory(provider.serviceCategories[0] ?? ''); setScreen('create'); }} />}
    {screen === 'home' && user.role === 'provider' && <ProviderApp feed={providerFeed} latitude={providerLatitude} longitude={providerLongitude} onLocate={captureProviderLocation} onOpenOpportunity={openOpportunity} />}
    {screen === 'profile' && <ProfileScreen user={user} profileName={profileName} onNameChange={setProfileName} onSaveName={updateProfileName} onEditProfessional={() => setProfileEditOpen(true)} onSimulatePlan={simulatePlan} onOpenSupport={() => setSupportOpen(true)} onOpenTerms={() => setLegalDocument('terms')} onOpenPrivacy={() => setLegalDocument('privacy')} onSignOut={signOut} onBack={() => setScreen('home')} />}
<View style={styles.nav}><TouchableOpacity style={navigationStyles.button} onPress={() => setScreen('home')}><Text style={navigationStyles.icon}>⌂</Text><Text style={styles.navItem}>Início</Text></TouchableOpacity><TouchableOpacity style={navigationStyles.button} onPress={() => user.role === 'customer' ? (setType('service'), setCategory(''), setScreen('create')) : setScreen('home')}><Text style={navigationStyles.icon}>▣</Text><Text style={styles.navItem}>Demandas</Text></TouchableOpacity><TouchableOpacity style={navigationStyles.button} onPress={() => setHistoryOpen(true)}><Text style={navigationStyles.icon}>▤</Text><Text style={styles.navItem}>Histórico</Text></TouchableOpacity><TouchableOpacity style={navigationStyles.button} onPress={() => setNotificationsOpen(true)}><Text style={navigationStyles.icon}>♧</Text><Text style={styles.navItem}>Notificações</Text></TouchableOpacity><TouchableOpacity style={navigationStyles.button} onPress={() => setScreen('profile')}><Text style={navigationStyles.icon}>♙</Text><Text style={styles.navItem}>Perfil</Text></TouchableOpacity></View>
    <HistoryScreen user={user} profiles={[user, ...knownUsers.filter((item) => item.id !== user.id)]} visible={historyOpen} onClose={() => setHistoryOpen(false)} onChanged={() => findPendingRating().catch(() => undefined)} onRatingSaved={showServiceCompletion} />
    <SupportScreen user={user} visible={supportOpen} onClose={() => setSupportOpen(false)} />
    <LegalDocumentModal document={legalDocument} onClose={() => setLegalDocument(null)} />
    <Modal visible={profileEditOpen} animationType="slide" onRequestClose={() => setProfileEditOpen(false)}><SafeAreaView style={styles.safeLight}><MyProfileScreen user={user} availableCategories={remoteCategories} onClose={() => setProfileEditOpen(false)} onSaved={(updatedUser) => { void enterWithUser(updatedUser); setProfileName(updatedUser.name); refreshCategories().catch(() => undefined); setProfileEditOpen(false); }} /></SafeAreaView></Modal>
    <NotificationCenterScreen user={user} visible={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    {providerProfileOpen && <PublicProfileScreen user={providerProfileOpen} metrics={providerProfileOpen.professionalMetrics} ratings={providerProfileRatings} visible onClose={() => setProviderProfileOpen(null)} />}
    <CompletionRatingModal visible={Boolean(pendingRatingDemand)} demand={pendingRatingDemand} user={user} onClose={() => { if (pendingRatingDemand) setDismissedRatingDemandIds((current) => [...current, pendingRatingDemand.id]); setPendingRatingDemand(null); }} onSaved={async () => { if (pendingRatingDemand) setDismissedRatingDemandIds((current) => [...current, pendingRatingDemand.id]); showServiceCompletion(); }} />
    <Modal visible={Boolean(newDemandPopup)} transparent animationType="fade" onRequestClose={() => setNewDemandPopup(null)}>
      <View style={providerPopupStyles.backdrop}><View style={providerPopupStyles.card}>
        <Text style={providerPopupStyles.eyebrow}>NOVO CHAMADO</Text>
        <Text style={providerPopupStyles.title}>{newDemandPopup?.demand.isUrgent ? '⚡ Preciso agora' : 'Uma oportunidade perto de você'}</Text>
        <Text style={providerPopupStyles.demandTitle}>{newDemandPopup?.demand.title}</Text>
        <Text style={providerPopupStyles.detail}>{newDemandPopup?.demand.category} · {newDemandPopup?.demand.locationLabel}</Text>
        {newDemandPopup?.distanceKm !== undefined && <Text style={providerPopupStyles.distance}>{formatDistance(newDemandPopup.distanceKm)} de você</Text>}
        <TouchableOpacity style={providerPopupStyles.primary} onPress={() => { const item = newDemandPopup; setNewDemandPopup(null); if (item) openOpportunity(item.demand, item.distanceKm); }}><Text style={providerPopupStyles.primaryText}>Ver chamado agora</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setNewDemandPopup(null)}><Text style={providerPopupStyles.dismiss}>Agora não</Text></TouchableOpacity>
      </View></View>
    </Modal>
  </SafeAreaView>;
}

function WelcomeScreen({ onStart, onLogin }: { onStart: () => void; onLogin: () => void }) {
  return <ImageBackground source={WELCOME_BACKGROUND} resizeMode="cover" style={welcomeStyles.background}><StatusBar style="light" /><View style={welcomeStyles.shade}><View style={welcomeStyles.bottom}><Text style={welcomeStyles.promise}>Encontre. Negocie.{'\n'}Contrate. Acompanhe.</Text><Text style={welcomeStyles.description}>Serviços locais, mais perto de você.</Text><TouchableOpacity style={welcomeStyles.startButton} onPress={onStart}><Text style={welcomeStyles.startButtonText}>Começar</Text></TouchableOpacity><TouchableOpacity onPress={onLogin} hitSlop={12}><Text style={welcomeStyles.loginLink}>Já tem cadastro? <Text style={welcomeStyles.loginLinkStrong}>Entre</Text></Text></TouchableOpacity></View></View></ImageBackground>;
}

function RoleEntryScreen({ onBack, onSelectCustomer, onSelectProvider, onLogin }: { onBack: () => void; onSelectCustomer: () => void; onSelectProvider: () => void; onLogin: () => void }) {
  return <SafeAreaView style={roleStyles.safe}><StatusBar style="dark" /><ScrollView contentContainerStyle={roleStyles.content}><TouchableOpacity onPress={onBack} hitSlop={12}><Text style={roleStyles.back}>‹ Voltar</Text></TouchableOpacity><Text style={roleStyles.eyebrow}>BEM-VINDO AO RUBLI</Text><Text style={roleStyles.title}>Como você quer usar o Rubli?</Text><Text style={roleStyles.subtitle}>Escolha seu perfil para personalizarmos sua experiência desde o início.</Text><TouchableOpacity style={roleStyles.card} onPress={onSelectCustomer}><View style={[roleStyles.icon, roleStyles.customerIcon]}><Text style={roleStyles.iconText}>⌕</Text></View><View style={roleStyles.cardText}><Text style={roleStyles.cardTitle}>Quero contratar</Text><Text style={roleStyles.cardDescription}>Busco prestadores de serviço para resolver o que preciso.</Text></View><Text style={roleStyles.arrow}>›</Text></TouchableOpacity><TouchableOpacity style={roleStyles.card} onPress={onSelectProvider}><View style={[roleStyles.icon, roleStyles.providerIcon]}><Text style={roleStyles.iconText}>⚒</Text></View><View style={roleStyles.cardText}><Text style={roleStyles.cardTitle}>Quero trabalhar</Text><Text style={roleStyles.cardDescription}>Escolha sua modalidade profissional na próxima etapa.</Text></View><Text style={roleStyles.arrow}>›</Text></TouchableOpacity><View style={roleStyles.loginBox}><Text style={roleStyles.loginText}>Já tem cadastro?</Text><TouchableOpacity onPress={onLogin}><Text style={roleStyles.loginAction}>Entre na sua conta</Text></TouchableOpacity></View></ScrollView></SafeAreaView>;
}

function ProviderTypeEntryScreen({ onBack, onSelect }: { onBack: () => void; onSelect: (type: ProviderType) => void }) {
  const options: Array<{ type: ProviderType; icon: string; title: string; description: string }> = [
    { type: 'services', icon: '🛠', title: 'Prestador de serviços', description: 'Reparos, manutenção, limpeza e serviços especializados.' },
    { type: 'courier', icon: '🏍', title: 'Entregas / Motoboy', description: 'Entregas rápidas, retiradas e pequenas encomendas.' },
    { type: 'freight', icon: '🚚', title: 'Fretes e mudanças', description: 'Transporte de móveis, materiais, mudanças e cargas.' },
  ];
  return <SafeAreaView style={roleStyles.safe}><StatusBar style="dark" /><ScrollView contentContainerStyle={roleStyles.content}><TouchableOpacity onPress={onBack} hitSlop={12}><Text style={roleStyles.back}>‹ Voltar</Text></TouchableOpacity><Text style={roleStyles.eyebrow}>TRABALHE COM O RUBLI</Text><Text style={roleStyles.title}>Como você quer trabalhar?</Text><Text style={roleStyles.subtitle}>Escolha uma modalidade para criar sua conta profissional.</Text>{options.map((option) => <TouchableOpacity key={option.type} style={roleStyles.card} onPress={() => onSelect(option.type)}><View style={[roleStyles.icon, roleStyles.providerIcon]}><Text style={roleStyles.iconText}>{option.icon}</Text></View><View style={roleStyles.cardText}><Text style={roleStyles.cardTitle}>{option.title}</Text><Text style={roleStyles.cardDescription}>{option.description}</Text></View><Text style={roleStyles.arrow}>›</Text></TouchableOpacity>)}</ScrollView></SafeAreaView>;
}

function ServiceCompletionScreen() {
  return <ImageBackground source={SERVICE_COMPLETE_BACKGROUND} resizeMode="contain" style={serviceCompletionStyles.background}><StatusBar style="light" /></ImageBackground>;
}

function CustomerHome({ user, demands, proposals, onCreate, onAccept, onCancel, onChat }: { user: User; demands: Demand[]; proposals: Proposal[]; onCreate: (type: DemandType) => void; onAccept: (proposal: Proposal) => Promise<void>; onCancel: (demand: Demand) => Promise<void>; onChat: (proposal: Proposal) => Promise<void> }) {
  const [providerSearch, setProviderSearch] = useState('');
  const [providerResults, setProviderResults] = useState<PublicProvider[]>([]);
  const [searchingProvider, setSearchingProvider] = useState(false);
  async function searchPremiumProviders() { setSearchingProvider(true); try { setProviderResults(await apiListPremiumProviders(providerSearch)); } catch { Alert.alert('Busca indisponível', 'Não foi possível carregar os prestadores verificados agora.'); } finally { setSearchingProvider(false); } }
  const ownDemands = demands.filter((item) => item.requesterId === user.id && !['completed', 'cancelled'].includes(item.status));
  const categoryCards: Array<{ icon: string; label: string; type: DemandType }> = [
    { icon: '🚗', label: 'Automotivo', type: 'service' }, { icon: '⚡', label: 'Elétrica', type: 'service' },
    { icon: '🔧', label: 'Manutenção', type: 'service' }, { icon: '🧹', label: 'Limpeza', type: 'service' },
    { icon: '📦', label: 'Entrega', type: 'delivery' }, { icon: '•••', label: 'Outros', type: 'service' },
  ];
  return <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
    <View style={styles.homeSearch}><Text style={styles.searchIcon}>⌕</Text><TextInput value={providerSearch} onChangeText={setProviderSearch} onSubmitEditing={() => searchPremiumProviders()} placeholder="Buscar prestador verificado" placeholderTextColor="#7C8BA0" style={{ flex: 1, color: BRAND }} /><TouchableOpacity onPress={() => searchPremiumProviders()}><Text style={styles.homeSeeAll}>{searchingProvider ? '...' : 'Buscar'}</Text></TouchableOpacity></View>
    {providerResults.length > 0 && <View style={styles.infoBox}><Text style={styles.infoTitle}>Prestadores Premium verificados</Text>{providerResults.map((provider) => <View key={provider.id} style={styles.proposal}><Text style={styles.demandTitle}>✓ {provider.name}</Text>{provider.professionalTitle && <Text style={styles.mutedSmall}>{provider.professionalTitle}</Text>}<Text style={styles.mutedSmall}>{provider.city ?? 'Região não informada'}{provider.serviceCategories?.length ? ` · ${provider.serviceCategories.join(', ')}` : ''}</Text>{provider.businessName && <Text style={styles.mutedSmall}>Empresa: {provider.businessName}</Text>}{provider.taxDocumentType === 'cnpj' && provider.taxDocument && <Text style={styles.mutedSmall}>CNPJ: {provider.taxDocument}</Text>}<Text style={styles.mutedSmall}>{provider.issuesInvoice ? '✓ Emite nota fiscal' : 'Não informa emissão de nota fiscal'}</Text>{provider.bio && <Text style={styles.mutedSmall}>{provider.bio}</Text>}</View>)}</View>}
    <TouchableOpacity style={styles.homeHero} onPress={() => onCreate('service')} activeOpacity={0.9}>
      <Text style={styles.homeHeroEyebrow}>SERVIÇOS COM SEGURANÇA</Text><Text style={styles.homeHeroTitle}>Encontre quem resolve.{"\n"}Sem complicação.</Text><View style={styles.homeHeroButton}><Text style={styles.homeHeroButtonText}>Criar demanda</Text></View>
    </TouchableOpacity>
    <View style={styles.homeSectionHeader}><Text style={styles.homeSectionTitle}>Categorias em destaque</Text><Text style={styles.homeSeeAll}>Ver todas</Text></View>
    <View style={styles.categoryGrid}>{categoryCards.map((item) => <TouchableOpacity key={item.label} style={styles.categoryItem} onPress={() => onCreate(item.type)}><View style={styles.categoryIcon}><Text>{item.icon}</Text></View><Text style={styles.categoryLabel}>{item.label}</Text></TouchableOpacity>)}</View>
    <View style={styles.homeSectionHeader}><Text style={styles.homeSectionTitle}>Minhas demandas</Text><TouchableOpacity onPress={() => onCreate('service')}><Text style={styles.homeSeeAll}>+ Nova</Text></TouchableOpacity></View>
    {ownDemands.length === 0 ? <TouchableOpacity style={styles.homeEmpty} onPress={() => onCreate('service')}><Text style={styles.homeEmptyTitle}>Publique sua primeira demanda</Text><Text style={styles.homeEmptyText}>Descreva o que precisa e receba propostas de profissionais.</Text><Text style={styles.homeEmptyAction}>Criar demanda →</Text></TouchableOpacity> : ownDemands.map((demand) => { const demandProposals = proposals.filter((item) => item.demandId === demand.id); const canCancel = demand.status === 'open' || demand.status === 'negotiating'; return <View style={styles.demand} key={demand.id}><View style={styles.demandTop}><Text style={styles.demandType}>{demand.category}</Text><Text style={styles.status}>{STATUS_LABELS[demand.status]}</Text></View>{demand.isUrgent && <Text style={styles.urgentBadge}>⚡ PRECISO AGORA</Text>}<Text style={styles.demandTitle}>{demand.title}</Text><Text style={styles.mutedSmall}>{demand.locationLabel} · {money(demand.budget)}</Text>{canCancel && <TouchableOpacity style={styles.outlineSmallButton} onPress={() => Alert.alert('Cancelar chamado?', 'As propostas serão encerradas e o chamado ficará registrado como cancelado.', [{ text: 'Voltar', style: 'cancel' }, { text: 'Cancelar chamado', style: 'destructive', onPress: () => onCancel(demand).catch(() => Alert.alert('Erro', 'Não foi possível cancelar o chamado.')) }])}><Text style={styles.outlineSmallButtonText}>Cancelar chamado</Text></TouchableOpacity>}{demandProposals.map((proposal) => <View style={styles.proposal} key={proposal.id}><View style={styles.proposalTop}><Text style={styles.proposalAmount}>{money(proposal.amount)}</Text><Text style={styles.status}>{PROPOSAL_LABELS[proposal.status]}</Text></View>{proposal.message && <Text style={styles.mutedSmall}>{proposal.message}</Text>}<View style={styles.actionRow}>{proposal.status === 'pending' && !proposal.customerConfirmedAt && <TouchableOpacity style={styles.smallButton} onPress={() => onAccept(proposal)}><Text style={styles.smallButtonText}>Aceitar proposta</Text></TouchableOpacity>}<TouchableOpacity style={styles.outlineSmallButton} onPress={() => onChat(proposal)}><Text style={styles.outlineSmallButtonText}>Conversar</Text></TouchableOpacity></View></View>)}</View>; })}
  </ScrollView>;
}

function ProviderFeed({ feed, providerLatitude, providerLongitude, onLocate, onOpenOpportunity }: { feed: Array<{ demand: Demand; distanceKm?: number }>; providerLatitude?: number; providerLongitude?: number; onLocate: () => Promise<void>; onOpenOpportunity: (demand: Demand, distanceKm?: number) => void }) {
  if (!isValidCoordinates(providerLatitude, providerLongitude)) return <ScrollView contentContainerStyle={styles.content}><View style={styles.heroBox}><Text style={styles.hero}>Ative sua localização</Text><Text style={styles.muted}>Ela é obrigatória para mostrar chamados próximos e calcular a distância até cada cliente.</Text><TouchableOpacity style={styles.primaryButton} onPress={onLocate}><Text style={styles.primaryText}>Usar minha localização</Text></TouchableOpacity></View></ScrollView>;
  return <ScrollView contentContainerStyle={styles.content}><View style={styles.heroBox}><Text style={styles.hero}>Chamados próximos</Text><Text style={styles.muted}>Oportunidades organizadas automaticamente pela sua localização.</Text><TouchableOpacity style={styles.locationButton} onPress={onLocate}><Text style={styles.locationText}>✓ Atualizar localização</Text></TouchableOpacity></View><Text style={styles.sectionTitle}>Demandas disponíveis</Text>{feed.length === 0 ? <Text style={styles.empty}>Não há chamados disponíveis próximos da sua localização agora.</Text> : feed.map(({ demand, distanceKm: itemDistance }) => <View style={styles.demand} key={demand.id}><View style={styles.demandTop}><Text style={styles.demandType}>{TYPE_LABELS[demand.type]}</Text><Text style={styles.distance}>{itemDistance === undefined ? 'Próximo' : formatDistance(itemDistance)}</Text></View>{demand.isUrgent && <Text style={styles.urgentBadge}>⚡ PRECISO AGORA</Text>}<Text style={styles.demandTitle}>{demand.title}</Text><Text style={styles.mutedSmall}>{demand.category} · {demand.locationLabel}</Text><Text style={styles.mutedSmall}>{demand.description}</Text><Text style={styles.budgetHint}>{demand.budget ? `Cliente informa: ${money(demand.budget)}` : 'Cliente deixou o valor aberto'}</Text><TouchableOpacity style={styles.viewDemandButton} onPress={() => onOpenOpportunity(demand, itemDistance)}><Text style={styles.viewDemandButtonText}>Ver chamado completo →</Text></TouchableOpacity></View>)}</ScrollView>;
}

function ProfileScreen({ user, profileName, onNameChange, onSaveName, onEditProfessional, onSimulatePlan, onOpenSupport, onOpenTerms, onOpenPrivacy, onSignOut, onBack }: { user: User; profileName: string; onNameChange: (value: string) => void; onSaveName: () => Promise<void>; onEditProfessional: () => void; onSimulatePlan: (plan: ProviderPlan) => Promise<void>; onOpenSupport: () => void; onOpenTerms: () => void; onOpenPrivacy: () => void; onSignOut: () => Promise<void>; onBack: () => void }) {
  return <ScrollView contentContainerStyle={styles.content}>
    <TouchableOpacity onPress={onBack}><Text style={styles.back}>‹ Voltar</Text></TouchableOpacity>
    <Text style={styles.headingDark}>Meu perfil</Text><Text style={styles.label}>Nome</Text>
    <TextInput value={profileName} onChangeText={onNameChange} style={styles.inputLight} />
    <TouchableOpacity style={styles.secondaryButton} onPress={onSaveName}><Text style={styles.secondaryText}>Salvar nome</Text></TouchableOpacity>
    <Text style={styles.label}>Perfil atual</Text><Text style={styles.value}>{user.role === 'customer' ? 'Cliente' : 'Prestador'}</Text>
    {user.role === 'provider' && <>
      <View style={styles.infoBox}><Text style={styles.infoTitle}>Perfil profissional</Text><Text style={styles.muted}>{user.professionalTitle ?? 'Adicione sua especialidade, biografia, fotos de trabalhos e área de atendimento.'}</Text><Text style={styles.muted}>{user.taxDocumentType === 'cnpj' ? `Empresa${user.businessName ? ` · ${user.businessName}` : ''} · CNPJ cadastrado` : 'Profissional autônomo'}</Text><Text style={styles.muted}>{user.issuesInvoice ? '✓ Emite nota fiscal' : 'Não informa emissão de nota fiscal'}</Text><TouchableOpacity style={styles.primaryButton} onPress={onEditProfessional}><Text style={styles.primaryText}>Editar perfil profissional</Text></TouchableOpacity></View>
      <View style={styles.infoBox}><Text style={styles.infoTitle}>{user.providerPlan === 'premium_verified' ? '★ Premium Verificado' : 'Plano Comum'}</Text>
        <Text style={styles.muted}>{user.providerSubscriptionStatus === 'simulated_active' ? 'Ativo em modo de simulação' : user.providerSubscriptionStatus === 'trialing' ? `7 dias grátis ativos até ${user.trialEndsAt ? new Date(user.trialEndsAt).toLocaleDateString('pt-BR') : 'a data informada'}` : 'Aguardando ativação do plano'}</Text>
        {user.verificationStatus === 'simulated_verified' && <Text style={styles.urgentBadge}>✓ Selo verificado simulado</Text>}
        <Text style={styles.muted}>Premium: prioridade no recebimento de chamados e perfil disponível para busca direta.</Text>
        <View style={styles.rowWrap}><TouchableOpacity style={styles.smallButton} onPress={() => onSimulatePlan('standard')}><Text style={styles.smallButtonText}>Simular Comum · R$ 49,90</Text></TouchableOpacity><TouchableOpacity style={styles.outlineSmallButton} onPress={() => onSimulatePlan('premium_verified')}><Text style={styles.outlineSmallButtonText}>Simular Premium · R$ 69,90</Text></TouchableOpacity></View>
      </View>
    </>}
    <View style={styles.infoBox}><Text style={styles.infoTitle}>Modo conectado</Text><Text style={styles.muted}>Chamados e propostas são sincronizados pela API quando disponível. O cache local continua como fallback.</Text></View>
    <View style={styles.infoBox}><Text style={styles.infoTitle}>Documentos legais</Text><Text style={styles.muted}>Consulte as regras de uso, privacidade e tratamento dos seus dados.</Text><View style={styles.rowWrap}><TouchableOpacity style={styles.outlineSmallButton} onPress={onOpenTerms}><Text style={styles.outlineSmallButtonText}>Termos de Uso</Text></TouchableOpacity><TouchableOpacity style={styles.outlineSmallButton} onPress={onOpenPrivacy}><Text style={styles.outlineSmallButtonText}>Privacidade</Text></TouchableOpacity></View></View>
    <TouchableOpacity style={styles.primaryButton} onPress={onOpenSupport}><Text style={styles.primaryText}>Ajuda e suporte</Text></TouchableOpacity>
    <TouchableOpacity style={styles.secondaryButton} onPress={onSignOut}><Text style={styles.secondaryText}>Sair da conta</Text></TouchableOpacity>
  </ScrollView>;
}

function ChatView({ conversation, currentUserId, messages, onBack, onSend }: { conversation: Conversation; currentUserId: string; messages: ChatMessage[]; onBack: () => void; onSend: (text: string) => Promise<void> }) { const [text, setText] = useState(''); return <KeyboardAvoidingView style={styles.chatContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><StatusBar style="dark" /><View style={styles.chatHeader}><TouchableOpacity onPress={onBack} style={styles.chatBack}><Text style={styles.chatBackText}>‹</Text></TouchableOpacity><View style={styles.chatHeaderText}><Text style={styles.chatTitle}>Conversa</Text><Text style={styles.chatSubtitle}>Demanda {conversation.demandId.slice(-6)}</Text></View></View><ScrollView contentContainerStyle={styles.chatMessages}><View style={styles.notice}><Text style={styles.noticeTitle}>Conversa vinculada à demanda</Text><Text style={styles.noticeText}>Negocie valores e detalhes aqui.</Text></View>{messages.length === 0 ? <Text style={styles.empty}>Nenhuma mensagem ainda.</Text> : messages.map((message) => { const mine = message.senderId === currentUserId; return <View key={message.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}><Text style={mine ? styles.mineText : styles.theirsText}>{message.text}</Text><Text style={mine ? styles.mineTime : styles.theirsTime}>{new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text></View>; })}</ScrollView><View style={styles.composer}><TextInput value={text} onChangeText={setText} placeholder="Digite sua mensagem..." multiline style={styles.chatInput} /><TouchableOpacity style={styles.sendButton} onPress={async () => { const value = text; setText(''); await onSend(value); }}><Text style={styles.sendText}>Enviar</Text></TouchableOpacity></View></KeyboardAvoidingView>; }
const welcomeStyles = StyleSheet.create({
  background: { flex: 1, backgroundColor: '#061A39' },
  shade: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(3, 15, 35, 0.12)' },
  bottom: { paddingHorizontal: 26, paddingTop: 84, paddingBottom: 38, backgroundColor: 'rgba(2, 13, 31, 0.42)' },
  promise: { color: '#FFF', fontSize: 27, fontWeight: '900', lineHeight: 32, textAlign: 'center' },
  description: { color: '#DCE8FA', fontSize: 14, textAlign: 'center', marginTop: 9, marginBottom: 22 },
  startButton: { backgroundColor: '#0B66FF', borderRadius: 16, paddingVertical: 16, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 10, elevation: 5 },
  startButtonText: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  loginLink: { color: '#DFE9F8', textAlign: 'center', marginTop: 19, fontSize: 14 },
  loginLinkStrong: { color: '#FFF', fontWeight: '900' },
});

const roleStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  content: { padding: 24, paddingTop: 16, paddingBottom: 48 },
  back: { color: BRAND, fontWeight: '800', fontSize: 16, marginBottom: 38 },
  eyebrow: { color: ACCENT, fontSize: 11, fontWeight: '900', letterSpacing: 1, marginBottom: 8 },
  title: { color: BRAND, fontSize: 30, fontWeight: '900', lineHeight: 36 },
  subtitle: { color: '#66778D', fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 26 },
  card: { backgroundColor: '#FFF', borderColor: '#DFE8F4', borderWidth: 1, borderRadius: 18, padding: 17, flexDirection: 'row', alignItems: 'center', marginBottom: 13, shadowColor: '#173B70', shadowOpacity: 0.07, shadowRadius: 10, elevation: 2 },
  icon: { width: 49, height: 49, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 13 },
  customerIcon: { backgroundColor: '#E7F1FF' },
  providerIcon: { backgroundColor: '#FFF0DD' },
  iconText: { color: BRAND, fontSize: 22, fontWeight: '900' },
  cardText: { flex: 1 },
  cardTitle: { color: BRAND, fontSize: 17, fontWeight: '900' },
  cardDescription: { color: '#68788E', fontSize: 13, lineHeight: 19, marginTop: 4 },
  arrow: { color: ACCENT, fontSize: 30, fontWeight: '400' },
  loginBox: { marginTop: 28, alignItems: 'center' },
  loginText: { color: '#69798D', fontSize: 14, marginBottom: 5 },
  loginAction: { color: ACCENT, fontSize: 15, fontWeight: '900' },
});

const serviceCompletionStyles = StyleSheet.create({
  background: { flex: 1, backgroundColor: '#031A3B' },
});

const providerPopupStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(7, 25, 52, 0.72)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#FFF', borderRadius: 24, padding: 24, shadowColor: '#001B44', shadowOpacity: 0.3, shadowRadius: 18, elevation: 10 },
  eyebrow: { color: ACCENT, fontWeight: '900', fontSize: 12, letterSpacing: 1, marginBottom: 10 },
  title: { color: BRAND, fontSize: 25, lineHeight: 31, fontWeight: '900', marginBottom: 18 },
  demandTitle: { color: '#152D4D', fontSize: 19, lineHeight: 25, fontWeight: '800', marginBottom: 7 },
  detail: { color: '#637389', lineHeight: 20 },
  distance: { color: BRAND, fontWeight: '900', marginTop: 11, marginBottom: 18 },
  primary: { backgroundColor: ACCENT, alignItems: 'center', borderRadius: 14, padding: 16, marginTop: 22 },
  primaryText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  dismiss: { color: BRAND, fontWeight: '800', textAlign: 'center', paddingTop: 18, paddingBottom: 2 },
});

function RoleButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <TouchableOpacity onPress={onPress} style={[styles.pill, active && styles.pillActive]}><Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text></TouchableOpacity>; }
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: BRAND }, safeLight: { flex: 1, backgroundColor: BG }, onboarding: { flexGrow: 1, padding: 28, justifyContent: 'center' }, content: { padding: 20, paddingBottom: 96 }, homeContent: { padding: 16, paddingBottom: 94 }, logo: { color: '#FFF', fontSize: 42, fontWeight: '800', marginBottom: 4 }, tagline: { color: '#DDE7F5', fontSize: 16, marginBottom: 42 }, heading: { color: '#FFF', fontSize: 28, fontWeight: '800', marginBottom: 10 }, headingDark: { color: BRAND, fontSize: 28, fontWeight: '800', marginBottom: 8 }, muted: { color: '#68778C', lineHeight: 20, marginBottom: 12 }, mutedLight: { color: '#DDE7F5', lineHeight: 20, marginBottom: 18 }, mutedSmall: { color: '#68778C', lineHeight: 19, marginBottom: 7 }, inputDark: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 14, fontSize: 16 }, inputLight: { backgroundColor: '#FFF', borderColor: '#D8E0EA', borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10, fontSize: 16 }, multiline: { minHeight: 100, textAlignVertical: 'top' }, rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }, pill: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 99, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: '#FFF' }, pillActive: { backgroundColor: BRAND, borderColor: BRAND }, pillText: { color: '#526174', fontWeight: '600' }, pillTextActive: { color: '#FFF' }, primaryButton: { backgroundColor: ACCENT, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 6 }, primaryText: { color: '#FFF', fontSize: 16, fontWeight: '800' }, secondaryButton: { borderWidth: 1, borderColor: BRAND, borderRadius: 14, padding: 15, alignItems: 'center', marginBottom: 14 }, secondaryText: { color: BRAND, fontWeight: '800' }, locationButton: { borderWidth: 1, borderColor: '#AAB7C6', borderRadius: 14, padding: 14, alignItems: 'center', marginBottom: 8 }, locationText: { color: BRAND, fontWeight: '800' }, photoHelp: { color: '#718096', fontSize: 12, lineHeight: 18, marginBottom: 9 }, photoPickerButton: { borderWidth: 1, borderStyle: 'dashed', borderColor: ACCENT, backgroundColor: '#EDF5FF', borderRadius: 14, padding: 14, alignItems: 'center', marginBottom: 10 }, photoPickerText: { color: ACCENT, fontWeight: '900' }, photoPreviewList: { gap: 10, paddingBottom: 10, paddingRight: 6 }, photoPreviewWrap: { position: 'relative' }, photoPreview: { width: 110, height: 82, borderRadius: 12, backgroundColor: '#E2E8F0' }, photoRemove: { position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: '#D94A4A', alignItems: 'center', justifyContent: 'center' }, photoRemoveText: { color: '#FFF', fontSize: 18, fontWeight: '900', lineHeight: 20 }, viewDemandButton: { borderWidth: 1, borderColor: ACCENT, backgroundColor: '#EDF5FF', borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 10 }, viewDemandButtonText: { color: ACCENT, fontWeight: '900' }, urgentButton: { borderWidth: 1, borderColor: '#D0D7E2', borderRadius: 14, padding: 14, alignItems: 'center', marginBottom: 8, backgroundColor: '#FFF' }, urgentButtonActive: { backgroundColor: '#EEF5FF', borderColor: ACCENT }, urgentButtonText: { color: BRAND, fontWeight: '900' }, urgentButtonTextActive: { color: ACCENT }, urgentBadge: { color: ACCENT, fontWeight: '900', marginBottom: 7 }, header: { backgroundColor: '#FFF', padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E9EEF5' }, brand: { color: BRAND, fontSize: 25, fontWeight: '900' }, headerSubtitle: { color: '#6B7788', marginTop: 2 }, avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#FFF', fontWeight: '800' }, homeSearch: { height: 46, borderRadius: 14, borderWidth: 1, borderColor: '#DCE6F5', backgroundColor: '#FFF', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 14 }, searchIcon: { color: BRAND, fontSize: 25, marginRight: 8, marginTop: -3 }, searchPlaceholder: { color: '#7C8BA0', fontSize: 13 }, homeHero: { borderRadius: 18, padding: 19, minHeight: 168, backgroundColor: BRAND, marginBottom: 20, justifyContent: 'center', overflow: 'hidden' }, homeHeroEyebrow: { color: '#A9D1FF', fontWeight: '900', fontSize: 10, letterSpacing: .6, marginBottom: 8 }, homeHeroTitle: { color: '#FFF', fontWeight: '900', fontSize: 25, lineHeight: 30 }, homeHeroButton: { alignSelf: 'flex-start', backgroundColor: ACCENT, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, marginTop: 15 }, homeHeroButtonText: { color: '#FFF', fontWeight: '900', fontSize: 12 }, homeSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }, homeSectionTitle: { color: BRAND, fontWeight: '900', fontSize: 17 }, homeSeeAll: { color: ACCENT, fontWeight: '800', fontSize: 12 }, categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 23 }, categoryItem: { width: '30.5%', alignItems: 'center', marginBottom: 13 }, categoryIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: '#E8F3FF', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }, categoryLabel: { color: '#45607E', fontSize: 10, fontWeight: '700', textAlign: 'center' }, homeEmpty: { borderWidth: 1, borderColor: '#D9E7FA', borderRadius: 16, padding: 17, backgroundColor: '#FFF', marginBottom: 14 }, homeEmptyTitle: { color: BRAND, fontWeight: '900', fontSize: 16 }, homeEmptyText: { color: '#65768C', marginTop: 5, lineHeight: 18, fontSize: 13 }, homeEmptyAction: { color: ACCENT, fontWeight: '900', marginTop: 12, fontSize: 13 }, heroBox: { backgroundColor: '#EAF1F8', borderRadius: 18, padding: 18, marginBottom: 18 }, hero: { color: BRAND, fontSize: 27, fontWeight: '800', marginBottom: 6 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 25 }, card: { backgroundColor: '#FFF', borderRadius: 18, padding: 17, width: '47%', minHeight: 108, borderWidth: 1, borderColor: '#E7ECF2' }, cardTitle: { color: BRAND, fontWeight: '800', fontSize: 17, marginBottom: 8 }, cardBody: { color: '#718096', lineHeight: 18 }, sectionTitle: { color: BRAND, fontSize: 20, fontWeight: '800', marginBottom: 12, marginTop: 6 }, subheading: { color: BRAND, fontWeight: '800', marginTop: 12, marginBottom: 8 }, empty: { color: '#718096', backgroundColor: '#FFF', padding: 18, borderRadius: 15, marginBottom: 14 }, demand: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E7ECF2' }, demandTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }, demandType: { color: ACCENT, fontWeight: '800' }, status: { color: '#607086', fontSize: 12, fontWeight: '700' }, distance: { color: BRAND, fontSize: 12, fontWeight: '800' }, demandTitle: { color: BRAND, fontSize: 17, fontWeight: '800', marginBottom: 6 }, back: { color: ACCENT, fontWeight: '800', marginBottom: 16 }, label: { color: BRAND, fontWeight: '800', marginBottom: 7, marginTop: 8 }, value: { backgroundColor: '#FFF', padding: 15, borderRadius: 12, marginBottom: 8, color: '#27364A' }, infoBox: { backgroundColor: '#EAF1F8', borderRadius: 15, padding: 16, marginBottom: 18 }, infoTitle: { color: BRAND, fontWeight: '800', marginBottom: 6 }, filterBox: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E7ECF2' }, budgetHint: { color: '#465A73', fontWeight: '700', marginTop: 2, marginBottom: 9 }, proposal: { borderTopWidth: 1, borderTopColor: '#E8EDF3', paddingTop: 10, marginTop: 6 }, proposalTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }, proposalAmount: { color: BRAND, fontWeight: '900', fontSize: 16 }, actionRow: { flexDirection: 'row', gap: 8, marginTop: 5 }, smallButton: { backgroundColor: ACCENT, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10 }, smallButtonText: { color: '#FFF', fontWeight: '800' }, outlineSmallButton: { borderWidth: 1, borderColor: BRAND, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10 }, outlineSmallButtonText: { color: BRAND, fontWeight: '800' }, negotiationBox: { backgroundColor: '#F0F7F2', borderWidth: 1, borderColor: '#C6DDCC', borderRadius: 14, padding: 14, marginTop: 5 }, negotiationTitle: { color: '#3F6F54', fontWeight: '900', fontSize: 12 }, negotiationAmount: { color: BRAND, fontSize: 22, fontWeight: '900', marginTop: 5 }, negotiationMessage: { color: '#637389', marginTop: 3 }, negotiationHint: { color: '#637389', fontSize: 12, marginTop: 7 }, negotiationButton: { backgroundColor: ACCENT, borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 11 }, negotiationButtonText: { color: '#FFF', fontWeight: '900' }, nav: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 68, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5EAF0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }, navItem: { color: BRAND, fontWeight: '800' }, chatContainer: { flex: 1, backgroundColor: BG }, chatHeader: { backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5EAF0', padding: 14, flexDirection: 'row', alignItems: 'center' }, chatBack: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, chatBackText: { color: ACCENT, fontSize: 34, lineHeight: 36 }, chatHeaderText: { flex: 1 }, chatTitle: { color: BRAND, fontSize: 18, fontWeight: '800' }, chatSubtitle: { color: '#738096', marginTop: 2 }, chatMessages: { padding: 16, paddingBottom: 24 }, notice: { backgroundColor: '#EAF1F8', borderRadius: 14, padding: 14, marginBottom: 16 }, noticeTitle: { color: BRAND, fontWeight: '800', marginBottom: 4 }, noticeText: { color: '#5F6F83', lineHeight: 19 }, bubble: { maxWidth: '82%', paddingHorizontal: 13, paddingVertical: 10, borderRadius: 16, marginBottom: 9 }, mine: { alignSelf: 'flex-end', backgroundColor: BRAND, borderBottomRightRadius: 5 }, theirs: { alignSelf: 'flex-start', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E1E7EE', borderBottomLeftRadius: 5 }, mineText: { color: '#FFF', fontSize: 15, lineHeight: 20 }, theirsText: { color: '#26364A', fontSize: 15, lineHeight: 20 }, mineTime: { color: '#D8E3F0', fontSize: 10, marginTop: 4, textAlign: 'right' }, theirsTime: { color: '#8A96A6', fontSize: 10, marginTop: 4, textAlign: 'right' }, composer: { backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5EAF0', padding: 10, flexDirection: 'row', alignItems: 'flex-end', gap: 8 }, chatInput: { flex: 1, maxHeight: 100, minHeight: 45, backgroundColor: '#F3F6FA', borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11, color: '#26364A' }, sendButton: { backgroundColor: ACCENT, paddingHorizontal: 15, paddingVertical: 12, borderRadius: 13 }, sendText: { color: '#FFF', fontWeight: '800' } });
