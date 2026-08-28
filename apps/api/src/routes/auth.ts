import type { FastifyInstance } from 'fastify';
import type { User, UserRole } from '@rubli/shared';
import { memoryStore } from '../store/memoryStore.js';

function id() {
  return `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post<{ Body: { name?: string; phone?: string; email?: string; role?: UserRole } }>('/api/v1/auth/register', async (request, reply) => {
    const body = request.body ?? {};
    if (!body.name?.trim() || !body.role || !['customer', 'provider', 'courier'].includes(body.role)) {
      return reply.code(400).send({ error: 'INVALID_USER', message: 'Nome e tipo de conta são obrigatórios.' });
    }

    const user: User = {
      id: id(),
      name: body.name.trim(),
      phone: body.phone?.trim(),
      email: body.email?.trim().toLowerCase(),
      role: body.role,
      createdAt: new Date().toISOString(),
    };
    memoryStore.users.push(user);
    return reply.code(201).send({ user });
  });

  app.get<{ Params: { id: string } }>('/api/v1/users/:id', async (request, reply) => {
    const user = memoryStore.users.find((item) => item.id === request.params.id);
    if (!user) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    return user;
  });
}
