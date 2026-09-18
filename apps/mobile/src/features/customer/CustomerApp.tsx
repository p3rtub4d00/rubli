import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Demand, DemandType, Proposal, User } from '@rubli/shared';
import { apiSearchPremiumProviders, type PremiumProviderSearchItem } from '../../core/api/client';
import { PremiumProviderCard } from './components/PremiumProviderCard';
import { PremiumProviderSearchScreen } from './screens/PremiumProviderSearchScreen';

const BRAND = '#0B3B82';
const ACCENT = '#0B66FF';

type Props = {
  user: User;
  demands: Demand[];
  proposals: Proposal[];
  onCreate: (type: DemandType) => void;
  onAccept: (proposal: Proposal) => Promise<void>;
  onCancel: (demand: Demand) => Promise<void>;
  onChat: (proposal: Proposal) => Promise<void>;
  onViewProvider: (proposal: Proposal) => Promise<void>;
  onRequestProvider: (provider: PremiumProviderSearchItem) => void;
  onOpenProvider: (provider: PremiumProviderSearchItem) => void;
};

const money = (value?: number) => typeof value === 'number' ? `R$ ${value.toFixed(2).replace('.', ',')}` : 'Valor aberto';
const statusLabel: Record<Demand['status'], string> = { draft: 'Rascunho', open: 'Aberta', negotiating: 'Recebendo propostas', accepted: 'Acordo confirmado', provider_en_route: 'Prestador a caminho', provider_arrived: 'Prestador chegou', in_progress: 'Em andamento', awaiting_customer_confirmation: 'Aguardando sua confirmação', completed: 'Concluída', cancelled: 'Cancelada' };
const proposalLabel: Record<Proposal['status'], string> = { pending: 'Pendente', accepted: 'Aceita', rejected: 'Recusada', withdrawn: 'Retirada', superseded: 'Substituída' };

/** Raiz da experiência do cliente. Navegação e estados globais continuam no App. */
export function CustomerApp({ user, demands, proposals, onCreate, onAccept, onCancel, onChat, onViewProvider, onRequestProvider, onOpenProvider }: Props) {
  const [providerSearch, setProviderSearch] = useState('');
  const [providerResults, setProviderResults] = useState<PremiumProviderSearchItem[]>([]);
  const [providerTotal, setProviderTotal] = useState(0);
  const [searchingProvider, setSearchingProvider] = useState(false);
  const [showAllPremium, setShowAllPremium] = useState(false);
  const ownDemands = demands.filter((item) => item.requesterId === user.id && !['completed', 'cancelled'].includes(item.status));
  const categoryCards: Array<{ icon: string; label: string; type: DemandType }> = [{ icon: '🚗', label: 'Automotivo', type: 'service' }, { icon: '⚡', label: 'Elétrica', type: 'service' }, { icon: '🔧', label: 'Manutenção', type: 'service' }, { icon: '🧹', label: 'Limpeza', type: 'service' }, { icon: '📦', label: 'Entrega', type: 'delivery' }, { icon: '•••', label: 'Outros', type: 'service' }];
  async function searchPremiumProviders() {
    setSearchingProvider(true);
    try {
      const result = await apiSearchPremiumProviders({ query: providerSearch.trim(), page: 1, limit: 6 });
      setProviderResults(result.items);
      setProviderTotal(result.total);
    } catch {
      Alert.alert('Busca indisponível', 'Não foi possível carregar os prestadores verificados agora.');
    } finally {
      setSearchingProvider(false);
    }
  }

  if (showAllPremium) {
    return (
      <PremiumProviderSearchScreen
        initialQuery={providerSearch}
        onBack={() => setShowAllPremium(false)}
        onOpenProvider={onOpenProvider}
        onRequestProvider={onRequestProvider}
      />
    );
  }

  return <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.search}><Text style={styles.searchIcon}>⌕</Text><TextInput value={providerSearch} onChangeText={setProviderSearch} onSubmitEditing={() => searchPremiumProviders()} placeholder="Buscar prestador verificado" placeholderTextColor="#7C8BA0" style={styles.searchInput} /><TouchableOpacity onPress={() => searchPremiumProviders()}><Text style={styles.seeAll}>{searchingProvider ? '...' : 'Buscar'}</Text></TouchableOpacity></View>
    {providerResults.length > 0 && <View style={styles.infoBox}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.infoTitle}>Prestadores Premium perto de você</Text>
          <Text style={styles.resultCount}>{providerTotal} profissional{providerTotal === 1 ? '' : 'is'} encontrado{providerTotal === 1 ? '' : 's'}</Text>
        </View>
        {providerTotal > providerResults.length && <TouchableOpacity onPress={() => setShowAllPremium(true)}><Text style={styles.seeAll}>Ver todos</Text></TouchableOpacity>}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.premiumRow}>
        {providerResults.map((provider) => (
          <PremiumProviderCard
            key={provider.id}
            provider={provider}
            variant="compact"
            onOpen={onOpenProvider}
            onRequest={onRequestProvider}
          />
        ))}
      </ScrollView>
    </View>}
    <TouchableOpacity style={styles.hero} onPress={() => onCreate('service')} activeOpacity={0.9}><Text style={styles.heroEyebrow}>SERVIÇOS COM SEGURANÇA</Text><Text style={styles.heroTitle}>Encontre quem resolve.{"\n"}Sem complicação.</Text><View style={styles.heroButton}><Text style={styles.heroButtonText}>Criar demanda</Text></View></TouchableOpacity>
    <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Categorias em destaque</Text><Text style={styles.seeAll}>Ver todas</Text></View>
    <View style={styles.categoryGrid}>{categoryCards.map((item) => <TouchableOpacity key={item.label} style={styles.categoryItem} onPress={() => onCreate(item.type)}><View style={styles.categoryIcon}><Text>{item.icon}</Text></View><Text style={styles.categoryLabel}>{item.label}</Text></TouchableOpacity>)}</View>
    <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Minhas demandas</Text><TouchableOpacity onPress={() => onCreate('service')}><Text style={styles.seeAll}>+ Nova</Text></TouchableOpacity></View>
    {ownDemands.length === 0 ? <TouchableOpacity style={styles.emptyCard} onPress={() => onCreate('service')}><Text style={styles.emptyTitle}>Publique sua primeira demanda</Text><Text style={styles.emptyText}>Descreva o que precisa e receba propostas de profissionais.</Text><Text style={styles.emptyAction}>Criar demanda →</Text></TouchableOpacity> : ownDemands.map((demand) => { const demandProposals = proposals.filter((item) => item.demandId === demand.id); const canCancel = demand.status === 'open' || demand.status === 'negotiating'; return <View style={styles.demand} key={demand.id}><View style={styles.demandTop}><Text style={styles.demandType}>{demand.category}</Text><Text style={styles.status}>{statusLabel[demand.status]}</Text></View>{demand.isUrgent && <Text style={styles.urgent}>⚡ PRECISO AGORA</Text>}<Text style={styles.demandTitle}>{demand.title}</Text><Text style={styles.mutedSmall}>{demand.locationLabel} · {money(demand.budget)}</Text>{canCancel && <TouchableOpacity style={styles.outline} onPress={() => Alert.alert('Cancelar chamado?', 'As propostas serão encerradas e o chamado ficará registrado como cancelado.', [{ text: 'Voltar', style: 'cancel' }, { text: 'Cancelar chamado', style: 'destructive', onPress: () => onCancel(demand).catch(() => Alert.alert('Erro', 'Não foi possível cancelar o chamado.')) }])}><Text style={styles.outlineText}>Cancelar chamado</Text></TouchableOpacity>}{demandProposals.map((proposal) => <View style={styles.proposal} key={proposal.id}><View style={styles.demandTop}><Text style={styles.proposalAmount}>{money(proposal.amount)}</Text><Text style={styles.status}>{proposalLabel[proposal.status]}</Text></View>{proposal.message && <Text style={styles.mutedSmall}>{proposal.message}</Text>}<View style={styles.actionRow}>{proposal.status === 'pending' && !proposal.customerConfirmedAt && <TouchableOpacity style={styles.smallButton} onPress={() => onAccept(proposal)}><Text style={styles.smallButtonText}>Aceitar proposta</Text></TouchableOpacity>}<View style={styles.secondaryActions}><TouchableOpacity style={styles.outline} onPress={() => onViewProvider(proposal)}><Text style={styles.outlineText}>Ver perfil</Text></TouchableOpacity><TouchableOpacity style={styles.outline} onPress={() => onChat(proposal)}><Text style={styles.outlineText}>Conversar</Text></TouchableOpacity></View></View></View>)}</View>; })}
  </ScrollView>;
}

const styles = StyleSheet.create({ content:{padding:16,paddingBottom:94},search:{height:46,borderRadius:14,borderWidth:1,borderColor:'#DCE6F5',backgroundColor:'#FFF',paddingHorizontal:14,flexDirection:'row',alignItems:'center',marginBottom:14},searchIcon:{color:BRAND,fontSize:25,marginRight:8,marginTop:-3},searchInput:{flex:1,color:BRAND},seeAll:{color:ACCENT,fontWeight:'800',fontSize:12},infoBox:{backgroundColor:'#EAF1F8',borderRadius:15,padding:16,marginBottom:18},infoTitle:{color:BRAND,fontWeight:'800',marginBottom:2},resultCount:{color:'#74849A',fontSize:11},premiumRow:{paddingTop:10,paddingRight:4},proposal:{borderTopWidth:1,borderTopColor:'#E8EDF3',paddingTop:10,marginTop:6},hero:{borderRadius:18,padding:19,minHeight:168,backgroundColor:BRAND,marginBottom:20,justifyContent:'center',overflow:'hidden'},heroEyebrow:{color:'#A9D1FF',fontWeight:'900',fontSize:10,letterSpacing:.6,marginBottom:8},heroTitle:{color:'#FFF',fontWeight:'900',fontSize:25,lineHeight:30},heroButton:{alignSelf:'flex-start',backgroundColor:ACCENT,borderRadius:10,paddingHorizontal:14,paddingVertical:9,marginTop:15},heroButtonText:{color:'#FFF',fontWeight:'900',fontSize:12},sectionHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:11},sectionTitle:{color:BRAND,fontWeight:'900',fontSize:17},categoryGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',marginBottom:23},categoryItem:{width:'30.5%',alignItems:'center',marginBottom:13},categoryIcon:{width:48,height:48,borderRadius:15,backgroundColor:'#E8F3FF',alignItems:'center',justifyContent:'center',marginBottom:6},categoryLabel:{color:'#45607E',fontSize:10,fontWeight:'700',textAlign:'center'},emptyCard:{borderWidth:1,borderColor:'#D9E7FA',borderRadius:16,padding:17,backgroundColor:'#FFF',marginBottom:14},emptyTitle:{color:BRAND,fontWeight:'900',fontSize:16},emptyText:{color:'#65768C',marginTop:5,lineHeight:18,fontSize:13},emptyAction:{color:ACCENT,fontWeight:'900',marginTop:12,fontSize:13},demand:{backgroundColor:'#FFF',borderRadius:16,padding:16,marginBottom:12,borderWidth:1,borderColor:'#E7ECF2'},demandTop:{flexDirection:'row',justifyContent:'space-between',marginBottom:8},demandType:{color:ACCENT,fontWeight:'800'},status:{color:'#607086',fontSize:12,fontWeight:'700'},urgent:{color:ACCENT,fontWeight:'900',marginBottom:7},demandTitle:{color:BRAND,fontSize:17,fontWeight:'800',marginBottom:6},mutedSmall:{color:'#68778C',lineHeight:19,marginBottom:7},outline:{borderWidth:1,borderColor:BRAND,paddingHorizontal:13,paddingVertical:8,borderRadius:10},outlineText:{color:BRAND,fontWeight:'800'},proposalAmount:{color:BRAND,fontWeight:'900',fontSize:16},actionRow:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:5},secondaryActions:{flexDirection:'row',flexWrap:'wrap',gap:8},smallButton:{backgroundColor:ACCENT,paddingHorizontal:13,paddingVertical:9,borderRadius:10},smallButtonText:{color:'#FFF',fontWeight:'800'}});
