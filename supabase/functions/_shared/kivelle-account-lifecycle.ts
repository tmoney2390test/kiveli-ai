export type AccountDeletionBilling = {
  provider?: string | null;
  subscriptionId?: string | null;
  status?: string | null;
  managedByKivelle?: boolean;
};

export type AccountDeletionBillingPlan = {
  action: 'none' | 'cancel_stripe' | 'external_action';
  canDelete: boolean;
  providerLabel: string | null;
  message: string;
};

const billableStatuses = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']);

export function accountDeletionBillingPlan(billing: AccountDeletionBilling): AccountDeletionBillingPlan {
  const provider = String(billing.provider ?? '').toLowerCase();
  const active = billableStatuses.has(String(billing.status ?? '').toLowerCase());
  if (!active || billing.managedByKivelle) {
    return { action: 'none', canDelete: true, providerLabel: providerLabel(provider), message: 'No separately billed subscription needs to be canceled.' };
  }
  if (provider === 'stripe' && billing.subscriptionId) {
    return { action: 'cancel_stripe', canDelete: true, providerLabel: 'Stripe', message: 'Your Kivelle subscription will be canceled immediately before the account is deleted.' };
  }
  const label = providerLabel(provider) ?? 'your billing provider';
  return { action: 'external_action', canDelete: false, providerLabel: label, message: `Cancel the active subscription through ${label} before deleting your Kivelle account so future renewals stop.` };
}

export function hasRecentAccountAuthentication(lastSignInAt: string | null | undefined, now = new Date(), maxAgeMinutes = 10): boolean {
  const signedInAt = Date.parse(lastSignInAt ?? '');
  return Number.isFinite(signedInAt) && now.getTime() - signedInAt >= 0 && now.getTime() - signedInAt <= maxAgeMinutes * 60_000;
}

export function isOwnedAvatarPath(path: string | null, userId: string): boolean {
  return path === null || (path.startsWith(`${userId}/avatar-`) && path.endsWith('.jpg') && !path.includes('..'));
}

function providerLabel(provider: string): string | null {
  if (provider === 'stripe') return 'Stripe';
  if (provider === 'revenuecat') return 'the App Store or Google Play';
  if (provider === 'apple') return 'the App Store';
  if (provider === 'google_play' || provider === 'google') return 'Google Play';
  return provider ? 'your billing provider' : null;
}
