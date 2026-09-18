import type { Demand, Proposal, User } from '@rubli/shared';

/** Acordo bilateral é a única condição que libera endereço ao prestador. */
export function hasConfirmedAgreement(demand: Demand, userId: string, proposals: Proposal[]) {
  return demand.acceptedProviderId === userId && proposals.some((proposal) => proposal.demandId === demand.id && proposal.providerId === userId && Boolean(proposal.customerConfirmedAt && proposal.providerConfirmedAt));
}

export function demandPreviewLabel(demand: Demand) {
  const address = demand.serviceAddress;
  return address ? `${address.neighborhood} · ${address.city} - ${address.state}` : demand.locationLabel;
}

/** Remove dados que permitiriam localizar a residência antes do contrato. */
export function demandForUser(demand: Demand, user: User, proposals: Proposal[]): Demand {
  if (user.role === 'admin' || demand.requesterId === user.id || hasConfirmedAgreement(demand, user.id, proposals)) return demand;
  const { serviceAddress: _address, pickupAddress: _pickup, dropoffAddress: _dropoff, latitude: _latitude, longitude: _longitude, ...preview } = demand;
  return { ...preview, locationLabel: demandPreviewLabel(demand) };
}
