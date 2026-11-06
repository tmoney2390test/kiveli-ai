import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { subscriptionQueryOptions } from '../lib/subscriptionQuery';
export { subscriptionStatusQueryKey, subscriptionStatusKey } from '../lib/subscriptionQuery';

export function useSubscriptionStatus(enabled = true) {
  const { session } = useAuth();
  return useQuery({
    ...subscriptionQueryOptions(session?.user.id),
    enabled: enabled && Boolean(session?.user.id),
  });
}
