import type { FastifyInstance } from 'fastify';
import type { Demand, DemandType } from '@rubli/shared';
import { DEMAND_CATEGORIES } from '@rubli/shared';
import { memoryStore } from '../store/memoryStore.js';
import { getDatabase } from '../store/database.js';

const demandTypes: DemandType[] = ['service', 'purchase', 'delivery', 'freight'];
const collectionName = 'demands';

async function listDemands() {
  const db = await getDatabase();
  if (!db) return [...memoryStore.demands];
  const docs = await db.collection<Demand>(collectionName).find({}).sort({ createdAt: -1 }).toArray();
  return docs;
}

export async function registerDemandRoutes(app: FastifyInstance) {
  app.get('/api/v1/demands', async () => listDemands());

  app.post<{ Body: Partial<Demand> }>('/api/v1/demands', async (request, reply) => {
    const body = request.body ?? {};
    if (!body.id || !body.requesterId || !body.type || !demandTypes.includes(body.type) || !body.title || !body.description || !body.category || !body.locationLabel) {
      return reply.code(400).send({ error: 'INVALID_DEMAND', message: 'Dados obrigatórios da demanda não foram preenchidos.' });
    }

    const allowedCategories = DEMAND_CATEGORIES[body.type as DemandType] as readonly string[];
    if (!allowedCategories.includes(body.category)) {
      return reply.code(400).send({ error: 'INVALID_CATEGORY', message: 'Categoria incompatível com o tipo da demanda.' });
    }

    const now = new Date().toISOString();
    const demand: Demand = {
      id: body.id,
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
      isUrgent: body.isUrgent === true,
      photoUris: body.photoUris,
      status: body.status ?? 'open',
      createdAt: body.createdAt ?? now,
      updatedAt: body.updatedAt ?? now,
      ...(body.acceptedProviderId ? { acceptedProviderId: body.acceptedProviderId } : {}),
    };

    const db = await getDatabase();
    if (!db) {
      const existingIndex = memoryStore.demands.findIndex((item) => item.id === demand.id);
      if (existingIndex >= 0) memoryStore.demands[existingIndex] = demand;
      else memoryStore.demands.unshift(demand);
      return reply.code(existingIndex >= 0 ? 200 : 201).send(demand);
    }

    await db.collection<Demand>(collectionName).replaceOne({ id: demand.id }, demand, { upsert: true });
    return reply.code(201).send(demand);
  });
}
