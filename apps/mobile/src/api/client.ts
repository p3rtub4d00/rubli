import type { CancellationReason, CancellationRequest, Conversation, Demand, DemandType, Dispute, Proposal, ChatMessage, Rating, ProviderPlan, ProviderType, ProviderVehicle, ScheduleChange, User, UserRole } from '@rubli/shared';
import Constants from 'expo-constants';
import { clearAuthTokens, getAuthTokens, saveAuthTokens, type AuthTokens } from '../auth/tokenStore';

const API_PORT = 3000;

function resolveApiUrl() {
  // Na versão web local, o front e a API usam a mesma máquina. Priorizar o
  // hostname que abriu o navegador evita deixar um IP da rede anterior preso
  // no build quando o notebook muda de Wi-Fi.
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    return `http://${host}:${API_PORT}`;
  }

  // No Expo Go / build de desenvolvimento, o QR Code já contém o IP atual da
  // máquina que executa o Metro. Reaproveitamos esse host para falar com a
  // API local, sem exigir que o usuário altere o .env a cada troca de Wi-Fi.
  const expoHost = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const expoHostname = expoHost?.split(':')[0];
  if (expoHostname) return `http://${expoHostname}:${API_PORT}`;

  // Dispositivos nativos não têm um hostname do navegador. Neles a URL pode
  // continuar sendo configurada por EXPO_PUBLIC_RUBLI_API_URL (ou uma URL
  // pública em produção), sem remover essa possibilidade.
  const configured = process.env.EXPO_PUBLIC_RUBLI_API_URL?.trim();
  return configured ? configured.replace(/\/$/, '') : '';
}

export const API_URL = resolveApiUrl();

type AuthResponse = { user: User; accessToken: string; refreshToken: string; accessTokenExpiresIn: number; refreshTokenExpiresIn: number };
let refreshInFlight: Promise<AuthTokens | null> | null = null;
let authenticationLostHandler: (() => void) | undefined;

export function onAuthenticationLost(handler: () => void) { authenticationLostHandler = handler; return () => { if (authenticationLostHandler === handler) authenticationLostHandler = undefined; }; }
export async function hasAuthenticatedSession() { return Boolean(await getAuthTokens()); }

async function refreshTokens() {
  if (!refreshInFlight) refreshInFlight = (async () => {
    const tokens = await getAuthTokens();
    if (!tokens) return null;
    const response = await fetch(`${API_URL}/api/v1/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: tokens.refreshToken }) });
    if (!response.ok) return null;
    const body = await response.json() as AuthResponse;
    const next = { accessToken: body.accessToken, refreshToken: body.refreshToken, accessTokenExpiresAt: Date.now() + body.accessTokenExpiresIn * 1000 };
    await saveAuthTokens(next);
    return next;
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

async function request<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  if (!API_URL) throw new Error('API URL não configurada. Defina EXPO_PUBLIC_RUBLI_API_URL.');
  let tokens = await getAuthTokens();
  // Renova antes de expirar (inclusive sessões antigas sem data de expiração),
  // evitando vários 401 simultâneos quando uma tela dispara recargas paralelas.
  if (tokens && !['/api/v1/auth/refresh', '/api/v1/auth/login', '/api/v1/auth/register'].includes(path) && (!tokens.accessTokenExpiresAt || tokens.accessTokenExpiresAt <= Date.now() + 30_000)) {
    tokens = await refreshTokens();
    if (!tokens) {
      await clearAuthTokens();
      authenticationLostHandler?.();
      throw new Error('UNAUTHORIZED');
    }
  }
  const headers = {
    ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
    ...(init?.headers ?? {}),
  };
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (response.status === 401 && !retried && path !== '/api/v1/auth/refresh' && path !== '/api/v1/auth/login' && path !== '/api/v1/auth/register') {
    const refreshed = await refreshTokens();
    if (refreshed) return request<T>(path, init, true);
    await clearAuthTokens();
    authenticationLostHandler?.();
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(body || `HTTP ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function apiHealth() { return request<{ ok: boolean; persistence: string; realtime?: boolean; push?: boolean }>('/health'); }
export async function apiRegister(input: { name: string; email: string; phone: string; password: string; role: Extract<UserRole, 'customer' | 'provider'>; providerType?: ProviderType; providerPlan?: ProviderPlan; taxDocument: string; taxDocumentType?: 'cpf' | 'cnpj'; businessName?: string; issuesInvoice?: boolean; professionalTitle?: string }) { const result = await request<AuthResponse & { trial?: { days: 7; endsAt: string } }>('/api/v1/auth/register', { method: 'POST', body: JSON.stringify(input) }); await saveAuthTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken, accessTokenExpiresAt: Date.now() + result.accessTokenExpiresIn * 1000 }); return result; }
export async function apiLogin(input: { email: string; password: string }) { const result = await request<AuthResponse>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(input) }); await saveAuthTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken, accessTokenExpiresAt: Date.now() + result.accessTokenExpiresIn * 1000 }); return result; }
export async function apiAccessTokenForRealtime() {
  let tokens = await getAuthTokens();
  if (tokens && (!tokens.accessTokenExpiresAt || tokens.accessTokenExpiresAt <= Date.now() + 30_000)) tokens = await refreshTokens();
  return tokens?.accessToken ?? null;
}
export async function apiCurrentUser() { return request<{ user: User }>('/api/v1/auth/me'); }
export async function apiLogout() { const tokens = await getAuthTokens(); try { await request<void>('/api/v1/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: tokens?.refreshToken }) }); } finally { await clearAuthTokens(); } }
export async function apiUpdateUserProfile(userId: string, input: Partial<Pick<User, 'name' | 'bio' | 'city' | 'serviceRadiusKm' | 'serviceCategories' | 'serviceLatitude' | 'serviceLongitude' | 'avatarUri' | 'profilePhotos' | 'professionalTitle' | 'businessAddress' | 'isAvailable' | 'providerType' | 'providerVehicle'>>) { return request<User>(`/api/v1/users/${encodeURIComponent(userId)}/profile`, { method: 'PATCH', body: JSON.stringify(input) }); }
export async function apiSimulateProviderSubscription(userId: string, plan: ProviderPlan) { return request<{ user: User; simulated: true; amount: number }>(`/api/v1/providers/${encodeURIComponent(userId)}/subscription/simulate`, { method: 'POST', body: JSON.stringify({ plan }) }); }
export type ProfessionalMetrics = {
  completedServices: number;
  averageRating?: number;
  ratingsCount: number;
  completionRate?: number;
  cancellationRate?: number;
  averageResponseMinutes?: number;
  responseSampleCount?: number;
  memberSince: string;
};
export type PublicProfessionalProfile = User & { professionalMetrics?: ProfessionalMetrics };
export async function apiGetUserProfile(userId: string) { return request<PublicProfessionalProfile>(`/api/v1/users/${encodeURIComponent(userId)}`); }
export type PublicProvider = Pick<User, 'id' | 'name' | 'city' | 'serviceCategories' | 'bio' | 'verificationStatus' | 'professionalTitle' | 'businessName' | 'taxDocument' | 'taxDocumentType' | 'issuesInvoice'>;
export async function apiListPremiumProviders(query?: string) { return request<PublicProvider[]>(`/api/v1/providers${query?.trim() ? `?query=${encodeURIComponent(query.trim())}` : ''}`); }
export type PremiumProviderSearchItem = { id: string; name: string; avatarUri?: string; city?: string; providerType: ProviderType; professionalTitle?: string; serviceCategories: string[]; extraCategoriesCount: number; isAvailable: boolean; verificationStatus?: User['verificationStatus']; distanceKm?: number; metrics: ProfessionalMetrics };
export type PremiumProviderSearchResult = { items: PremiumProviderSearchItem[]; total: number; page: number; limit: number; nextPage?: number };
export async function apiSearchPremiumProviders(input: { query?: string; providerType?: ProviderType; page?: number; limit?: number; sort?: 'relevant' | 'distance' | 'rating' | 'completed' | 'available' } = {}) { const query = new URLSearchParams(); Object.entries(input).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); }); return request<PremiumProviderSearchResult>(`/api/v1/providers/search?${query.toString()}`); }
export type SupportTicket = { id: string; userId: string; userName: string; userRole: UserRole; subject: string; message: string; status: 'open' | 'in_progress' | 'resolved'; statusHistory: Array<{ status: 'open' | 'in_progress' | 'resolved'; at: string }>; createdAt: string; updatedAt: string };
export async function apiCreateSupportTicket(input: Pick<SupportTicket, 'subject' | 'message'>) { return request<SupportTicket>('/api/v1/support/tickets', { method: 'POST', body: JSON.stringify(input) }); }
export async function apiListSupportTickets() { return request<SupportTicket[]>('/api/v1/support/tickets'); }
export type RemoteDemandCategory = { id: string; type: DemandType; name: string; icon: string; active: boolean };
export async function apiListCategories() { return request<RemoteDemandCategory[]>('/api/v1/categories'); }
export async function apiCreateProviderCategory(input: { name: string; type: DemandType }) { return request<RemoteDemandCategory>('/api/v1/provider-categories', { method: 'POST', body: JSON.stringify(input) }); }
export async function apiListDemands() { return request<Demand[]>('/api/v1/demands'); }
export type ProviderOpportunities = { locationRequired: boolean; radiusKm: number; items: Array<Demand & { distanceKm: number }> };
export async function apiListProviderOpportunities() { return request<ProviderOpportunities>('/api/v1/providers/me/opportunities'); }
export async function apiCreateDemand(demand: Demand) { return request<Demand>('/api/v1/demands', { method: 'POST', body: JSON.stringify(demand) }); }
export async function apiListProposals(demandId?: string) { return request<Proposal[]>(`/api/v1/proposals${demandId ? `?demandId=${encodeURIComponent(demandId)}` : ''}`); }
export async function apiListRatings() { return request<Rating[]>('/api/v1/ratings'); }
export async function apiCreateRating(input: { demandId: string; stars: Rating['stars']; comment?: string }) { return request<Rating>('/api/v1/ratings', { method: 'POST', body: JSON.stringify(input) }); }
export async function apiCreateProposal(input: { demandId: string; amount: number; message?: string }) { return request<Proposal>('/api/v1/proposals', { method: 'POST', body: JSON.stringify(input) }); }
export async function apiAcceptDemandBudget(demandId: string) { return request<{ proposal: Proposal; demand: Demand }>(`/api/v1/demands/${encodeURIComponent(demandId)}/accept-budget`, { method: 'POST' }); }
export async function apiAcceptProposal(id: string) { return request<{ proposal: Proposal; demand: Demand }>(`/api/v1/proposals/${encodeURIComponent(id)}/accept`, { method: 'POST' }); }
export async function apiConfirmProposal(id: string) { return request<{ proposal: Proposal; demand: Demand }>(`/api/v1/proposals/${encodeURIComponent(id)}/confirm`, { method: 'POST' }); }
export async function apiCounterProposal(id: string, input: { amount: number; message?: string }) { return request<{ proposal: Proposal; supersededProposal: Proposal; demand: Demand }>(`/api/v1/proposals/${encodeURIComponent(id)}/counter`, { method: 'POST', body: JSON.stringify(input) }); }
export async function apiServiceAction(id: string, input: { action: 'en_route' | 'arrived' | 'start' | 'request_completion' | 'confirm_completion' }) { return request<Demand>(`/api/v1/demands/${encodeURIComponent(id)}/service-actions`, { method: 'POST', body: JSON.stringify(input) }); }
export async function apiCancelDemand(id: string) { return request<Demand>(`/api/v1/demands/${encodeURIComponent(id)}/cancel`, { method: 'POST' }); }
export async function apiListCancellationRequests(demandId: string) { return request<CancellationRequest[]>(`/api/v1/demands/${encodeURIComponent(demandId)}/cancellation-requests`); }
export async function apiCreateCancellationRequest(demandId: string, input: { reason: CancellationReason; description?: string }) { return request<CancellationRequest>(`/api/v1/demands/${encodeURIComponent(demandId)}/cancellation-requests`, { method: 'POST', body: JSON.stringify(input) }); }
export async function apiRespondCancellationRequest(demandId: string, requestId: string, input: { action: 'accept' | 'refuse'; note?: string }) { return request<CancellationRequest>(`/api/v1/demands/${encodeURIComponent(demandId)}/cancellation-requests/${encodeURIComponent(requestId)}/respond`, { method: 'POST', body: JSON.stringify(input) }); }
export async function apiListDisputes(demandId: string) { return request<Dispute[]>(`/api/v1/demands/${encodeURIComponent(demandId)}/disputes`); }
export async function apiCreateDispute(demandId: string, input: { reason: string; description: string; cancellationRequestId?: string }) { return request<Dispute>(`/api/v1/demands/${encodeURIComponent(demandId)}/disputes`, { method: 'POST', body: JSON.stringify(input) }); }
export type ServiceSchedule = Pick<Demand, 'scheduledAt' | 'scheduleStatus' | 'scheduleProposedBy' | 'scheduleCustomerConfirmedAt' | 'scheduleProviderConfirmedAt'> & { demandId: string; history: ScheduleChange[] };
export async function apiGetSchedule(demandId: string) { return request<ServiceSchedule>(`/api/v1/demands/${encodeURIComponent(demandId)}/schedule`); }
export async function apiProposeSchedule(demandId: string, scheduledAt: string) { return request<{ demand: Demand; change: ScheduleChange }>(`/api/v1/demands/${encodeURIComponent(demandId)}/schedule/propose`, { method: 'POST', body: JSON.stringify({ scheduledAt }) }); }
export async function apiRespondSchedule(demandId: string, input: { action: 'accept' | 'counter'; scheduledAt?: string }) { return request<{ demand: Demand; change: ScheduleChange }>(`/api/v1/demands/${encodeURIComponent(demandId)}/schedule/respond`, { method: 'POST', body: JSON.stringify(input) }); }
export async function apiCreateConversation(conversation: Partial<Conversation>) { return request<Conversation>('/api/v1/conversations', { method: 'POST', body: JSON.stringify(conversation) }); }
export async function apiListConversations(demandId?: string) { return request<Conversation[]>(`/api/v1/conversations${demandId ? `?demandId=${encodeURIComponent(demandId)}` : ''}`); }
export async function apiListMessages(conversationId: string) { return request<ChatMessage[]>(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`); }
export async function apiCreateMessage(message: Omit<Partial<ChatMessage> & Pick<ChatMessage, 'conversationId' | 'text'>, 'senderId'>) { return request<ChatMessage>('/api/v1/messages', { method: 'POST', body: JSON.stringify(message) }); }
export async function apiRegisterPushToken(input: { token: string }) { return request<void>('/api/v1/notifications/register-token', { method: 'POST', body: JSON.stringify(input) }); }
export async function apiRemovePushToken(input: { token: string }) { return request<void>('/api/v1/notifications/remove-token', { method: 'POST', body: JSON.stringify(input) }); }
