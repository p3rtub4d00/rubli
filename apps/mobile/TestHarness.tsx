import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { User } from '@rubli/shared';
import App from './App';
import { getUser, saveUser } from './src/storage/localStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccountSetupScreen } from './src/screens/AccountSetupScreen';
import { TestNegotiationsScreen } from './src/screens/TestNegotiationsScreen';
import { MyProfileScreen } from './src/screens/MyProfileScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { ServiceLifecycleScreen } from './src/screens/ServiceLifecycleScreen';
import { MessagesCenterScreen } from './src/screens/MessagesCenterScreen';
import { NotificationCenterScreen } from './src/screens/NotificationCenterScreen';

const PROFILE_KEY = '@rubli/test_profiles';
const BRAND = '#081B33';
const ACCENT = '#F28C28';

type StoredProfiles = User[];
async function readProfiles(): Promise<StoredProfiles> { const raw = await AsyncStorage.getItem(PROFILE_KEY); if (!raw) return []; try { return JSON.parse(raw) as User[]; } catch { return []; } }
async function writeProfiles(profiles: StoredProfiles) { await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profiles)); }

export default function TestHarness() {
  const [loading, setLoading] = useState(true);
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<User[]>([]);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [accountSetupOpen, setAccountSetupOpen] = useState(false);
  const [negotiationsOpen, setNegotiationsOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [appVersion, setAppVersion] = useState(0);

  async function refresh() { const [user, storedProfiles] = await Promise.all([getUser(), readProfiles()]); setActiveUser(user); setProfiles(storedProfiles); }
  useEffect(() => { refresh().finally(() => setLoading(false)); }, []);
  async function activateProfile(profile: User) { await saveUser(profile); setActiveUser(profile); setSelectorOpen(false); setAppVersion((value) => value + 1); }
  async function onAccountCreated() { const user = await getUser(); if (!user) return; const current = await readProfiles(); const next = [...current.filter((item) => item.id !== user.id), user]; await writeProfiles(next); setProfiles(next); setActiveUser(user); setAccountSetupOpen(false); setAppVersion((value) => value + 1); }
  async function onProfileSaved(user: User) { await saveUser(user); const current = await readProfiles(); const next = [...current.filter((item) => item.id !== user.id), user]; await writeProfiles(next); setProfiles(next); setActiveUser(user); setProfileOpen(false); setAppVersion((value) => value + 1); }
  async function resetTestData() { Alert.alert('Resetar perfis de teste', 'Isso remove somente a lista de perfis para troca rápida. Demandas, propostas, mensagens, avaliações e histórico serão preservados.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Resetar', style: 'destructive', onPress: async () => { await AsyncStorage.removeItem(PROFILE_KEY); await refresh(); setSelectorOpen(false); } }]); }

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={BRAND} /></View>;
  if (!activeUser) return <AccountSetupScreen onCreated={onAccountCreated} />;

  return <SafeAreaView style={styles.root}>
    <View style={styles.appWrap}><App key={`${activeUser.id}:${activeUser.role}:${activeUser.email ?? ''}:${appVersion}`} /></View>
    <View style={styles.testToolbar}>
      <TouchableOpacity style={styles.testButton} onPress={() => setMessagesOpen(true)}><Text style={styles.testButtonText}>💬 Mensagens</Text></TouchableOpacity>
      <TouchableOpacity style={styles.testButton} onPress={() => setNotificationsOpen(true)}><Text style={styles.testButtonText}>🔔 Notificações</Text></TouchableOpacity>
      <TouchableOpacity style={styles.testButton} onPress={() => setProfileOpen(true)}><Text style={styles.testButtonText}>👤 Perfil</Text></TouchableOpacity>
      <TouchableOpacity style={styles.testButton} onPress={() => setServiceOpen(true)}><Text style={styles.testButtonText}>🔧 Serviço</Text></TouchableOpacity>
      <TouchableOpacity style={styles.testButton} onPress={() => setHistoryOpen(true)}><Text style={styles.testButtonText}>📋 Histórico</Text></TouchableOpacity>
      <TouchableOpacity style={styles.testButton} onPress={() => setNegotiationsOpen(true)}><Text style={styles.testButtonText}>💼 Negociações</Text></TouchableOpacity>
      <TouchableOpacity style={styles.testButton} onPress={() => setSelectorOpen(true)}><Text style={styles.testButtonText}>⇄ Perfis</Text></TouchableOpacity>
    </View>

    <Modal visible={selectorOpen} transparent animationType="slide" onRequestClose={() => setSelectorOpen(false)}><View style={styles.modalBackdrop}><View style={styles.modalCard}><Text style={styles.modalTitle}>Perfis de teste</Text><Text style={styles.modalSubtitle}>Troque entre cliente e prestador sem apagar dados.</Text>{profiles.map((profile) => <TouchableOpacity key={profile.id} style={[styles.profileCard, activeUser.id === profile.id && styles.profileActive]} onPress={() => activateProfile(profile)}><View style={styles.profileText}><Text style={styles.profileName}>{profile.name}</Text><Text style={styles.profileMeta}>{profile.role === 'provider' ? 'Prestador' : 'Cliente'} · {profile.email}</Text></View>{activeUser.id === profile.id && <Text style={styles.activeMark}>ATIVO</Text>}</TouchableOpacity>)}<TouchableOpacity style={styles.newProfileButton} onPress={() => { setAccountSetupOpen(true); setSelectorOpen(false); }}><Text style={styles.newProfileText}>+ Criar outro perfil de teste</Text></TouchableOpacity><TouchableOpacity style={styles.resetButton} onPress={resetTestData}><Text style={styles.resetText}>Limpar lista de perfis de teste</Text></TouchableOpacity><TouchableOpacity style={styles.closeButton} onPress={() => setSelectorOpen(false)}><Text style={styles.closeText}>Fechar</Text></TouchableOpacity></View></View></Modal>
    <Modal visible={accountSetupOpen} animationType="slide" onRequestClose={() => setAccountSetupOpen(false)}><AccountSetupScreen onCreated={onAccountCreated} /></Modal>
    <Modal visible={negotiationsOpen} animationType="slide" onRequestClose={() => setNegotiationsOpen(false)}><TestNegotiationsScreen user={activeUser} profiles={profiles} onClose={() => setNegotiationsOpen(false)} /></Modal>
    <Modal visible={profileOpen} animationType="slide" onRequestClose={() => setProfileOpen(false)}><MyProfileScreen user={activeUser} onSaved={onProfileSaved} onClose={() => setProfileOpen(false)} /></Modal>
    <HistoryScreen user={activeUser} profiles={profiles} visible={historyOpen} onClose={() => setHistoryOpen(false)} onChanged={() => { setAppVersion((value) => value + 1); refresh().catch(() => undefined); }} />
    <ServiceLifecycleScreen user={activeUser} profiles={profiles} visible={serviceOpen} onClose={() => setServiceOpen(false)} onChanged={() => { setAppVersion((value) => value + 1); refresh().catch(() => undefined); }} />
    <MessagesCenterScreen user={activeUser} profiles={profiles} visible={messagesOpen} onClose={() => setMessagesOpen(false)} />
    <NotificationCenterScreen user={activeUser} visible={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({ root:{flex:1,backgroundColor:'#F7F9FC'},appWrap:{flex:1},loading:{flex:1,backgroundColor:'#F7F9FC',alignItems:'center',justifyContent:'center'},testToolbar:{position:'absolute',top:10,right:10,flexDirection:'row',gap:6,flexWrap:'wrap',justifyContent:'flex-end',maxWidth:'94%'},testButton:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#D6DEE9',borderRadius:999,paddingHorizontal:10,paddingVertical:8,shadowColor:'#000',shadowOpacity:0.08,shadowRadius:8,elevation:4},testButtonText:{color:BRAND,fontWeight:'800',fontSize:11},modalBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,0.38)',justifyContent:'flex-end'},modalCard:{backgroundColor:'#FFF',borderTopLeftRadius:24,borderTopRightRadius:24,padding:20,paddingBottom:28},modalTitle:{color:BRAND,fontSize:24,fontWeight:'900',marginBottom:5},modalSubtitle:{color:'#67768A',lineHeight:19,marginBottom:16},profileCard:{borderWidth:1,borderColor:'#DFE6EF',borderRadius:16,padding:14,marginBottom:10,flexDirection:'row',alignItems:'center'},profileActive:{borderColor:ACCENT,backgroundColor:'#FFF7EF'},profileText:{flex:1},profileName:{color:BRAND,fontSize:16,fontWeight:'800'},profileMeta:{color:'#718096',marginTop:3,fontSize:12},activeMark:{color:ACCENT,fontWeight:'900',fontSize:11},newProfileButton:{borderWidth:1,borderColor:BRAND,borderRadius:14,padding:14,alignItems:'center',marginTop:4},newProfileText:{color:BRAND,fontWeight:'900'},resetButton:{padding:12,alignItems:'center'},resetText:{color:'#9A5A34',fontWeight:'700',fontSize:12},closeButton:{backgroundColor:BRAND,borderRadius:14,padding:15,alignItems:'center',marginTop:8},closeText:{color:'#FFF',fontWeight:'900'}});
