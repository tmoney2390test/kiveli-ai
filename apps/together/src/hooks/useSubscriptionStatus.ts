import { useQuery } from '@tanstack/react-query';
import { manageSubscription } from '../lib/api';
import type { SubscriptionStatus } from '../lib/subscription';

export const subscriptionStatusQueryKey=['kivelle-subscription-status'] as const;

export function useSubscriptionStatus(enabled = true) {
  return useQuery({
    queryKey: subscriptionStatusQueryKey,
    queryFn: () => manageSubscription<SubscriptionStatus>(),
    enabled,
    staleTime: 60_000,
    gcTime: 30*60_000,
    retry: 1,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  });
}
