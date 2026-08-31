import type { ProviderSubscription } from '@rubli/shared';
import { canProviderSubmitProposal } from '@rubli/shared';

const TRIAL_DAYS = 7;

export function createLocalTrial(providerId: string, now = new Date()): ProviderSubscription {
  const startedAt = new Date(now);
  const trialEndsAt = new Date(startedAt);
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

  return {
    id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    providerId,
    plan: 'trial',
    status: 'trialing',
    startedAt: startedAt.toISOString(),
    trialEndsAt: trialEndsAt.toISOString(),
    currentPeriodStart: startedAt.toISOString(),
    currentPeriodEnd: trialEndsAt.toISOString(),
    updatedAt: startedAt.toISOString(),
  };
}

export function subscriptionLabel(subscription?: ProviderSubscription, now = new Date()): string {
  if (!subscription) return 'Assinatura não configurada';
  if (canProviderSubmitProposal(subscription, now)) {
    return subscription.status === 'trialing' ? 'Período de teste ativo' : 'Assinatura ativa';
  }
  if (subscription.status === 'past_due') return 'Pagamento pendente';
  if (subscription.status === 'cancelled') return 'Assinatura cancelada';
  return 'Assinatura vencida';
}

export function subscriptionBlocksNewProposals(subscription?: ProviderSubscription, now = new Date()): boolean {
  return !canProviderSubmitProposal(subscription, now);
}
