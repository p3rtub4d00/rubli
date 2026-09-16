import type { FastifyInstance } from 'fastify';
import type { UserRole } from '@rubli/shared';
import { getDatabase } from '../store/database.js';

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
  app.post<{ Body: Partial<SupportTicket> }>('/api/v1/support/tickets', async (request, reply) => {
    const body = request.body ?? {};
    if (!body.userId || !body.userName?.trim() || !body.userRole || !body.subject?.trim() || !body.message?.trim()) {
      return reply.code(400).send({ error: 'INVALID_TICKET', message: 'Informe assunto e descrição do problema.' });
    }
    const now = new Date().toISOString();
    const ticket: SupportTicket = { id: `sup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, userId: body.userId, userName: body.userName.trim(), userRole: body.userRole, subject: body.subject.trim().slice(0, 120), message: body.message.trim().slice(0, 4000), status: 'open', statusHistory: [{ status: 'open', at: now }], createdAt: now, updatedAt: now };
    const db = await getDatabase();
    if (db) await db.collection<SupportTicket>('support_tickets').insertOne(ticket); else memoryTickets.unshift(ticket);
    return reply.code(201).send(ticket);
  });

  app.get<{ Querystring: { userId?: string } }>('/api/v1/support/tickets', async (request, reply) => {
    if (!request.query.userId) return reply.code(400).send({ error: 'USER_REQUIRED' });
    const db = await getDatabase();
    if (db) return db.collection<SupportTicket>('support_tickets').find({ userId: request.query.userId }).sort({ createdAt: -1 }).toArray();
    return memoryTickets.filter((ticket) => ticket.userId === request.query.userId);
  });
}
