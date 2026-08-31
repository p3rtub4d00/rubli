import type { Demand } from '@rubli/shared';
import { distanceKm, isValidCoordinates } from '@rubli/shared';

export interface NearbyDemand extends Demand {
  distanceKm?: number;
}

export function getNearbyDemands(
  demands: Demand[],
  center: { latitude: number; longitude: number },
  radiusKm: number,
  options?: { urgentOnly?: boolean; type?: Demand['type']; excludeRequesterId?: string },
): NearbyDemand[] {
  if (!isValidCoordinates(center.latitude, center.longitude)) return [];

  const safeRadius = Math.min(Math.max(radiusKm, 1), 100);

  return demands
    .filter((demand) => demand.status === 'open' || demand.status === 'negotiating')
    .filter((demand) => !options?.type || demand.type === options.type)
    .filter((demand) => !options?.urgentOnly || demand.isUrgent === true)
    .filter((demand) => !options?.excludeRequesterId || demand.requesterId !== options.excludeRequesterId)
    .filter((demand) => isValidCoordinates(demand.latitude, demand.longitude))
    .map((demand) => ({
      ...demand,
      distanceKm: distanceKm(
        center,
        { latitude: demand.latitude!, longitude: demand.longitude! },
      ),
    }))
    .filter((demand) => (demand.distanceKm ?? Infinity) <= safeRadius)
    .sort((a, b) => {
      if (Boolean(b.isUrgent) !== Boolean(a.isUrgent)) {
        return Number(Boolean(b.isUrgent)) - Number(Boolean(a.isUrgent));
      }
      return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
    });
}
