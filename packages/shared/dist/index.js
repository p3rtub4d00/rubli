export const DEMAND_CATEGORIES = {
    service: ['Elétrica', 'Hidráulica', 'Chaveiro', 'Limpeza', 'Montagem', 'Pintura', 'Construção', 'Outros'],
    purchase: ['Mercado', 'Padaria', 'Farmácia', 'Restaurante', 'Outros'],
    delivery: ['Documentos', 'Pequenos volumes', 'Comida', 'Compras', 'Outros'],
    freight: ['Mudança', 'Móveis', 'Materiais', 'Carga leve', 'Carga pesada', 'Outros'],
};
export { distanceKm, isValidCoordinates } from './geo.js';
export { canProviderSubmitProposal, isProviderSubscriptionActive } from './subscription.js';
