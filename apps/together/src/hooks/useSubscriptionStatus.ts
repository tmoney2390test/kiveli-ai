import { useQuery } from '@tanstack/react-query';
import { manageSubscription } from '../lib/api';
import type { SubscriptionStatus } from '../lib/subscription';

export function useSubscriptionStatus(enabled = true) {
  return useQuery({
    queryKey: ['kivelle-subscription-status'],
    queryFn: () => manageSubscription<SubscriptionStatus>(),
    enabled,
    staleTime: 60_000,
    retry: 1,
  });
}
