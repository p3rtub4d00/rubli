import type { FastifyInstance } from 'fastify';
import type { Demand, Proposal, ScheduleChange } from '@rubli/shared';
import { getDatabase } from '../store/database.js';
import { memoryStore } from '../store/memoryStore.js';
import { broadcastRealtime } from '../realtime.js';
import { sendPushToUsers } from '../push.js';
import { requireAuth } from './auth.js';

const schedulableStatuses: Demand['status'][] = ['accepted', 'provider_en_route', 'provider_arrived'];

function newId() { return `sch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
function participants(demand: Demand, userId: string) {
  if (!demand.acceptedProviderId) return null;
  if (userId !== demand.requesterId && userId !== demand.acceptedProviderId) return null;
  return { customerId: demand.requesterId, providerId: demand.acceptedProviderId, otherUserId: userId === demand.requesterId ? demand.acceptedProviderId : demand.requesterId };
}
function validFutureDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() > Date.now() ? date.toISOString() : null;
}
async function findDemand(id: string) {
  const db = await getDatabase();
  return db ? db.collection<Demand>('demands').findOne({ id }) : memoryStore.demands.find((item) => item.id === id) ?? null;
}
async function agreementIsConfirmed(demand: Demand) {
  const db = await getDatabase();
  const proposals = db
    ? await db.collection<Proposal>('proposals').find({ demandId: demand.id, providerId: demand.acceptedProviderId, status: 'accepted' }).toArray()
    : memoryStore.proposals.filter((item) => item.demandId === demand.id && item.providerId === demand.acceptedProviderId && item.status === 'accepted');
  return proposals.some((item) => item.customerConfirmedAt && item.providerConfirmedAt);
}
async function listChanges(demandId: string) {
  const db = await getDatabase();
  return db ? db.collection<ScheduleChange>('schedule_changes').find({ demandId }).sort({ createdAt: -1 }).toArray() : memoryStore.scheduleChanges.filter((item) => item.demandId === demandId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function saveChange(change: ScheduleChange) {
  const db = await getDatabase();
  if (db) await db.collection<ScheduleChange>('schedule_changes').replaceOne({ id: change.id }, change, { upsert: true });
  else memoryStore.scheduleChanges.unshift(change);
}
async function saveDemand(next: Demand, expected: Demand) {
  const db = await getDatabase();
  if (db) {
    const result = await db.collection<Demand>('demands').replaceOne({ id: next.id, status: expected.status, updatedAt: expected.updatedAt }, next);
    return result.matchedCount === 1;
  }
  const index = memoryStore.demands.findIndex((item) => item.id === next.id && item.status === expected.status && item.updatedAt === expected.updatedAt);
  if (index < 0) return false;
  memoryStore.demands[index] = next;
  return true;
}

export async function registerSchedulingRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/v1/demands/:id/schedule', { preHandler: requireAuth }, async (request, reply) => {
    const demand = await findDemand(request.params.id);
    if (!demand) return reply.code(404).send({ error: 'DEMAND_NOT_FOUND' });
    if (!participants(demand, request.authUser!.id)) return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'Você não participa deste serviço.' });
    return { demandId: demand.id, scheduledAt: demand.scheduledAt, scheduleStatus: demand.scheduleStatus, scheduleProposedBy: demand.scheduleProposedBy, scheduleCustomerConfirmedAt: demand.scheduleCustomerConfirmedAt, scheduleProviderConfirmedAt: demand.scheduleProviderConfirmedAt, history: await listChanges(demand.id) };
  });

  app.post<{ Params: { id: string }; Body: { scheduledAt?: string } }>('/api/v1/demands/:id/schedule/propose', { preHandler: requireAuth }, async (request, reply) => {
    const demand = await findDemand(request.params.id);
    const userId = request.authUser!.id;
    const scheduledAt = validFutureDate(request.body?.scheduledAt);
    if (!demand) return reply.code(404).send({ error: 'DEMAND_NOT_FOUND' });
    const people = participants(demand, userId);
    if (!people) return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'Você não participa deste serviço.' });
    if (!scheduledAt) return reply.code(400).send({ error: 'INVALID_SCHEDULE', message: 'Informe uma data e horário futuros.' });
    if (!schedulableStatuses.includes(demand.status)) return reply.code(409).send({ error: 'SCHEDULE_NOT_AVAILABLE', message: 'O agendamento só pode ser alterado antes do início do serviço.' });
    if (!await agreementIsConfirmed(demand)) return reply.code(409).send({ error: 'AGREEMENT_NOT_CONFIRMED', message: 'O acordo deve ser confirmado pelos dois lados antes do agendamento.' });
    const now = new Date().toISOString();
    const customerConfirmed = userId === people.customerId ? now : undefined;
    const providerConfirmed = userId === people.providerId ? now : undefined;
    const next: Demand = { ...demand, scheduledAt, scheduleStatus: 'pending', scheduleProposedBy: userId, scheduleCustomerConfirmedAt: customerConfirmed, scheduleProviderConfirmedAt: providerConfirmed, scheduleUpdatedAt: now, updatedAt: now };
    if (!await saveDemand(next, demand)) return reply.code(409).send({ error: 'DEMAND_STATE_CHANGED', message: 'A demanda foi atualizada por outro dispositivo.' });
    const change: ScheduleChange = { id: newId(), demandId: demand.id, scheduledAt, action: demand.scheduledAt ? 'counter_proposed' : 'proposed', proposedBy: userId, createdAt: now, customerConfirmedAt: customerConfirmed, providerConfirmedAt: providerConfirmed };
    await saveChange(change);
    void broadcastRealtime({ type: 'demand.updated', demandId: demand.id, actorUserId: userId, at: now }, [people.customerId, people.providerId]);
    void sendPushToUsers([people.otherUserId], { title: demand.scheduledAt ? 'Reagendamento proposto' : 'Novo horário proposto', body: 'Foi sugerido um horário para o serviço. Abra o Rubli para confirmar ou propor outro.', data: { type: 'schedule.proposed', demandId: demand.id } }).catch(() => undefined);
    return reply.code(201).send({ demand: next, change });
  });

  app.post<{ Params: { id: string }; Body: { action?: 'accept' | 'counter'; scheduledAt?: string } }>('/api/v1/demands/:id/schedule/respond', { preHandler: requireAuth }, async (request, reply) => {
    const demand = await findDemand(request.params.id);
    const userId = request.authUser!.id;
    const action = request.body?.action;
    if (!demand) return reply.code(404).send({ error: 'DEMAND_NOT_FOUND' });
    const people = participants(demand, userId);
    if (!people) return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'Você não participa deste serviço.' });
    if (!schedulableStatuses.includes(demand.status) || demand.scheduleStatus !== 'pending' || !demand.scheduledAt || !demand.scheduleProposedBy) return reply.code(409).send({ error: 'SCHEDULE_NOT_PENDING', message: 'Não existe um horário aguardando confirmação.' });
    if (demand.scheduleProposedBy === userId) return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'Quem propôs o horário deve aguardar a resposta da outra parte.' });
    const now = new Date().toISOString();
    if (action === 'accept') {
      const next: Demand = { ...demand, scheduleStatus: 'confirmed', scheduleCustomerConfirmedAt: userId === people.customerId ? now : demand.scheduleCustomerConfirmedAt, scheduleProviderConfirmedAt: userId === people.providerId ? now : demand.scheduleProviderConfirmedAt, scheduleUpdatedAt: now, updatedAt: now };
      if (!await saveDemand(next, demand)) return reply.code(409).send({ error: 'DEMAND_STATE_CHANGED' });
      const change: ScheduleChange = { id: newId(), demandId: demand.id, scheduledAt: next.scheduledAt!, action: 'confirmed', proposedBy: demand.scheduleProposedBy, createdAt: now, customerConfirmedAt: next.scheduleCustomerConfirmedAt, providerConfirmedAt: next.scheduleProviderConfirmedAt };
      await saveChange(change);
      void broadcastRealtime({ type: 'demand.updated', demandId: demand.id, actorUserId: userId, at: now }, [people.customerId, people.providerId]);
      void sendPushToUsers([people.otherUserId], { title: 'Horário confirmado', body: 'O horário do serviço foi confirmado pelos dois lados.', data: { type: 'schedule.confirmed', demandId: demand.id } }).catch(() => undefined);
      return reply.send({ demand: next, change });
    }
    if (action !== 'counter') return reply.code(400).send({ error: 'INVALID_SCHEDULE_RESPONSE' });
    const scheduledAt = validFutureDate(request.body?.scheduledAt);
    if (!scheduledAt) return reply.code(400).send({ error: 'INVALID_SCHEDULE', message: 'Informe uma data e horário futuros.' });
    const customerConfirmed = userId === people.customerId ? now : undefined;
    const providerConfirmed = userId === people.providerId ? now : undefined;
    const next: Demand = { ...demand, scheduledAt, scheduleStatus: 'pending', scheduleProposedBy: userId, scheduleCustomerConfirmedAt: customerConfirmed, scheduleProviderConfirmedAt: providerConfirmed, scheduleUpdatedAt: now, updatedAt: now };
    if (!await saveDemand(next, demand)) return reply.code(409).send({ error: 'DEMAND_STATE_CHANGED' });
    const change: ScheduleChange = { id: newId(), demandId: demand.id, scheduledAt, action: 'counter_proposed', proposedBy: userId, createdAt: now, customerConfirmedAt: customerConfirmed, providerConfirmedAt: providerConfirmed };
    await saveChange(change);
    void broadcastRealtime({ type: 'demand.updated', demandId: demand.id, actorUserId: userId, at: now }, [people.customerId, people.providerId]);
    void sendPushToUsers([people.otherUserId], { title: 'Reagendamento proposto', body: 'Foi sugerido um novo horário para o serviço.', data: { type: 'schedule.proposed', demandId: demand.id } }).catch(() => undefined);
    return reply.send({ demand: next, change });
  });
}
