import type { Conversation, Demand, DemandType, Proposal, ChatMessage, Rating, ProviderPlan, User, UserRole } from '@rubli/shared';
import Constants from 'expo-constants';

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) throw new Error('API URL não configurada. Defina EXPO_PUBLIC_RUBLI_API_URL.');
  const response = await fetch(`${API_URL}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(body || `HTTP ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function apiHealth() { return request<{ ok: boolean; persistence: string; realtime?: boolean; push?: boolean }>('/health'); }
export async function apiRegister(input: { name: string; email: string; phone: string; password: string; role: Extract<UserRole, 'customer' | 'provider' | 'courier'>; providerPlan?: ProviderPlan; taxDocument: string; taxDocumentType?: 'cpf' | 'cnpj'; businessName?: string; issuesInvoice?: boolean; professionalTitle?: string }) { return request<{ user: User; trial?: { days: 7; endsAt: string } }>('/api/v1/auth/register', { method: 'POST', body: JSON.stringify(input) }); }
export async function apiLogin(input: { email: string; password: string }) { return request<{ user: User }>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(input) }); }
export async function apiSessionActive(userId: string) { return request<{ active: boolean }>(`/api/v1/auth/session/${encodeURIComponent(userId)}`); }
export async function apiUpdateUserProfile(userId: string, input: Partial<Pick<User, 'name' | 'bio' | 'city' | 'serviceRadiusKm' | 'serviceCategories' | 'avatarUri' | 'profilePhotos' | 'professionalTitle' | 'businessAddress'>>) { return request<User>(`/api/v1/users/${encodeURIComponent(userId)}/profile`, { method: 'PATCH', body: JSON.stringify(input) }); }
export async function apiSimulateProviderSubscription(userId: string, plan: ProviderPlan) { return request<{ user: User; simulated: true; amount: number }>(`/api/v1/providers/${encodeURIComponent(userId)}/subscription/simulate`, { method: 'POST', body: JSON.stringify({ plan }) }); }
export type PublicProfessionalProfile = User & { completedServices?: number };
export async function apiGetUserProfile(userId: string) { return request<PublicProfessionalProfile>(`/api/v1/users/${encodeURIComponent(userId)}`); }
export type PublicProvider = Pick<User, 'id' | 'name' | 'city' | 'serviceCategories' | 'bio' | 'verificationStatus' | 'professionalTitle' | 'businessName' | 'taxDocument' | 'taxDocumentType' | 'issuesInvoice'>;
export async function apiListPremiumProviders(query?: string) { return request<PublicProvider[]>(`/api/v1/providers${query?.trim() ? `?query=${encodeURIComponent(query.trim())}` : ''}`); }
export type SupportTicket = { id: string; userId: string; userName: string; userRole: UserRole; subject: string; message: string; status: 'open' | 'in_progress' | 'resolved'; statusHistory: Array<{ status: 'open' | 'in_progress' | 'resolved'; at: string }>; createdAt: string; updatedAt: string };
export async function apiCreateSupportTicket(input: Pick<SupportTicket, 'userId' | 'userName' | 'userRole' | 'subject' | 'message'>) { return request<SupportTicket>('/api/v1/support/tickets', { method: 'POST', body: JSON.stringify(input) }); }
export async function apiListSupportTickets(userId: string) { return request<SupportTicket[]>(`/api/v1/support/tickets?userId=${encodeURIComponent(userId)}`); }
export type RemoteDemandCategory = { id: string; type: DemandType; name: string; icon: string; active: boolean };
export async function apiListCategories() { return request<RemoteDemandCategory[]>('/api/v1/categories'); }
export async function apiListDemands() { return request<Demand[]>('/api/v1/demands'); }
export async function apiCreateDemand(demand: Demand) { return request<Demand>('/api/v1/demands', { method: 'POST', body: JSON.stringify(demand) }); }
export async function apiListProposals(demandId?: string) { return request<Proposal[]>(`/api/v1/proposals${demandId ? `?demandId=${encodeURIComponent(demandId)}` : ''}`); }
export async function apiListRatings() { return request<Rating[]>('/api/v1/ratings'); }
export async function apiCreateRating(input: { demandId: string; fromUserId: string; stars: Rating['stars']; comment?: string }) { return request<Rating>('/api/v1/ratings', { method: 'POST', body: JSON.stringify(input) }); }
export async function apiCreateProposal(input: { demandId: string; providerId: string; amount: number; message?: string }) { return request<Proposal>('/api/v1/proposals', { method: 'POST', body: JSON.stringify(input) }); }
export async function apiAcceptDemandBudget(demandId: string, providerId: string) { return request<{ proposal: Proposal; demand: Demand }>(`/api/v1/demands/${encodeURIComponent(demandId)}/accept-budget`, { method: 'POST', body: JSON.stringify({ providerId }) }); }
export async function apiAcceptProposal(id: string, userId: string) { return request<{ proposal: Proposal; demand: Demand }>(`/api/v1/proposals/${encodeURIComponent(id)}/accept`, { method: 'POST', body: JSON.stringify({ userId }) }); }
export async function apiConfirmProposal(id: string, userId: string) { return request<{ proposal: Proposal; demand: Demand }>(`/api/v1/proposals/${encodeURIComponent(id)}/confirm`, { method: 'POST', body: JSON.stringify({ userId }) }); }
export async function apiCounterProposal(id: string, input: { userId: string; amount: number; message?: string }) { return request<{ proposal: Proposal; supersededProposal: Proposal; demand: Demand }>(`/api/v1/proposals/${encodeURIComponent(id)}/counter`, { method: 'POST', body: JSON.stringify(input) }); }
export async function apiServiceAction(id: string, input: { userId: string; action: 'en_route' | 'arrived' | 'start' | 'request_completion' | 'confirm_completion' }) { return request<Demand>(`/api/v1/demands/${encodeURIComponent(id)}/service-actions`, { method: 'POST', body: JSON.stringify(input) }); }
export async function apiCancelDemand(id: string, userId: string) { return request<Demand>(`/api/v1/demands/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: JSON.stringify({ userId }) }); }
export async function apiCreateConversation(conversation: Partial<Conversation>) { return request<Conversation>('/api/v1/conversations', { method: 'POST', body: JSON.stringify(conversation) }); }
export async function apiListConversations(demandId?: string) { return request<Conversation[]>(`/api/v1/conversations${demandId ? `?demandId=${encodeURIComponent(demandId)}` : ''}`); }
export async function apiListMessages(conversationId: string) { return request<ChatMessage[]>(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`); }
export async function apiCreateMessage(message: Partial<ChatMessage> & Pick<ChatMessage, 'conversationId' | 'senderId' | 'text'>) { return request<ChatMessage>('/api/v1/messages', { method: 'POST', body: JSON.stringify(message) }); }
export async function apiRegisterPushToken(input: { userId: string; role?: string; token: string }) { return request<void>('/api/v1/notifications/register-token', { method: 'POST', body: JSON.stringify(input) }); }
export async function apiRemovePushToken(input: { userId: string; token: string }) { return request<void>('/api/v1/notifications/remove-token', { method: 'POST', body: JSON.stringify(input) }); }
