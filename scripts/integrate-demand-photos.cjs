const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'apps', 'mobile', 'App.tsx');

let source = fs.readFileSync(appPath, 'utf8');

const marker = '// RUBLI_DEMAND_PHOTOS_V1';
if (source.includes(marker)) {
  console.log('A integração de fotos já foi aplicada. Nenhuma alteração feita.');
  process.exit(0);
}

function replaceOnce(find, replace, label) {
  const index = typeof find === 'function' ? find(source) : source.indexOf(find);
  if (index === -1) throw new Error(`Não encontrei o trecho esperado: ${label}`);
  if (typeof find === 'function') {
    source = source.slice(0, index) + replace + source.slice(index + (find.matchLength ?? 0));
  } else {
    source = source.replace(find, replace);
  }
}

replaceOnce(
  "import { Alert, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';",
  "import { Alert, Image, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';",
  'importar Image'
);

replaceOnce(
  "import * as Location from 'expo-location';",
  "import * as Location from 'expo-location';\nimport * as ImagePicker from 'expo-image-picker';",
  'importar ImagePicker'
);

replaceOnce(
  "  const [name, setName] = useState(''); const [role, setRole] = useState<UserRole>('customer'); const [type, setType] = useState<DemandType>('service'); const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [category, setCategory] = useState(''); const [budget, setBudget] = useState(''); const [locationLabel, setLocationLabel] = useState(''); const [latitude, setLatitude] = useState<number | undefined>(); const [longitude, setLongitude] = useState<number | undefined>(); const [isUrgent, setIsUrgent] = useState(false);",
  "  // RUBLI_DEMAND_PHOTOS_V1\n  const [name, setName] = useState(''); const [role, setRole] = useState<UserRole>('customer'); const [type, setType] = useState<DemandType>('service'); const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [category, setCategory] = useState(''); const [budget, setBudget] = useState(''); const [locationLabel, setLocationLabel] = useState(''); const [latitude, setLatitude] = useState<number | undefined>(); const [longitude, setLongitude] = useState<number | undefined>(); const [isUrgent, setIsUrgent] = useState(false); const [demandPhotos, setDemandPhotos] = useState<string[]>([]);",
  'estado das fotos'
);

replaceOnce(
  "  async function createDemand() { if (!user) return;",
  `  async function pickDemandPhotos() {\n    const remaining = 5 - demandPhotos.length;\n    if (remaining <= 0) return Alert.alert('Limite atingido', 'Você pode anexar até 5 fotos por chamado.');\n    try {\n      const result = await ImagePicker.launchImageLibraryAsync({\n        mediaTypes: ['images'],\n        allowsMultipleSelection: true,\n        selectionLimit: remaining,\n        quality: 0.8,\n      });\n      if (!result.canceled) {\n        const selected = result.assets.map((asset) => asset.uri).filter(Boolean);\n        setDemandPhotos((current) => Array.from(new Set([...current, ...selected])).slice(0, 5));\n      }\n    } catch {\n      Alert.alert('Fotos', 'Não foi possível selecionar as fotos.');\n    }\n  }\n\n  async function createDemand() { if (!user) return;`,
  'função de seleção de fotos'
);

replaceOnce(
  "    const now = new Date().toISOString(); const next: Demand = { id: newId('dem'), requesterId: user.id, type, title: title.trim(), description: description.trim(), category, budgetType: parsedBudget ? 'fixed' : 'open', budget: parsedBudget, locationLabel: locationLabel.trim(), latitude, longitude, isUrgent, status: 'open', createdAt: now, updatedAt: now };",
  "    const now = new Date().toISOString(); const next: Demand = { id: newId('dem'), requesterId: user.id, type, title: title.trim(), description: description.trim(), category, budgetType: parsedBudget ? 'fixed' : 'open', budget: parsedBudget, locationLabel: locationLabel.trim(), latitude, longitude, isUrgent, photoUris: demandPhotos, status: 'open', createdAt: now, updatedAt: now };",
  'salvar fotos na demanda'
);

replaceOnce(
  "    setTitle(''); setDescription(''); setBudget(''); setLocationLabel(''); setCategory(''); setLatitude(undefined); setLongitude(undefined); setIsUrgent(false); setScreen('home');",
  "    setTitle(''); setDescription(''); setBudget(''); setLocationLabel(''); setCategory(''); setLatitude(undefined); setLongitude(undefined); setIsUrgent(false); setDemandPhotos([]); setScreen('home');",
  'limpar fotos após publicação'
);

const createScreenNeedle = `<TouchableOpacity style={[styles.urgentButton, isUrgent && styles.urgentButtonActive]} onPress={() => setIsUrgent((value) => !value)}><Text style={[styles.urgentButtonText, isUrgent && styles.urgentButtonTextActive]}>{isUrgent ? '⚡ PRECISO AGORA ATIVADO' : '⚡ PRECISO AGORA'}</Text></TouchableOpacity>`;
if (!source.includes(createScreenNeedle)) throw new Error('Não encontrei o botão PRECISO AGORA para inserir as fotos.');
source = source.replace(
  createScreenNeedle,
  `${createScreenNeedle}<View style={styles.photoSection}><View style={styles.photoSectionTop}><View style={styles.photoSectionText}><Text style={styles.label}>Fotos do serviço</Text><Text style={styles.photoHint}>Ajude o prestador a entender o que precisa ser feito. Até 5 fotos.</Text></View><TouchableOpacity style={styles.photoAddButton} onPress={() => pickDemandPhotos().catch(() => undefined)}><Text style={styles.photoAddButtonText}>＋ Fotos</Text></TouchableOpacity></View>{demandPhotos.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoPreviewRow}>{demandPhotos.map((uri, index) => <View key={uri} style={styles.photoPreview}><Image source={{ uri }} style={styles.photoPreviewImage} /><TouchableOpacity style={styles.photoRemove} onPress={() => setDemandPhotos((current) => current.filter((_, i) => i !== index))}><Text style={styles.photoRemoveText}>×</Text></TouchableOpacity></View>)}</ScrollView>}</View>`
);

replaceOnce(
  "<Text style={styles.budgetHint}>{demand.budget ? `Cliente informa: ${money(demand.budget)}` : 'Cliente deixou o valor aberto'}</Text>{myProposal ?",
  "<Text style={styles.budgetHint}>{demand.budget ? `Cliente informa: ${money(demand.budget)}` : 'Cliente deixou o valor aberto'}</Text>{demand.photoUris?.length ? <View style={styles.demandPhotosPreview}><Text style={styles.photoCountLabel}>📷 {demand.photoUris.length} {demand.photoUris.length === 1 ? 'foto' : 'fotos'} anexada{demand.photoUris.length === 1 ? '' : 's'}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.demandPhotoRow}>{demand.photoUris.map((uri) => <Image key={uri} source={{ uri }} style={styles.demandPhotoImage} />)}</ScrollView></View> : null}{myProposal ?",
  'fotos visíveis para o prestador'
);

replaceOnce(
  "const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: BRAND },",
  "const styles = StyleSheet.create({ photoSection:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#E3E9F0',borderRadius:16,padding:14,marginBottom:10},photoSectionTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},photoSectionText:{flex:1},photoHint:{color:'#718096',fontSize:12,lineHeight:17,marginTop:-2},photoAddButton:{backgroundColor:'#EAF1F8',borderRadius:11,paddingHorizontal:12,paddingVertical:9},photoAddButtonText:{color:BRAND,fontWeight:'900'},photoPreviewRow:{gap:10,paddingTop:10},photoPreview:{width:92,height:92,borderRadius:12,overflow:'hidden',position:'relative'},photoPreviewImage:{width:'100%',height:'100%'},photoRemove:{position:'absolute',right:5,top:5,width:24,height:24,borderRadius:12,backgroundColor:'rgba(8,27,51,0.85)',alignItems:'center',justifyContent:'center'},photoRemoveText:{color:'#FFF',fontSize:18,fontWeight:'900',lineHeight:20},demandPhotosPreview:{backgroundColor:'#F7F9FC',borderRadius:14,padding:10,marginBottom:10},photoCountLabel:{color:BRAND,fontSize:12,fontWeight:'900',marginBottom:7},demandPhotoRow:{gap:8},demandPhotoImage:{width:92,height:70,borderRadius:10},safe: { flex: 1, backgroundColor: BRAND },",
  'estilos das fotos'
);

fs.writeFileSync(appPath, source, 'utf8');
console.log('Integração de fotos dos chamados aplicada com sucesso em apps/mobile/App.tsx.');
