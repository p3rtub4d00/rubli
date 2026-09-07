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
export declare function isProviderSubscriptionActive(subscription?: ProviderSubscription, now?: Date): boolean;
export declare function canProviderSubmitProposal(subscription?: ProviderSubscription, now?: Date): boolean;
