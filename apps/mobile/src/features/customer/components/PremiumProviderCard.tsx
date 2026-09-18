import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { PremiumProviderSearchItem } from '../../../core/api/client';

const BRAND = '#0B3B82';
const ACCENT = '#0B66FF';

type Props = {
  provider: PremiumProviderSearchItem;
  variant?: 'compact' | 'full';
  onOpen: (provider: PremiumProviderSearchItem) => void;
  onRequest: (provider: PremiumProviderSearchItem) => void;
};

function providerTitle(provider: PremiumProviderSearchItem) {
  if (provider.professionalTitle?.trim()) return provider.professionalTitle.trim();
  if (provider.providerType === 'courier') return 'Entregas / Motoboy';
  if (provider.providerType === 'freight') return 'Fretes e mudanças';
  return 'Profissional Rubli';
}

function ratingLabel(provider: PremiumProviderSearchItem) {
  const { averageRating, ratingsCount } = provider.metrics;
  return averageRating
    ? `⭐ ${averageRating.toFixed(1).replace('.', ',')} (${ratingsCount})`
    : 'Novo no Rubli';
}

export function PremiumProviderCard({ provider, variant = 'compact', onOpen, onRequest }: Props) {
  const isCompact = variant === 'compact';
  const categories = provider.serviceCategories.slice(0, 3);

  return (
    <View style={[styles.card, isCompact ? styles.compact : styles.full]}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{provider.name.trim().slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={styles.name}>
            {provider.verificationStatus === 'simulated_verified' ? '✓ ' : ''}{provider.name}
          </Text>
          <Text numberOfLines={1} style={styles.title}>{providerTitle(provider)}</Text>
        </View>
      </View>

      <Text style={styles.meta}>
        {ratingLabel(provider)}
        {provider.distanceKm !== undefined ? ` · 📍 ${provider.distanceKm.toFixed(1).replace('.', ',')} km` : ''}
      </Text>

      {provider.metrics.completedServices > 0 && (
        <Text style={styles.meta}>{provider.metrics.completedServices} serviços concluídos</Text>
      )}

      {categories.length > 0 && (
        <Text numberOfLines={2} style={styles.categories}>
          {categories.join(' • ')}
          {provider.extraCategoriesCount ? ` · + ${provider.extraCategoriesCount} outras` : ''}
        </Text>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => onOpen(provider)}>
          <Text style={styles.secondaryText}>Ver perfil</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, !provider.isAvailable && styles.disabledButton]}
          disabled={!provider.isAvailable}
          onPress={() => onRequest(provider)}
        >
          <Text style={styles.primaryText}>{provider.isAvailable ? 'Solicitar atendimento' : 'Indisponível'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DFE8F4',
    padding: 14,
  },
  compact: {
    width: 268,
    marginRight: 12,
  },
  full: {
    width: '100%',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E8F3FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    color: BRAND,
    fontWeight: '900',
    fontSize: 17,
  },
  headerText: {
    flex: 1,
  },
  name: {
    color: BRAND,
    fontWeight: '900',
    fontSize: 16,
  },
  title: {
    color: '#697B91',
    marginTop: 2,
    fontSize: 12,
  },
  meta: {
    color: '#52677F',
    fontSize: 12,
    lineHeight: 18,
  },
  categories: {
    color: '#68778C',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    minHeight: 36,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: BRAND,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  secondaryText: {
    color: BRAND,
    fontWeight: '800',
    fontSize: 12,
  },
  primaryButton: {
    flexGrow: 1,
    backgroundColor: ACCENT,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#AEBACA',
  },
  primaryText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 12,
  },
});
