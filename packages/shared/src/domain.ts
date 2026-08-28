export type UserRole = 'customer' | 'provider' | 'admin';

export type DemandKind = 'service' | 'purchase' | 'delivery' | 'freight';

export type DemandStatus =
  | 'draft'
  | 'open'
  | 'proposals'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'confirmed'
  | 'paid_out'
  | 'cancelled'
  | 'disputed'
  | 'expired';

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Money {
  amountInCents: number;
  currency: 'BRL';
}

export interface Demand {
  id: string;
  customerId: string;
  kind: DemandKind;
  categoryId: string;
  title: string;
  description: string;
  location: Coordinates;
  budget?: Money;
  allowsCounterOffer: boolean;
  scheduledFor?: string;
  status: DemandStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Proposal {
  id: string;
  demandId: string;
  providerId: string;
  price: Money;
  message?: string;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
}
