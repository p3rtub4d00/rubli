import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ProviderSubscription } from '@rubli/shared';
import { canProviderSubmitProposal } from '@rubli/shared';

interface Props {
  subscription?: ProviderSubscription;
  onBack: () => void;
  onSimulateTrial?: () => void;
  onSimulateExpiry?: () => void;
}

const BRAND = '#081B33';
const ACCENT = '#F28C28';

export function ProviderSubscriptionScreen({ subscription, onBack, onSimulateTrial, onSimulateExpiry }: Props) {
  const active = useMemo(() => canProviderSubmitProposal(subscription), [subscription]);
  const end = subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString('pt-BR') : '—';

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={onBack}><Text style={styles.back}>‹ Voltar</Text></TouchableOpacity>
      <Text style={styles.title}>Assinatura profissional</Text>
      <Text style={styles.subtitle}>A assinatura dá acesso às oportunidades e ao envio de propostas.</Text>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>STATUS</Text>
        <Text style={[styles.status, active ? styles.statusActive : styles.statusInactive]}>
          {active ? (subscription?.status === 'trialing' ? 'Período de teste ativo' : 'Assinatura ativa') : 'Assinatura vencida'}
        </Text>
        <Text style={styles.period}>Válida até {end}</Text>
      </View>

      <View style={styles.planCard}>
        <Text style={styles.planName}>PROFISSIONAL</Text>
        <Text style={styles.price}>R$ 29,90<Text style={styles.month}>/mês</Text></Text>
        <Text style={styles.feature}>✓ Receba oportunidades na sua região</Text>
        <Text style={styles.feature}>✓ Envie propostas para clientes</Text>
        <Text style={styles.feature}>✓ Perfil profissional e avaliações</Text>
        <Text style={styles.feature}>✓ Acesse seu histórico de serviços</Text>
      </View>

      {onSimulateTrial && <TouchableOpacity style={styles.primary} onPress={onSimulateTrial}><Text style={styles.primaryText}>Iniciar período de teste</Text></TouchableOpacity>}
      {onSimulateExpiry && <TouchableOpacity style={styles.outline} onPress={onSimulateExpiry}><Text style={styles.outlineText}>Simular assinatura vencida</Text></TouchableOpacity>}

      <View style={styles.info}>
        <Text style={styles.infoTitle}>Pagamento do serviço</Text>
        <Text style={styles.infoText}>A assinatura é do prestador e é separada do pagamento do serviço. Nesta fase, o cliente paga o prestador diretamente.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content:{padding:20,paddingBottom:40,backgroundColor:'#F7F9FC',flexGrow:1},
  back:{color:ACCENT,fontWeight:'900',marginBottom:16},
  title:{color:BRAND,fontSize:28,fontWeight:'900'},
  subtitle:{color:'#718096',lineHeight:20,marginTop:5,marginBottom:18},
  statusCard:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#E3E9F0',borderRadius:16,padding:16,marginBottom:12},
  statusLabel:{color:'#718096',fontSize:11,fontWeight:'900'},
  status:{fontSize:21,fontWeight:'900',marginTop:4},
  statusActive:{color:'#2F7A4F'},
  statusInactive:{color:'#B45309'},
  period:{color:'#68778C',marginTop:5},
  planCard:{backgroundColor:'#FFF7EF',borderWidth:1,borderColor:'#F1C28F',borderRadius:16,padding:18,marginBottom:12},
  planName:{color:ACCENT,fontWeight:'900',fontSize:12},
  price:{color:BRAND,fontSize:31,fontWeight:'900',marginTop:5,marginBottom:12},
  month:{fontSize:14,fontWeight:'700'},
  feature:{color:'#405366',marginTop:7},
  primary:{backgroundColor:ACCENT,borderRadius:12,padding:14,alignItems:'center',marginTop:4},
  primaryText:{color:'#FFF',fontWeight:'900'},
  outline:{borderWidth:1,borderColor:BRAND,borderRadius:12,padding:13,alignItems:'center',marginTop:9},
  outlineText:{color:BRAND,fontWeight:'900'},
  info:{backgroundColor:'#EAF1F8',borderRadius:14,padding:15,marginTop:18},
  infoTitle:{color:BRAND,fontWeight:'900',marginBottom:5},
  infoText:{color:'#5E7086',lineHeight:19},
});
