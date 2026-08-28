import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Demand, DemandType, User, UserRole } from '@rubli/shared';
import { DEMAND_CATEGORIES } from '@rubli/shared';
import { getDemands, getUser, saveDemands, saveUser } from './src/storage/localStore';

const BRAND = '#081B33';
const ACCENT = '#F28C28';

const TYPE_LABELS: Record<DemandType, string> = {
  service: 'Serviço',
  purchase: 'Compra',
  delivery: 'Entrega',
  freight: 'Frete',
};

function newId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [demands, setDemands] = useState<Demand[]>([]);
  const [screen, setScreen] = useState<'home' | 'create' | 'profile'>('home');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('customer');
  const [type, setType] = useState<DemandType>('service');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [budget, setBudget] = useState('');
  const [locationLabel, setLocationLabel] = useState('');

  useEffect(() => {
    Promise.all([getUser(), getDemands()]).then(([storedUser, storedDemands]) => {
      setUser(storedUser);
      setDemands(storedDemands);
    });
  }, []);

  const categories = useMemo(() => DEMAND_CATEGORIES[type] as readonly string[], [type]);

  async function createLocalUser() {
    if (!name.trim()) {
      Alert.alert('Nome obrigatório', 'Informe seu nome para continuar.');
      return;
    }
    const newUser: User = {
      id: newId('usr'),
      name: name.trim(),
      role,
      createdAt: new Date().toISOString(),
    };
    await saveUser(newUser);
    setUser(newUser);
  }

  async function createDemand() {
    if (!user) return;
    if (!title.trim() || !description.trim() || !category || !locationLabel.trim()) {
      Alert.alert('Complete os dados', 'Preencha título, descrição, categoria e localização.');
      return;
    }

    const next: Demand = {
      id: newId('dem'),
      requesterId: user.id,
      type,
      title: title.trim(),
      description: description.trim(),
      category,
      budgetType: budget.trim() ? 'fixed' : 'open',
      budget: budget.trim() ? Number(budget.replace(',', '.')) : undefined,
      locationLabel: locationLabel.trim(),
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const nextDemands = [next, ...demands];
    setDemands(nextDemands);
    await saveDemands(nextDemands);
    setTitle('');
    setDescription('');
    setBudget('');
    setLocationLabel('');
    setCategory('');
    setScreen('home');
    Alert.alert('Demanda publicada', 'Sua solicitação foi salva neste dispositivo.');
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.onboarding}>
          <Text style={styles.logo}>Rubli</Text>
          <Text style={styles.tagline}>Quem precisa, encontra quem resolve.</Text>
          <Text style={styles.heading}>Comece pelo seu perfil</Text>
          <Text style={styles.muted}>Nesta primeira fase, os dados ficam somente no aparelho. A sincronização com o servidor será conectada depois.</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Seu nome" placeholderTextColor="#718096" style={styles.input} />
          <View style={styles.row}>
            <RoleButton label="Quero contratar" active={role === 'customer'} onPress={() => setRole('customer')} />
            <RoleButton label="Quero trabalhar" active={role === 'provider'} onPress={() => setRole('provider')} />
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={createLocalUser}>
            <Text style={styles.primaryText}>Entrar no Rubli</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeLight}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>Rubli</Text>
          <Text style={styles.headerSubtitle}>Olá, {user.name}</Text>
        </View>
        <TouchableOpacity onPress={() => setScreen('profile')} style={styles.avatar}><Text style={styles.avatarText}>{user.name[0]?.toUpperCase()}</Text></TouchableOpacity>
      </View>

      {screen === 'home' && (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.hero}>O que você precisa resolver hoje?</Text>
          <View style={styles.grid}>
            {(Object.keys(TYPE_LABELS) as DemandType[]).map((key) => (
              <TouchableOpacity key={key} style={styles.card} onPress={() => { setType(key); setScreen('create'); }}>
                <Text style={styles.cardTitle}>{TYPE_LABELS[key]}</Text>
                <Text style={styles.cardBody}>Publique sua demanda</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Minhas demandas</Text>
            <Text style={styles.count}>{demands.length}</Text>
          </View>
          {demands.length === 0 ? (
            <Text style={styles.empty}>Nenhuma demanda publicada ainda.</Text>
          ) : demands.map((item) => (
            <View style={styles.demand} key={item.id}>
              <View style={styles.demandTop}><Text style={styles.demandType}>{TYPE_LABELS[item.type]}</Text><Text style={styles.status}>{item.status}</Text></View>
              <Text style={styles.demandTitle}>{item.title}</Text>
              <Text style={styles.muted}>{item.locationLabel} · {item.budget ? `R$ ${item.budget.toFixed(2)}` : 'Valor aberto'}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {screen === 'create' && (
        <ScrollView contentContainerStyle={styles.content}>
          <TouchableOpacity onPress={() => setScreen('home')}><Text style={styles.back}>‹ Voltar</Text></TouchableOpacity>
          <Text style={styles.headingDark}>Criar demanda</Text>
          <Text style={styles.muted}>Descreva o que precisa e deixe o Rubli encontrar quem pode resolver.</Text>
          <View style={styles.rowWrap}>
            {(Object.keys(TYPE_LABELS) as DemandType[]).map((key) => <RoleButton key={key} label={TYPE_LABELS[key]} active={type === key} onPress={() => { setType(key); setCategory(''); }} />)}
          </View>
          <TextInput value={title} onChangeText={setTitle} placeholder="Ex.: Instalar fechadura na porta" style={styles.inputLight} />
          <TextInput value={description} onChangeText={setDescription} placeholder="Descreva os detalhes da demanda" multiline numberOfLines={4} style={[styles.inputLight, styles.multiline]} />
          <Text style={styles.label}>Categoria</Text>
          <View style={styles.rowWrap}>{categories.map((item) => <RoleButton key={item} label={item} active={category === item} onPress={() => setCategory(item)} />)}</View>
          <TextInput value={budget} onChangeText={setBudget} placeholder="Valor que pretende pagar (opcional)" keyboardType="decimal-pad" style={styles.inputLight} />
          <TextInput value={locationLabel} onChangeText={setLocationLabel} placeholder="Bairro / endereço de atendimento" style={styles.inputLight} />
          <TouchableOpacity style={styles.primaryButton} onPress={createDemand}><Text style={styles.primaryText}>Publicar demanda</Text></TouchableOpacity>
        </ScrollView>
      )}

      {screen === 'profile' && (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.headingDark}>Meu perfil</Text>
          <Text style={styles.label}>Nome</Text><Text style={styles.value}>{user.name}</Text>
          <Text style={styles.label}>Tipo de conta</Text><Text style={styles.value}>{user.role === 'customer' ? 'Cliente' : 'Prestador'}</Text>
          <View style={styles.infoBox}><Text style={styles.infoTitle}>Modo offline</Text><Text style={styles.muted}>Suas demandas estão sendo armazenadas localmente. A futura sincronização online será adicionada sem mudar o fluxo do aplicativo.</Text></View>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setScreen('home')}><Text style={styles.secondaryText}>Voltar para início</Text></TouchableOpacity>
        </ScrollView>
      )}

      <View style={styles.nav}><TouchableOpacity onPress={() => setScreen('home')}><Text style={styles.navItem}>Início</Text></TouchableOpacity><TouchableOpacity onPress={() => { setType('service'); setScreen('create'); }}><Text style={styles.navItem}>+ Demanda</Text></TouchableOpacity><TouchableOpacity onPress={() => setScreen('profile')}><Text style={styles.navItem}>Perfil</Text></TouchableOpacity></View>
    </SafeAreaView>
  );
}

function RoleButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <TouchableOpacity onPress={onPress} style={[styles.pill, active && styles.pillActive]}><Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BRAND }, safeLight: { flex: 1, backgroundColor: '#F7F9FC' },
  onboarding: { flexGrow: 1, padding: 28, justifyContent: 'center' }, content: { padding: 20, paddingBottom: 90 },
  logo: { color: '#FFF', fontSize: 42, fontWeight: '800', marginBottom: 4 }, tagline: { color: '#DDE7F5', fontSize: 16, marginBottom: 42 },
  heading: { color: '#FFF', fontSize: 28, fontWeight: '800', marginBottom: 10 }, headingDark: { color: BRAND, fontSize: 28, fontWeight: '800', marginBottom: 8 },
  muted: { color: '#68778C', lineHeight: 20, marginBottom: 18 }, input: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 14, fontSize: 16 }, inputLight: { backgroundColor: '#FFF', borderColor: '#D8E0EA', borderWidth: 1, borderRadius: 14, padding: 15, marginBottom: 12, fontSize: 16 }, multiline: { minHeight: 110, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 8, marginBottom: 18 }, rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  pill: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 99, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: '#FFF' }, pillActive: { backgroundColor: BRAND, borderColor: BRAND }, pillText: { color: '#526174', fontWeight: '600' }, pillTextActive: { color: '#FFF' },
  primaryButton: { backgroundColor: ACCENT, borderRadius: 14, padding: 17, alignItems: 'center', marginTop: 8 }, primaryText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  secondaryButton: { borderWidth: 1, borderColor: BRAND, borderRadius: 14, padding: 15, alignItems: 'center' }, secondaryText: { color: BRAND, fontWeight: '800' },
  header: { backgroundColor: '#FFF', padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E9EEF5' }, brand: { color: BRAND, fontSize: 25, fontWeight: '900' }, headerSubtitle: { color: '#6B7788', marginTop: 2 }, avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#FFF', fontWeight: '800' },
  hero: { color: BRAND, fontSize: 28, fontWeight: '800', marginBottom: 18 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, card: { backgroundColor: '#FFF', borderRadius: 18, padding: 17, width: '47%', minHeight: 108, borderWidth: 1, borderColor: '#E7ECF2' }, cardTitle: { color: BRAND, fontWeight: '800', fontSize: 17, marginBottom: 8 }, cardBody: { color: '#718096', lineHeight: 18 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 12 }, sectionTitle: { color: BRAND, fontSize: 20, fontWeight: '800' }, count: { color: '#FFF', backgroundColor: BRAND, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99, overflow: 'hidden' }, empty: { color: '#718096', backgroundColor: '#FFF', padding: 18, borderRadius: 15 },
  demand: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#E7ECF2' }, demandTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }, demandType: { color: ACCENT, fontWeight: '800' }, status: { color: '#607086', fontSize: 12 }, demandTitle: { color: BRAND, fontSize: 17, fontWeight: '800', marginBottom: 5 }, back: { color: ACCENT, fontWeight: '800', marginBottom: 16 }, label: { color: BRAND, fontWeight: '800', marginBottom: 6, marginTop: 8 }, value: { backgroundColor: '#FFF', padding: 15, borderRadius: 12, marginBottom: 8, color: '#27364A' }, infoBox: { marginTop: 20, backgroundColor: '#EAF1F8', borderRadius: 15, padding: 16, marginBottom: 18 }, infoTitle: { color: BRAND, fontWeight: '800', marginBottom: 6 },
  nav: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 68, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5EAF0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }, navItem: { color: BRAND, fontWeight: '800' }
});
