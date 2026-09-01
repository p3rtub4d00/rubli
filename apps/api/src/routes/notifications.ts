import type { FastifyInstance } from 'fastify';
import { registerPushToken, removePushToken } from '../push.js';

export async function registerNotificationRoutes(app: FastifyInstance) {
  app.post<{ Body: { userId?: string; token?: string; role?: string } }>('/api/v1/notifications/register-token', async (request, reply) => {
    const { userId, token, role } = request.body ?? {};
    if (!userId || !token) return reply.code(400).send({ error: 'INVALID_PUSH_TOKEN', message: 'Usuário e token são obrigatórios.' });
    await registerPushToken(userId, token, role);
    return reply.code(204).send();
  });

  app.post<{ Body: { userId?: string; token?: string } }>('/api/v1/notifications/remove-token', async (request, reply) => {
    const { userId, token } = request.body ?? {};
    if (!userId || !token) return reply.code(400).send({ error: 'INVALID_PUSH_TOKEN', message: 'Usuário e token são obrigatórios.' });
    await removePushToken(userId, token);
    return reply.code(204).send();
  });
}
