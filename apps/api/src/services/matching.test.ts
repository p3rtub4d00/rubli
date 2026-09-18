import { describe, expect, it } from 'vitest';
import type { Demand, User } from '@rubli/shared';
import { matchDemandToProviders, matchProviderToDemand, rankProviderDemands } from './matching.js';

const now = new Date('2026-09-16T12:00:00.000Z');
const demand = (overrides: Partial<Demand> = {}): Demand => ({
  id: 'dem_electrical', requesterId: 'customer_1', type: 'service', title: 'Troca de disjuntor', description: 'Preciso de um eletricista', category: 'Elétrica', budgetType: 'open', locationLabel: 'Centro', latitude: -8.7608, longitude: -63.8999, status: 'open', createdAt: '2026-09-16T10:00:00.000Z', updatedAt: '2026-09-16T10:00:00.000Z', ...overrides,
});
const provider = (overrides: Partial<User> = {}): User => ({
  id: 'provider_1', name: 'Prestador', role: 'provider', serviceCategories: ['eletrica'], serviceRadiusKm: 10, serviceLatitude: -8.7608, serviceLongitude: -63.8727, isAvailable: true, providerSubscriptionStatus: 'simulated_active', createdAt: now.toISOString(), ...overrides,
});

describe('matching inteligente v1', () => {
  it('envia demanda elétrica ao eletricista a aproximadamente 3 km', () => {
    expect(matchDemandToProviders(demand(), [provider()], now)).toHaveLength(1);
  });

  it('não envia quando a distância ultrapassa o raio de atendimento', () => {
    expect(matchDemandToProviders(demand(), [provider({ serviceLatitude: -8.5000, serviceLongitude: -63.8999, serviceRadiusKm: 10 })], now)).toHaveLength(0);
  });

  it('não confunde categorias diferentes', () => {
    expect(matchDemandToProviders(demand(), [provider({ serviceCategories: ['Hidráulica'] })], now)).toHaveLength(0);
  });

  it('considera Frete uma área ampla para subcategorias de frete', () => {
    const freight = demand({ type: 'freight', category: 'Carga leve' });
    expect(matchDemandToProviders(freight, [provider({ serviceCategories: ['Frete'] })], now)).toHaveLength(1);
  });

  it('mantém courier legado elegível para Entrega quando ainda não há área salva', () => {
    const courier = provider({ providerType: 'courier', serviceCategories: [], serviceCategoryIds: [] });
    expect(matchDemandToProviders(demand({ type: 'delivery', category: 'Entrega expressa' }), [courier], now)).toHaveLength(1);
    expect(matchDemandToProviders(demand({ type: 'freight', category: 'Frete leve' }), [courier], now)).toHaveLength(0);
  });

  it('mantém freight legado elegível para Frete quando ainda não há área salva', () => {
    const freightProvider = provider({ providerType: 'freight', serviceCategories: [], serviceCategoryIds: [] });
    expect(matchDemandToProviders(demand({ type: 'freight', category: 'Mudança residencial' }), [freightProvider], now)).toHaveLength(1);
    expect(matchDemandToProviders(demand({ type: 'delivery', category: 'Entrega expressa' }), [freightProvider], now)).toHaveLength(0);
  });

  it('não envia para prestador indisponível', () => {
    expect(matchDemandToProviders(demand(), [provider({ isAvailable: false })], now)).toHaveLength(0);
  });

  it('envia uma subcategoria personalizada somente ao prestador que a cadastrou', () => {
    const customDemand = demand({ category: 'rafael3' });
    expect(matchDemandToProviders(customDemand, [provider({ serviceCategories: ['rafael3'] })], now)).toHaveLength(1);
    expect(matchDemandToProviders(customDemand, [provider({ serviceCategories: ['Limpeza'] })], now)).toHaveLength(0);
  });

  it('prioriza o ID canônico do catálogo quando a demanda e o perfil já foram migrados', () => {
    const cameraDemand = demand({ category: 'Instalação de câmeras', categoryId: 'provider_service_instalacao_de_cameras' });
    const cameraProvider = provider({ serviceCategories: ['Instalação de câmeras'], serviceCategoryIds: ['provider_service_instalacao_de_cameras'] });
    expect(matchDemandToProviders(cameraDemand, [cameraProvider], now)).toHaveLength(1);
  });

  it('mantém compatibilidade com dados legados de texto, ignorando acentos e caixa', () => {
    const result = matchProviderToDemand(provider({ serviceCategories: ['ELÉTRICA'] }), demand({ category: 'eletrica' }), { now });
    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual(['CATEGORY_MATCH']);
  });

  it('aceita qualquer uma das diversas áreas reais salvas no mesmo perfil', () => {
    const multiAreaProvider = provider({ serviceCategories: ['Frete', 'Hidráulica', 'Elétrica'] });
    expect(matchDemandToProviders(demand(), [multiAreaProvider], now)).toHaveLength(1);
    expect(matchDemandToProviders(demand({ type: 'freight', category: 'Mudança residencial' }), [multiAreaProvider], now)).toHaveLength(1);
  });

  it('explica quando o prestador ficou inelegível por assinatura expirada', () => {
    const result = matchProviderToDemand(provider({ providerSubscriptionStatus: 'trialing', trialEndsAt: '2026-09-15T12:00:00.000Z' }), demand(), { now });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('SUBSCRIPTION_INACTIVE');
  });

  it('nunca distribui para o próprio criador da demanda', () => {
    const result = matchProviderToDemand(provider({ id: 'customer_1' }), demand(), { now });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('OWN_DEMAND');
  });

  it('prioriza urgência, distância e depois recência', () => {
    const ordinaryNear = matchDemandToProviders(demand({ id: 'ordinary-near', isUrgent: false, createdAt: '2026-09-16T11:00:00.000Z' }), [provider()], now)[0];
    const urgentFar = matchDemandToProviders(demand({ id: 'urgent-far', isUrgent: true, latitude: -8.7608, longitude: -63.8500, createdAt: '2026-09-16T09:00:00.000Z' }), [provider()], now)[0];
    const ordered = rankProviderDemands([ordinaryNear, urgentFar]);
    expect(ordered.map((item) => item.demand.id)).toEqual(['urgent-far', 'ordinary-near']);
  });
});
