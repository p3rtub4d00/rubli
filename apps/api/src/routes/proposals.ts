import type { FastifyInstance } from 'fastify';
import type { CreateProposalInput, Demand, Proposal } from '@rubli/shared';
import { memoryStore } from '../store/memoryStore.js';
import { getDatabase } from '../store/database.js';
import { broadcastRealtime } from '../realtime.js';

const proposalsCollection = 'proposals';
const demandsCollection = 'demands';

async function listProposals(demandId?: string) {
  const db = await getDatabase();
  if (!db) return demandId ? memoryStore.proposals.filter((item) => item.demandId === demandId) : [...memoryStore.proposals];
  const filter = demandId ? { demandId } : {};
  return db.collection<Proposal>(proposalsCollection).find(filter).sort({ createdAt: -1 }).toArray();
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
    if (index >= 0) memoryStore.proposals[index] = proposal;
    else memoryStore.proposals.unshift(proposal);
    return;
  }
  await db.collection<Proposal>(proposalsCollection).replaceOne({ id: proposal.id }, proposal, { upsert: true });
}

async function persistDemand(demand: Demand) {
  const db = await getDatabase();
  if (!db) {
    const index = memoryStore.demands.findIndex((item) => item.id === demand.id);
    if (index >= 0) memoryStore.demands[index] = demand;
    else memoryStore.demands.unshift(demand);
    return;
  }
  await db.collection<Demand>(demandsCollection).replaceOne({ id: demand.id }, demand, { upsert: true });
}

function normalizeProposal(proposal: Proposal): Proposal {
  if (proposal.status === 'superseded' || proposal.status === 'rejected' || proposal.status === 'withdrawn') return proposal;
  const bothConfirmed = Boolean(proposal.customerConfirmedAt && proposal.providerConfirmedAt);
  return bothConfirmed ? { ...proposal, status: 'accepted' } : { ...proposal, status: 'pending' };
}

export async function registerProposalRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { demandId?: string } }>('/api/v1/proposals', async (request) => listProposals(request.query.demandId));

  app.post<{ Body: CreateProposalInput }>('/api/v1/proposals', async (request, reply) => {
    const body = request.body ?? {} as CreateProposalInput;
    const demand = await findDemand(body.demandId);
    if (!demand) return reply.code(404).send({ error: 'DEMAND_NOT_FOUND', message: 'Demanda não encontrada.' });
    if (!body.providerId || !Number.isFinite(body.amount) || body.amount <= 0) return reply.code(400).send({ error: 'INVALID_PROPOSAL', message: 'Informe o prestador e um valor maior que zero.' });
    if (demand.status !== 'open' && demand.status !== 'negotiating') return reply.code(409).send({ error: 'DEMAND_UNAVAILABLE', message: 'Esta demanda não está disponível para novas propostas.' });
    const existing = await listProposals(body.demandId);
    if (existing.some((item) => item.providerId === body.providerId && item.status === 'pending')) return reply.code(409).send({ error: 'DUPLICATE_PROPOSAL', message: 'Você já enviou uma proposta pendente para esta demanda.' });
    const proposal: Proposal = { id: `pro_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, demandId: body.demandId, providerId: body.providerId, amount: Math.round(body.amount * 100) / 100, message: body.message?.trim() || undefined, status: 'pending', offeredBy: 'provider', version: 1, createdAt: new Date().toISOString() };
    await persistProposal(proposal);
    const updatedDemand = { ...demand, status: 'negotiating' as const, updatedAt: proposal.createdAt };
    await persistDemand(updatedDemand);
    broadcastRealtime({ type: 'proposal.created', demandId: proposal.demandId, proposalId: proposal.id, actorUserId: proposal.providerId, at: proposal.createdAt });
    broadcastRealtime({ type: 'demand.updated', demandId: updatedDemand.id, actorUserId: proposal.providerId, at: proposal.createdAt });
    return reply.code(201).send(proposal);
  });

  app.post<{ Body: { proposals: Proposal[] } }>('/api/v1/proposals/sync', async (request, reply) => {
    const proposals = Array.isArray(request.body?.proposals) ? request.body.proposals : [];
    for (const incoming of proposals) {
      const normalized = normalizeProposal(incoming);
      await persistProposal(normalized);
      const demand = await findDemand(normalized.demandId);
      if (!demand) continue;
      const bothConfirmed = Boolean(normalized.customerConfirmedAt && normalized.providerConfirmedAt);
      const nextDemand: Demand = bothConfirmed ? { ...demand, status: 'accepted', acceptedProviderId: normalized.providerId, updatedAt: new Date().toISOString() } : { ...demand, status: demand.status === 'accepted' ? 'accepted' : 'negotiating', acceptedProviderId: demand.acceptedProviderId, updatedAt: new Date().toISOString() };
      await persistDemand(nextDemand);
      broadcastRealtime({ type: 'proposal.updated', demandId: normalized.demandId, proposalId: normalized.id, actorUserId: normalized.offeredBy === 'customer' ? demand.requesterId : normalized.providerId, at: nextDemand.updatedAt });
      broadcastRealtime({ type: 'demand.updated', demandId: nextDemand.id, actorUserId: normalized.offeredBy === 'customer' ? demand.requesterId : normalized.providerId, at: nextDemand.updatedAt });
    }
    return reply.send({ ok: true, count: proposals.length });
  });

  app.post<{ Params: { id: string }; Body: { requesterId: string } }>('/api/v1/proposals/:id/accept', async (request, reply) => {
    const proposal = (await listProposals()).find((item) => item.id === request.params.id);
    if (!proposal) return reply.code(404).send({ error: 'PROPOSAL_NOT_FOUND', message: 'Proposta não encontrada.' });
    const demand = await findDemand(proposal.demandId);
    if (!demand || demand.requesterId !== request.body?.requesterId) return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'Somente o cliente pode aceitar a proposta nesta rota.' });
    return confirmProposal(request.params.id, request.body.requesterId, reply);
  });

  app.post<{ Params: { id: string }; Body: { userId: string } }>('/api/v1/proposals/:id/confirm', async (request, reply) => confirmProposal(request.params.id, request.body?.userId, reply));
}

async function confirmProposal(id: string, userId: string | undefined, reply: any) {
  if (!userId) return reply.code(400).send({ error: 'USER_REQUIRED', message: 'Informe o usuário que está confirmando.' });
  const proposals = await listProposals();
  const proposal = proposals.find((item) => item.id === id);
  if (!proposal) return reply.code(404).send({ error: 'PROPOSAL_NOT_FOUND', message: 'Proposta não encontrada.' });
  const demand = await findDemand(proposal.demandId);
  if (!demand) return reply.code(404).send({ error: 'DEMAND_NOT_FOUND', message: 'Demanda não encontrada.' });
  if (userId !== demand.requesterId && userId !== proposal.providerId) return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'Usuário não participa desta negociação.' });
  if (!['pending', 'accepted'].includes(proposal.status)) return reply.code(409).send({ error: 'PROPOSAL_UNAVAILABLE', message: 'Esta proposta não está disponível para confirmação.' });
  const now = new Date().toISOString();
  const nextProposal: Proposal = userId === demand.requesterId ? { ...proposal, customerConfirmedAt: proposal.customerConfirmedAt ?? now } : { ...proposal, providerConfirmedAt: proposal.providerConfirmedAt ?? now };
  const normalized = normalizeProposal(nextProposal);
  const bothConfirmed = Boolean(normalized.customerConfirmedAt && normalized.providerConfirmedAt);
  const nextDemand: Demand = bothConfirmed ? { ...demand, status: 'accepted', acceptedProviderId: normalized.providerId, updatedAt: now } : { ...demand, status: demand.status === 'accepted' ? 'accepted' : 'negotiating', acceptedProviderId: demand.acceptedProviderId, updatedAt: now };
  await persistProposal(normalized);
  await persistDemand(nextDemand);
  broadcastRealtime({ type: 'proposal.updated', demandId: normalized.demandId, proposalId: normalized.id, actorUserId: userId, at: now });
  broadcastRealtime({ type: 'demand.updated', demandId: nextDemand.id, actorUserId: userId, at: now });
  return reply.send({ proposal: normalized, demand: nextDemand });
}
