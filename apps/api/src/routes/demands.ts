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

    const db = await getDatabase();
    const existingForId = db ? await db.collection<Demand>(collectionName).findOne({ id: body.id }) : memoryStore.demands.find((item) => item.id === body.id);
    if (existingForId) return reply.code(409).send({ error: 'DEMAND_ALREADY_EXISTS', message: 'Demandas existentes devem ser alteradas pelos comandos de negociação ou serviço.' });

    const now = new Date().toISOString();
    // A criação nunca pode carregar estado contratado ou de execução vindo do aparelho.
    const demand: Demand = { id: body.id, requesterId: body.requesterId, type: body.type, title: body.title.trim(), description: body.description.trim(), category: body.category, budgetType: body.budget ? 'fixed' : 'open', budget: typeof body.budget === 'number' ? body.budget : undefined, locationLabel: body.locationLabel.trim(), latitude: body.latitude, longitude: body.longitude, isUrgent: body.isUrgent === true, photoUris: body.photoUris, status: 'open', createdAt: now, updatedAt: now };

    let merged: Demand;
    let existing: Demand | undefined;
    let created = false;
    if (!db) {
      const existingIndex = memoryStore.demands.findIndex((item) => item.id === demand.id);
      existing = existingIndex >= 0 ? memoryStore.demands[existingIndex] : undefined;
      merged = existing ? { ...existing, ...demand, status: mergeDemandStatus(existing.status, demand.status) } : demand;
      if (existingIndex >= 0) memoryStore.demands[existingIndex] = merged; else { memoryStore.demands.unshift(merged); created = true; }
    } else {
      existing = await db.collection<Demand>(collectionName).findOne({ id: demand.id }) ?? undefined;
      merged = existing ? { ...existing, ...demand, status: mergeDemandStatus(existing.status, demand.status) } : demand;
      created = !existing;
      await db.collection<Demand>(collectionName).replaceOne({ id: demand.id }, merged, { upsert: true });
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

  app.post<{ Params: { id: string }; Body: { userId?: string; action?: 'en_route' | 'arrived' | 'start' | 'request_completion' | 'confirm_completion' } }>('/api/v1/demands/:id/service-actions', async (request, reply) => {
    const { userId, action } = request.body ?? {};
    if (!userId || !action) return reply.code(400).send({ error: 'INVALID_SERVICE_ACTION', message: 'Informe participante e ação.' });
    const db = await getDatabase();
    const demand = db ? await db.collection<Demand>(collectionName).findOne({ id: request.params.id }) : memoryStore.demands.find((item) => item.id === request.params.id);
    if (!demand) return reply.code(404).send({ error: 'DEMAND_NOT_FOUND', message: 'Demanda não encontrada.' });
    const proposals = db ? await db.collection<{ demandId: string; providerId: string; status: string; customerConfirmedAt?: string; providerConfirmedAt?: string }>('proposals').find({ demandId: demand.id, providerId: demand.acceptedProviderId, status: 'accepted' }).toArray() : memoryStore.proposals.filter((item) => item.demandId === demand.id && item.providerId === demand.acceptedProviderId && item.status === 'accepted');
    const agreement = proposals.find((item) => item.customerConfirmedAt && item.providerConfirmedAt);
    if (!agreement || !demand.acceptedProviderId) return reply.code(409).send({ error: 'AGREEMENT_NOT_CONFIRMED', message: 'O acordo precisa ser confirmado pelos dois lados.' });
    const isProvider = userId === demand.acceptedProviderId;
    const isCustomer = userId === demand.requesterId;
    const transitions = {
      en_route: { from: 'accepted', to: 'provider_en_route', allowed: isProvider, field: 'enRouteAt' },
      arrived: { from: 'provider_en_route', to: 'provider_arrived', allowed: isProvider, field: 'arrivedAt' },
      start: { from: 'provider_arrived', to: 'in_progress', allowed: isProvider, field: 'startedAt' },
      request_completion: { from: 'in_progress', to: 'awaiting_customer_confirmation', allowed: isProvider, field: 'completionRequestedAt' },
      confirm_completion: { from: 'awaiting_customer_confirmation', to: 'completed', allowed: isCustomer, field: 'completedAt' },
    } as const;
    const transition = transitions[action];
    if (!transition.allowed) return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'Este participante não pode executar esta ação.' });
    if (demand.status !== transition.from) return reply.code(409).send({ error: 'INVALID_SERVICE_STATE', message: 'A ação não é válida para a etapa atual do serviço.' });
    const now = new Date().toISOString();
    const next: Demand = { ...demand, status: transition.to, updatedAt: now, [transition.field]: now, ...(action === 'confirm_completion' ? { customerConfirmedCompletionAt: now } : {}) };
    if (db) {
      const result = await db.collection<Demand>(collectionName).replaceOne({ id: demand.id, status: demand.status }, next);
      if (result.matchedCount !== 1) return reply.code(409).send({ error: 'SERVICE_STATE_CHANGED', message: 'A etapa foi alterada por outro dispositivo. Atualize a demanda e tente novamente.' });
    } else { const index = memoryStore.demands.findIndex((item) => item.id === demand.id); if (index >= 0) memoryStore.demands[index] = next; }
    broadcastRealtime({ type: 'demand.updated', demandId: demand.id, actorUserId: userId, at: now });
    const recipientId = isProvider ? demand.requesterId : demand.acceptedProviderId;
    const stage = stageText(next.status);
    if (recipientId && stage) await sendPushToUsers([recipientId], { ...stage, data: { type: 'demand.updated', demandId: demand.id, status: next.status } });
    return reply.send(next);
  });

  app.post<{ Params: { id: string }; Body: { userId?: string } }>('/api/v1/demands/:id/cancel', async (request, reply) => {
    const userId = request.body?.userId;
    if (!userId) return reply.code(400).send({ error: 'USER_REQUIRED', message: 'Informe o cliente que está cancelando.' });
    const db = await getDatabase();
    const demand = db ? await db.collection<Demand>(collectionName).findOne({ id: request.params.id }) : memoryStore.demands.find((item) => item.id === request.params.id);
    if (!demand) return reply.code(404).send({ error: 'DEMAND_NOT_FOUND', message: 'Demanda não encontrada.' });
    if (demand.requesterId !== userId) return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'Somente o cliente que criou o chamado pode cancelá-lo.' });
    if (!['open', 'negotiating'].includes(demand.status)) return reply.code(409).send({ error: 'CANCELLATION_UNAVAILABLE', message: 'Chamados com acordo confirmado precisam usar o fluxo de cancelamento ou disputa.' });
    const now = new Date().toISOString();
    const cancelled: Demand = { ...demand, status: 'cancelled', updatedAt: now };
    if (db) {
      const result = await db.collection<Demand>(collectionName).replaceOne({ id: demand.id, status: demand.status }, cancelled);
      if (result.matchedCount !== 1) return reply.code(409).send({ error: 'DEMAND_STATE_CHANGED', message: 'O chamado foi alterado por outro dispositivo. Atualize e tente novamente.' });
    } else {
      const index = memoryStore.demands.findIndex((item) => item.id === demand.id);
      if (index >= 0) memoryStore.demands[index] = cancelled;
    }
    broadcastRealtime({ type: 'demand.updated', demandId: demand.id, actorUserId: userId, at: now });
    return reply.send(cancelled);
  });
}
