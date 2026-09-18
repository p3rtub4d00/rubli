import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiSearchPremiumProviders, type PremiumProviderSearchItem } from '../../../core/api/client';
import { PremiumProviderCard } from '../components/PremiumProviderCard';

const BRAND = '#0B3B82';
const ACCENT = '#0B66FF';

type Sort = 'relevant' | 'rating' | 'completed' | 'available';

type Props = {
  initialQuery: string;
  onBack: () => void;
  onOpenProvider: (provider: PremiumProviderSearchItem) => void;
  onRequestProvider: (provider: PremiumProviderSearchItem) => void;
};

const sortOptions: Array<{ value: Sort; label: string }> = [
  { value: 'relevant', label: 'Relevantes' },
  { value: 'rating', label: 'Avaliação' },
  { value: 'completed', label: 'Mais serviços' },
  { value: 'available', label: 'Disponíveis' },
];

export function PremiumProviderSearchScreen({ initialQuery, onBack, onOpenProvider, onRequestProvider }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState<Sort>('relevant');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [items, setItems] = useState<PremiumProviderSearchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [nextPage, setNextPage] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);

  async function load(page = 1, append = false) {
    if (loading) return;
    setLoading(true);
    try {
      const result = await apiSearchPremiumProviders({
        query: query.trim(),
        page,
        limit: 10,
        sort,
        available: availableOnly,
        verified: verifiedOnly,
      });
      setItems((current) => append
        ? [...current, ...result.items.filter((item) => !current.some((saved) => saved.id === item.id))]
        : result.items);
      setTotal(result.total);
      setNextPage(result.nextPage);
    } catch {
      Alert.alert('Busca indisponível', 'Não foi possível carregar os profissionais agora.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1, false);
    // O recarregamento é disparado intencionalmente quando filtros/ordenação mudam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, availableOnly, verifiedOnly]);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Prestadores Premium</Text>
          <Text style={styles.subtitle}>{total} profissional{total === 1 ? '' : 'is'} encontrado{total === 1 ? '' : 's'}</Text>
        </View>
      </View>

      <View style={styles.search}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => load(1, false)}
          placeholder="Buscar profissão ou serviço"
          placeholderTextColor="#7C8BA0"
          returnKeyType="search"
          style={styles.searchInput}
        />
        <TouchableOpacity onPress={() => load(1, false)}>
          <Text style={styles.searchAction}>Buscar</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.filterTitle}>Ordenar por</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {sortOptions.map((option) => (
          <TouchableOpacity
            key={option.value}
            onPress={() => setSort(option.value)}
            style={[styles.chip, sort === option.value && styles.chipActive]}
          >
            <Text style={[styles.chipText, sort === option.value && styles.chipTextActive]}>{option.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggle, availableOnly && styles.toggleActive]}
          onPress={() => setAvailableOnly((value) => !value)}
        >
          <Text style={[styles.toggleText, availableOnly && styles.toggleTextActive]}>Disponível agora</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggle, verifiedOnly && styles.toggleActive]}
          onPress={() => setVerifiedOnly((value) => !value)}
        >
          <Text style={[styles.toggleText, verifiedOnly && styles.toggleTextActive]}>Identidade verificada</Text>
        </TouchableOpacity>
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.loadingBox}><ActivityIndicator /><Text style={styles.loadingText}>Carregando profissionais...</Text></View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nenhum profissional encontrado</Text>
          <Text style={styles.emptyText}>Tente outro termo ou remova alguns filtros.</Text>
        </View>
      ) : (
        items.map((provider) => (
          <PremiumProviderCard
            key={provider.id}
            provider={provider}
            variant="full"
            onOpen={onOpenProvider}
            onRequest={onRequestProvider}
          />
        ))
      )}

      {nextPage && (
        <TouchableOpacity disabled={loading} style={styles.loadMore} onPress={() => load(nextPage, true)}>
          {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.loadMoreText}>Carregar mais</Text>}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 110,
    backgroundColor: '#F6F9FE',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  backText: {
    color: ACCENT,
    fontSize: 36,
    lineHeight: 38,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: BRAND,
    fontSize: 24,
    fontWeight: '900',
  },
  subtitle: {
    color: '#6E7F94',
    marginTop: 2,
    fontSize: 12,
  },
  search: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCE6F5',
    backgroundColor: '#FFF',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    color: BRAND,
  },
  searchAction: {
    color: ACCENT,
    fontWeight: '900',
  },
  filterTitle: {
    color: BRAND,
    fontWeight: '900',
    marginBottom: 8,
  },
  chips: {
    gap: 8,
    paddingBottom: 12,
  },
  chip: {
    borderRadius: 99,
    borderWidth: 1,
    borderColor: '#C8D7EA',
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: BRAND,
    borderColor: BRAND,
  },
  chipText: {
    color: '#5B6F88',
    fontWeight: '700',
    fontSize: 12,
  },
  chipTextActive: {
    color: '#FFF',
  },
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  toggle: {
    borderRadius: 10,
    backgroundColor: '#E9F1FA',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  toggleActive: {
    backgroundColor: '#DCEBFF',
    borderWidth: 1,
    borderColor: ACCENT,
  },
  toggleText: {
    color: '#52677F',
    fontWeight: '700',
    fontSize: 12,
  },
  toggleTextActive: {
    color: ACCENT,
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  loadingText: {
    color: '#6E7F94',
    marginTop: 10,
  },
  empty: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E1E8F1',
    padding: 20,
  },
  emptyTitle: {
    color: BRAND,
    fontWeight: '900',
    fontSize: 16,
  },
  emptyText: {
    color: '#6E7F94',
    marginTop: 5,
    lineHeight: 19,
  },
  loadMore: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  loadMoreText: {
    color: '#FFF',
    fontWeight: '900',
  },
});
