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

export async function registerProposalRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { demandId?: string } }>('/api/v1/proposals', async (request) => {
    return listProposals(request.query.demandId);
  });

  app.post<{ Body: CreateProposalInput }>('/api/v1/proposals', async (request, reply) => {
    const body = request.body ?? {} as CreateProposalInput;
    const demand = await findDemand(body.demandId);

    if (!demand) {
      return reply.code(404).send({ error: 'DEMAND_NOT_FOUND', message: 'Demanda não encontrada.' });
    }
    if (!body.providerId || !Number.isFinite(body.amount) || body.amount <= 0) {
      return reply.code(400).send({ error: 'INVALID_PROPOSAL', message: 'Informe o prestador e um valor maior que zero.' });
    }
    if (demand.status !== 'open' && demand.status !== 'negotiating') {
      return reply.code(409).send({ error: 'DEMAND_UNAVAILABLE', message: 'Esta demanda não está disponível para novas propostas.' });
    }

    const existing = await listProposals(body.demandId);
    if (existing.some((item) => item.providerId === body.providerId && item.status === 'pending')) {
      return reply.code(409).send({ error: 'DUPLICATE_PROPOSAL', message: 'Você já enviou uma proposta pendente para esta demanda.' });
    }

    const proposal: Proposal = {
      id: `pro_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      demandId: body.demandId,
      providerId: body.providerId,
      amount: Math.round(body.amount * 100) / 100,
      message: body.message?.trim() || undefined,
      status: 'pending',
      offeredBy: 'provider',
      version: 1,
      createdAt: new Date().toISOString(),
    };

    const db = await getDatabase();
    if (!db) {
      memoryStore.proposals.unshift(proposal);
      const localDemand = memoryStore.demands.find((item) => item.id === demand.id);
      if (localDemand) { localDemand.status = 'negotiating'; localDemand.updatedAt = proposal.createdAt; }
      return reply.code(201).send(proposal);
    }

    await db.collection<Proposal>(proposalsCollection).replaceOne({ id: proposal.id }, proposal, { upsert: true });
    await db.collection<Demand>(demandsCollection).updateOne({ id: demand.id }, { $set: { status: 'negotiating', updatedAt: proposal.createdAt } });
    return reply.code(201).send(proposal);
  });

  app.post<{ Body: { proposals: Proposal[] } }>('/api/v1/proposals/sync', async (request, reply) => {
    const proposals = Array.isArray(request.body?.proposals) ? request.body.proposals : [];
    const db = await getDatabase();
    if (!db) {
      for (const proposal of proposals) {
        const index = memoryStore.proposals.findIndex((item) => item.id === proposal.id);
        if (index >= 0) memoryStore.proposals[index] = proposal;
        else memoryStore.proposals.unshift(proposal);
      }
      return reply.send({ ok: true, count: proposals.length });
    }

    if (proposals.length > 0) {
      await db.collection<Proposal>(proposalsCollection).bulkWrite(proposals.map((proposal) => ({
        replaceOne: { filter: { id: proposal.id }, replacement: proposal, upsert: true },
      })));
    }
    return reply.send({ ok: true, count: proposals.length });
  });

  app.post<{ Params: { id: string }; Body: { requesterId: string } }>('/api/v1/proposals/:id/accept', async (request, reply) => {
    const db = await getDatabase();
    const proposals = await listProposals();
    const proposal = proposals.find((item) => item.id === request.params.id);
    if (!proposal) return reply.code(404).send({ error: 'PROPOSAL_NOT_FOUND', message: 'Proposta não encontrada.' });

    const demand = await findDemand(proposal.demandId);
    if (!demand || demand.requesterId !== request.body?.requesterId) {
      return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'Somente o responsável pela demanda pode aceitar a proposta.' });
    }
    if (proposal.status !== 'pending' || !['open', 'negotiating'].includes(demand.status)) {
      return reply.code(409).send({ error: 'PROPOSAL_UNAVAILABLE', message: 'Esta proposta não está disponível para aceite.' });
    }

    const now = new Date().toISOString();
    const accepted = { ...proposal, status: 'accepted' as const, customerConfirmedAt: now };
    const rejected = proposals.filter((item) => item.demandId === demand.id && item.id !== proposal.id && item.status === 'pending').map((item) => ({ ...item, status: 'rejected' as const }));
    const next = [accepted, ...rejected];

    if (!db) {
      memoryStore.proposals.splice(0, memoryStore.proposals.length, ...memoryStore.proposals.map((item) => next.find((candidate) => candidate.id === item.id) ?? item));
      const localDemand = memoryStore.demands.find((item) => item.id === demand.id);
      if (localDemand) { localDemand.status = 'accepted'; localDemand.acceptedProviderId = proposal.providerId; localDemand.updatedAt = now; }
    } else {
      await db.collection<Proposal>(proposalsCollection).replaceOne({ id: accepted.id }, accepted, { upsert: true });
      for (const item of rejected) await db.collection<Proposal>(proposalsCollection).replaceOne({ id: item.id }, item, { upsert: true });
      await db.collection<Demand>(demandsCollection).updateOne({ id: demand.id }, { $set: { status: 'accepted', acceptedProviderId: proposal.providerId, updatedAt: now } });
    }

    return reply.send({ proposal: accepted, demand: { ...demand, status: 'accepted', acceptedProviderId: proposal.providerId, updatedAt: now } });
  });
}
