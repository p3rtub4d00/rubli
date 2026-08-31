export type UserRole = 'customer' | 'provider' | 'courier' | 'admin';

export type DemandType = 'service' | 'purchase' | 'delivery' | 'freight';

export type DemandStatus =
  | 'draft'
  | 'open'
  | 'negotiating'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'superseded';
export type ProposalSide = 'customer' | 'provider';

export interface User {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  role: UserRole;
  serviceRadiusKm?: number;
  serviceCategories?: string[];
  bio?: string;
  city?: string;
  avatarUri?: string;
  profilePhotos?: string[];
  isAvailable?: boolean;
  availabilityUpdatedAt?: string;
  createdAt: string;
}

export interface Demand {
  id: string;
  requesterId: string;
  type: DemandType;
  title: string;
  description: string;
  category: string;
  budgetType: 'fixed' | 'negotiable' | 'open';
  budget?: number;
  locationLabel: string;
  latitude?: number;
  longitude?: number;
  isUrgent?: boolean;
  photoUris?: string[];
  status: DemandStatus;
  createdAt: string;
  updatedAt: string;
  acceptedProviderId?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface Proposal {
  id: string;
  demandId: string;
  providerId: string;
  amount: number;
  message?: string;
  status: ProposalStatus;
  customerConfirmedAt?: string;
  providerConfirmedAt?: string;
  version?: number;
  parentProposalId?: string;
  offeredBy?: ProposalSide;
  createdAt: string;
}

export interface CreateProposalInput {
  demandId: string;
  providerId: string;
  amount: number;
  message?: string;
}

export interface CreateCounterProposalInput {
  demandId: string;
  providerId: string;
  amount: number;
  message?: string;
  parentProposalId: string;
}

export type ChatParticipantRole = 'customer' | 'provider';

export interface Conversation {
  id: string;
  demandId: string;
  customerId: string;
  providerId: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: string;
  readAt?: string;
}

export interface CreateMessageInput {
  conversationId: string;
  senderId: string;
  text: string;
}

export interface Rating {
  id: string;
  demandId: string;
  fromUserId: string;
  toUserId: string;
  stars: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  createdAt: string;
}

export interface ServiceRating {
  id: string;
  demandId: string;
  providerId: string;
  customerId: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

export const DEMAND_CATEGORIES = {
  service: ['Elétrica', 'Hidráulica', 'Chaveiro', 'Limpeza', 'Montagem', 'Pintura', 'Construção', 'Outros'],
  purchase: ['Mercado', 'Padaria', 'Farmácia', 'Restaurante', 'Outros'],
  delivery: ['Documentos', 'Pequenos volumes', 'Comida', 'Compras', 'Outros'],
  freight: ['Mudança', 'Móveis', 'Materiais', 'Carga leve', 'Carga pesada', 'Outros'],
} as const;

export { distanceKm, isValidCoordinates } from './geo.js';
export { canProviderSubmitProposal, isProviderSubscriptionActive } from './subscription.js';
export type { ProviderSubscription, ProviderSubscriptionPlan, ProviderSubscriptionStatus } from './subscription.js';
