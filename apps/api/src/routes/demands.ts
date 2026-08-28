import type { FastifyInstance } from 'fastify';
import type { Demand, DemandType } from '@rubli/shared';
import { DEMAND_CATEGORIES } from '@rubli/shared';
import { memoryStore } from '../store/memoryStore.js';

const demandTypes: DemandType[] = ['service', 'purchase', 'delivery', 'freight'];

export async function registerDemandRoutes(app: FastifyInstance) {
  app.get('/api/v1/demands', async () => memoryStore.demands);

  app.post<{ Body: Partial<Demand> }>('/api/v1/demands', async (request, reply) => {
    const body = request.body ?? {};
    if (!body.requesterId || !body.type || !demandTypes.includes(body.type) || !body.title || !body.description || !body.category || !body.locationLabel) {
      return reply.code(400).send({ error: 'INVALID_DEMAND', message: 'Dados obrigatórios da demanda não foram preenchidos.' });
    }

    const allowedCategories = DEMAND_CATEGORIES[body.type as DemandType] as readonly string[];
    if (!allowedCategories.includes(body.category)) {
      return reply.code(400).send({ error: 'INVALID_CATEGORY', message: 'Categoria incompatível com o tipo da demanda.' });
    }

    const now = new Date().toISOString();
    const demand: Demand = {
      id: `dem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      requesterId: body.requesterId,
      type: body.type,
      title: body.title.trim(),
      description: body.description.trim(),
      category: body.category,
      budgetType: body.budget ? 'fixed' : 'open',
      budget: typeof body.budget === 'number' ? body.budget : undefined,
      locationLabel: body.locationLabel.trim(),
      latitude: body.latitude,
      longitude: body.longitude,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };

    memoryStore.demands.unshift(demand);
    return reply.code(201).send(demand);
  });
}
