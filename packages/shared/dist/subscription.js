export function isProviderSubscriptionActive(subscription, now = new Date()) {
    if (!subscription)
        return false;
    const current = new Date(now).getTime();
    const periodEnd = new Date(subscription.currentPeriodEnd).getTime();
    return ['trialing', 'active'].includes(subscription.status) && Number.isFinite(periodEnd) && periodEnd > current;
}
export function canProviderSubmitProposal(subscription, now = new Date()) {
    return isProviderSubscriptionActive(subscription, now);
}
