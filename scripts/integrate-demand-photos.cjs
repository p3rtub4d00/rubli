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

function replaceRegex(regex, replacement, label) {
  const next = source.replace(regex, replacement);
  if (next === source) throw new Error(`Não encontrei um ponto compatível para: ${label}`);
  source = next;
}

// 1) Imports.
replaceRegex(
  /import \{ Alert, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View \} from 'react-native';/,
  "import { Alert, Image, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';",
  'importar Image'
);

replaceRegex(
  /import \* as Location from 'expo-location';/,
  "import * as Location from 'expo-location';\nimport * as ImagePicker from 'expo-image-picker';",
  'importar ImagePicker'
);

// 2) State marker is placed immediately before the existing state declarations.
replaceRegex(
  /\n  const \[name, setName\] = useState\(''\);/,
  `\n  ${marker}\n  const [name, setName] = useState('');`,
  'marcador das fotos'
);

replaceRegex(
  /(const \[name, setName\] = useState\(''\);[\s\S]*?const \[isUrgent, setIsUrgent\] = useState\(false\);)/,
  '$1 const [demandPhotos, setDemandPhotos] = useState<string[]>([]);',
  'estado das fotos'
);

// 3) Add gallery picker before createDemand.
replaceRegex(
  /\n  async function createDemand\(\) \{/,
  `\n  async function pickDemandPhotos() {\n    const remaining = 5 - demandPhotos.length;\n    if (remaining <= 0) return Alert.alert('Limite atingido', 'Você pode anexar até 5 fotos por chamado.');\n    try {\n      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();\n      if (permission.status !== 'granted') return Alert.alert('Fotos', 'Permita o acesso às fotos para anexar imagens ao chamado.');\n      const result = await ImagePicker.launchImageLibraryAsync({\n        mediaTypes: ['images'],\n        allowsMultipleSelection: true,\n        selectionLimit: remaining,\n        quality: 0.8,\n      });\n      if (!result.canceled) {\n        const selected = result.assets.map((asset) => asset.uri).filter(Boolean);\n        setDemandPhotos((current) => Array.from(new Set([...current, ...selected])).slice(0, 5));\n      }\n    } catch {\n      Alert.alert('Fotos', 'Não foi possível selecionar as fotos.');\n    }\n  }\n\n  async function createDemand() {`,
  'função de seleção de fotos'
);

// 4) Save photos on the Demand object.
replaceRegex(
  /(locationLabel: locationLabel\.trim\(\), latitude, longitude, isUrgent, )status:/,
  '$1photoUris: demandPhotos, status:',
  'salvar fotos na demanda'
);

// 5) Clear photos after publication.
replaceRegex(
  /(setTitle\(''\); setDescription\(''\); setBudget\(''\); setLocationLabel\(''\); setCategory\(''\); setLatitude\(undefined\); setLongitude\(undefined\); setIsUrgent\(false\);)/,
  '$1 setDemandPhotos([]);',
  'limpar fotos após publicação'
);

// 6) Customer demand form: insert photo picker immediately before the publish button.
replaceRegex(
  /(onPress=\{\(\) => setIsUrgent\(\(value\) => !value\)\}\}><Text style=\{\[styles\.urgentButtonText, isUrgent && styles\.urgentButtonTextActive\]\}>\{isUrgent \? '⚡ PRECISO AGORA ATIVADO' : '⚡ PRECISO AGORA'\}<\/Text><\/TouchableOpacity>)(<TouchableOpacity style=\{styles\.primaryButton\} onPress=\{createDemand\}>)/,
  `$1<View style={styles.photoSection}><View style={styles.photoSectionTop}><View style={styles.photoSectionText}><Text style={styles.label}>Fotos do serviço</Text><Text style={styles.photoHint}>Ajude o prestador a entender o que precisa ser feito. Até 5 fotos.</Text></View><TouchableOpacity style={styles.photoAddButton} onPress={() => pickDemandPhotos().catch(() => undefined)}><Text style={styles.photoAddButtonText}>＋ Fotos</Text></TouchableOpacity></View>{demandPhotos.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoPreviewRow}>{demandPhotos.map((uri, index) => <View key={uri} style={styles.photoPreview}><Image source={{ uri }} style={styles.photoPreviewImage} /><TouchableOpacity style={styles.photoRemove} onPress={() => setDemandPhotos((current) => current.filter((_, i) => i !== index))}><Text style={styles.photoRemoveText}>×</Text></TouchableOpacity></View>)}</ScrollView>}</View>$2`,
  'bloco de fotos no formulário'
);

// 7) Provider feed: show photos before the proposal controls.
replaceRegex(
  /(<Text style=\{styles\.budgetHint\}>\{demand\.budget \? `Cliente informa: \$\{money\(demand\.budget\)\}` : 'Cliente deixou o valor aberto'\}<\/Text>)(\{myProposal \?)/,
  `$1{demand.photoUris?.length ? <View style={styles.demandPhotosPreview}><Text style={styles.photoCountLabel}>📷 {demand.photoUris.length} {demand.photoUris.length === 1 ? 'foto' : 'fotos'} anexada{demand.photoUris.length === 1 ? '' : 's'}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.demandPhotoRow}>{demand.photoUris.map((uri) => <Image key={uri} source={{ uri }} style={styles.demandPhotoImage} /></ScrollView>}</View> : null}$2`,
  'fotos visíveis para o prestador'
);

// Fix the JSX closing generated by the replacement above in a controlled way.
replaceRegex(
  /<Image key=\{uri\} source=\{\{ uri \}\} style=\{styles\.demandPhotoImage\} \/><\/ScrollView>/,
  '<Image key={uri} source={{ uri }} style={styles.demandPhotoImage} /></ScrollView>',
  'fechamento da galeria do prestador'
);

// 8) Styles are inserted before the first existing style entry.
replaceRegex(
  /const styles = StyleSheet\.create\(\{\s*safe:/,
  `const styles = StyleSheet.create({ photoSection:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#E3E9F0',borderRadius:16,padding:14,marginBottom:10},photoSectionTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},photoSectionText:{flex:1},photoHint:{color:'#718096',fontSize:12,lineHeight:17,marginTop:-2},photoAddButton:{backgroundColor:'#EAF1F8',borderRadius:11,paddingHorizontal:12,paddingVertical:9},photoAddButtonText:{color:BRAND,fontWeight:'900'},photoPreviewRow:{gap:10,paddingTop:10},photoPreview:{width:92,height:92,borderRadius:12,overflow:'hidden',position:'relative'},photoPreviewImage:{width:'100%',height:'100%'},photoRemove:{position:'absolute',right:5,top:5,width:24,height:24,borderRadius:12,backgroundColor:'rgba(8,27,51,0.85)',alignItems:'center',justifyContent:'center'},photoRemoveText:{color:'#FFF',fontSize:18,fontWeight:'900',lineHeight:20},demandPhotosPreview:{backgroundColor:'#F7F9FC',borderRadius:14,padding:10,marginBottom:10},photoCountLabel:{color:BRAND,fontSize:12,fontWeight:'900',marginBottom:7},demandPhotoRow:{gap:8},demandPhotoImage:{width:92,height:70,borderRadius:10},safe:`,
  'estilos das fotos'
);

fs.writeFileSync(appPath, source, 'utf8');
console.log('Integração de fotos dos chamados aplicada com sucesso em apps/mobile/App.tsx.');
