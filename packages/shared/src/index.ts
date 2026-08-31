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

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export interface User {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  role: UserRole;
  serviceRadiusKm?: number;
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
  status: DemandStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Proposal {
  id: string;
  demandId: string;
  providerId: string;
  amount: number;
  message?: string;
  status: ProposalStatus;
  createdAt: string;
}

export interface CreateProposalInput {
  demandId: string;
  providerId: string;
  amount: number;
  message?: string;
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

export const DEMAND_CATEGORIES = {
  service: ['Elétrica', 'Hidráulica', 'Chaveiro', 'Limpeza', 'Montagem', 'Pintura', 'Construção', 'Outros'],
  purchase: ['Mercado', 'Padaria', 'Farmácia', 'Restaurante', 'Outros'],
  delivery: ['Documentos', 'Pequenos volumes', 'Comida', 'Compras', 'Outros'],
  freight: ['Mudança', 'Móveis', 'Materiais', 'Carga leve', 'Carga pesada', 'Outros'],
} as const;

export { distanceKm, isValidCoordinates } from './geo.js';
