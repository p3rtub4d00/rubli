import { StatusBar } from 'expo-status-bar';
import { Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Demand, User } from '@rubli/shared';

const BRAND = '#081B33';
const ACCENT = '#F28C28';
const GREEN = '#2F7D4A';
const RED = '#D94A4A';

interface OpportunityScreenProps {
  user: User;
  demand: Demand;
  distanceKm?: number;
  onBack: () => void;
  onViewDemand: () => void;
  onIgnore: () => void;
}

function formatMoney(value?: number) {
  if (typeof value !== 'number') return null;
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Agora mesmo';

  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 1) return 'Agora mesmo';
  if (diffMinutes < 60) return `Há ${diffMinutes} min`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `Há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Há ${days} dia${days > 1 ? 's' : ''}`;
}

export function OpportunityScreen({ user, demand, distanceKm, onBack, onViewDemand, onIgnore }: OpportunityScreenProps) {
  const distanceLabel = typeof distanceKm === 'number'
    ? distanceKm < 1
      ? `${Math.max(1, Math.round(distanceKm * 1000))} m`
      : `${distanceKm.toFixed(1).replace('.', ',')} km`
    : 'Distância indisponível';

  const budget = formatMoney(demand.budget);
  const photos = demand.photoUris ?? [];

  const budgetLabel =
    demand.budgetType === 'open'
      ? 'A combinar'
      : demand.budgetType === 'negotiable'
        ? budget ? `${budget} negociável` : 'Valor negociável'
        : budget ?? 'Valor não informado';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.back}>‹</Text>
          </TouchableOpacity>

          <View style={styles.topInfo}>
            <View style={styles.status}>
              <View style={styles.dot} />
              <Text style={styles.statusText}>NOVA OPORTUNIDADE</Text>
            </View>
            <Text style={styles.time}>{formatCreatedAt(demand.createdAt)}</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.categoryPill}>
              <Text style={styles.categoryPillText}>{demand.category}</Text>
            </View>
            {demand.isUrgent ? (
              <View style={styles.urgentPill}>
                <Text style={styles.urgentText}>⚡ URGENTE</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.title}>{demand.title}</Text>
          <Text style={styles.heroDescription} numberOfLines={3}>{demand.description}</Text>

          <View style={styles.heroMetrics}>
            <View>
              <Text style={styles.metricLabel}>DISTÂNCIA</Text>
              <Text style={styles.metricValue}>📍 {distanceLabel}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View>
              <Text style={styles.metricLabel}>ORÇAMENTO</Text>
              <Text style={styles.metricValue}>💰 {budgetLabel}</Text>
            </View>
          </View>
        </View>

        {photos.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Fotos do serviço</Text>
              <View style={styles.photoCount}><Text style={styles.photoCountText}>{photos.length} foto{photos.length > 1 ? 's' : ''}</Text></View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoList}>
              {photos.map((uri, index) => (
                <Image key={`${uri}-${index}`} source={{ uri }} style={styles.photo} />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Resumo do chamado</Text>
          <Text style={styles.description}>{demand.description}</Text>

          <View style={styles.details}>
            <View style={styles.detailRow}>
              <Text style={styles.detailIcon}>🧰</Text>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Categoria</Text>
                <Text style={styles.detailValue}>{demand.category}</Text>
              </View>
            </View>

            <View style={styles.separator} />

            <View style={styles.detailRow}>
              <Text style={styles.detailIcon}>📍</Text>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Local do serviço</Text>
                <Text style={styles.detailValue}>{demand.locationLabel}</Text>
              </View>
            </View>

            <View style={styles.separator} />

            <View style={styles.detailRow}>
              <Text style={styles.detailIcon}>💰</Text>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Valor informado pelo cliente</Text>
                <Text style={styles.detailValue}>{budgetLabel}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.alertCard}>
          <Text style={styles.alertIcon}>{demand.isUrgent ? '⚡' : '💡'}</Text>
          <View style={styles.alertContent}>
            <Text style={styles.alertTitle}>{demand.isUrgent ? 'Cliente precisa de atendimento rápido' : 'Analise antes de enviar sua proposta'}</Text>
            <Text style={styles.alertText}>
              Confira os detalhes, fotos e localização. Você poderá negociar o valor diretamente com o cliente.
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.primary} onPress={onViewDemand} activeOpacity={0.88}>
          <Text style={styles.primaryText}>Ver chamado e enviar proposta →</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondary} onPress={onIgnore} activeOpacity={0.8}>
          <Text style={styles.secondaryText}>Ignorar oportunidade</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>
          Olá, {user.name}. Esta oportunidade foi exibida com base no seu perfil e área de atendimento.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7FB' },
  content: { padding: 16, paddingBottom: 40 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  backButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  back: { color: BRAND, fontWeight: '800', fontSize: 30, lineHeight: 32, marginTop: -2 },
  topInfo: { alignItems: 'flex-end' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 99, backgroundColor: GREEN },
  statusText: { color: GREEN, fontWeight: '900', fontSize: 11, letterSpacing: 0.4 },
  time: { color: '#94A3B8', fontSize: 11, marginTop: 3, fontWeight: '700' },

  hero: { backgroundColor: BRAND, borderRadius: 22, padding: 20, marginBottom: 16, shadowColor: '#081B33', shadowOpacity: 0.16, shadowRadius: 14, elevation: 4 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 13 },
  categoryPill: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  categoryPillText: { color: '#DCE7F3', fontWeight: '800', fontSize: 11 },
  urgentPill: { backgroundColor: 'rgba(242,140,40,0.16)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(242,140,40,0.35)' },
  urgentText: { color: '#FFB76E', fontWeight: '900', fontSize: 10 },
  title: { color: '#FFF', fontWeight: '900', fontSize: 26, lineHeight: 31 },
  heroDescription: { color: '#BFCBDD', fontSize: 14, lineHeight: 21, marginTop: 9 },
  heroMetrics: { flexDirection: 'row', marginTop: 20, paddingTop: 15, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
  metricLabel: { color: '#8FA4BC', fontWeight: '900', fontSize: 9, letterSpacing: 0.6 },
  metricValue: { color: '#FFF', fontWeight: '800', fontSize: 13, marginTop: 5, maxWidth: 145 },
  metricDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.14)', marginHorizontal: 14 },

  section: { marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { color: BRAND, fontWeight: '900', fontSize: 17 },
  photoCount: { backgroundColor: '#EAF0F7', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  photoCountText: { color: '#5D6B7A', fontWeight: '800', fontSize: 10 },
  photoList: { gap: 10, paddingRight: 4 },
  photo: { width: 210, height: 145, borderRadius: 16, backgroundColor: '#E2E8F0' },

  card: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 18, padding: 17, marginBottom: 14 },
  description: { color: '#526173', fontSize: 14, lineHeight: 21, marginTop: 9 },
  details: { marginTop: 14 },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  detailIcon: { fontSize: 18, width: 32 },
  detailContent: { flex: 1 },
  detailLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  detailValue: { color: '#26384D', fontSize: 14, fontWeight: '800', marginTop: 3 },
  separator: { height: 1, backgroundColor: '#EDF1F5', marginVertical: 4 },

  alertCard: { flexDirection: 'row', backgroundColor: '#FFF8EF', borderRadius: 16, borderWidth: 1, borderColor: '#F7D9B0', padding: 14, marginBottom: 16 },
  alertIcon: { fontSize: 21, marginRight: 10 },
  alertContent: { flex: 1 },
  alertTitle: { color: '#9A5A10', fontWeight: '900', fontSize: 13 },
  alertText: { color: '#795E3C', fontSize: 12, lineHeight: 18, marginTop: 4 },

  primary: { backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 16, alignItems: 'center', shadowColor: ACCENT, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 },
  primaryText: { color: '#FFF', fontWeight: '900', fontSize: 15 },
  secondary: { borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFF', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  secondaryText: { color: '#526173', fontWeight: '900', fontSize: 14 },
  footer: { color: '#94A3B8', fontSize: 11, textAlign: 'center', marginTop: 18, lineHeight: 17, paddingHorizontal: 10 },
});
