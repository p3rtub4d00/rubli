import { distanceKm, isValidCoordinates, normalizeCategoryKey, type Demand, type User } from '@rubli/shared';
import { getDatabase } from '../store/database.js';
import { memoryStore } from '../store/memoryStore.js';

export type ProviderDemandMatch = {
  provider: User;
  demand: Demand;
  distanceKm: number;
};

export type MatchingReason = 'CATEGORY_MATCH' | 'CATEGORY_MISMATCH' | 'OUTSIDE_RADIUS' | 'LOCATION_MISSING' | 'PROVIDER_UNAVAILABLE' | 'SUBSCRIPTION_INACTIVE' | 'PROVIDER_SUSPENDED' | 'NOT_PROVIDER' | 'OWN_DEMAND' | 'DEMAND_NOT_OPEN';
export type ProviderEligibility = { eligible: boolean; reasons: MatchingReason[]; distanceKm?: number; radiusKm?: number };

/** Normalização intencionalmente conservadora: elimina acentos e diferenças de caixa,
 * sem transformar categorias diferentes em sinônimos por engano. */
export function normalizeMatchingCategory(value: string) {
  return normalizeCategoryKey(value);
}

export function hasMatchingCategory(demand: Demand, provider: User) {
  // As contas de Entregas e Fretes não possuem as áreas genéricas de serviços
  // no cadastro. Para as contas já criadas antes da tela específica salvar sua
  // primeira área, a própria modalidade é a área mínima canônica: Entrega ou
  // Frete. Assim não se perde um chamado válido apenas por esse estado legado.
  // Ao existir uma área salva, continuamos usando integralmente o filtro de
  // categoria já utilizado pelo restante da plataforma.
  const providerType = provider.providerType ?? 'services';
  const hasConfiguredAreas = (provider.serviceCategories?.length ?? 0) > 0 || (provider.serviceCategoryIds?.length ?? 0) > 0;
  if (!hasConfiguredAreas && ((providerType === 'courier' && demand.type === 'delivery') || (providerType === 'freight' && demand.type === 'freight'))) return true;
  const category = normalizeMatchingCategory(demand.category);
  const broadAreaByDemandType: Record<Demand['type'], string | undefined> = {
    service: undefined,
    purchase: 'compras',
    delivery: 'entrega',
    freight: 'frete',
  };
  const broadArea = broadAreaByDemandType[demand.type];
  if (demand.categoryId && provider.serviceCategoryIds?.includes(demand.categoryId)) return true;
  return Boolean(category) && (provider.serviceCategories ?? []).some((item) => {
    const providerCategory = normalizeMatchingCategory(item);
    return providerCategory === category || providerCategory === broadArea;
  });
}

export function matchProviderToDemand(provider: User, demand: Demand, options: { suspended?: boolean; now?: Date } = {}): ProviderEligibility {
  const now = options.now ?? new Date();
  const reasons: MatchingReason[] = [];
  if (provider.role !== 'provider') reasons.push('NOT_PROVIDER');
  if (provider.id === demand.requesterId) reasons.push('OWN_DEMAND');
  if (!['open', 'negotiating'].includes(demand.status)) reasons.push('DEMAND_NOT_OPEN');
  if (options.suspended) reasons.push('PROVIDER_SUSPENDED');
  if (provider.isAvailable === false) reasons.push('PROVIDER_UNAVAILABLE');
  if (!hasValidProviderAccess(provider, now)) reasons.push('SUBSCRIPTION_INACTIVE');
  if (!hasMatchingCategory(demand, provider)) reasons.push('CATEGORY_MISMATCH'); else reasons.push('CATEGORY_MATCH');
  if (!isValidCoordinates(demand.latitude, demand.longitude) || !isValidCoordinates(provider.serviceLatitude, provider.serviceLongitude)) reasons.push('LOCATION_MISSING');
  const radiusKm = provider.serviceRadiusKm ?? 10;
  let currentDistance: number | undefined;
  if (!reasons.includes('LOCATION_MISSING')) {
    currentDistance = distanceKm({ latitude: provider.serviceLatitude!, longitude: provider.serviceLongitude! }, { latitude: demand.latitude!, longitude: demand.longitude! });
    if (currentDistance > radiusKm) reasons.push('OUTSIDE_RADIUS');
  }
  const eligible = !reasons.some((reason) => reason !== 'CATEGORY_MATCH');
  if (process.env.NODE_ENV !== 'production') console.info('[MATCHING]', JSON.stringify({ providerId: provider.id, demandId: demand.id, categoryMatch: !reasons.includes('CATEGORY_MISMATCH'), distanceKm: currentDistance, radiusKm, eligible, reasons }));
  return { eligible, reasons, distanceKm: currentDistance, radiusKm };
}

function hasValidProviderAccess(provider: User, now: Date) {
  // Contas legadas sem estado de assinatura continuam compatíveis. Quando o
  // estado existe, apenas trial vigente ou assinatura ativa simulada participa.
  if (!provider.providerSubscriptionStatus) return true;
  if (provider.providerSubscriptionStatus === 'simulated_active') return true;
  if (provider.providerSubscriptionStatus !== 'trialing') return false;
  const trialEnd = new Date(provider.trialEndsAt ?? '').getTime();
  return Number.isFinite(trialEnd) && trialEnd > now.getTime();
}

export function matchDemandToProviders(demand: Demand, providers: User[], now = new Date(), suspendedProviderIds = new Set<string>()): ProviderDemandMatch[] {
  return providers
    .flatMap((provider) => {
      const result = matchProviderToDemand(provider, demand, { now, suspended: suspendedProviderIds.has(provider.id) });
      return result.eligible && result.distanceKm !== undefined ? [{ provider, demand, distanceKm: result.distanceKm }] : [];
    })
    .sort((left, right) => left.distanceKm - right.distanceKm);
}

export function rankProviderDemands(matches: ProviderDemandMatch[]) {
  return [...matches].sort((left, right) => {
    const urgentOrder = Number(Boolean(right.demand.isUrgent)) - Number(Boolean(left.demand.isUrgent));
    if (urgentOrder) return urgentOrder;
    const distanceOrder = left.distanceKm - right.distanceKm;
    if (distanceOrder) return distanceOrder;
    return new Date(right.demand.createdAt).getTime() - new Date(left.demand.createdAt).getTime();
  });
}

export async function matchingProvidersForDemand(demand: Demand) {
  const db = await getDatabase();
  const providers = db
    ? await db.collection<User>('users').find({ role: 'provider', isAvailable: { $ne: false } }).toArray()
    : memoryStore.users.filter((user) => user.role === 'provider' && user.isAvailable !== false);
  const suspended = db ? await db.collection<{ userId: string; suspended?: boolean }>('admin_user_state').find({ suspended: true }).toArray() : [];
  return matchDemandToProviders(demand, providers, new Date(), new Set(suspended.map((item) => item.userId)));
}

export async function matchingDemandsForProvider(provider: User, demands: Demand[]) {
  const db = await getDatabase();
  const suspended = db ? await db.collection<{ userId: string; suspended?: boolean }>('admin_user_state').findOne({ userId: provider.id, suspended: true }) : null;
  const matched = demands.flatMap((demand) => matchDemandToProviders(demand, [provider], new Date(), new Set(suspended ? [provider.id] : [])));
  return rankProviderDemands(matched);
}
