import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Demand, User } from '@rubli/shared';

const BRAND = '#081B33';
const ACCENT = '#F28C28';
const GREEN = '#2F7D4A';

interface OpportunityScreenProps {
  user: User;
  demand: Demand;
  distanceKm?: number;
  onBack: () => void;
  onViewDemand: () => void;
  onIgnore: () => void;
}

export function OpportunityScreen({ user, demand, distanceKm, onBack, onViewDemand, onIgnore }: OpportunityScreenProps) {
  const distanceLabel = typeof distanceKm === 'number'
    ? distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1).replace('.', ',')} km`
    : 'Distância indisponível';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={onBack}><Text style={styles.back}>‹ Voltar</Text></TouchableOpacity>
          <View style={styles.status}><View style={styles.dot} /><Text style={styles.statusText}>OPORTUNIDADE</Text></View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>{demand.type.toUpperCase()}</Text>
          {demand.isUrgent ? <Text style={styles.urgent}>⚡ PRECISO AGORA</Text> : null}
          <Text style={styles.title}>{demand.title}</Text>
          <Text style={styles.distance}>📍 {distanceLabel}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>O que o cliente precisa</Text>
          <Text style={styles.description}>{demand.description}</Text>
          <View style={styles.infoGrid}>
            <View style={styles.infoBox}><Text style={styles.infoLabel}>Categoria</Text><Text style={styles.infoValue}>{demand.category}</Text></View>
            <View style={styles.infoBox}><Text style={styles.infoLabel}>Valor informado</Text><Text style={styles.infoValue}>{typeof demand.budget === 'number' ? `R$ ${demand.budget.toFixed(2).replace('.', ',')}` : 'Aberto'}</Text></View>
          </View>
          <View style={styles.locationBox}>
            <Text style={styles.infoLabel}>Local do serviço</Text>
            <Text style={styles.location}>{demand.locationLabel}</Text>
          </View>
        </View>

        <View style={styles.tip}>
          <Text style={styles.tipTitle}>Antes de enviar sua proposta</Text>
          <Text style={styles.tipText}>Confira a descrição, localização e valor informado pelo cliente. A proposta continua sendo sua decisão.</Text>
        </View>

        <TouchableOpacity style={styles.primary} onPress={onViewDemand}>
          <Text style={styles.primaryText}>Ver chamado completo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} onPress={onIgnore}>
          <Text style={styles.secondaryText}>Ignorar oportunidade</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>Olá, {user.name}. Você está visualizando uma oportunidade compatível com seu perfil.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F9FC' },
  content: { padding: 16, paddingBottom: 36 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  back: { color: BRAND, fontWeight: '800', fontSize: 15 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EAF6EE', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  dot: { width: 8, height: 8, borderRadius: 99, backgroundColor: GREEN },
  statusText: { color: GREEN, fontWeight: '900', fontSize: 11 },
  hero: { backgroundColor: BRAND, borderRadius: 18, padding: 18, marginBottom: 14 },
  eyebrow: { color: '#B8C7DA', fontWeight: '900', fontSize: 11, marginBottom: 8 },
  urgent: { color: ACCENT, fontWeight: '900', fontSize: 13, marginBottom: 8 },
  title: { color: '#FFF', fontWeight: '900', fontSize: 25, lineHeight: 30 },
  distance: { color: '#D7E0EA', fontWeight: '700', marginTop: 12 },
  card: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16, padding: 16, marginBottom: 14 },
  sectionTitle: { color: BRAND, fontWeight: '900', fontSize: 17, marginBottom: 10 },
  description: { color: '#334155', fontSize: 15, lineHeight: 22 },
  infoGrid: { flexDirection: 'row', gap: 10, marginTop: 16 },
  infoBox: { flex: 1, backgroundColor: '#F7F9FC', borderRadius: 12, padding: 12 },
  infoLabel: { color: '#718096', fontWeight: '700', fontSize: 11 },
  infoValue: { color: BRAND, fontWeight: '900', fontSize: 14, marginTop: 5 },
  locationBox: { backgroundColor: '#FFF8EF', borderRadius: 12, padding: 12, marginTop: 10 },
  location: { color: '#4A5568', fontWeight: '700', marginTop: 5 },
  tip: { backgroundColor: '#EDF3F9', borderRadius: 14, padding: 14, marginBottom: 14 },
  tipTitle: { color: BRAND, fontWeight: '900', fontSize: 13 },
  tipText: { color: '#5D6B7A', fontSize: 12, lineHeight: 18, marginTop: 5 },
  primary: { backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#FFF', fontWeight: '900', fontSize: 15 },
  secondary: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 9 },
  secondaryText: { color: BRAND, fontWeight: '900', fontSize: 14 },
  footer: { color: '#718096', fontSize: 11, textAlign: 'center', marginTop: 16, lineHeight: 17 },
});
