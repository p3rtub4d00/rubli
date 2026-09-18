import type { WebSocket } from 'ws';
import { getDatabase } from './store/database.js';
import { memoryStore } from './store/memoryStore.js';

export type RealtimeEvent = {
  type: 'demand.created' | 'demand.updated' | 'proposal.created' | 'proposal.updated' | 'message.created' | 'rating.created' | 'rating.requested' | 'cancellation.updated' | 'dispute.updated' | 'category.updated' | 'admin.data_purged';
  demandId?: string;
  proposalId?: string;
  conversationId?: string;
  actorUserId?: string;
  scope?: 'demands' | 'users';
  at: string;
};

const clients = new Map<WebSocket, { userId?: string }>();

export function attachRealtimeClient(socket: WebSocket, userId?: string) {
  clients.set(socket, { userId });
  socket.on('message', (raw) => {
    try {
      const message = JSON.parse(String(raw)) as { type?: string; userId?: string };
      if (message.type === 'identify' && message.userId) clients.set(socket, { userId: message.userId });
    } catch { /* Ignora mensagens de identificação inválidas. */ }
  });
  socket.on('close', () => clients.delete(socket));
  socket.on('error', () => clients.delete(socket));
}

export async function broadcastRealtime(event: RealtimeEvent, recipientUserIds?: readonly string[]) {
  const recipients = recipientUserIds ? new Set(recipientUserIds) : undefined;
  let unavailableProviderIds = new Set<string>();
  if (event.type === 'demand.created') {
    const connectedUserIds = [...new Set([...clients.values()].map((client) => client.userId).filter((id): id is string => Boolean(id)))];
    if (connectedUserIds.length) {
      try {
        const db = await getDatabase();
        const unavailable = db
          ? await db.collection<{ id: string }>('users').find({ id: { $in: connectedUserIds }, role: 'provider', isAvailable: false }).toArray()
          : memoryStore.users.filter((user) => connectedUserIds.includes(user.id) && user.role === 'provider' && user.isAvailable === false);
        unavailableProviderIds = new Set(unavailable.map((user) => user.id));
      } catch { /* Realtime não pode impedir a criação de uma demanda. */ }
    }
  }
  const payload = JSON.stringify(event);
  for (const [socket, client] of clients) {
    if (recipients && (!client.userId || !recipients.has(client.userId))) continue;
    if (event.type === 'demand.created' && client.userId && unavailableProviderIds.has(client.userId)) continue;
    if (socket.readyState === 1) {
      try { socket.send(payload); } catch { clients.delete(socket); }
    }
  }
}
