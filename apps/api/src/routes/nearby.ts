import type { FastifyInstance } from 'fastify';
import { distanceKm, isValidCoordinates } from '@rubli/shared/src/geo.js';
import { memoryStore } from '../store/memoryStore.js';

const DEFAULT_RADIUS_KM = 10;
const MAX_RADIUS_KM = 100;

export async function registerNearbyRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { latitude?: string; longitude?: string; radiusKm?: string; type?: string; urgentOnly?: string } }>(
    '/api/v1/demands/nearby',
    async (request, reply) => {
      const latitude = Number(request.query.latitude);
      const longitude = Number(request.query.longitude);
      const radiusKm = Math.min(
        Math.max(Number(request.query.radiusKm) || DEFAULT_RADIUS_KM, 1),
        MAX_RADIUS_KM,
      );

      if (!isValidCoordinates(latitude, longitude)) {
        return reply.code(400).send({
          error: 'INVALID_COORDINATES',
          message: 'Informe latitude e longitude válidas.',
        });
      }

      const type = request.query.type;
      const urgentOnly = request.query.urgentOnly === 'true';

      const results = memoryStore.demands
        .filter((demand) => demand.status === 'open' || demand.status === 'negotiating')
        .filter((demand) => !type || demand.type === type)
        .filter((demand) => !urgentOnly || demand.isUrgent === true)
        .filter((demand) => isValidCoordinates(demand.latitude, demand.longitude))
        .map((demand) => ({
          demand,
          distanceKm: distanceKm(
            { latitude, longitude },
            { latitude: demand.latitude!, longitude: demand.longitude! },
          ),
        }))
        .filter((item) => item.distanceKm <= radiusKm)
        .sort((a, b) => {
          if (Boolean(b.demand.isUrgent) !== Boolean(a.demand.isUrgent)) {
            return Number(Boolean(b.demand.isUrgent)) - Number(Boolean(a.demand.isUrgent));
          }
          return a.distanceKm - b.distanceKm;
        });

      return {
        center: { latitude, longitude },
        radiusKm,
        count: results.length,
        items: results.map((item) => ({
          ...item.demand,
          distanceKm: Math.round(item.distanceKm * 10) / 10,
        })),
      };
    },
  );
}
