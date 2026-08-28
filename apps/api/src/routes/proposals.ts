import type { FastifyInstance } from 'fastify';
import type { CreateProposalInput, Demand, Proposal } from '@rubli/shared';
import { memoryStore } from '../store/memoryStore.js';
import { proposalStore } from '../store/proposalStore.js';

export async function registerProposalRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { demandId?: string } }>('/api/v1/proposals', async (request) => {
    const { demandId } = request.query;
    return demandId ? proposalStore.filter((item) => item.demandId === demandId) : proposalStore;
  });

  app.post<{ Body: CreateProposalInput }>('/api/v1/proposals', async (request, reply) => {
    const body = request.body ?? {} as CreateProposalInput;
    const demand = memoryStore.demands.find((item: Demand) => item.id === body.demandId);

    if (!demand) {
      return reply.code(404).send({ error: 'DEMAND_NOT_FOUND', message: 'Demanda não encontrada.' });
    }
    if (!body.providerId || !Number.isFinite(body.amount) || body.amount <= 0) {
      return reply.code(400).send({ error: 'INVALID_PROPOSAL', message: 'Informe o prestador e um valor maior que zero.' });
    }
    if (demand.status !== 'open' && demand.status !== 'negotiating') {
      return reply.code(409).send({ error: 'DEMAND_UNAVAILABLE', message: 'Esta demanda não está disponível para novas propostas.' });
    }
    if (proposalStore.some((item) => item.demandId === body.demandId && item.providerId === body.providerId && item.status === 'pending')) {
      return reply.code(409).send({ error: 'DUPLICATE_PROPOSAL', message: 'Você já enviou uma proposta pendente para esta demanda.' });
    }

    const proposal: Proposal = {
      id: `pro_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      demandId: body.demandId,
      providerId: body.providerId,
      amount: Math.round(body.amount * 100) / 100,
      message: body.message?.trim() || undefined,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    proposalStore.unshift(proposal);
    demand.status = 'negotiating';
    demand.updatedAt = new Date().toISOString();
    return reply.code(201).send(proposal);
  });

  app.post<{ Params: { id: string }; Body: { requesterId: string } }>('/api/v1/proposals/:id/accept', async (request, reply) => {
    const proposal = proposalStore.find((item) => item.id === request.params.id);
    if (!proposal) {
      return reply.code(404).send({ error: 'PROPOSAL_NOT_FOUND', message: 'Proposta não encontrada.' });
    }

    const demand = memoryStore.demands.find((item) => item.id === proposal.demandId);
    if (!demand || demand.requesterId !== request.body?.requesterId) {
      return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'Somente o responsável pela demanda pode aceitar a proposta.' });
    }
    if (proposal.status !== 'pending' || !['open', 'negotiating'].includes(demand.status)) {
      return reply.code(409).send({ error: 'PROPOSAL_UNAVAILABLE', message: 'Esta proposta não está disponível para aceite.' });
    }

    proposal.status = 'accepted';
    demand.status = 'accepted';
    demand.updatedAt = new Date().toISOString();

    for (const other of proposalStore) {
      if (other.demandId === demand.id && other.id !== proposal.id && other.status === 'pending') {
        other.status = 'rejected';
      }
    }

    return reply.send({ proposal, demand });
  });
}
