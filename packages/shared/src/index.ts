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

export const DEMAND_CATEGORIES = {
  service: ['Elétrica', 'Hidráulica', 'Chaveiro', 'Limpeza', 'Montagem', 'Pintura', 'Construção', 'Outros'],
  purchase: ['Mercado', 'Padaria', 'Farmácia', 'Restaurante', 'Outros'],
  delivery: ['Documentos', 'Pequenos volumes', 'Comida', 'Compras', 'Outros'],
  freight: ['Mudança', 'Móveis', 'Materiais', 'Carga leve', 'Carga pesada', 'Outros'],
} as const;
