import type { SocketStream } from '@fastify/websocket';

export type RealtimeEvent = {
  type: 'demand.created' | 'demand.updated' | 'proposal.created' | 'proposal.updated' | 'message.created';
  demandId?: string;
  proposalId?: string;
  conversationId?: string;
  actorUserId?: string;
  at: string;
};

const clients = new Set<SocketStream['socket']>();

export function attachRealtimeClient(socket: SocketStream['socket']) {
  clients.add(socket);
  socket.on('close', () => clients.delete(socket));
  socket.on('error', () => clients.delete(socket));
}

export function broadcastRealtime(event: RealtimeEvent) {
  const payload = JSON.stringify(event);
  for (const socket of clients) {
    if (socket.readyState === 1) {
      try { socket.send(payload); } catch { clients.delete(socket); }
    }
  }
}
