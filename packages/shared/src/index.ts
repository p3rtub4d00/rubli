export type UserRole = 'customer' | 'provider' | 'courier' | 'admin';
/** Modalidade única do prestador. Multi-modalidade será tratada em etapa futura. */
export type ProviderType = 'services' | 'courier' | 'freight';
export type CourierVehicleType = 'motorcycle' | 'bicycle' | 'car';
export type FreightVehicleType = 'utility' | 'pickup' | 'van' | 'small_truck' | 'truck';
export type ProviderVehicle = {
  type: CourierVehicleType | FreightVehicleType;
  brand?: string;
  model?: string;
  /** Dado privado: nunca deve ser exposto em perfil público. */
  plate?: string;
  loadCapacityKg?: number;
};
export type ProviderPlan = 'standard' | 'premium_verified';
export type ProviderVerificationStatus = 'not_requested' | 'pending' | 'simulated_verified';

export type DemandType = 'service' | 'purchase' | 'delivery' | 'freight';

export type DemandStatus =
  | 'draft'
  | 'open'
  | 'negotiating'
  | 'accepted'
  | 'provider_en_route'
  | 'provider_arrived'
  | 'in_progress'
  | 'awaiting_customer_confirmation'
  | 'completed'
  | 'cancelled';

/** Endereço operacional de uma demanda presencial. Nunca é público por padrão. */
export interface ServiceAddress {
  postalCode: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  reference?: string;
  latitude: number;
  longitude: number;
}

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'superseded';
export type ProposalSide = 'customer' | 'provider';

export interface User {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  taxDocument?: string;
  taxDocumentType?: 'cpf' | 'cnpj';
  businessName?: string;
  businessAddress?: string;
  issuesInvoice?: boolean;
  professionalTitle?: string;
  role: UserRole;
  /** Obrigatório para novas contas provider; ausente apenas em registros legados. */
  providerType?: ProviderType;
  providerVehicle?: ProviderVehicle;
  serviceRadiusKm?: number;
  serviceCategories?: string[];
  /** IDs estáveis do catálogo; serviceCategories é preservado para exibição e legado. */
  serviceCategoryIds?: string[];
  /** Coordenada operacional usada somente pelo servidor para o matching. */
  serviceLatitude?: number;
  serviceLongitude?: number;
  bio?: string;
  city?: string;
  avatarUri?: string;
  profilePhotos?: string[];
  isAvailable?: boolean;
  availabilityUpdatedAt?: string;
  providerPlan?: ProviderPlan;
  providerSubscriptionStatus?: 'inactive' | 'trialing' | 'simulated_active';
  trialEndsAt?: string;
  verificationStatus?: ProviderVerificationStatus;
  createdAt: string;
}

export interface Demand {
  id: string;
  requesterId: string;
  type: DemandType;
  title: string;
  description: string;
  category: string;
  /** ID estável da categoria do catálogo quando a demanda foi criada após a migração. */
  categoryId?: string;
  budgetType: 'fixed' | 'negotiable' | 'open';
  budget?: number;
  locationLabel: string;
  latitude?: number;
  longitude?: number;
  /** Dados completos, disponíveis somente ao cliente, administração e prestador contratado. */
  serviceAddress?: ServiceAddress;
  /** Coleta e destino para entrega/frete. Mantidos separados para evolução logística. */
  pickupAddress?: ServiceAddress;
  dropoffAddress?: ServiceAddress;
  isUrgent?: boolean;
  photoUris?: string[];
  status: DemandStatus;
  createdAt: string;
  updatedAt: string;
  acceptedProviderId?: string;
  /** Solicitação iniciada a partir da busca de um profissional. */
  targetProviderId?: string;
  directRequestDeclinedAt?: string;
  directRequestDeclineReason?: string;
  enRouteAt?: string;
  arrivedAt?: string;
  startedAt?: string;
  completionRequestedAt?: string;
  customerConfirmedCompletionAt?: string;
  completedAt?: string;
  scheduledAt?: string;
  scheduleStatus?: 'pending' | 'confirmed';
  scheduleProposedBy?: string;
  scheduleCustomerConfirmedAt?: string;
  scheduleProviderConfirmedAt?: string;
  scheduleUpdatedAt?: string;
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

export type CancellationReason = 'provider_no_show' | 'customer_unavailable' | 'service_not_feasible' | 'conditions_different' | 'mutual_agreement' | 'other';
export type CancellationRequestStatus = 'pending_confirmation' | 'accepted' | 'refused' | 'dispute_opened';

export interface CancellationRequest {
  id: string;
  demandId: string;
  requestedBy: string;
  reason: CancellationReason;
  description?: string;
  createdAt: string;
  status: CancellationRequestStatus;
  respondedBy?: string;
  respondedAt?: string;
  responseNote?: string;
}

export type DisputeStatus = 'open' | 'under_review' | 'resolved' | 'closed';

export interface Dispute {
  id: string;
  demandId: string;
  openedBy: string;
  againstUserId: string;
  reason: string;
  description: string;
  status: DisputeStatus;
  createdAt: string;
  updatedAt: string;
  cancellationRequestId?: string;
  resolution?: string;
  resolvedBy?: string;
}

export interface ScheduleChange {
  id: string;
  demandId: string;
  scheduledAt: string;
  action: 'proposed' | 'counter_proposed' | 'confirmed';
  proposedBy: string;
  createdAt: string;
  customerConfirmedAt?: string;
  providerConfirmedAt?: string;
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
export { normalizeCategoryKey } from './categories.js';
export { canProviderSubmitProposal, isProviderSubscriptionActive } from './subscription.js';
export type { ProviderSubscription, ProviderSubscriptionPlan, ProviderSubscriptionStatus } from './subscription.js';
