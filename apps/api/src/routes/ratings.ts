import type { FastifyInstance } from 'fastify';
import type { Demand, Rating } from '@rubli/shared';
import { getDatabase } from '../store/database.js';
import { memoryStore } from '../store/memoryStore.js';
import { broadcastRealtime } from '../realtime.js';

const ratingsCollection = 'ratings';

async function listRatings() {
  const db = await getDatabase();
  if (!db) return memoryStore.ratings;
  return db.collection<Rating>(ratingsCollection).find({}).sort({ createdAt: -1 }).toArray();
}

export async function registerRatingRoutes(app: FastifyInstance) {
  app.get('/api/v1/ratings', async () => listRatings());

  app.post<{ Body: { demandId?: string; fromUserId?: string; stars?: number; comment?: string } }>('/api/v1/ratings', async (request, reply) => {
    const { demandId, fromUserId, stars, comment } = request.body ?? {};
    if (!demandId || !fromUserId || typeof stars !== 'number' || !Number.isInteger(stars) || stars < 1 || stars > 5) return reply.code(400).send({ error: 'INVALID_RATING', message: 'Informe demanda, avaliador e nota de 1 a 5.' });
    if (comment && comment.trim().length > 1000) return reply.code(400).send({ error: 'COMMENT_TOO_LONG', message: 'O comentário pode ter até 1000 caracteres.' });
    const db = await getDatabase();
    const demand = db ? await db.collection<Demand>('demands').findOne({ id: demandId }) : memoryStore.demands.find((item) => item.id === demandId);
    if (!demand) return reply.code(404).send({ error: 'DEMAND_NOT_FOUND', message: 'Demanda não encontrada.' });
    if (demand.status !== 'completed' || !demand.acceptedProviderId) return reply.code(409).send({ error: 'SERVICE_NOT_COMPLETED', message: 'A avaliação é liberada após a conclusão confirmada pelo cliente.' });
    const participants = [demand.requesterId, demand.acceptedProviderId];
    if (!participants.includes(fromUserId)) return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'Somente participantes do serviço podem avaliar.' });
    const toUserId = fromUserId === demand.requesterId ? demand.acceptedProviderId : demand.requesterId;
    const existing = db ? await db.collection<Rating>(ratingsCollection).findOne({ demandId, fromUserId }) : memoryStore.ratings.find((item) => item.demandId === demandId && item.fromUserId === fromUserId);
    if (existing) return reply.code(409).send({ error: 'RATING_ALREADY_EXISTS', message: 'Você já avaliou este serviço.' });
    const rating: Rating = { id: `rat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, demandId, fromUserId, toUserId, stars: stars as Rating['stars'], comment: comment?.trim() || undefined, createdAt: new Date().toISOString() };
    if (db) await db.collection<Rating>(ratingsCollection).insertOne(rating);
    else memoryStore.ratings.unshift(rating);
    broadcastRealtime({ type: 'rating.created', demandId, actorUserId: fromUserId, at: rating.createdAt });
    return reply.code(201).send(rating);
  });
}
