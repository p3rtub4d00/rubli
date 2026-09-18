import type { FastifyInstance } from 'fastify';
import type { Demand, Proposal } from '@rubli/shared';
import { getDatabase } from '../store/database.js';
import { memoryStore } from '../store/memoryStore.js';
import { matchingDemandsForProvider } from '../services/matching.js';
import { requireRole } from './auth.js';
import { demandForUser } from '../services/demandPrivacy.js';

async function proposalsForPrivacy() {
  const db = await getDatabase();
  return db ? db.collection<Proposal>('proposals').find({}).toArray() : memoryStore.proposals;
}

export async function registerNearbyRoutes(app: FastifyInstance) {
  app.get('/api/v1/providers/me/opportunities', { preHandler: requireRole('provider') }, async (request) => {
    const provider = request.authUser!;
    const db = await getDatabase();
    const demands = db ? await db.collection<Demand>('demands').find({}).toArray() : memoryStore.demands;
    const [results, proposals] = await Promise.all([matchingDemandsForProvider(provider, demands), proposalsForPrivacy()]);
    const hasLocation = provider.serviceLatitude !== undefined && provider.serviceLongitude !== undefined;
    return {
      locationRequired: !hasLocation,
      radiusKm: provider.serviceRadiusKm ?? 10,
      items: results.map((item) => ({ ...demandForUser(item.demand, provider, proposals), distanceKm: Math.round(item.distanceKm * 10) / 10 })),
    };
  });

  app.get<{ Querystring: { type?: string; urgentOnly?: string } }>(
    '/api/v1/demands/nearby',
    { preHandler: requireRole('provider') },
    async (request) => {
      // Compatibilidade para clientes antigos: não confiamos mais em
      // coordenadas recebidas pela query. O centro vem do perfil autenticado.
      const provider = request.authUser!;
      const db = await getDatabase();
      const demands = db ? await db.collection<Demand>('demands').find({}).toArray() : memoryStore.demands;
      const [matches, proposals] = await Promise.all([matchingDemandsForProvider(provider, demands), proposalsForPrivacy()]);
      const results = matches
        .filter((match) => !request.query.type || match.demand.type === request.query.type)
        .filter((match) => request.query.urgentOnly !== 'true' || match.demand.isUrgent === true);

      return {
        center: provider.serviceLatitude !== undefined && provider.serviceLongitude !== undefined
          ? { latitude: provider.serviceLatitude, longitude: provider.serviceLongitude }
          : null,
        radiusKm: provider.serviceRadiusKm ?? 10,
        count: results.length,
        items: results.map((item) => ({ ...demandForUser(item.demand, provider, proposals), distanceKm: Math.round(item.distanceKm * 10) / 10 })),
      };
    },
  );
}
