import type { FastifyInstance } from 'fastify';
import type { DemandType } from '@rubli/shared';
import { createProviderCategory } from '../store/categories.js';
import { broadcastRealtime } from '../realtime.js';
import { requireRole } from './auth.js';

const demandTypes: DemandType[] = ['service', 'purchase', 'delivery', 'freight'];

/** Permite que uma área real de atuação entre no catálogo público com revisão
 * posterior pelo admin, sem confiar em tipo ou identidade enviados pelo app. */
export async function registerProviderCategoryRoutes(app: FastifyInstance) {
  app.post<{ Body: { name?: string; type?: DemandType } }>('/api/v1/provider-categories', { preHandler: requireRole('provider') }, async (request, reply) => {
    const { name, type } = request.body ?? {};
    if (!name?.trim() || !type || !demandTypes.includes(type)) {
      return reply.code(400).send({ error: 'INVALID_CATEGORY', message: 'Informe uma área de atuação e o tipo de demanda.' });
    }
    try {
      const category = await createProviderCategory(type, name);
      void broadcastRealtime({ type: 'category.updated', actorUserId: request.authUser!.id, at: new Date().toISOString() });
      return reply.code(201).send(category);
    } catch {
      return reply.code(400).send({ error: 'INVALID_CATEGORY', message: 'Use uma área de atuação com pelo menos 3 caracteres.' });
    }
  });
}
