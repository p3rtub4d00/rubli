import { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Demand, Proposal, Rating, User } from '@rubli/shared';
import { getDemands, getProposals, saveDemands } from '../storage/localStore';
import { archiveCompletedDemand, getRatings, saveRating } from '../profile/profileStore';
import { PublicProfileScreen } from './PublicProfileScreen';

const BRAND = '#081B33';
const ACCENT = '#F28C28';
interface Props { user: User; profiles: User[]; visible: boolean; onClose: () => void; onChanged: () => void; }
function newId() { return `rat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
function money(value: number) { return `R$ ${value.toFixed(2).replace('.', ',')}`; }

export function ServiceLifecycleScreen({ user, profiles, visible, onClose, onChanged }: Props) {
  const [demands, setDemands] = useState<Demand[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [rateDemand, setRateDemand] = useState<Demand | null>(null);
  const [rateTarget, setRateTarget] = useState<User | null>(null);
  const [stars, setStars] = useState<1 | 2 | 3 | 4 | 5>(5);
  const [comment, setComment] = useState('');
  const [profileTarget, setProfileTarget] = useState<User | null>(null);

  async function reload() {
    const [allDemands, allProposals, allRatings] = await Promise.all([getDemands(), getProposals(), getRatings()]);
    setDemands(allDemands); setProposals(allProposals); setRatings(allRatings);
  }
  useEffect(() => { if (visible) reload().catch(() => undefined); }, [visible, user.id]);

  const mine = demands.filter((demand) => {
    const accepted = allAcceptedProviderId(demand, proposals);
    return accepted && (demand.requesterId === user.id || accepted === user.id) && ['accepted', 'in_progress', 'completed'].includes(demand.status);
  });

  function otherParty(demand: Demand) {
    const providerId = allAcceptedProviderId(demand, proposals);
    if (user.id === demand.requesterId && providerId) return profiles.find((item) => item.id === providerId);
    if (user.id === providerId) return profiles.find((item) => item.id === demand.requesterId);
    return undefined;
  }

  async function setStatus(demand: Demand, status: 'in_progress' | 'completed') {
    const acceptedProviderId = allAcceptedProviderId(demand, proposals);
    if (!acceptedProviderId) return Alert.alert('Não encontrado', 'Não foi possível identificar o prestador aceito.');
    if (status === 'in_progress' && user.id !== acceptedProviderId) return Alert.alert('Ação do prestador', 'Somente o prestador contratado pode iniciar o serviço.');
    const now = new Date().toISOString();
    const next = demands.map((item) => item.id === demand.id ? { ...item, acceptedProviderId, status, ...(status === 'in_progress' ? { startedAt: now } : { completedAt: now }) } : item);
    await saveDemands(next); await reload(); onChanged();
  }

  async function submitRating() {
    if (!rateDemand || !rateTarget) return;
    const duplicate = ratings.some((item) => item.demandId === rateDemand.id && item.fromUserId === user.id && item.toUserId === rateTarget.id);
    if (duplicate) return Alert.alert('Avaliação já enviada', 'Você já avaliou este usuário neste chamado.');
    const rating: Rating = { id: newId(), demandId: rateDemand.id, fromUserId: user.id, toUserId: rateTarget.id, stars, comment: comment.trim() || undefined, createdAt: new Date().toISOString() };
    const nextRatings = await saveRating(rating);
    setRatings(nextRatings); setRateDemand(null); setRateTarget(null); setComment(''); setStars(5);
    const participantRatings = nextRatings.filter((item) => item.demandId === rating.demandId);
    if (participantRatings.some((item) => item.fromUserId === rateDemand.requesterId) && participantRatings.some((item) => item.fromUserId === allAcceptedProviderId(rateDemand, proposals))) {
      await archiveCompletedDemand(rateDemand);
      await reload(); onChanged();
      Alert.alert('Chamado encerrado', 'As duas avaliações foram registradas e o chamado foi movido para o histórico.');
    } else {
      await reload();
      Alert.alert('Avaliação enviada', 'A outra parte ainda precisa avaliar.');
    }
  }

  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <View style={styles.root}><View style={styles.header}><Text style={styles.title}>Serviço em andamento</Text><TouchableOpacity style={styles.close} onPress={onClose}><Text style={styles.closeText}>Fechar</Text></TouchableOpacity></View>
      <ScrollView contentContainerStyle={styles.content}>
        {mine.length === 0 ? <Text style={styles.empty}>Nenhum serviço contratado no momento.</Text> : mine.map((demand) => {
          const providerId = allAcceptedProviderId(demand, proposals);
          const other = otherParty(demand);
          const myRating = other && ratings.find((item) => item.demandId === demand.id && item.fromUserId === user.id && item.toUserId === other.id);
          return <View key={demand.id} style={styles.card}><Text style={styles.category}>{demand.category}</Text><Text style={styles.cardTitle}>{demand.title}</Text><Text style={styles.meta}>Status: {demand.status === 'accepted' ? 'Contratado' : demand.status === 'in_progress' ? 'Em andamento' : 'Concluído'}</Text>{other && <TouchableOpacity onPress={() => setProfileTarget(other)}><Text style={styles.profileLink}>Ver perfil de {other.name}</Text></TouchableOpacity>}{demand.status === 'accepted' && user.id === providerId && <TouchableOpacity style={styles.primary} onPress={() => setStatus(demand, 'in_progress').catch(() => Alert.alert('Erro', 'Não foi possível iniciar o serviço.'))}><Text style={styles.primaryText}>Iniciar serviço</Text></TouchableOpacity>}{demand.status === 'in_progress' && user.id === providerId && <TouchableOpacity style={styles.primary} onPress={() => setStatus(demand, 'completed').catch(() => Alert.alert('Erro', 'Não foi possível concluir o serviço.'))}><Text style={styles.primaryText}>Concluir serviço</Text></TouchableOpacity>}{demand.status === 'completed' && other && !myRating && <TouchableOpacity style={styles.primary} onPress={() => { setRateDemand(demand); setRateTarget(other); }}><Text style={styles.primaryText}>Avaliar {other.role === 'provider' ? 'prestador' : 'cliente'}</Text></TouchableOpacity>}{demand.status === 'completed' && myRating && <Text style={styles.done}>✓ Sua avaliação foi registrada</Text>}</View>;
        })}
      </ScrollView>
      {profileTarget && <PublicProfileScreen user={profileTarget} ratings={ratings} visible onClose={() => setProfileTarget(null)} />}
      {rateDemand && rateTarget && <Modal transparent animationType="fade" visible onRequestClose={() => setRateDemand(null)}><View style={styles.backdrop}><View style={styles.rateCard}><Text style={styles.rateTitle}>Avaliar {rateTarget.name}</Text><View style={styles.stars}>{([1,2,3,4,5] as const).map((value) => <TouchableOpacity key={value} onPress={() => setStars(value)}><Text style={[styles.star, value <= stars && styles.starActive]}>★</Text></TouchableOpacity>)}</View><TextInput value={comment} onChangeText={setComment} placeholder="Comentário (opcional)" multiline style={styles.comment}/><TouchableOpacity style={styles.primary} onPress={() => submitRating().catch(() => Alert.alert('Erro', 'Não foi possível salvar a avaliação.'))}><Text style={styles.primaryText}>Enviar avaliação</Text></TouchableOpacity></View></View></Modal>}
    </View>
  </Modal>;
}

function allAcceptedProviderId(demand: Demand, proposals: Proposal[]) { return demand.acceptedProviderId ?? proposals.find((item) => item.demandId === demand.id && item.status === 'accepted')?.providerId; }

const styles = StyleSheet.create({root:{flex:1,backgroundColor:'#F7F9FC'},header:{backgroundColor:'#FFF',padding:16,borderBottomWidth:1,borderBottomColor:'#E5EAF0',flexDirection:'row',alignItems:'center'},title:{flex:1,color:BRAND,fontSize:23,fontWeight:'900'},close:{backgroundColor:BRAND,borderRadius:11,paddingHorizontal:13,paddingVertical:9},closeText:{color:'#FFF',fontWeight:'800'},content:{padding:16,paddingBottom:40},card:{backgroundColor:'#FFF',borderRadius:16,padding:16,borderWidth:1,borderColor:'#E3E9F0',marginBottom:12},category:{color:ACCENT,fontWeight:'900'},cardTitle:{color:BRAND,fontSize:18,fontWeight:'900',marginTop:5},meta:{color:'#68778C',marginTop:5},profileLink:{color:ACCENT,fontWeight:'900',marginTop:10},primary:{backgroundColor:ACCENT,borderRadius:12,padding:13,alignItems:'center',marginTop:12},primaryText:{color:'#FFF',fontWeight:'900'},done:{color:'#4B7A60',fontWeight:'800',marginTop:12},empty:{color:'#718096',padding:24,textAlign:'center'},backdrop:{flex:1,backgroundColor:'rgba(0,0,0,0.45)',alignItems:'center',justifyContent:'center',padding:20},rateCard:{width:'100%',maxWidth:430,backgroundColor:'#FFF',borderRadius:20,padding:20},rateTitle:{color:BRAND,fontSize:22,fontWeight:'900',textAlign:'center'},stars:{flexDirection:'row',justifyContent:'center',gap:6,marginVertical:16},star:{fontSize:34,color:'#D4D9E1'},starActive:{color:ACCENT},comment:{minHeight:100,borderWidth:1,borderColor:'#D8E0EA',borderRadius:14,padding:13,textAlignVertical:'top'}});
