import { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Demand, Rating, User } from '@rubli/shared';
import { getHistoryDemands, getRatings, saveRating, archiveCompletedDemand } from '../profile/profileStore';
import { PublicProfileScreen } from './PublicProfileScreen';

const BRAND = '#081B33';
const ACCENT = '#F28C28';

interface Props { user: User; profiles: User[]; visible: boolean; onClose: () => void; onChanged?: () => void; }
function makeId() { return `rat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

export function HistoryScreen({ user, profiles, visible, onClose, onChanged }: Props) {
  const [demands, setDemands] = useState<Demand[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [rateDemand, setRateDemand] = useState<Demand | null>(null);
  const [rateTarget, setRateTarget] = useState<User | null>(null);
  const [stars, setStars] = useState<1 | 2 | 3 | 4 | 5>(5);
  const [comment, setComment] = useState('');
  const [profileTarget, setProfileTarget] = useState<User | null>(null);

  async function reload() {
    const [history, allRatings] = await Promise.all([getHistoryDemands(), getRatings()]);
    setDemands(history.filter((item) => item.requesterId === user.id || item.acceptedProviderId === user.id));
    setRatings(allRatings);
  }

  useEffect(() => { if (visible) reload().catch(() => undefined); }, [visible, user.id]);

  function targetFor(demand: Demand) {
    if (user.id === demand.requesterId && demand.acceptedProviderId) return profiles.find((item) => item.id === demand.acceptedProviderId);
    if (user.id === demand.acceptedProviderId) return profiles.find((item) => item.id === demand.requesterId);
    return undefined;
  }

  async function submitRating() {
    if (!rateDemand || !rateTarget) return;
    const duplicate = ratings.some((item) => item.demandId === rateDemand.id && item.fromUserId === user.id && item.toUserId === rateTarget.id);
    if (duplicate) return Alert.alert('Avaliação já enviada', 'Você já avaliou este usuário neste chamado.');
    const rating: Rating = { id: makeId(), demandId: rateDemand.id, fromUserId: user.id, toUserId: rateTarget.id, stars, comment: comment.trim() || undefined, createdAt: new Date().toISOString() };
    const nextRatings = await saveRating(rating);
    setRatings(nextRatings);
    const demand = rateDemand;
    setRateDemand(null); setRateTarget(null); setComment(''); setStars(5);

    const providerId = demand.acceptedProviderId;
    const participants = providerId ? 2 : 1;
    const completedRatings = nextRatings.filter((item) => item.demandId === demand.id);
    if (completedRatings.length >= participants) {
      await archiveCompletedDemand(demand);
    }
    onChanged?.();
    await reload();
    Alert.alert('Avaliação enviada', completedRatings.length >= participants ? 'Chamado encerrado e movido para o histórico.' : 'Avaliação registrada. A outra parte ainda precisa avaliar.');
  }

  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <View style={styles.root}><View style={styles.header}><Text style={styles.title}>Histórico</Text><TouchableOpacity onPress={onClose} style={styles.close}><Text style={styles.closeText}>Fechar</Text></TouchableOpacity></View>
      <ScrollView contentContainerStyle={styles.content}>
        {demands.length === 0 ? <Text style={styles.empty}>Nenhum chamado encerrado no histórico.</Text> : demands.map((demand) => {
          const target = targetFor(demand);
          const mine = target ? ratings.find((item) => item.demandId === demand.id && item.fromUserId === user.id && item.toUserId === target.id) : undefined;
          return <View key={demand.id} style={styles.card}><Text style={styles.category}>{demand.category}</Text><Text style={styles.cardTitle}>{demand.title}</Text><Text style={styles.meta}>{demand.locationLabel}</Text><Text style={styles.meta}>Concluído em {demand.completedAt ? new Date(demand.completedAt).toLocaleDateString('pt-BR') : 'data não informada'}</Text>{target && <TouchableOpacity onPress={() => setProfileTarget(target)}><Text style={styles.profileLink}>Ver perfil de {target.name}</Text></TouchableOpacity>}{target && !mine ? <TouchableOpacity style={styles.primary} onPress={() => { setRateDemand(demand); setRateTarget(target); }}><Text style={styles.primaryText}>Avaliar {target.role === 'provider' ? 'prestador' : 'cliente'}</Text></TouchableOpacity> : <Text style={styles.done}>✓ Avaliação já registrada</Text>}</View>;
        })}
      </ScrollView>
      {rateDemand && rateTarget && <Modal transparent animationType="fade" visible onRequestClose={() => setRateDemand(null)}><View style={styles.backdrop}><View style={styles.rateCard}><Text style={styles.rateTitle}>Avaliar {rateTarget.name}</Text><View style={styles.starsRow}>{([1,2,3,4,5] as const).map((value) => <TouchableOpacity key={value} onPress={() => setStars(value)}><Text style={[styles.star, value <= stars && styles.starActive]}>★</Text></TouchableOpacity>)}</View><TextInput value={comment} onChangeText={setComment} placeholder="Comentário (opcional)" multiline style={styles.comment}/><TouchableOpacity style={styles.primary} onPress={() => submitRating().catch(() => Alert.alert('Erro', 'Não foi possível salvar a avaliação.'))}><Text style={styles.primaryText}>Enviar avaliação</Text></TouchableOpacity></View></View></Modal>}
      {profileTarget && <PublicProfileScreen user={profileTarget} ratings={ratings} visible onClose={() => setProfileTarget(null)} />}
    </View>
  </Modal>;
}

const styles = StyleSheet.create({ root:{flex:1,backgroundColor:'#F7F9FC'}, header:{backgroundColor:'#FFF',padding:16,borderBottomWidth:1,borderBottomColor:'#E5EAF0',flexDirection:'row',alignItems:'center'}, title:{flex:1,color:BRAND,fontSize:24,fontWeight:'900'}, close:{backgroundColor:BRAND,borderRadius:11,paddingHorizontal:13,paddingVertical:9}, closeText:{color:'#FFF',fontWeight:'800'}, content:{padding:16,paddingBottom:40}, card:{backgroundColor:'#FFF',borderRadius:16,padding:16,borderWidth:1,borderColor:'#E3E9F0',marginBottom:12}, category:{color:ACCENT,fontWeight:'900'}, cardTitle:{color:BRAND,fontSize:18,fontWeight:'900',marginTop:5}, meta:{color:'#68778C',marginTop:4}, profileLink:{color:ACCENT,fontWeight:'900',marginTop:10}, primary:{backgroundColor:ACCENT,borderRadius:12,padding:13,alignItems:'center',marginTop:12}, primaryText:{color:'#FFF',fontWeight:'900'}, done:{color:'#4B7A60',fontWeight:'800',marginTop:12}, empty:{color:'#718096',padding:24,textAlign:'center'}, backdrop:{flex:1,backgroundColor:'rgba(0,0,0,0.45)',alignItems:'center',justifyContent:'center',padding:20}, rateCard:{width:'100%',maxWidth:430,backgroundColor:'#FFF',borderRadius:20,padding:20}, rateTitle:{color:BRAND,fontSize:22,fontWeight:'900',textAlign:'center'}, starsRow:{flexDirection:'row',justifyContent:'center',gap:6,marginVertical:18}, star:{fontSize:34,color:'#D4D9E1'}, starActive:{color:ACCENT}, comment:{minHeight:100,borderWidth:1,borderColor:'#D8E0EA',borderRadius:14,padding:13,textAlignVertical:'top'}});
