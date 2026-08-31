export type ProviderSubscriptionPlan = 'trial' | 'professional';
export type ProviderSubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'expired' | 'cancelled';

export interface ProviderSubscription {
  id: string;
  providerId: string;
  plan: ProviderSubscriptionPlan;
  status: ProviderSubscriptionStatus;
  startedAt: string;
  trialEndsAt?: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelledAt?: string;
  updatedAt: string;
}

export function isProviderSubscriptionActive(subscription?: ProviderSubscription, now = new Date()): boolean {
  if (!subscription) return false;
  const current = new Date(now).getTime();
  const periodEnd = new Date(subscription.currentPeriodEnd).getTime();
  return ['trialing', 'active'].includes(subscription.status) && Number.isFinite(periodEnd) && periodEnd > current;
}

export function canProviderSubmitProposal(subscription?: ProviderSubscription, now = new Date()): boolean {
  return isProviderSubscriptionActive(subscription, now);
}
