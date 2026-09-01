import type { FastifyInstance } from 'fastify';
import type { Demand, DemandType } from '@rubli/shared';
import { DEMAND_CATEGORIES } from '@rubli/shared';
import { memoryStore } from '../store/memoryStore.js';
import { getDatabase } from '../store/database.js';

const demandTypes: DemandType[] = ['service', 'purchase', 'delivery', 'freight'];
const collectionName = 'demands';
const statusRank: Record<Demand['status'], number> = {
  draft: 0,
  open: 1,
  negotiating: 2,
  accepted: 3,
  provider_en_route: 4,
  provider_arrived: 5,
  in_progress: 6,
  awaiting_customer_confirmation: 7,
  completed: 8,
  cancelled: -1,
};

async function listDemands() {
  const db = await getDatabase();
  if (!db) return [...memoryStore.demands];
  return db.collection<Demand>(collectionName).find({}).sort({ createdAt: -1 }).toArray();
}

function mergeDemandStatus(existing: Demand['status'] | undefined, incoming: Demand['status']) {
  if (!existing || existing === 'cancelled' || incoming === 'cancelled') return incoming;
  return statusRank[incoming] >= statusRank[existing] ? incoming : existing;
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
      ...(body.enRouteAt ? { enRouteAt: body.enRouteAt } : {}),
      ...(body.arrivedAt ? { arrivedAt: body.arrivedAt } : {}),
      ...(body.startedAt ? { startedAt: body.startedAt } : {}),
      ...(body.completionRequestedAt ? { completionRequestedAt: body.completionRequestedAt } : {}),
      ...(body.customerConfirmedCompletionAt ? { customerConfirmedCompletionAt: body.customerConfirmedCompletionAt } : {}),
      ...(body.completedAt ? { completedAt: body.completedAt } : {}),
    };

    const db = await getDatabase();
    if (!db) {
      const existingIndex = memoryStore.demands.findIndex((item) => item.id === demand.id);
      const existing = existingIndex >= 0 ? memoryStore.demands[existingIndex] : undefined;
      const merged = existing ? { ...existing, ...demand, status: mergeDemandStatus(existing.status, demand.status) } : demand;
      if (existingIndex >= 0) memoryStore.demands[existingIndex] = merged;
      else memoryStore.demands.unshift(merged);
      return reply.code(existingIndex >= 0 ? 200 : 201).send(merged);
    }

    const existing = await db.collection<Demand>(collectionName).findOne({ id: demand.id });
    const merged = existing ? { ...existing, ...demand, status: mergeDemandStatus(existing.status, demand.status) } : demand;
    await db.collection<Demand>(collectionName).replaceOne({ id: demand.id }, merged, { upsert: true });
    return reply.code(existing ? 200 : 201).send(merged);
  });
}
