import type { FastifyInstance } from 'fastify';
import type { CancellationReason, CancellationRequest, Demand, Dispute, DisputeStatus } from '@rubli/shared';
import { getDatabase } from '../store/database.js';
import { memoryStore } from '../store/memoryStore.js';
import { broadcastRealtime } from '../realtime.js';
import { sendPushToUsers } from '../push.js';
import { requireAuth } from './auth.js';

const cancellationReasons: CancellationReason[] = ['provider_no_show', 'customer_unavailable', 'service_not_feasible', 'conditions_different', 'mutual_agreement', 'other'];
const contractedStatuses: Demand['status'][] = ['accepted', 'provider_en_route', 'provider_arrived', 'in_progress', 'awaiting_customer_confirmation'];

function newId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
function participantIds(demand: Demand) { return demand.acceptedProviderId ? [demand.requesterId, demand.acceptedProviderId] as const : null; }
function otherParticipant(demand: Demand, userId: string) {
  const participants = participantIds(demand);
  if (!participants || (participants[0] !== userId && participants[1] !== userId)) return null;
  return participants[0] === userId ? participants[1] : participants[0];
}
function isPostContract(demand: Demand) { return contractedStatuses.includes(demand.status); }

async function findDemand(id: string) {
  const db = await getDatabase();
  return db ? db.collection<Demand>('demands').findOne({ id }) : memoryStore.demands.find((item) => item.id === id) ?? null;
}
async function listRequests(demandId: string) {
  const db = await getDatabase();
  return db ? db.collection<CancellationRequest>('cancellation_requests').find({ demandId }).sort({ createdAt: -1 }).toArray() : memoryStore.cancellationRequests.filter((item) => item.demandId === demandId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function saveRequest(item: CancellationRequest) {
  const db = await getDatabase();
  if (db) return db.collection<CancellationRequest>('cancellation_requests').replaceOne({ id: item.id }, item, { upsert: true });
  const index = memoryStore.cancellationRequests.findIndex((entry) => entry.id === item.id);
  if (index >= 0) memoryStore.cancellationRequests[index] = item; else memoryStore.cancellationRequests.unshift(item);
}
async function listDisputes(demandId: string) {
  const db = await getDatabase();
  return db ? db.collection<Dispute>('disputes').find({ demandId }).sort({ updatedAt: -1 }).toArray() : memoryStore.disputes.filter((item) => item.demandId === demandId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
async function saveDispute(item: Dispute) {
  const db = await getDatabase();
  if (db) return db.collection<Dispute>('disputes').replaceOne({ id: item.id }, item, { upsert: true });
  const index = memoryStore.disputes.findIndex((entry) => entry.id === item.id);
  if (index >= 0) memoryStore.disputes[index] = item; else memoryStore.disputes.unshift(item);
}
async function cancelDemand(demand: Demand, expectedStatus: Demand['status']) {
  const now = new Date().toISOString();
  const next: Demand = { ...demand, status: 'cancelled', updatedAt: now };
  const db = await getDatabase();
  if (db) {
    const result = await db.collection<Demand>('demands').replaceOne({ id: demand.id, status: expectedStatus }, next);
    return result.matchedCount === 1 ? next : null;
  }
  const index = memoryStore.demands.findIndex((item) => item.id === demand.id && item.status === expectedStatus);
  if (index < 0) return null;
  memoryStore.demands[index] = next;
  return next;
}

export async function registerCancellationRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/v1/demands/:id/cancellation-requests', { preHandler: requireAuth }, async (request, reply) => {
    const demand = await findDemand(request.params.id);
    if (!demand) return reply.code(404).send({ error: 'DEMAND_NOT_FOUND' });
    if (!otherParticipant(demand, request.authUser!.id)) return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'Você não participa deste serviço.' });
    return listRequests(demand.id);
  });

  app.post<{ Params: { id: string }; Body: { reason?: CancellationReason; description?: string } }>('/api/v1/demands/:id/cancellation-requests', { preHandler: requireAuth }, async (request, reply) => {
    const demand = await findDemand(request.params.id);
    const userId = request.authUser!.id;
    const body = request.body ?? {};
    if (!demand) return reply.code(404).send({ error: 'DEMAND_NOT_FOUND' });
    const counterpartId = otherParticipant(demand, userId);
    if (!counterpartId) return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'Você não participa deste serviço.' });
    if (!isPostContract(demand)) return reply.code(409).send({ error: 'CANCELLATION_NOT_AVAILABLE', message: 'Este fluxo só é usado após a confirmação do acordo e antes da conclusão.' });
    if (!body.reason || !cancellationReasons.includes(body.reason)) return reply.code(400).send({ error: 'INVALID_CANCELLATION_REASON', message: 'Selecione um motivo de cancelamento.' });
    const description = body.description?.trim();
    if (description && description.length > 1500) return reply.code(400).send({ error: 'DESCRIPTION_TOO_LONG', message: 'A descrição pode ter no máximo 1500 caracteres.' });
    const existing = await listRequests(demand.id);
    if (existing.some((item) => item.status === 'pending_confirmation')) return reply.code(409).send({ error: 'CANCELLATION_ALREADY_PENDING', message: 'Já existe uma solicitação aguardando resposta da outra parte.' });
    const now = new Date().toISOString();
    const cancellation: CancellationRequest = { id: newId('can'), demandId: demand.id, requestedBy: userId, reason: body.reason, description, createdAt: now, status: 'pending_confirmation' };
    await saveRequest(cancellation);
    void broadcastRealtime({ type: 'cancellation.updated', demandId: demand.id, actorUserId: userId, at: now }, [userId, counterpartId]);
    void sendPushToUsers([counterpartId], { title: 'Solicitação de cancelamento', body: 'A outra parte solicitou o cancelamento deste serviço. Abra o Rubli para responder.', data: { type: 'cancellation.updated', demandId: demand.id } }).catch(() => undefined);
    return reply.code(201).send(cancellation);
  });

  app.post<{ Params: { id: string; requestId: string }; Body: { action?: 'accept' | 'refuse'; note?: string } }>('/api/v1/demands/:id/cancellation-requests/:requestId/respond', { preHandler: requireAuth }, async (request, reply) => {
    const demand = await findDemand(request.params.id);
    const userId = request.authUser!.id;
    const body = request.body ?? {};
    if (!demand) return reply.code(404).send({ error: 'DEMAND_NOT_FOUND' });
    const counterpartId = otherParticipant(demand, userId);
    if (!counterpartId) return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'Você não participa deste serviço.' });
    const cancellation = (await listRequests(demand.id)).find((item) => item.id === request.params.requestId);
    if (!cancellation) return reply.code(404).send({ error: 'CANCELLATION_REQUEST_NOT_FOUND' });
    if (cancellation.requestedBy === userId) return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'Quem solicitou o cancelamento deve aguardar a outra parte.' });
    if (cancellation.status !== 'pending_confirmation') return reply.code(409).send({ error: 'CANCELLATION_ALREADY_RESPONDED', message: 'Esta solicitação já foi respondida.' });
    if (body.action !== 'accept' && body.action !== 'refuse') return reply.code(400).send({ error: 'INVALID_CANCELLATION_RESPONSE' });
    const note = body.note?.trim();
    if (note && note.length > 1000) return reply.code(400).send({ error: 'NOTE_TOO_LONG' });
    const now = new Date().toISOString();
    const next: CancellationRequest = { ...cancellation, status: body.action === 'accept' ? 'accepted' : 'refused', respondedBy: userId, respondedAt: now, responseNote: note };
    if (body.action === 'accept') {
      const cancelled = await cancelDemand(demand, demand.status);
      if (!cancelled) return reply.code(409).send({ error: 'DEMAND_STATE_CHANGED', message: 'A demanda foi atualizada por outro dispositivo. Atualize e tente novamente.' });
      void broadcastRealtime({ type: 'demand.updated', demandId: demand.id, actorUserId: userId, at: now }, [demand.requesterId, demand.acceptedProviderId!]);
    }
    await saveRequest(next);
    void broadcastRealtime({ type: 'cancellation.updated', demandId: demand.id, actorUserId: userId, at: now }, [demand.requesterId, demand.acceptedProviderId!]);
    void sendPushToUsers([cancellation.requestedBy], { title: body.action === 'accept' ? 'Cancelamento confirmado' : 'Cancelamento recusado', body: body.action === 'accept' ? 'O serviço foi cancelado de comum acordo.' : 'A outra parte recusou o cancelamento. Você pode abrir uma disputa.', data: { type: 'cancellation.updated', demandId: demand.id } }).catch(() => undefined);
    return reply.send(next);
  });

  app.get<{ Params: { id: string } }>('/api/v1/demands/:id/disputes', { preHandler: requireAuth }, async (request, reply) => {
    const demand = await findDemand(request.params.id);
    if (!demand) return reply.code(404).send({ error: 'DEMAND_NOT_FOUND' });
    if (!otherParticipant(demand, request.authUser!.id)) return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'Você não participa deste serviço.' });
    return listDisputes(demand.id);
  });

  app.post<{ Params: { id: string }; Body: { reason?: string; description?: string; cancellationRequestId?: string } }>('/api/v1/demands/:id/disputes', { preHandler: requireAuth }, async (request, reply) => {
    const demand = await findDemand(request.params.id);
    const userId = request.authUser!.id;
    const body = request.body ?? {};
    if (!demand) return reply.code(404).send({ error: 'DEMAND_NOT_FOUND' });
    const againstUserId = otherParticipant(demand, userId);
    if (!againstUserId) return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'Você não participa deste serviço.' });
    if (!isPostContract(demand)) return reply.code(409).send({ error: 'DISPUTE_NOT_AVAILABLE', message: 'Disputas só podem ser abertas para serviços contratados e ainda não concluídos.' });
    const reason = body.reason?.trim(); const description = body.description?.trim();
    if (!reason || !description) return reply.code(400).send({ error: 'INVALID_DISPUTE', message: 'Informe o motivo e descreva o ocorrido.' });
    if (reason.length > 160 || description.length > 3000) return reply.code(400).send({ error: 'DISPUTE_TOO_LONG', message: 'Revise o tamanho do motivo e da descrição.' });
    const existing = await listDisputes(demand.id);
    if (existing.some((item) => ['open', 'under_review'].includes(item.status))) return reply.code(409).send({ error: 'DISPUTE_ALREADY_OPEN', message: 'Já existe uma disputa em análise para este serviço.' });
    const now = new Date().toISOString();
    const dispute: Dispute = { id: newId('dsp'), demandId: demand.id, openedBy: userId, againstUserId, reason, description, status: 'open', createdAt: now, updatedAt: now, cancellationRequestId: body.cancellationRequestId };
    await saveDispute(dispute);
    if (body.cancellationRequestId) {
      const cancellation = (await listRequests(demand.id)).find((item) => item.id === body.cancellationRequestId);
      if (cancellation && cancellation.status === 'refused') await saveRequest({ ...cancellation, status: 'dispute_opened' });
    }
    void broadcastRealtime({ type: 'dispute.updated', demandId: demand.id, actorUserId: userId, at: now }, [userId, againstUserId]);
    void sendPushToUsers([againstUserId], { title: 'Disputa aberta', body: 'Foi aberta uma disputa vinculada a um serviço. A administração analisará o caso.', data: { type: 'dispute.updated', demandId: demand.id } }).catch(() => undefined);
    return reply.code(201).send(dispute);
  });
}

export async function updateDisputeByAdmin(id: string, status: DisputeStatus, resolution: string | undefined, adminUserId = 'admin') {
  const db = await getDatabase();
  const current = db ? await db.collection<Dispute>('disputes').findOne({ id }) : memoryStore.disputes.find((item) => item.id === id) ?? null;
  if (!current) return null;
  const now = new Date().toISOString();
  const next: Dispute = { ...current, status, resolution: resolution?.trim() || current.resolution, resolvedBy: ['resolved', 'closed'].includes(status) ? adminUserId : current.resolvedBy, updatedAt: now };
  await saveDispute(next);
  void broadcastRealtime({ type: 'dispute.updated', demandId: next.demandId, actorUserId: adminUserId, at: now }, [next.openedBy, next.againstUserId]);
  void sendPushToUsers([next.openedBy, next.againstUserId], { title: status === 'resolved' ? 'Disputa resolvida' : 'Atualização na disputa', body: status === 'resolved' ? 'A administração concluiu a análise da disputa.' : 'A administração atualizou o status da disputa.', data: { type: 'dispute.updated', demandId: next.demandId, status } }).catch(() => undefined);
  return next;
}
