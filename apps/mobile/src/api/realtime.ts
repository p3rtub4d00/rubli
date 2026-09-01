import type { UserRole } from '@rubli/shared';
import { registerForPushNotifications } from '../notifications/push';

export type RealtimeEvent = {
  type: 'demand.created' | 'demand.updated' | 'proposal.created' | 'proposal.updated' | 'message.created';
  demandId?: string;
  proposalId?: string;
  conversationId?: string;
  actorUserId?: string;
  at: string;
};

type Listener = (event: RealtimeEvent) => void;

const API_HTTP = process.env.EXPO_PUBLIC_RUBLI_API_URL?.trim().replace(/\/$/, '') || 'http://192.168.100.85:3000';
const API_WS = API_HTTP.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
const URL = `${API_WS}/api/v1/realtime`;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connectUserId: string | null = null;
const listeners = new Set<Listener>();

function scheduleReconnect() {
  if (!connectUserId || reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connectRealtime(connectUserId!); }, 1500);
}

export function connectRealtime(userId: string, role?: UserRole) {
  connectUserId = userId;
  if (role) registerForPushNotifications({ id: userId, role, name: '', createdAt: new Date().toISOString() }).catch(() => undefined);
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  try {
    const ws = new WebSocket(`${URL}?userId=${encodeURIComponent(userId)}`);
    socket = ws;
    ws.onopen = () => { ws.send(JSON.stringify({ type: 'identify', userId })); };
    ws.onmessage = (message) => {
      try {
        const event = JSON.parse(String(message.data)) as RealtimeEvent;
        listeners.forEach((listener) => listener(event));
      } catch { /* ignore malformed realtime events */ }
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
    ws.onclose = () => { if (socket === ws) socket = null; scheduleReconnect(); };
  } catch {
    scheduleReconnect();
  }
}

export function disconnectRealtime() {
  connectUserId = null;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (socket) { try { socket.close(); } catch {} }
  socket = null;
}

export function subscribeRealtime(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
