import type { Demand, Proposal } from '@rubli/shared';

const API_PORT = 3000;
const LAN_API_URL = 'http://192.168.100.85:3000';

function resolveApiUrl() {
  const configured = process.env.EXPO_PUBLIC_RUBLI_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `http://${window.location.hostname}:${API_PORT}`;
  }

  // Desenvolvimento na rede local: o celular usa o IP do PC.
  // Para produção, defina EXPO_PUBLIC_RUBLI_API_URL com a URL do Render.
  return LAN_API_URL;
}

export const API_URL = resolveApiUrl();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) throw new Error('API URL não configurada. Defina EXPO_PUBLIC_RUBLI_API_URL.');
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(body || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function apiHealth() {
  return request<{ ok: boolean; persistence: string }>('/health');
}

export async function apiListDemands() {
  return request<Demand[]>('/api/v1/demands');
}

export async function apiCreateDemand(demand: Demand) {
  return request<Demand>('/api/v1/demands', {
    method: 'POST',
    body: JSON.stringify(demand),
  });
}

export async function apiListProposals(demandId?: string) {
  return request<Proposal[]>(`/api/v1/proposals${demandId ? `?demandId=${encodeURIComponent(demandId)}` : ''}`);
}

export async function apiSyncProposals(proposals: Proposal[]) {
  return request<{ ok: boolean; count: number }>('/api/v1/proposals/sync', {
    method: 'POST',
    body: JSON.stringify({ proposals }),
  });
}
