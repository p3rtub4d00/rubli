import type { FastifyInstance } from 'fastify';
import type { CreateProposalInput, Demand, Proposal } from '@rubli/shared';
import { memoryStore } from '../store/memoryStore.js';
import { getDatabase } from '../store/database.js';
import { broadcastRealtime } from '../realtime.js';
import { sendPushToUsers } from '../push.js';
import { requireAuth, requireRole } from './auth.js';

const proposalsCollection = 'proposals';
const demandsCollection = 'demands';
const ORIGINAL_BUDGET_ACCEPTANCE_MESSAGE = 'Prestador propôs atender pelo valor informado pelo cliente.';

function isOriginalBudgetAcceptance(proposal: Proposal, demand: Demand) {
  return proposal.offeredBy === 'provider'
    && !proposal.parentProposalId
    && typeof demand.budget === 'number'
    && Math.abs(proposal.amount - demand.budget) < 0.01
    && proposal.message === ORIGINAL_BUDGET_ACCEPTANCE_MESSAGE;
}

function normalizeProposal(proposal: Proposal): Proposal {
  if (proposal.status === 'superseded' || proposal.status === 'rejected' || proposal.status === 'withdrawn') return proposal;
  const bothConfirmed = Boolean(proposal.customerConfirmedAt && proposal.providerConfirmedAt);
  return bothConfirmed ? { ...proposal, status: 'accepted' } : { ...proposal, status: 'pending' };
}

async function listProposals(demandId?: string) {
  const db = await getDatabase();
  if (!db) {
    const items = demandId ? memoryStore.proposals.filter((item) => item.demandId === demandId) : [...memoryStore.proposals];
    return items.map(normalizeProposal);
  }
  const filter = demandId ? { demandId } : {};
  const items = await db.collection<Proposal>(proposalsCollection).find(filter).sort({ createdAt: -1 }).toArray();
  return items.map(normalizeProposal);
}

async function findDemand(demandId: string) {
  const db = await getDatabase();
  if (!db) return memoryStore.demands.find((item: Demand) => item.id === demandId);
  return db.collection<Demand>(demandsCollection).findOne({ id: demandId });
}

async function persistProposal(proposal: Proposal) {
  const db = await getDatabase();
  if (!db) {
    const index = memoryStore.proposals.findIndex((item) => item.id === proposal.id);
    if (index >= 0) memoryStore.proposals[index] = proposal; else memoryStore.proposals.unshift(proposal);
    return;
  }
  await db.collection<Proposal>(proposalsCollection).replaceOne({ id: proposal.id }, proposal, { upsert: true });
}

async function persistDemand(demand: Demand) {
  const db = await getDatabase();
  if (!db) {
    const index = memoryStore.demands.findIndex((item) => item.id === demand.id);
    if (index >= 0) memoryStore.demands[index] = demand; else memoryStore.demands.unshift(demand);
    return;
  }
  await db.collection<Demand>(demandsCollection).replaceOne({ id: demand.id }, demand, { upsert: true });
}

export async function registerProposalRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { demandId?: string } }>('/api/v1/proposals', { preHandler: requireAuth }, async (request) => {
    const user = request.authUser!;
    const proposals = await listProposals(request.query.demandId);
    const demandIds = [...new Set(proposals.map((proposal) => proposal.demandId))];
    const demands = await Promise.all(demandIds.map(findDemand));
    const ownerByDemand = new Map(demands.filter((demand): demand is Demand => Boolean(demand)).map((demand) => [demand.id, demand.requesterId]));
    return proposals.filter((proposal) => proposal.providerId === user.id || ownerByDemand.get(proposal.demandId) === user.id);
  });

  app.post<{ Body: CreateProposalInput }>('/api/v1/proposals', { preHandler: requireRole('provider') }, async (request, reply) => {
    const body = request.body ?? {} as CreateProposalInput;
    const providerId = request.authUser!.id;
    if (request.authUser!.isAvailable === false) return reply.code(409).send({ error: 'PROVIDER_UNAVAILABLE', message: 'Ative sua disponibilidade antes de enviar novas propostas.' });
    const demand = await findDemand(body.demandId);
    if (!demand) return reply.code(404).send({ error: 'DEMAND_NOT_FOUND', message: 'Demanda não encontrada.' });
    if (demand.targetProviderId && demand.targetProviderId !== providerId) return reply.code(403).send({ error: 'DIRECT_REQUEST_ONLY', message: 'Esta solicitação foi direcionada a outro profissional.' });
    if (!Number.isFinite(body.amount) || body.amount <= 0) return reply.code(400).send({ error: 'INVALID_PROPOSAL', message: 'Informe um valor maior que zero.' });
    if (demand.status !== 'open' && demand.status !== 'negotiating') return reply.code(409).send({ error: 'DEMAND_UNAVAILABLE', message: 'Esta demanda não está disponível para novas propostas.' });
    if (demand.requesterId === providerId) return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'O cliente não pode enviar proposta para a própria demanda.' });
    const existing = await listProposals(body.demandId);
    if (existing.some((item) => item.providerId === providerId && item.status === 'pending')) return reply.code(409).send({ error: 'DUPLICATE_PROPOSAL', message: 'Você já enviou uma proposta pendente para esta demanda.' });
    const proposal: Proposal = { id: `pro_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, demandId: body.demandId, providerId, amount: Math.round(body.amount * 100) / 100, message: body.message?.trim() || undefined, status: 'pending', offeredBy: 'provider', version: 1, createdAt: new Date().toISOString() };
    await persistProposal(proposal);
    const updatedDemand = { ...demand, status: 'negotiating' as const, updatedAt: proposal.createdAt };
    await persistDemand(updatedDemand);
    broadcastRealtime({ type: 'proposal.created', demandId: proposal.demandId, proposalId: proposal.id, actorUserId: proposal.providerId, at: proposal.createdAt });
    broadcastRealtime({ type: 'demand.updated', demandId: updatedDemand.id, actorUserId: proposal.providerId, at: proposal.createdAt });
    await sendPushToUsers([demand.requesterId], { title: '💰 Nova proposta recebida', body: `${proposal.amount.toFixed(2).replace('.', ',')} para ${demand.title}`, data: { type: 'proposal.created', demandId: proposal.demandId, proposalId: proposal.id } });
    return reply.code(201).send(proposal);
  });

  app.post<{ Params: { id: string } }>('/api/v1/demands/:id/accept-budget', { preHandler: requireRole('provider') }, async (request, reply) => {
    const providerId = request.authUser!.id;
    if (request.authUser!.isAvailable === false) return reply.code(409).send({ error: 'PROVIDER_UNAVAILABLE', message: 'Ative sua disponibilidade antes de aceitar novos chamados.' });
    const demand = await findDemand(request.params.id);
    if (!demand) return reply.code(404).send({ error: 'DEMAND_NOT_FOUND', message: 'Demanda não encontrada.' });
    if (demand.targetProviderId && demand.targetProviderId !== providerId) return reply.code(403).send({ error: 'DIRECT_REQUEST_ONLY', message: 'Esta solicitação foi direcionada a outro profissional.' });
    if (providerId === demand.requesterId) return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'O cliente não pode aceitar a própria oferta.' });
    if (!demand.budget || demand.budget <= 0) return reply.code(409).send({ error: 'BUDGET_UNAVAILABLE', message: 'O cliente não informou um valor para aceite.' });
    if (!['open', 'negotiating'].includes(demand.status)) return reply.code(409).send({ error: 'DEMAND_UNAVAILABLE', message: 'Esta demanda não está disponível para aceite.' });
    const existing = await listProposals(demand.id);
    if (existing.some((item) => item.providerId === providerId && ['pending', 'accepted'].includes(item.status))) return reply.code(409).send({ error: 'DUPLICATE_PROPOSAL', message: 'Você já possui uma negociação ativa neste chamado.' });
    const now = new Date().toISOString();
    // O prestador iniciou a negociação ao aceitar trabalhar pelo orçamento do
    // cliente. Portanto esta é uma oferta do prestador: o cliente a aceita e,
    // depois disso, o prestador faz a confirmação final. Marcar como oferta do
    // cliente deixava o botão do cliente tentando aceitar a própria oferta.
    const proposal: Proposal = { id: `pro_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, demandId: demand.id, providerId, amount: demand.budget, message: ORIGINAL_BUDGET_ACCEPTANCE_MESSAGE, status: 'pending', offeredBy: 'provider', version: 1, createdAt: now };
    const nextDemand: Demand = { ...demand, status: 'negotiating', updatedAt: now };
    await persistProposal(proposal);
    await persistDemand(nextDemand);
    broadcastRealtime({ type: 'proposal.created', demandId: demand.id, proposalId: proposal.id, actorUserId: providerId, at: now });
    broadcastRealtime({ type: 'demand.updated', demandId: demand.id, actorUserId: providerId, at: now });
    await sendPushToUsers([demand.requesterId], { title: '💰 Proposta no valor solicitado', body: `O prestador propôs ${proposal.amount.toFixed(2).replace('.', ',')} para ${demand.title}. Aceite ou faça uma contraproposta.`, data: { type: 'proposal.created', demandId: demand.id, proposalId: proposal.id } });
    return reply.code(201).send({ proposal, demand: nextDemand });
  });

  // Snapshots locais nunca podem decidir acordo. A fila offline usa somente comandos idempotentes.
  app.post('/api/v1/proposals/sync', async (_request, reply) => reply.code(410).send({
    error: 'SYNC_DISABLED',
    message: 'Sincronização de snapshots de proposta foi desativada. Use os endpoints de proposta, contraproposta e confirmação.',
  }));

  app.post<{ Params: { id: string } }>('/api/v1/proposals/:id/accept', { preHandler: requireAuth }, async (request, reply) => {
    return confirmProposal(request.params.id, request.authUser!.id, reply, true);
  });

  app.post<{ Params: { id: string } }>('/api/v1/proposals/:id/confirm', { preHandler: requireAuth }, async (request, reply) => confirmProposal(request.params.id, request.authUser!.id, reply, false));

  app.post<{ Params: { id: string }; Body: { amount?: number; message?: string } }>('/api/v1/proposals/:id/counter', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.authUser!.id;
    const amount = request.body?.amount;
    if (!Number.isFinite(amount) || !amount || amount <= 0) return reply.code(400).send({ error: 'INVALID_COUNTER_PROPOSAL', message: 'Informe um valor maior que zero.' });
    const proposal = (await listProposals()).find((item) => item.id === request.params.id);
    if (!proposal) return reply.code(404).send({ error: 'PROPOSAL_NOT_FOUND', message: 'Proposta não encontrada.' });
    const demand = await findDemand(proposal.demandId);
    if (!demand) return reply.code(404).send({ error: 'DEMAND_NOT_FOUND', message: 'Demanda não encontrada.' });
    if (proposal.status !== 'pending') return reply.code(409).send({ error: 'PROPOSAL_UNAVAILABLE', message: 'Somente propostas pendentes podem receber contraproposta.' });
    if (userId !== demand.requesterId && userId !== proposal.providerId) return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'Usuário não participa desta negociação.' });
    const offeredBy = proposal.offeredBy ?? 'provider';
    const authorId = offeredBy === 'customer' ? demand.requesterId : proposal.providerId;
    if (userId === authorId) return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'Quem enviou a oferta deve aguardar a resposta da outra parte.' });
    if (isOriginalBudgetAcceptance(proposal, demand)) return reply.code(409).send({ error: 'ORIGINAL_BUDGET_LOCKED', message: 'O prestador aceitou o valor informado pelo cliente. Aceite a proposta para seguir com a confirmação do acordo; esse valor não pode receber contraproposta.' });
    const now = new Date().toISOString();
    const history = await listProposals(proposal.demandId);
    const counter: Proposal = { id: `pro_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, demandId: proposal.demandId, providerId: proposal.providerId, amount: Math.round(amount * 100) / 100, message: request.body?.message?.trim() || undefined, status: 'pending', version: Math.max(0, ...history.map((item) => item.version ?? 1)) + 1, parentProposalId: proposal.id, offeredBy: userId === demand.requesterId ? 'customer' : 'provider', createdAt: now };
    await persistProposal({ ...proposal, status: 'superseded' });
    await persistProposal(counter);
    const nextDemand = { ...demand, status: 'negotiating' as const, updatedAt: now };
    await persistDemand(nextDemand);
    broadcastRealtime({ type: 'proposal.updated', demandId: demand.id, proposalId: proposal.id, actorUserId: userId, at: now });
    broadcastRealtime({ type: 'proposal.created', demandId: demand.id, proposalId: counter.id, actorUserId: userId, at: now });
    broadcastRealtime({ type: 'demand.updated', demandId: demand.id, actorUserId: userId, at: now });
    const recipientId = userId === demand.requesterId ? proposal.providerId : demand.requesterId;
    await sendPushToUsers([recipientId], { title: '↔ Nova contraproposta', body: `${counter.amount.toFixed(2).replace('.', ',')} para ${demand.title}`, data: { type: 'proposal.created', demandId: demand.id, proposalId: counter.id } });
    return reply.code(201).send({ proposal: counter, supersededProposal: { ...proposal, status: 'superseded' }, demand: nextDemand });
  });
}

async function confirmProposal(id: string, userId: string | undefined, reply: any, isAcceptance: boolean) {
  if (!userId) return reply.code(400).send({ error: 'USER_REQUIRED', message: 'Informe o usuário que está confirmando.' });
  const proposal = (await listProposals()).find((item) => item.id === id);
  if (!proposal) return reply.code(404).send({ error: 'PROPOSAL_NOT_FOUND', message: 'Proposta não encontrada.' });
  const demand = await findDemand(proposal.demandId);
  if (!demand) return reply.code(404).send({ error: 'DEMAND_NOT_FOUND', message: 'Demanda não encontrada.' });
  if (userId !== demand.requesterId && userId !== proposal.providerId) return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'Usuário não participa desta negociação.' });
  if (!['pending', 'accepted'].includes(proposal.status)) return reply.code(409).send({ error: 'PROPOSAL_UNAVAILABLE', message: 'Esta proposta não está disponível para confirmação.' });
  const offeredBy = proposal.offeredBy ?? 'provider';
  const authorId = offeredBy === 'customer' ? demand.requesterId : proposal.providerId;
  const offerRecipientId = authorId === demand.requesterId ? proposal.providerId : demand.requesterId;
  if (isAcceptance && userId !== offerRecipientId) return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'Somente quem recebeu a oferta pode aceitá-la.' });
  if (!isAcceptance && userId === authorId && !(offerRecipientId === demand.requesterId ? proposal.customerConfirmedAt : proposal.providerConfirmedAt)) return reply.code(409).send({ error: 'WAITING_ACCEPTANCE', message: 'A outra parte precisa aceitar a oferta antes da sua confirmação.' });

  const now = new Date().toISOString();
  const nextProposal: Proposal = userId === demand.requesterId ? { ...proposal, customerConfirmedAt: proposal.customerConfirmedAt ?? now } : { ...proposal, providerConfirmedAt: proposal.providerConfirmedAt ?? now };
  const normalized = normalizeProposal(nextProposal);
  const bothConfirmed = Boolean(normalized.customerConfirmedAt && normalized.providerConfirmedAt);
  const nextDemand: Demand = bothConfirmed ? { ...demand, status: 'accepted', acceptedProviderId: normalized.providerId, updatedAt: now } : { ...demand, status: 'negotiating', acceptedProviderId: demand.acceptedProviderId, updatedAt: now };
  await persistProposal(normalized);
  await persistDemand(nextDemand);
  if (bothConfirmed) {
    const competitors = await listProposals(demand.id);
    await Promise.all(competitors.filter((item) => item.id !== normalized.id && item.status === 'pending').map((item) => persistProposal({ ...item, status: 'rejected' })));
  }
  broadcastRealtime({ type: 'proposal.updated', demandId: normalized.demandId, proposalId: normalized.id, actorUserId: userId, at: now });
  broadcastRealtime({ type: 'demand.updated', demandId: nextDemand.id, actorUserId: userId, at: now });
  const recipientId = userId === demand.requesterId ? proposal.providerId : demand.requesterId;
  await sendPushToUsers([recipientId], { title: bothConfirmed ? '✅ Serviço confirmado' : '🔔 Confirmação recebida', body: bothConfirmed ? `O serviço “${demand.title}” foi confirmado pelos dois lados.` : `A outra parte confirmou a proposta de ${normalized.amount.toFixed(2).replace('.', ',')}.`, data: { type: bothConfirmed ? 'agreement.confirmed' : 'proposal.confirmed', demandId: demand.id, proposalId: normalized.id } });
  return reply.send({ proposal: normalized, demand: nextDemand });
}
