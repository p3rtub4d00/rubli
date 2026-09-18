import type { FastifyInstance } from 'fastify';
import type { Demand, DemandType, Proposal, ServiceAddress } from '@rubli/shared';
import { DEMAND_CATEGORIES } from '@rubli/shared';
import { memoryStore } from '../store/memoryStore.js';
import { getDatabase } from '../store/database.js';
import { broadcastRealtime } from '../realtime.js';
import { sendPushToUsers } from '../push.js';
import { resolveManagedCategory } from '../store/categories.js';
import { requireAuth, requireRole } from './auth.js';
import { matchProviderToDemand, matchingDemandsForProvider, matchingProvidersForDemand } from '../services/matching.js';
import { demandForUser } from '../services/demandPrivacy.js';

const demandTypes: DemandType[] = ['service', 'purchase', 'delivery', 'freight'];
const collectionName = 'demands';
const statusRank: Record<Demand['status'], number> = { draft: 0, open: 1, negotiating: 2, accepted: 3, provider_en_route: 4, provider_arrived: 5, in_progress: 6, awaiting_customer_confirmation: 7, completed: 8, cancelled: -1 };

async function listDemands() {
  const db = await getDatabase();
  if (!db) return [...memoryStore.demands];
  return db.collection<Demand>(collectionName).find({}).sort({ createdAt: -1 }).toArray();
}
async function listAllProposals() {
  const db = await getDatabase();
  return db ? db.collection<Proposal>('proposals').find({}).toArray() : memoryStore.proposals;
}
function validAddress(value: unknown): value is ServiceAddress {
  if (!value || typeof value !== 'object') return false;
  const address = value as Partial<ServiceAddress>;
  return ['postalCode', 'street', 'number', 'neighborhood', 'city', 'state'].every((key) => typeof address[key as keyof ServiceAddress] === 'string' && String(address[key as keyof ServiceAddress]).trim())
    && typeof address.latitude === 'number' && Number.isFinite(address.latitude) && address.latitude >= -90 && address.latitude <= 90
    && typeof address.longitude === 'number' && Number.isFinite(address.longitude) && address.longitude >= -180 && address.longitude <= 180;
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
  app.get('/api/v1/demands', { preHandler: requireAuth }, async (request) => {
    const [all, proposals] = await Promise.all([listDemands(), listAllProposals()]);
    const user = request.authUser!;
    if (user.role === 'customer') return all.filter((demand) => demand.requesterId === user.id).map((demand) => demandForUser(demand, user, proposals));
    if (user.role === 'provider') {
      // Serviços já contratados permanecem acessíveis mesmo quando o prestador
      // estiver indisponível; apenas novas oportunidades passam pelo matching.
      const contracted = all.filter((demand) => demand.acceptedProviderId === user.id);
      const opportunities = (await matchingDemandsForProvider(user, all)).map((match) => match.demand);
      return [...contracted, ...opportunities.filter((demand) => !contracted.some((item) => item.id === demand.id))].map((demand) => demandForUser(demand, user, proposals));
    }
    return [];
  });

  app.post<{ Body: Partial<Demand> }>('/api/v1/demands', { preHandler: requireRole('customer') }, async (request, reply) => {
    const body = request.body ?? {};
    if (!body.id || !body.type || !demandTypes.includes(body.type) || !body.title || !body.description || !body.category || !body.locationLabel) return reply.code(400).send({ error: 'INVALID_DEMAND', message: 'Dados obrigatórios da demanda não foram preenchidos.' });
    if (body.type === 'service' && !validAddress(body.serviceAddress)) return reply.code(400).send({ error: 'INVALID_SERVICE_ADDRESS', message: 'Informe o endereço completo e uma localização válida onde o serviço será realizado.' });
    if (['delivery', 'freight'].includes(body.type) && (!validAddress(body.pickupAddress) || !validAddress(body.dropoffAddress))) return reply.code(400).send({ error: 'INVALID_ROUTE', message: 'Informe os endereços completos de coleta e destino, com localização válida.' });
    const managedCategory = await resolveManagedCategory(body.type as DemandType, body.category);
    if (!managedCategory) return reply.code(400).send({ error: 'INVALID_CATEGORY', message: 'Categoria incompatível com o tipo da demanda.' });
    const photoUris = Array.isArray(body.photoUris) ? body.photoUris.filter((item): item is string => typeof item === 'string') : [];
    if (photoUris.length > 5 || photoUris.some((item) => item.length > 2_000_000) || photoUris.reduce((total, item) => total + item.length, 0) > 8_000_000) {
      return reply.code(413).send({ error: 'PHOTOS_TOO_LARGE', message: 'Envie no máximo 5 fotos, totalizando até 6 MB.' });
    }

    const db = await getDatabase();
    const existingForId = db ? await db.collection<Demand>(collectionName).findOne({ id: body.id }) : memoryStore.demands.find((item) => item.id === body.id);
    if (existingForId) return reply.code(409).send({ error: 'DEMAND_ALREADY_EXISTS', message: 'Demandas existentes devem ser alteradas pelos comandos de negociação ou serviço.' });

    const now = new Date().toISOString();
    // A criação nunca pode carregar estado contratado ou de execução vindo do aparelho.
    const serviceAddress = validAddress(body.serviceAddress) ? { ...body.serviceAddress, postalCode: body.serviceAddress.postalCode.trim(), street: body.serviceAddress.street.trim(), number: body.serviceAddress.number.trim(), neighborhood: body.serviceAddress.neighborhood.trim(), city: body.serviceAddress.city.trim(), state: body.serviceAddress.state.trim().toUpperCase(), complement: body.serviceAddress.complement?.trim() || undefined, reference: body.serviceAddress.reference?.trim() || undefined } : undefined;
    const pickupAddress = validAddress(body.pickupAddress) ? body.pickupAddress : undefined;
    const dropoffAddress = validAddress(body.dropoffAddress) ? body.dropoffAddress : undefined;
    const demand: Demand = { id: body.id, requesterId: request.authUser!.id, type: body.type, title: body.title.trim(), description: body.description.trim(), category: managedCategory.name, categoryId: managedCategory.id, budgetType: body.budget ? 'fixed' : 'open', budget: typeof body.budget === 'number' ? body.budget : undefined, locationLabel: serviceAddress ? `${serviceAddress.neighborhood} · ${serviceAddress.city} - ${serviceAddress.state}` : pickupAddress ? `${pickupAddress.neighborhood} → ${dropoffAddress!.neighborhood}` : body.locationLabel.trim(), latitude: serviceAddress?.latitude ?? pickupAddress?.latitude ?? body.latitude, longitude: serviceAddress?.longitude ?? pickupAddress?.longitude ?? body.longitude, serviceAddress, pickupAddress, dropoffAddress, isUrgent: body.isUrgent === true, photoUris, status: 'open', createdAt: now, updatedAt: now, targetProviderId: typeof body.targetProviderId === 'string' ? body.targetProviderId : undefined };

    if (demand.targetProviderId) {
      if (demand.targetProviderId === demand.requesterId) return reply.code(400).send({ error: 'INVALID_TARGET_PROVIDER', message: 'Você não pode direcionar uma solicitação para si mesmo.' });
      const target = db ? await db.collection<import('@rubli/shared').User>('users').findOne({ id: demand.targetProviderId }) : memoryStore.users.find((user) => user.id === demand.targetProviderId);
      if (!target || target.role !== 'provider' || !matchProviderToDemand(target, demand).eligible) return reply.code(400).send({ error: 'INVALID_TARGET_PROVIDER', message: 'Esse profissional não está apto para esta solicitação.' });
    }

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

    if (created) {
      const matches = merged.targetProviderId ? (await matchingProvidersForDemand(merged)).filter((match) => match.provider.id === merged.targetProviderId) : await matchingProvidersForDemand(merged);
      const providerIds = matches.map((match) => match.provider.id);
      void broadcastRealtime({ type: 'demand.created', demandId: merged.id, actorUserId: merged.requesterId, at: eventAt }, providerIds);
      const title = merged.targetProviderId ? '🔔 Nova solicitação direta' : merged.isUrgent ? '⚡ Novo chamado urgente' : '🔔 Novo chamado disponível';
      const bodyText = merged.isUrgent ? `${merged.title} • atendimento imediato` : `${merged.title} • nova oportunidade na sua região`;
      await sendPushToUsers(providerIds, { title, body: bodyText, data: { type: 'demand.created', demandId: merged.id } });
    } else if (existing && existing.status !== merged.status) {
      void broadcastRealtime({ type: 'demand.updated', demandId: merged.id, actorUserId: merged.requesterId, at: eventAt });
      const stage = stageText(merged.status);
      if (stage) {
        const recipientId = merged.status === 'completed' ? merged.acceptedProviderId : merged.requesterId;
        if (recipientId) await sendPushToUsers([recipientId], { ...stage, data: { type: 'demand.updated', demandId: merged.id, status: merged.status } });
      }
    }

    return reply.code(created ? 201 : 200).send(merged);
  });

  app.post<{ Params: { id: string }; Body: { action?: 'en_route' | 'arrived' | 'start' | 'request_completion' | 'confirm_completion' } }>('/api/v1/demands/:id/service-actions', { preHandler: requireAuth }, async (request, reply) => {
    const { action } = request.body ?? {};
    const userId = request.authUser!.id;
    if (!action) return reply.code(400).send({ error: 'INVALID_SERVICE_ACTION', message: 'Informe uma ação.' });
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
    if (action === 'confirm_completion' && demand.acceptedProviderId) {
      broadcastRealtime({ type: 'rating.requested', demandId: demand.id, actorUserId: userId, at: now });
      void sendPushToUsers([demand.acceptedProviderId], {
        title: '⭐ Avalie o cliente',
        body: `O serviço “${demand.title}” foi concluído. Conte como foi sua experiência.`,
        data: { type: 'rating.requested', demandId: demand.id, status: next.status },
      }).catch(() => undefined);
    }
    const recipientId = isProvider ? demand.requesterId : demand.acceptedProviderId;
    const stage = stageText(next.status);
    if (recipientId && stage) void sendPushToUsers([recipientId], { ...stage, data: { type: 'demand.updated', demandId: demand.id, status: next.status } }).catch(() => undefined);
    return reply.send(next);
  });

  app.post<{ Params: { id: string } }>('/api/v1/demands/:id/cancel', { preHandler: requireRole('customer') }, async (request, reply) => {
    const userId = request.authUser!.id;
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
