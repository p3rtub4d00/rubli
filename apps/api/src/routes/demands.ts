import type { FastifyInstance } from 'fastify';
import type { Demand, DemandType } from '@rubli/shared';
import { DEMAND_CATEGORIES } from '@rubli/shared';
import { memoryStore } from '../store/memoryStore.js';
import { getDatabase } from '../store/database.js';
import { broadcastRealtime } from '../realtime.js';
import { sendPushToRoles, sendPushToUsers } from '../push.js';

const demandTypes: DemandType[] = ['service', 'purchase', 'delivery', 'freight'];
const collectionName = 'demands';
const statusRank: Record<Demand['status'], number> = { draft: 0, open: 1, negotiating: 2, accepted: 3, provider_en_route: 4, provider_arrived: 5, in_progress: 6, awaiting_customer_confirmation: 7, completed: 8, cancelled: -1 };

async function listDemands() {
  const db = await getDatabase();
  if (!db) return [...memoryStore.demands];
  return db.collection<Demand>(collectionName).find({}).sort({ createdAt: -1 }).toArray();
}
function mergeDemandStatus(existing: Demand['status'] | undefined, incoming: Demand['status']) { if (!existing || existing === 'cancelled' || incoming === 'cancelled') return incoming; return statusRank[incoming] >= statusRank[existing] ? incoming : existing; }
function mergeDemand(existing: Demand | undefined, incoming: Demand): Demand {
  if (!existing) return incoming;
  return {
    ...existing,
    ...incoming,
    status: mergeDemandStatus(existing.status, incoming.status),
    ...(incoming.budget === undefined ? { budget: existing.budget, budgetType: existing.budgetType } : {}),
    ...(incoming.latitude === undefined ? { latitude: existing.latitude } : {}),
    ...(incoming.longitude === undefined ? { longitude: existing.longitude } : {}),
    ...(incoming.photoUris === undefined ? { photoUris: existing.photoUris } : {}),
    ...(incoming.acceptedProviderId === undefined ? { acceptedProviderId: existing.acceptedProviderId } : {}),
    ...(incoming.enRouteAt === undefined ? { enRouteAt: existing.enRouteAt } : {}),
    ...(incoming.arrivedAt === undefined ? { arrivedAt: existing.arrivedAt } : {}),
    ...(incoming.startedAt === undefined ? { startedAt: existing.startedAt } : {}),
    ...(incoming.completionRequestedAt === undefined ? { completionRequestedAt: existing.completionRequestedAt } : {}),
    ...(incoming.customerConfirmedCompletionAt === undefined ? { customerConfirmedCompletionAt: existing.customerConfirmedCompletionAt } : {}),
    ...(incoming.completedAt === undefined ? { completedAt: existing.completedAt } : {}),
  };
}

function stageText(status: Demand['status']) {
  switch (status) {
    case 'provider_en_route': return { title: '🚗 Prestador a caminho', body: 'O prestador informou que está a caminho.' };
    case 'provider_arrived': return { title: '📍 Prestador chegou', body: 'O prestador informou que chegou ao local.' };
    case 'in_progress': return { title: '🛠 Serviço iniciado', body: 'O prestador iniciou o serviço.' };
    case 'awaiting_customer_confirmation': return { title: '✅ Serviço aguardando sua confirmação', body: 'O prestador informou que concluiu o serviço. Abra o Rubli para conferir e confirmar.' };
    case 'completed': return { title: '✅ Serviço concluído', body: 'O cliente confirmou a conclusão do serviço.' };
    default: return null;
  }
}

export async function registerDemandRoutes(app: FastifyInstance) {
  app.get('/api/v1/demands', async () => listDemands());

  app.post<{ Body: Partial<Demand> }>('/api/v1/demands', async (request, reply) => {
    const body = request.body ?? {};
    if (!body.id || !body.requesterId || !body.type || !demandTypes.includes(body.type) || !body.title || !body.description || !body.category || !body.locationLabel) return reply.code(400).send({ error: 'INVALID_DEMAND', message: 'Dados obrigatórios da demanda não foram preenchidos.' });
    const allowedCategories = DEMAND_CATEGORIES[body.type as DemandType] as readonly string[];
    if (!allowedCategories.includes(body.category)) return reply.code(400).send({ error: 'INVALID_CATEGORY', message: 'Categoria incompatível com o tipo da demanda.' });

    const now = new Date().toISOString();
    const incoming: Demand = { id: body.id, requesterId: body.requesterId, type: body.type, title: body.title.trim(), description: body.description.trim(), category: body.category, budgetType: body.budget ? 'fixed' : 'open', budget: typeof body.budget === 'number' ? body.budget : undefined, locationLabel: body.locationLabel.trim(), latitude: body.latitude, longitude: body.longitude, isUrgent: body.isUrgent === true, photoUris: body.photoUris, status: body.status ?? 'open', createdAt: body.createdAt ?? now, updatedAt: body.updatedAt ?? now, ...(body.acceptedProviderId ? { acceptedProviderId: body.acceptedProviderId } : {}), ...(body.enRouteAt ? { enRouteAt: body.enRouteAt } : {}), ...(body.arrivedAt ? { arrivedAt: body.arrivedAt } : {}), ...(body.startedAt ? { startedAt: body.startedAt } : {}), ...(body.completionRequestedAt ? { completionRequestedAt: body.completionRequestedAt } : {}), ...(body.customerConfirmedCompletionAt ? { customerConfirmedCompletionAt: body.customerConfirmedCompletionAt } : {}), ...(body.completedAt ? { completedAt: body.completedAt } : {}) };

    const db = await getDatabase();
    let merged: Demand;
    let existing: Demand | undefined;
    let created = false;
    if (!db) {
      const existingIndex = memoryStore.demands.findIndex((item) => item.id === incoming.id);
      existing = existingIndex >= 0 ? memoryStore.demands[existingIndex] : undefined;
      merged = mergeDemand(existing, incoming);
      if (existingIndex >= 0) memoryStore.demands[existingIndex] = merged; else { memoryStore.demands.unshift(merged); created = true; }
    } else {
      existing = await db.collection<Demand>(collectionName).findOne({ id: incoming.id }) ?? undefined;
      merged = mergeDemand(existing, incoming);
      created = !existing;
      await db.collection<Demand>(collectionName).replaceOne({ id: incoming.id }, merged, { upsert: true });
    }

    const eventAt = new Date().toISOString();
    broadcastRealtime({ type: created ? 'demand.created' : 'demand.updated', demandId: merged.id, actorUserId: merged.requesterId, at: eventAt });

    if (created) {
      const title = merged.isUrgent ? '⚡ Novo chamado urgente' : '🔔 Novo chamado disponível';
      const bodyText = merged.isUrgent ? `${merged.title} • atendimento imediato` : `${merged.title} • nova oportunidade na sua região`;
      await sendPushToRoles(['provider'], { title, body: bodyText, data: { type: 'demand.created', demandId: merged.id } });
    } else if (existing && existing.status !== merged.status) {
      const stage = stageText(merged.status);
      if (stage) {
        const recipientId = merged.status === 'completed' ? merged.acceptedProviderId : merged.requesterId;
        if (recipientId) await sendPushToUsers([recipientId], { ...stage, data: { type: 'demand.updated', demandId: merged.id, status: merged.status } });
      }
    }

    return reply.code(created ? 201 : 200).send(merged);
  });
}
