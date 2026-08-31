const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'apps', 'mobile', 'App.tsx');
let source = fs.readFileSync(appPath, 'utf8');

if (source.includes('// RUBLI_PROVIDER_OPPORTUNITY_V1')) {
  console.log('Tela de oportunidade do prestador já foi aplicada.');
  process.exit(0);
}

function mustReplace(regex, replacement, label) {
  const next = source.replace(regex, replacement);
  if (next === source) throw new Error(`Não encontrei o ponto de integração: ${label}`);
  source = next;
}

mustReplace(
  /import \{ NegotiationChatScreen \} from '\.\/src\/screens\/NegotiationChatScreen';/,
  "import { NegotiationChatScreen } from './src/screens/NegotiationChatScreen';\nimport { OpportunityScreen } from './src/screens/OpportunityScreen'; // RUBLI_PROVIDER_OPPORTUNITY_V1",
  'import da tela de oportunidade'
);

mustReplace(
  /type Screen = 'home' \| 'create' \| 'profile' \| 'chat' \| 'negotiation';/,
  "type Screen = 'home' | 'create' | 'profile' | 'chat' | 'negotiation' | 'opportunity';",
  'tipo de tela'
);

mustReplace(
  /const \[activeConversation, setActiveConversation\] = useState<Conversation \| null>\(null\);/,
  "const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);\n  const [selectedOpportunity, setSelectedOpportunity] = useState<{ demand: Demand; distanceKm?: number } | null>(null);",
  'estado da oportunidade'
);

mustReplace(
  /async function createLocalUser\(\)/,
  "function openOpportunity(item: { demand: Demand; distanceKm?: number }) { setSelectedOpportunity(item); setScreen('opportunity'); }\n  async function createLocalUser()",
  'função de abertura da oportunidade'
);

mustReplace(
  /if \(screen === 'negotiation' && activeConversation\) return <NegotiationChatScreen user=\{user\} conversation=\{activeConversation\} onBack=\{\(\) => setScreen\('home'\)\} \/>;/,
  "if (screen === 'negotiation' && activeConversation) return <NegotiationChatScreen user={user} conversation={activeConversation} onBack={() => setScreen('home')} />;\n  if (screen === 'opportunity' && selectedOpportunity) return <OpportunityScreen user={user} demand={selectedOpportunity.demand} distanceKm={selectedOpportunity.distanceKm} onBack={() => { setSelectedOpportunity(null); setScreen('home'); }} onViewDemand={() => { setSelectedOpportunity(null); setScreen('home'); }} onIgnore={() => { setSelectedOpportunity(null); setScreen('home'); }} />;",
  'rota da tela de oportunidade'
);

mustReplace(
  /<ProviderHome user=\{user\} feed=\{providerFeed\}/,
  "<ProviderHome user={user} feed={providerFeed} onOpportunity={openOpportunity}",
  'prop da oportunidade no ProviderHome'
);

mustReplace(
  /function ProviderHome\(\{ user, feed,/,
  "function ProviderHome({ user, feed, onOpportunity,",
  'assinatura do ProviderHome'
);

mustReplace(
  /\{ user: User; feed: Array<\{ demand: Demand; distanceKm\?: number \}>;/,
  "{ user: User; feed: Array<{ demand: Demand; distanceKm?: number }>; onOpportunity: (item: { demand: Demand; distanceKm?: number }) => void;",
  'tipo do ProviderHome'
);

mustReplace(
  /(<Text style=\{styles\.muted\}>Raio atual: \{providerRadius\} km\. As urgentes aparecem primeiro\.<\/Text>)/,
  "$1<Text style={styles.opportunityTestHint}>Teste local do fluxo: escolha uma oportunidade do feed.</Text><TouchableOpacity style={styles.opportunityTestButton} onPress={() => feed[0] && onOpportunity(feed[0])}><Text style={styles.opportunityTestButtonText}>🔔 Abrir oportunidade</Text></TouchableOpacity>",
  'botão de teste da oportunidade'
);

mustReplace(
  /const styles = StyleSheet\.create\(\{container:/,
  "const styles = StyleSheet.create({opportunityTestHint:{color:'#68778C',fontSize:11,marginTop:8},opportunityTestButton:{backgroundColor:BRAND,borderRadius:11,paddingVertical:11,paddingHorizontal:13,alignItems:'center',marginTop:9},opportunityTestButtonText:{color:'#FFF',fontWeight:'900',fontSize:12},container:",
  'estilos do botão de oportunidade'
);

fs.writeFileSync(appPath, source, 'utf8');
console.log('Fluxo local de oportunidade do prestador aplicado com sucesso.');
