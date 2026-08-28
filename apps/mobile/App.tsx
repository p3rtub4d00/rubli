import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Demand, DemandType, Proposal, User, UserRole } from '@rubli/shared';
import { DEMAND_CATEGORIES } from '@rubli/shared';
import { getDemands, getProposals, getUser, saveDemands, saveProposals, saveUser } from './src/storage/localStore';

const BRAND = '#081B33';
const ACCENT = '#F28C28';
const BG = '#F7F9FC';

const TYPE_LABELS: Record<DemandType, string> = { service: 'Serviço', purchase: 'Compra', delivery: 'Entrega', freight: 'Frete' };
const STATUS_LABELS: Record<Demand['status'], string> = {
  draft: 'Rascunho', open: 'Aberta', negotiating: 'Recebendo propostas', accepted: 'Aceita', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada',
};
const PROPOSAL_LABELS: Record<Proposal['status'], string> = { pending: 'Pendente', accepted: 'Aceita', rejected: 'Recusada', withdrawn: 'Retirada' };

function newId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
function money(value?: number) { return typeof value === 'number' ? `R$ ${value.toFixed(2).replace('.', ',')}` : 'Valor aberto'; }

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [demands, setDemands] = useState<Demand[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [screen, setScreen] = useState<'home' | 'create' | 'profile'>('home');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('customer');
  const [type, setType] = useState<DemandType>('service');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [budget, setBudget] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [proposalAmounts, setProposalAmounts] = useState<Record<string, string>>({});
  const [proposalMessages, setProposalMessages] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([getUser(), getDemands(), getProposals()]).then(([storedUser, storedDemands, storedProposals]) => {
      setUser(storedUser); setDemands(storedDemands); setProposals(storedProposals);
    });
  }, []);

  const categories = useMemo(() => DEMAND_CATEGORIES[type] as readonly string[], [type]);

  async function createLocalUser() {
    if (!name.trim()) return Alert.alert('Nome obrigatório', 'Informe seu nome para continuar.');
    const newUser: User = { id: newId('usr'), name: name.trim(), role, createdAt: new Date().toISOString() };
    await saveUser(newUser); setUser(newUser);
  }

  async function createDemand() {
    if (!user) return;
    const parsedBudget = budget.trim() ? Number(budget.replace(',', '.')) : undefined;
    if (!title.trim() || !description.trim() || !category || !locationLabel.trim()) return Alert.alert('Complete os dados', 'Preencha título, descrição, categoria e localização.');
    if (parsedBudget !== undefined && (!Number.isFinite(parsedBudget) || parsedBudget <= 0)) return Alert.alert('Valor inválido', 'Informe um valor maior que zero ou deixe o campo vazio.');
    const now = new Date().toISOString();
    const next: Demand = { id: newId('dem'), requesterId: user.id, type, title: title.trim(), description: description.trim(), category, budgetType: parsedBudget ? 'fixed' : 'open', budget: parsedBudget, locationLabel: locationLabel.trim(), status: 'open', createdAt: now, updatedAt: now };
    const nextDemands = [next, ...demands];
    setDemands(nextDemands); await saveDemands(nextDemands);
    setTitle(''); setDescription(''); setBudget(''); setLocationLabel(''); setCategory(''); setScreen('home');
    Alert.alert('Demanda publicada', 'A demanda foi salva localmente e já pode receber propostas.');
  }

  async function submitProposal(demand: Demand) {
    if (!user) return;
    const amount = Number((proposalAmounts[demand.id] ?? '').replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) return Alert.alert('Valor inválido', 'Informe o valor que você cobra para realizar esta demanda.');
    const pending = proposals.find((item) => item.demandId === demand.id && item.providerId === user.id && item.status === 'pending');
    if (pending) return Alert.alert('Proposta já enviada', 'Você já possui uma proposta pendente para esta demanda.');
    const proposal: Proposal = { id: newId('pro'), demandId: demand.id, providerId: user.id, amount: Math.round(amount * 100) / 100, message: proposalMessages[demand.id]?.trim() || undefined, status: 'pending', createdAt: new Date().toISOString() };
    const nextProposals = [proposal, ...proposals];
    const nextDemands = demands.map((item) => item.id === demand.id ? { ...item, status: 'negotiating' as const, updatedAt: new Date().toISOString() } : item);
    setProposals(nextProposals); setDemands(nextDemands); await saveProposals(nextProposals); await saveDemands(nextDemands);
    setProposalAmounts((state) => ({ ...state, [demand.id]: '' })); setProposalMessages((state) => ({ ...state, [demand.id]: '' }));
    Alert.alert('Proposta enviada', 'O cliente poderá analisar sua proposta e aceitar ou escolher outra.');
  }

  async function acceptProposal(proposal: Proposal) {
    if (!user) return;
    const demand = demands.find((item) => item.id === proposal.demandId);
    if (!demand || demand.requesterId !== user.id || proposal.status !== 'pending') return;
    const nextProposals = proposals.map((item) => item.demandId === demand.id ? { ...item, status: item.id === proposal.id ? 'accepted' as const : item.status === 'pending' ? 'rejected' as const : item.status } : item);
    const nextDemands = demands.map((item) => item.id === demand.id ? { ...item, status: 'accepted' as const, updatedAt: new Date().toISOString() } : item);
    setProposals(nextProposals); setDemands(nextDemands); await saveProposals(nextProposals); await saveDemands(nextDemands);
    Alert.alert('Proposta aceita', 'A demanda agora está vinculada ao prestador.');
  }

  if (!user) return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.onboarding}>
        <Text style={styles.logo}>Rubli</Text>
        <Text style={styles.tagline}>Quem precisa, encontra quem resolve.</Text>
        <Text style={styles.heading}>Crie seu perfil</Text>
        <Text style={styles.mutedLight}>Nesta fase, tudo funciona localmente no aparelho. A conta online e a sincronização entram depois.</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Seu nome" placeholderTextColor="#718096" style={styles.input} />
        <View style={styles.row}><RoleButton label="Quero contratar" active={role === 'customer'} onPress={() => setRole('customer')} /><RoleButton label="Quero trabalhar" active={role === 'provider'} onPress={() => setRole('provider')} /></View>
        <TouchableOpacity style={styles.primaryButton} onPress={createLocalUser}><Text style={styles.primaryText}>Entrar no Rubli</Text></TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.safeLight}>
      <StatusBar style="dark" />
      <View style={styles.header}><View><Text style={styles.brand}>Rubli</Text><Text style={styles.headerSubtitle}>Olá, {user.name}</Text></View><TouchableOpacity onPress={() => setScreen('profile')} style={styles.avatar}><Text style={styles.avatarText}>{user.name[0]?.toUpperCase()}</Text></TouchableOpacity></View>
      {screen === 'home' && <HomeScreen user={user} demands={demands} proposals={proposals} onCreate={(selectedType) => { setType(selectedType); setCategory(''); setScreen('create'); }} proposalAmounts={proposalAmounts} proposalMessages={proposalMessages} setProposalAmounts={setProposalAmounts} setProposalMessages={setProposalMessages} onProposal={submitProposal} onAccept={acceptProposal} />}
      {screen === 'create' && <ScrollView contentContainerStyle={styles.content}><TouchableOpacity onPress={() => setScreen('home')}><Text style={styles.back}>‹ Voltar</Text></TouchableOpacity><Text style={styles.headingDark}>Criar demanda</Text><Text style={styles.muted}>Descreva o que precisa. Você pode definir um valor ou deixar para negociação.</Text><View style={styles.rowWrap}>{(Object.keys(TYPE_LABELS) as DemandType[]).map((key) => <RoleButton key={key} label={TYPE_LABELS[key]} active={type === key} onPress={() => { setType(key); setCategory(''); }} />)}</View><TextInput value={title} onChangeText={setTitle} placeholder="Ex.: Instalar fechadura na porta" style={styles.inputLight} /><TextInput value={description} onChangeText={setDescription} placeholder="Descreva os detalhes da demanda" multiline numberOfLines={4} style={[styles.inputLight, styles.multiline]} /><Text style={styles.label}>Categoria</Text><View style={styles.rowWrap}>{categories.map((item) => <RoleButton key={item} label={item} active={category === item} onPress={() => setCategory(item)} />)}</View><TextInput value={budget} onChangeText={setBudget} placeholder="Quanto pretende pagar? (opcional)" keyboardType="decimal-pad" style={styles.inputLight} /><TextInput value={locationLabel} onChangeText={setLocationLabel} placeholder="Bairro / endereço" style={styles.inputLight} /><TouchableOpacity style={styles.primaryButton} onPress={createDemand}><Text style={styles.primaryText}>Publicar demanda</Text></TouchableOpacity></ScrollView>}
      {screen === 'profile' && <ScrollView contentContainerStyle={styles.content}><Text style={styles.headingDark}>Meu perfil</Text><Text style={styles.label}>Nome</Text><Text style={styles.value}>{user.name}</Text><Text style={styles.label}>Perfil</Text><Text style={styles.value}>{user.role === 'customer' ? 'Cliente' : 'Prestador'}</Text><View style={styles.infoBox}><Text style={styles.infoTitle}>Modo offline</Text><Text style={styles.muted}>Demandas e propostas são salvas no aparelho. Mais à frente, trocaremos essa camada local pela API + MongoDB sem mudar a experiência do usuário.</Text></View><TouchableOpacity style={styles.secondaryButton} onPress={() => setScreen('home')}><Text style={styles.secondaryText}>Voltar</Text></TouchableOpacity></ScrollView>}
      <View style={styles.nav}><TouchableOpacity onPress={() => setScreen('home')}><Text style={styles.navItem}>Início</Text></TouchableOpacity><TouchableOpacity onPress={() => { setType('service'); setScreen('create'); }}><Text style={styles.navItem}>+ Demanda</Text></TouchableOpacity><TouchableOpacity onPress={() => setScreen('profile')}><Text style={styles.navItem}>Perfil</Text></TouchableOpacity></View>
    </SafeAreaView>
  );
}

function HomeScreen({ user, demands, proposals, onCreate, proposalAmounts, proposalMessages, setProposalAmounts, setProposalMessages, onProposal, onAccept }: { user: User; demands: Demand[]; proposals: Proposal[]; onCreate: (type: DemandType) => void; proposalAmounts: Record<string, string>; proposalMessages: Record<string, string>; setProposalAmounts: React.Dispatch<React.SetStateAction<Record<string, string>>>; setProposalMessages: React.Dispatch<React.SetStateAction<Record<string, string>>>; onProposal: (demand: Demand) => Promise<void>; onAccept: (proposal: Proposal) => Promise<void>; }) {
  const ownDemands = demands.filter((item) => item.requesterId === user.id);
  const available = demands.filter((item) => item.requesterId !== user.id && ['open', 'negotiating'].includes(item.status));
  const myProposal = (demandId: string) => proposals.filter((item) => item.demandId === demandId);
  return <ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.hero}>{user.role === 'customer' ? 'O que você precisa resolver hoje?' : 'Encontre demandas perto de você'}</Text>
    {user.role === 'customer' ? <>
      <View style={styles.grid}>{(Object.keys(TYPE_LABELS) as DemandType[]).map((key) => <TouchableOpacity key={key} style={styles.card} onPress={() => onCreate(key)}><Text style={styles.cardTitle}>{TYPE_LABELS[key]}</Text><Text style={styles.cardBody}>Publicar uma nova demanda</Text></TouchableOpacity>)}</View>
      <Text style={styles.sectionTitle}>Minhas demandas</Text>
      {ownDemands.length === 0 ? <Text style={styles.empty}>Você ainda não publicou nenhuma demanda.</Text> : ownDemands.map((demand) => <View style={styles.demand} key={demand.id}><View style={styles.demandTop}><Text style={styles.demandType}>{TYPE_LABELS[demand.type]}</Text><Text style={styles.status}>{STATUS_LABELS[demand.status]}</Text></View><Text style={styles.demandTitle}>{demand.title}</Text><Text style={styles.mutedSmall}>{demand.locationLabel} · {money(demand.budget)}</Text>{demand.status !== 'accepted' && myProposal(demand.id).length > 0 && <><Text style={styles.subheading}>Propostas ({myProposal(demand.id).length})</Text>{myProposal(demand.id).map((proposal) => <View style={styles.proposal} key={proposal.id}><View style={styles.proposalTop}><Text style={styles.proposalAmount}>{money(proposal.amount)}</Text><Text style={styles.status}>{PROPOSAL_LABELS[proposal.status]}</Text></View>{proposal.message ? <Text style={styles.mutedSmall}>{proposal.message}</Text> : null}{proposal.status === 'pending' && <TouchableOpacity style={styles.smallButton} onPress={() => onAccept(proposal)}><Text style={styles.smallButtonText}>Aceitar proposta</Text></TouchableOpacity>}</View>)}</>}</View>)}
    </> : <>
      <View style={styles.infoBox}><Text style={styles.infoTitle}>Como funciona</Text><Text style={styles.muted}>Escolha uma demanda, informe quanto você cobra e envie sua proposta. O cliente decide.</Text></View>
      <Text style={styles.sectionTitle}>Demandas disponíveis</Text>
      {available.length === 0 ? <Text style={styles.empty}>Nenhuma demanda disponível no momento.</Text> : available.map((demand) => <View style={styles.demand} key={demand.id}><View style={styles.demandTop}><Text style={styles.demandType}>{TYPE_LABELS[demand.type]}</Text><Text style={styles.status}>{STATUS_LABELS[demand.status]}</Text></View><Text style={styles.demandTitle}>{demand.title}</Text><Text style={styles.mutedSmall}>{demand.category} · {demand.locationLabel}</Text><Text style={styles.mutedSmall}>{demand.description}</Text>{demand.budget ? <Text style={styles.budgetHint}>Cliente informou: {money(demand.budget)}</Text> : <Text style={styles.budgetHint}>Cliente deixou o valor aberto</Text>}<TextInput value={proposalAmounts[demand.id] ?? ''} onChangeText={(value) => setProposalAmounts((state) => ({ ...state, [demand.id]: value }))} placeholder="Seu preço" keyboardType="decimal-pad" style={styles.inputLight} /><TextInput value={proposalMessages[demand.id] ?? ''} onChangeText={(value) => setProposalMessages((state) => ({ ...state, [demand.id]: value }))} placeholder="Mensagem ao cliente (opcional)" multiline style={styles.inputLight} /><TouchableOpacity style={styles.primaryButton} onPress={() => onProposal(demand)}><Text style={styles.primaryText}>Enviar proposta</Text></TouchableOpacity></View>)}
    </>}
  </ScrollView>;
}

function RoleButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <TouchableOpacity onPress={onPress} style={[styles.pill, active && styles.pillActive]}><Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text></TouchableOpacity>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BRAND }, safeLight: { flex: 1, backgroundColor: BG }, onboarding: { flexGrow: 1, padding: 28, justifyContent: 'center' }, content: { padding: 20, paddingBottom: 92 }, logo: { color: '#FFF', fontSize: 42, fontWeight: '800', marginBottom: 4 }, tagline: { color: '#DDE7F5', fontSize: 16, marginBottom: 42 }, heading: { color: '#FFF', fontSize: 28, fontWeight: '800', marginBottom: 10 }, headingDark: { color: BRAND, fontSize: 28, fontWeight: '800', marginBottom: 8 }, muted: { color: '#68778C', lineHeight: 20, marginBottom: 12 }, mutedLight: { color: '#DDE7F5', lineHeight: 20, marginBottom: 18 }, mutedSmall: { color: '#68778C', lineHeight: 19, marginBottom: 7 }, input: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 14, fontSize: 16 }, inputLight: { backgroundColor: '#FFF', borderColor: '#D8E0EA', borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10, fontSize: 16 }, multiline: { minHeight: 100, textAlignVertical: 'top' }, row: { flexDirection: 'row', gap: 8, marginBottom: 18 }, rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }, pill: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 99, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: '#FFF' }, pillActive: { backgroundColor: BRAND, borderColor: BRAND }, pillText: { color: '#526174', fontWeight: '600' }, pillTextActive: { color: '#FFF' }, primaryButton: { backgroundColor: ACCENT, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 6 }, primaryText: { color: '#FFF', fontSize: 16, fontWeight: '800' }, secondaryButton: { borderWidth: 1, borderColor: BRAND, borderRadius: 14, padding: 15, alignItems: 'center' }, secondaryText: { color: BRAND, fontWeight: '800' }, header: { backgroundColor: '#FFF', padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E9EEF5' }, brand: { color: BRAND, fontSize: 25, fontWeight: '900' }, headerSubtitle: { color: '#6B7788', marginTop: 2 }, avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#FFF', fontWeight: '800' }, hero: { color: BRAND, fontSize: 28, fontWeight: '800', marginBottom: 18 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 25 }, card: { backgroundColor: '#FFF', borderRadius: 18, padding: 17, width: '47%', minHeight: 108, borderWidth: 1, borderColor: '#E7ECF2' }, cardTitle: { color: BRAND, fontWeight: '800', fontSize: 17, marginBottom: 8 }, cardBody: { color: '#718096', lineHeight: 18 }, sectionTitle: { color: BRAND, fontSize: 20, fontWeight: '800', marginBottom: 12, marginTop: 6 }, subheading: { color: BRAND, fontWeight: '800', marginTop: 12, marginBottom: 8 }, empty: { color: '#718096', backgroundColor: '#FFF', padding: 18, borderRadius: 15, marginBottom: 14 }, demand: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E7ECF2' }, demandTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }, demandType: { color: ACCENT, fontWeight: '800' }, status: { color: '#607086', fontSize: 12, fontWeight: '700' }, demandTitle: { color: BRAND, fontSize: 17, fontWeight: '800', marginBottom: 6 }, back: { color: ACCENT, fontWeight: '800', marginBottom: 16 }, label: { color: BRAND, fontWeight: '800', marginBottom: 6, marginTop: 8 }, value: { backgroundColor: '#FFF', padding: 15, borderRadius: 12, marginBottom: 8, color: '#27364A' }, infoBox: { backgroundColor: '#EAF1F8', borderRadius: 15, padding: 16, marginBottom: 18 }, infoTitle: { color: BRAND, fontWeight: '800', marginBottom: 6 }, budgetHint: { color: '#465A73', fontWeight: '700', marginTop: 2, marginBottom: 9 }, proposal: { borderTopWidth: 1, borderTopColor: '#E8EDF3', paddingTop: 10, marginTop: 6 }, proposalTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }, proposalAmount: { color: BRAND, fontWeight: '900', fontSize: 16 }, smallButton: { alignSelf: 'flex-start', backgroundColor: BRAND, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10, marginTop: 5 }, smallButtonText: { color: '#FFF', fontWeight: '800' }, nav: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 68, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5EAF0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }, navItem: { color: BRAND, fontWeight: '800' },
});
