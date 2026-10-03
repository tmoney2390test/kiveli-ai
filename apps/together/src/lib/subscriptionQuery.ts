import { queryOptions } from '@tanstack/react-query';
import { manageSubscription } from './api/account';
import type { SubscriptionStatus } from './subscription';

/** Prefix for invalidation only; never store an account's balance under this key. */
export const subscriptionStatusQueryKey = ['kivelle-subscription-status'] as const;
export const subscriptionStatusKey = (userId?: string | null) => [...subscriptionStatusQueryKey, userId ?? 'signed-out'] as const;

export function subscriptionQueryOptions(userId?: string | null) {
  return queryOptions({
    queryKey: subscriptionStatusKey(userId),
    queryFn: () => {
      if (!userId) throw new Error('Sign in to view your membership.');
      return manageSubscription<SubscriptionStatus>();
    },
    enabled: Boolean(userId),
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
    refetchOnMount: true,
    refetchOnReconnect: true,
  });
}
