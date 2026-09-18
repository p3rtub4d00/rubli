import type { FastifyInstance } from 'fastify';
import { registerPushToken, removePushToken } from '../push.js';
import { requireAuth } from './auth.js';

export async function registerNotificationRoutes(app: FastifyInstance) {
  app.post<{ Body: { token?: string } }>('/api/v1/notifications/register-token', { preHandler: requireAuth }, async (request, reply) => {
    const { token } = request.body ?? {};
    if (!token) return reply.code(400).send({ error: 'INVALID_PUSH_TOKEN', message: 'Token é obrigatório.' });
    await registerPushToken(request.authUser!.id, token, request.authUser!.role);
    return reply.code(204).send();
  });

  app.post<{ Body: { token?: string } }>('/api/v1/notifications/remove-token', { preHandler: requireAuth }, async (request, reply) => {
    const { token } = request.body ?? {};
    if (!token) return reply.code(400).send({ error: 'INVALID_PUSH_TOKEN', message: 'Token é obrigatório.' });
    await removePushToken(request.authUser!.id, token);
    return reply.code(204).send();
  });
}
