import type { FastifyInstance } from 'fastify';
import type { UserRole } from '@rubli/shared';
import { getDatabase } from '../store/database.js';
import { requireAuth } from './auth.js';

export type SupportTicket = {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved';
  statusHistory: Array<{ status: 'open' | 'in_progress' | 'resolved'; at: string }>;
  createdAt: string;
  updatedAt: string;
};

const memoryTickets: SupportTicket[] = [];

export async function registerSupportRoutes(app: FastifyInstance) {
  app.post<{ Body: Pick<SupportTicket, 'subject' | 'message'> }>('/api/v1/support/tickets', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body ?? {};
    if (!body.subject?.trim() || !body.message?.trim()) {
      return reply.code(400).send({ error: 'INVALID_TICKET', message: 'Informe assunto e descrição do problema.' });
    }
    const now = new Date().toISOString();
    const ticket: SupportTicket = { id: `sup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, userId: request.authUser!.id, userName: request.authUser!.name, userRole: request.authUser!.role, subject: body.subject.trim().slice(0, 120), message: body.message.trim().slice(0, 4000), status: 'open', statusHistory: [{ status: 'open', at: now }], createdAt: now, updatedAt: now };
    const db = await getDatabase();
    if (db) await db.collection<SupportTicket>('support_tickets').insertOne(ticket); else memoryTickets.unshift(ticket);
    return reply.code(201).send(ticket);
  });

  app.get('/api/v1/support/tickets', { preHandler: requireAuth }, async (request) => {
    const db = await getDatabase();
    if (db) return db.collection<SupportTicket>('support_tickets').find({ userId: request.authUser!.id }).sort({ createdAt: -1 }).toArray();
    return memoryTickets.filter((ticket) => ticket.userId === request.authUser!.id);
  });
}
