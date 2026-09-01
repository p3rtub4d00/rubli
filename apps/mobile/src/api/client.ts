import type { Conversation, Demand, Proposal, ChatMessage } from '@rubli/shared';

const API_PORT = 3000;
const LAN_API_URL = 'http://192.168.100.85:3000';

function resolveApiUrl() {
  const configured = process.env.EXPO_PUBLIC_RUBLI_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.hostname) return `http://${window.location.hostname}:${API_PORT}`;
  return LAN_API_URL;
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
export async function apiListDemands() { return request<Demand[]>('/api/v1/demands'); }
export async function apiCreateDemand(demand: Demand) { return request<Demand>('/api/v1/demands', { method: 'POST', body: JSON.stringify(demand) }); }
export async function apiListProposals(demandId?: string) { return request<Proposal[]>(`/api/v1/proposals${demandId ? `?demandId=${encodeURIComponent(demandId)}` : ''}`); }
export async function apiSyncProposals(proposals: Proposal[]) { return request<{ ok: boolean; count: number }>('/api/v1/proposals/sync', { method: 'POST', body: JSON.stringify({ proposals }) }); }
export async function apiCreateConversation(conversation: Partial<Conversation>) { return request<Conversation>('/api/v1/conversations', { method: 'POST', body: JSON.stringify(conversation) }); }
export async function apiListConversations(demandId?: string) { return request<Conversation[]>(`/api/v1/conversations${demandId ? `?demandId=${encodeURIComponent(demandId)}` : ''}`); }
export async function apiListMessages(conversationId: string) { return request<ChatMessage[]>(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`); }
export async function apiCreateMessage(message: Partial<ChatMessage> & Pick<ChatMessage, 'conversationId' | 'senderId' | 'text'>) { return request<ChatMessage>('/api/v1/messages', { method: 'POST', body: JSON.stringify(message) }); }
export async function apiRegisterPushToken(input: { userId: string; role?: string; token: string }) { return request<void>('/api/v1/notifications/register-token', { method: 'POST', body: JSON.stringify(input) }); }
export async function apiRemovePushToken(input: { userId: string; token: string }) { return request<void>('/api/v1/notifications/remove-token', { method: 'POST', body: JSON.stringify(input) }); }
