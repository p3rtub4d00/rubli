import type { FastifyInstance } from 'fastify';
import type { CreateProposalInput, Demand, Proposal } from '@rubli/shared';
import { memoryStore } from '../store/memoryStore.js';
import { getDatabase } from '../store/database.js';

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

async function syncProposalState(proposal: Proposal) {
  await persistProposal(proposal);
  if (proposal.status !== 'accepted') return;

  const db = await getDatabase();
  if (!db) {
    const demand = memoryStore.demands.find((item) => item.id === proposal.demandId);
    if (demand) {
      demand.status = 'accepted';
      demand.acceptedProviderId = proposal.providerId;
      demand.updatedAt = new Date().toISOString();
    }
    for (const item of memoryStore.proposals) {
      if (item.demandId === proposal.demandId && item.id !== proposal.id && item.status === 'pending') item.status = 'rejected';
    }
    return;
  }

  const now = new Date().toISOString();
  await db.collection<Demand>(demandsCollection).updateOne(
    { id: proposal.demandId },
    { $set: { status: 'accepted', acceptedProviderId: proposal.providerId, updatedAt: now } },
  );
  await db.collection<Proposal>(proposalsCollection).updateMany(
    { demandId: proposal.demandId, id: { $ne: proposal.id }, status: 'pending' },
    { $set: { status: 'rejected' } },
  );
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

    const db = await getDatabase();
    if (!db) {
      const localDemand = memoryStore.demands.find((item) => item.id === demand.id);
      if (localDemand) { localDemand.status = 'negotiating'; localDemand.updatedAt = proposal.createdAt; }
    } else {
      await db.collection<Demand>(demandsCollection).updateOne({ id: demand.id }, { $set: { status: 'negotiating', updatedAt: proposal.createdAt } });
    }
    return reply.code(201).send(proposal);
  });

  app.post<{ Body: { proposals: Proposal[] } }>('/api/v1/proposals/sync', async (request, reply) => {
    const proposals = Array.isArray(request.body?.proposals) ? request.body.proposals : [];
    for (const proposal of proposals) await syncProposalState(proposal);
    return reply.send({ ok: true, count: proposals.length });
  });

  app.post<{ Params: { id: string }; Body: { requesterId: string } }>('/api/v1/proposals/:id/accept', async (request, reply) => {
    const proposal = (await listProposals()).find((item) => item.id === request.params.id);
    if (!proposal) return reply.code(404).send({ error: 'PROPOSAL_NOT_FOUND', message: 'Proposta não encontrada.' });
    const demand = await findDemand(proposal.demandId);
    if (!demand || demand.requesterId !== request.body?.requesterId) return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'Somente o responsável pela demanda pode aceitar a proposta.' });
    if (proposal.status !== 'pending' || !['open', 'negotiating'].includes(demand.status)) return reply.code(409).send({ error: 'PROPOSAL_UNAVAILABLE', message: 'Esta proposta não está disponível para aceite.' });

    const now = new Date().toISOString();
    const accepted = { ...proposal, status: 'accepted' as const, customerConfirmedAt: now, providerConfirmedAt: now };
    await syncProposalState(accepted);

    const updatedDemand = { ...demand, status: 'accepted' as const, acceptedProviderId: proposal.providerId, updatedAt: now };
    const db = await getDatabase();
    if (db) await db.collection<Demand>(demandsCollection).updateOne({ id: demand.id }, { $set: updatedDemand });
    else {
      const local = memoryStore.demands.find((item) => item.id === demand.id);
      if (local) Object.assign(local, updatedDemand);
    }
    return reply.send({ proposal: accepted, demand: updatedDemand });
  });
}
