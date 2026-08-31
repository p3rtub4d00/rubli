const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'apps', 'mobile', 'App.tsx');

let source = fs.readFileSync(appPath, 'utf8');

if (source.includes('// RUBLI_PROVIDER_AVAILABILITY_V1')) {
  console.log('Modo disponibilidade do prestador já foi aplicado.');
  process.exit(0);
}

function replaceOnce(regex, replacement, label) {
  const before = source;
  source = source.replace(regex, replacement);
  if (source === before) throw new Error(`Não encontrei o trecho esperado: ${label}`);
}

replaceOnce(
  /const \[proposalAmounts, setProposalAmounts\] = useState<Record<string, string>>\(\{\}\); const \[proposalMessages, setProposalMessages\] = useState<Record<string, string>>\(\{\}\); const \[profileName, setProfileName\] = useState\(''\);/,
  "const [proposalAmounts, setProposalAmounts] = useState<Record<string, string>>({}); const [proposalMessages, setProposalMessages] = useState<Record<string, string>>({}); const [profileName, setProfileName] = useState(''); // RUBLI_PROVIDER_AVAILABILITY_V1\n  const [providerAvailable, setProviderAvailable] = useState(false);",
  'estado de disponibilidade'
);

replaceOnce(
  /if \(storedUser\) \{ setProviderRadius\(storedUser\.serviceRadiusKm \?\? DEFAULT_RADIUS\); setProfileName\(storedUser\.name\); \}/,
  "if (storedUser) { setProviderRadius(storedUser.serviceRadiusKm ?? DEFAULT_RADIUS); setProfileName(storedUser.name); setProviderAvailable(Boolean(storedUser.isAvailable)); }",
  'carregar disponibilidade salva'
);

replaceOnce(
  /async function updateProviderSettings\(radius: number\) \{ if \(!user\) return; const nextUser = \{ \.\.\.user, serviceRadiusKm: radius \}; await saveUser\(nextUser\); setUser\(nextUser\); setProviderRadius\(radius\); \}/,
  "async function updateProviderSettings(radius: number) { if (!user) return; const nextUser = { ...user, serviceRadiusKm: radius }; await saveUser(nextUser); setUser(nextUser); setProviderRadius(radius); }\n  async function toggleProviderAvailability() { if (!user || user.role !== 'provider') return; const nextAvailable = !providerAvailable; const nextUser = { ...user, isAvailable: nextAvailable, availabilityUpdatedAt: new Date().toISOString() }; await saveUser(nextUser); setUser(nextUser); setProviderAvailable(nextAvailable); Alert.alert(nextAvailable ? 'Você está disponível' : 'Você está indisponível', nextAvailable ? 'O Rubli poderá considerar você para novas oportunidades compatíveis.' : 'Você não receberá novas oportunidades enquanto estiver indisponível.'); }",
  'função de alternância'
);

replaceOnce(
  /<ProviderHome user=\{user\} feed=\{providerFeed\} proposals=\{proposals\}/,
  "<ProviderHome user={user} feed={providerFeed} proposals={proposals} providerAvailable={providerAvailable} onAvailabilityToggle={toggleProviderAvailability}",
  'props do ProviderHome'
);

replaceOnce(
  /function ProviderHome\(\{ user, feed, proposals, providerRadius,/,
  "function ProviderHome({ user, feed, proposals, providerAvailable, onAvailabilityToggle, providerRadius,",
  'assinatura ProviderHome'
);

replaceOnce(
  /\{ user: User; feed: Array<\{ demand: Demand; distanceKm\?: number \}>; proposals: Proposal\[\]; providerRadius:/,
  "{ user: User; feed: Array<{ demand: Demand; distanceKm?: number }>; proposals: Proposal[]; providerAvailable: boolean; onAvailabilityToggle: () => Promise<void>; providerRadius:",
  'tipos do ProviderHome'
);

replaceOnce(
  /<View style=\{styles\.heroBox\}><Text style=\{styles\.hero\}>Demandas perto de você<\/Text><Text style=\{styles\.muted\}>Raio atual: \{providerRadius\} km\. As urgentes aparecem primeiro\.<\/Text><\/View>/,
  "<View style={styles.heroBox}><Text style={styles.hero}>Demandas perto de você</Text><Text style={styles.muted}>Raio atual: {providerRadius} km. As urgentes aparecem primeiro.</Text></View><View style={styles.availabilityCard}><View style={styles.availabilityText}><Text style={styles.availabilityTitle}>{providerAvailable ? '🟢 Estou disponível' : '⚪ Estou indisponível'}</Text><Text style={styles.availabilityHint}>{providerAvailable ? 'Você está apto a receber novas oportunidades compatíveis.' : 'Ative para receber oportunidades de serviço como no modelo de corridas.'}</Text></View><TouchableOpacity style={providerAvailable ? styles.availabilityOn : styles.availabilityOff} onPress={() => onAvailabilityToggle().catch(() => undefined)}><Text style={styles.availabilityButtonText}>{providerAvailable ? 'Ficar indisponível' : 'Ficar disponível'}</Text></TouchableOpacity></View>",
  'cartão de disponibilidade'
);

replaceOnce(
  /const styles = StyleSheet\.create\(\{container:\{flex:1,backgroundColor:'#F7F9FC'\},/,
  "const styles = StyleSheet.create({availabilityCard:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#E2E8F0',borderRadius:16,padding:15,marginBottom:14,flexDirection:'row',alignItems:'center',gap:12},availabilityText:{flex:1},availabilityTitle:{color:BRAND,fontWeight:'900',fontSize:16},availabilityHint:{color:'#68778C',fontSize:12,lineHeight:17,marginTop:4},availabilityOn:{backgroundColor:'#2F7D4A',borderRadius:11,paddingHorizontal:12,paddingVertical:10},availabilityOff:{backgroundColor:ACCENT,borderRadius:11,paddingHorizontal:12,paddingVertical:10},availabilityButtonText:{color:'#FFF',fontWeight:'900',fontSize:12},container:{flex:1,backgroundColor:'#F7F9FC'},",
  'estilos do modo disponibilidade'
);

fs.writeFileSync(appPath, source, 'utf8');
console.log('Modo disponibilidade do prestador aplicado com sucesso.');
