import { describe, expect, it } from 'vitest';
import type { Demand, Proposal, User } from '@rubli/shared';
import { demandForUser } from './demandPrivacy.js';

const demand: Demand = { id: 'dem_private', requesterId: 'customer', type: 'service', title: 'Reparo', description: 'x', category: 'Elétrica', budgetType: 'open', locationLabel: 'Centro · Porto Velho - RO', latitude: -8.76, longitude: -63.89, serviceAddress: { postalCode: '76801-000', street: 'Rua X', number: '123', complement: 'Casa 2', neighborhood: 'Centro', city: 'Porto Velho', state: 'RO', latitude: -8.76, longitude: -63.89 }, status: 'accepted', acceptedProviderId: 'provider_a', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
const provider = (id: string): User => ({ id, name: id, role: 'provider', createdAt: '2026-01-01' });
const agreement: Proposal = { id: 'pro_private', demandId: demand.id, providerId: 'provider_a', amount: 100, status: 'accepted', customerConfirmedAt: '2026-01-01', providerConfirmedAt: '2026-01-01', createdAt: '2026-01-01' };

describe('privacidade do endereço da demanda', () => {
  it('não expõe endereço nem coordenadas antes do acordo bilateral', () => {
    const preview = demandForUser({ ...demand, status: 'open', acceptedProviderId: undefined }, provider('provider_a'), []);
    expect(preview.serviceAddress).toBeUndefined(); expect(preview.latitude).toBeUndefined(); expect(preview.longitude).toBeUndefined(); expect(preview.locationLabel).toBe('Centro · Porto Velho - RO');
  });
  it('libera somente para o prestador contratado após as duas confirmações', () => {
    expect(demandForUser(demand, provider('provider_a'), [agreement]).serviceAddress?.street).toBe('Rua X');
    expect(demandForUser(demand, provider('provider_b'), [agreement]).serviceAddress).toBeUndefined();
  });
});
