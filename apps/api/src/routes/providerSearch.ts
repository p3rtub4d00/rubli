import type { FastifyInstance } from 'fastify';
import { distanceKm, normalizeCategoryKey, type User } from '@rubli/shared';
import { getDatabase } from '../store/database.js';
import { memoryStore } from '../store/memoryStore.js';
import { professionalMetrics, requireRole } from './auth.js';

type Sort = 'relevant' | 'distance' | 'rating' | 'completed' | 'available';
const number = (value: unknown) => typeof value === 'string' ? Number(value) : Number.NaN;

/** Busca Premium paginada. A rotação usa uma janela diária determinística para
 * não monopolizar os seis cards iniciais sem trocar a ordem a cada render. */
export async function registerProviderSearchRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { query?: string; category?: string; providerType?: string; latitude?: string; longitude?: string; radius?: string; minRating?: string; available?: string; verified?: string; sort?: Sort; page?: string; limit?: string } }>('/api/v1/providers/search', { preHandler: requireRole('customer') }, async (request, reply) => {
    const q = request.query ?? {};
    const page = Math.max(1, Math.floor(number(q.page) || 1));
    const limit = Math.min(20, Math.max(1, Math.floor(number(q.limit) || 10)));
    const latitude = number(q.latitude); const longitude = number(q.longitude);
    const radius = Math.min(100, Math.max(1, number(q.radius) || 50));
    const category = normalizeCategoryKey(q.category || q.query || '');
    const db = await getDatabase();
    const users = db ? await db.collection<User>('users').find({ role: 'provider', providerPlan: 'premium_verified' }).toArray() : memoryStore.users.filter((user) => user.role === 'provider' && user.providerPlan === 'premium_verified');
    const values = await Promise.all(users.map(async (user) => {
      const metrics = await professionalMetrics(user);
      const distance = Number.isFinite(latitude) && Number.isFinite(longitude) && user.serviceLatitude !== undefined && user.serviceLongitude !== undefined ? distanceKm({ latitude, longitude }, { latitude: user.serviceLatitude, longitude: user.serviceLongitude }) : undefined;
      return { user, metrics, distanceKm: distance };
    }));
    const filtered = values.filter(({ user, metrics, distanceKm }) => {
      const type = user.providerType ?? 'services';
      const haystack = normalizeCategoryKey(`${user.name} ${user.professionalTitle ?? ''} ${(user.serviceCategories ?? []).join(' ')}`);
      if (q.providerType && type !== q.providerType) return false;
      if (category && !haystack.includes(category) && !((category.includes('motoboy') || category.includes('entrega')) && type === 'courier') && !(category.includes('frete') && type === 'freight')) return false;
      if (distanceKm !== undefined && distanceKm > Math.min(radius, user.serviceRadiusKm ?? radius)) return false;
      if (Number.isFinite(latitude) && distanceKm === undefined) return false;
      if (q.available === 'true' && user.isAvailable === false) return false;
      if (q.verified === 'true' && user.verificationStatus !== 'simulated_verified') return false;
      if (Number.isFinite(number(q.minRating)) && (metrics.averageRating ?? 0) < number(q.minRating)) return false;
      return true;
    });
    const sort = q.sort ?? 'relevant';
    const day = Math.floor(Date.now() / 86_400_000);
    filtered.sort((a, b) => {
      const av = a.user.isAvailable === false ? 0 : 1; const bv = b.user.isAvailable === false ? 0 : 1;
      const ad = a.distanceKm ?? Infinity; const bd = b.distanceKm ?? Infinity;
      if (sort === 'distance') return ad - bd;
      if (sort === 'rating') return (b.metrics.averageRating ?? -1) - (a.metrics.averageRating ?? -1) || ad - bd;
      if (sort === 'completed') return b.metrics.completedServices - a.metrics.completedServices || ad - bd;
      if (sort === 'available') return bv - av || ad - bd;
      return bv - av || ad - bd || (b.user.verificationStatus === 'simulated_verified' ? 1 : 0) - (a.user.verificationStatus === 'simulated_verified' ? 1 : 0) || (b.metrics.averageRating ?? -1) - (a.metrics.averageRating ?? -1) || ((a.user.id.charCodeAt(0) + day) % 7) - ((b.user.id.charCodeAt(0) + day) % 7);
    });
    const items = filtered.slice((page - 1) * limit, page * limit).map(({ user, metrics, distanceKm }) => ({ id: user.id, name: user.name, avatarUri: user.avatarUri, city: user.city, providerType: user.providerType ?? 'services', professionalTitle: user.professionalTitle, serviceCategories: (user.serviceCategories ?? []).slice(0, 3), extraCategoriesCount: Math.max(0, (user.serviceCategories?.length ?? 0) - 3), isAvailable: user.isAvailable !== false, verificationStatus: user.verificationStatus, distanceKm: distanceKm === undefined ? undefined : Math.round(distanceKm * 10) / 10, metrics }));
    return reply.send({ items, total: filtered.length, page, limit, nextPage: page * limit < filtered.length ? page + 1 : undefined });
  });
}
