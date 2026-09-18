import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAuthRoutes, withLegacyProviderType } from './auth.js';
import { registerDemandRoutes } from './demands.js';
import { registerProposalRoutes } from './proposals.js';
import { registerSchedulingRoutes } from './scheduling.js';
import { registerNearbyRoutes } from './nearby.js';
import { registerProviderCategoryRoutes } from './providerCategories.js';
import { memoryStore } from '../store/memoryStore.js';
import type { ProviderType } from '@rubli/shared';

const customer = { name: 'Cliente de teste', email: 'cliente-auth@example.test', phone: '6999999999', password: 'senha-segura', role: 'customer', taxDocument: '52998224725' } as const;
const provider = { name: 'Prestador de teste', email: 'prestador-auth@example.test', phone: '6899999999', password: 'senha-segura', role: 'provider', providerType: 'services', taxDocument: '52998224725', taxDocumentType: 'cpf' } as const;
const serviceAddress = { postalCode: '76801-000', street: 'Rua de teste', number: '123', neighborhood: 'Centro', city: 'Porto Velho', state: 'RO', latitude: -8.7608, longitude: -63.8999 };

async function appForTest() {
  const app = Fastify();
  await registerAuthRoutes(app);
  await registerDemandRoutes(app);
  await registerProposalRoutes(app);
  await registerSchedulingRoutes(app);
  await registerNearbyRoutes(app);
  await registerProviderCategoryRoutes(app);
  return app;
}
type RegistrationInput = { name: string; email: string; phone: string; password: string; role: 'customer' | 'provider'; taxDocument: string; taxDocumentType?: 'cpf' | 'cnpj'; providerType?: ProviderType };
async function session(app: Awaited<ReturnType<typeof appForTest>>, account: RegistrationInput) {
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { ...account, email: `${Date.now()}-${Math.random().toString(36).slice(2)}-${account.email}` } });
  return response.json() as { accessToken: string; refreshToken: string };
}

describe('autenticação de sessão', () => {
  beforeEach(() => { memoryStore.users.splice(0); memoryStore.demands.splice(0); memoryStore.proposals.splice(0); memoryStore.scheduleChanges.splice(0); });

  it('emite tokens e rejeita senha errada, token ausente e token inválido', async () => {
    const app = await appForTest();
    const created = await session(app, customer);
    expect(created.accessToken).toBeTruthy();
    expect(created.refreshToken).toBeTruthy();
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: customer.email, password: 'incorreta' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/me' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: 'Bearer alterado' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${created.accessToken}` } })).statusCode).toBe(200);
    await app.close();
  });

  it('exige modalidade para prestador e aceita as três modalidades canônicas', async () => {
    const app = await appForTest();
    const base = { ...provider, email: `modalidade-${Date.now()}@example.test` };
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { ...base, providerType: undefined } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { ...base, email: `invalida-${Date.now()}@example.test`, providerType: 'invalid' } })).statusCode).toBe(400);
    for (const providerType of ['services', 'courier', 'freight']) {
      const response = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { ...base, email: `${providerType}-${Date.now()}-${Math.random()}@example.test`, providerType } });
      expect(response.statusCode).toBe(201);
      expect((response.json() as { user: { providerType: string } }).user.providerType).toBe(providerType);
    }
    await app.close();
  });

  it('mantém prestador legado acessível com fallback services sem gravar alteração', async () => {
    const legacy = { id: 'usr_legado_provider_type', name: 'Legado', role: 'provider' as const, email: 'legado@example.test', createdAt: new Date().toISOString() };
    memoryStore.users.push(legacy);
    expect(withLegacyProviderType(legacy)?.providerType).toBe('services');
    expect(memoryStore.users.find((user) => user.id === legacy.id)?.providerType).toBeUndefined();
  });

  it('protege a modalidade profissional e valida veículo conforme courier/freight', async () => {
    const app = await appForTest();
    const courier = await session(app, { ...provider, providerType: 'courier', email: 'courier-profile@example.test' });
    const courierHeaders = { authorization: `Bearer ${courier.accessToken}` };
    const courierUser = (await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: courierHeaders })).json() as { user: { id: string } };
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/users/${courierUser.user.id}/profile`, headers: courierHeaders, payload: { providerType: 'services' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/users/${courierUser.user.id}/profile`, headers: courierHeaders, payload: { providerVehicle: { type: 'motorcycle', brand: 'Honda', model: 'CG', plate: 'ABC1D23' } } })).statusCode).toBe(200);
    const freight = await session(app, { ...provider, providerType: 'freight', email: 'freight-profile@example.test' });
    const freightHeaders = { authorization: `Bearer ${freight.accessToken}` };
    const freightUser = (await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: freightHeaders })).json() as { user: { id: string } };
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/users/${freightUser.user.id}/profile`, headers: freightHeaders, payload: { providerVehicle: { type: 'van' } } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/users/${freightUser.user.id}/profile`, headers: freightHeaders, payload: { providerVehicle: { type: 'van', loadCapacityKg: 1500 } } })).statusCode).toBe(200);
    await app.close();
  });

  it('rejeita access token expirado', async () => {
    const app = await appForTest();
    const created = await session(app, customer);
    const realNow = Date.now;
    vi.spyOn(Date, 'now').mockReturnValue(realNow() + 60 * 60 * 1000);
    try {
      expect((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${created.accessToken}` } })).statusCode).toBe(401);
    } finally { vi.restoreAllMocks(); }
    await app.close();
  });

  it('rotaciona refresh token e o invalida no logout', async () => {
    const app = await appForTest();
    const created = await session(app, customer);
    const refreshed = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: created.refreshToken } });
    expect(refreshed.statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: created.refreshToken } })).statusCode).toBe(401);
    const next = refreshed.json() as { refreshToken: string };
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', payload: { refreshToken: next.refreshToken } })).statusCode).toBe(204);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: next.refreshToken } })).statusCode).toBe(401);
    await app.close();
  });

  it('impede cliente de enviar proposta e prestador de cancelar demanda de terceiro', async () => {
    const app = await appForTest();
    const client = await session(app, customer);
    const professional = await session(app, provider);
    expect((await app.inject({ method: 'POST', url: '/api/v1/demands', headers: { authorization: `Bearer ${client.accessToken}` }, payload: { id: 'dem_auth_test', type: 'service', title: 'Troca de torneira', description: 'Preciso de ajuda', category: 'Hidráulica', locationLabel: 'Centro', serviceAddress } })).statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: '/api/v1/proposals', headers: { authorization: `Bearer ${client.accessToken}` }, payload: { demandId: 'dem_auth_test', amount: 100 } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/v1/demands/dem_auth_test/cancel', headers: { authorization: `Bearer ${professional.accessToken}` } })).statusCode).toBe(403);
    await app.close();
  });

  it('aceita comando de proposta autenticado sem corpo JSON', async () => {
    const app = await appForTest();
    const client = await session(app, customer);
    const professional = await session(app, provider);
    await app.inject({ method: 'POST', url: '/api/v1/demands', headers: { authorization: `Bearer ${client.accessToken}` }, payload: { id: 'dem_auth_accept', type: 'service', title: 'Troca de torneira', description: 'Preciso de ajuda', category: 'Hidráulica', locationLabel: 'Centro', budget: 100, serviceAddress } });
    const proposal = await app.inject({ method: 'POST', url: '/api/v1/demands/dem_auth_accept/accept-budget', headers: { authorization: `Bearer ${professional.accessToken}` } });
    expect(proposal.statusCode).toBe(201);
    const proposalId = (proposal.json() as { proposal: { id: string } }).proposal.id;
    expect((await app.inject({ method: 'POST', url: `/api/v1/proposals/${proposalId}/accept`, headers: { authorization: `Bearer ${client.accessToken}` } })).statusCode).toBe(200);
    await app.close();
  });

  it('persiste uma única área personalizada e mantém a seleção vazia quando o prestador desmarca todas', async () => {
    const app = await appForTest();
    const professional = await session(app, provider);
    const headers = { authorization: `Bearer ${professional.accessToken}` };
    const current = (await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers })).json() as { user: { id: string } };
    const custom = await app.inject({ method: 'PATCH', url: `/api/v1/users/${current.user.id}/profile`, headers, payload: { serviceCategories: ['rafael3'] } });
    expect(custom.statusCode).toBe(200);
    expect((custom.json() as { serviceCategories: string[] }).serviceCategories).toEqual(['rafael3']);
    const empty = await app.inject({ method: 'PATCH', url: `/api/v1/users/${current.user.id}/profile`, headers, payload: { serviceCategories: [] } });
    expect(empty.statusCode).toBe(200);
    expect((empty.json() as { serviceCategories: string[] }).serviceCategories).toEqual([]);
    const reloaded = (await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers })).json() as { user: { serviceCategories?: string[] } };
    expect(reloaded.user.serviceCategories).toEqual([]);
    await app.close();
  });

  it('persiste o ID canônico da nova área e a usa no feed autenticado do prestador', async () => {
    const app = await appForTest();
    const client = await session(app, customer);
    const professional = await session(app, provider);
    const providerHeaders = { authorization: `Bearer ${professional.accessToken}` };
    const customerHeaders = { authorization: `Bearer ${client.accessToken}` };
    const categoryName = `Cuidador ${Date.now()}`;
    const categoryResponse = await app.inject({ method: 'POST', url: '/api/v1/provider-categories', headers: providerHeaders, payload: { name: categoryName, type: 'service' } });
    expect(categoryResponse.statusCode).toBe(201);
    const category = categoryResponse.json() as { id: string };
    const current = (await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: providerHeaders })).json() as { user: { id: string } };
    const profileResponse = await app.inject({ method: 'PATCH', url: `/api/v1/users/${current.user.id}/profile`, headers: providerHeaders, payload: { serviceCategories: [categoryName], serviceLatitude: -8.7608, serviceLongitude: -63.8727, serviceRadiusKm: 10 } });
    expect(profileResponse.statusCode).toBe(200);
    expect((profileResponse.json() as { serviceCategoryIds: string[] }).serviceCategoryIds).toEqual([category.id]);
    const created = await app.inject({ method: 'POST', url: '/api/v1/demands', headers: customerHeaders, payload: { id: `dem_custom_${Date.now()}`, type: 'service', title: 'Preciso de cuidador', description: 'Atendimento domiciliar', category: categoryName, locationLabel: 'Centro', serviceAddress } });
    expect(created.statusCode).toBe(201);
    const feed = await app.inject({ method: 'GET', url: '/api/v1/providers/me/opportunities', headers: providerHeaders });
    expect(feed.statusCode).toBe(200);
    expect((feed.json() as { items: Array<{ categoryId?: string }> }).items.some((item) => item.categoryId === category.id)).toBe(true);
    await app.close();
  });

  it('permite que prestador proponha horário e cliente confirme, e o caminho inverso no reagendamento', async () => {
    const app = await appForTest();
    const client = await session(app, customer);
    const professional = await session(app, provider);
    const customerHeaders = { authorization: `Bearer ${client.accessToken}` };
    const providerHeaders = { authorization: `Bearer ${professional.accessToken}` };
    await app.inject({ method: 'POST', url: '/api/v1/demands', headers: customerHeaders, payload: { id: 'dem_schedule', type: 'service', title: 'Troca de torneira', description: 'Preciso de ajuda', category: 'Hidráulica', locationLabel: 'Centro', budget: 100, serviceAddress } });
    const offered = await app.inject({ method: 'POST', url: '/api/v1/demands/dem_schedule/accept-budget', headers: providerHeaders });
    expect(offered.statusCode).toBe(201);
    const proposalId = (offered.json() as { proposal: { id: string } }).proposal.id;
    await app.inject({ method: 'POST', url: `/api/v1/proposals/${proposalId}/accept`, headers: customerHeaders });
    await app.inject({ method: 'POST', url: `/api/v1/proposals/${proposalId}/confirm`, headers: providerHeaders });

    const proposed = await app.inject({ method: 'POST', url: '/api/v1/demands/dem_schedule/schedule/propose', headers: providerHeaders, payload: { scheduledAt: '2030-09-18T14:30:00.000Z' } });
    expect(proposed.statusCode).toBe(201);
    expect((proposed.json() as { demand: { scheduleStatus: string } }).demand.scheduleStatus).toBe('pending');
    const accepted = await app.inject({ method: 'POST', url: '/api/v1/demands/dem_schedule/schedule/respond', headers: customerHeaders, payload: { action: 'accept' } });
    expect(accepted.statusCode).toBe(200);
    expect((accepted.json() as { demand: { scheduleStatus: string } }).demand.scheduleStatus).toBe('confirmed');

    const rescheduled = await app.inject({ method: 'POST', url: '/api/v1/demands/dem_schedule/schedule/propose', headers: customerHeaders, payload: { scheduledAt: '2030-09-19T09:00:00.000Z' } });
    expect(rescheduled.statusCode).toBe(201);
    const confirmed = await app.inject({ method: 'POST', url: '/api/v1/demands/dem_schedule/schedule/respond', headers: providerHeaders, payload: { action: 'accept' } });
    expect(confirmed.statusCode).toBe(200);
    expect((confirmed.json() as { demand: { scheduledAt: string } }).demand.scheduledAt).toBe('2030-09-19T09:00:00.000Z');
    await app.close();
  });
});
