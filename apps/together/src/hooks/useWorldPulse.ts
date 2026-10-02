import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { worldPulseIsDiscoverable } from '@together/domain/src/world-pulse-v2';
import { loadWorldPulse } from '../lib/api';

/** Account and Life are part of the cache key because instance projections are private. */
export function useWorldPulse(worldId?: string | null, scope?: string | null, enabled = true) {
  const client = useQueryClient();
  const [tick, setTick] = useState(0);
  const previousScope = useRef<string | null>(null);
  const canLoad = enabled && Boolean(worldId) && Boolean(scope);
  const query = useQuery({
    queryKey: ['kivelle-world-pulse', scope ?? 'unscoped', worldId ?? 'active'],
    queryFn: async () => ({ response: await loadWorldPulse(worldId ?? undefined), receivedAtMonotonic: performance.now() }),
    enabled: canLoad, staleTime: 120_000, gcTime: 15 * 60_000,
    retry: 1, refetchOnWindowFocus: true,
  });
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 30_000);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active' && canLoad) void query.refetch();
    });
    return () => { clearInterval(timer); listener.remove(); };
  }, [canLoad, query.refetch]);
  useEffect(() => {
    if (previousScope.current && previousScope.current !== scope) {
      const prior = previousScope.current;
      client.removeQueries({ queryKey: ['kivelle-world-pulse', prior], exact: false });
      client.removeQueries({ queryKey: ['world-pulse-detail', prior], exact: false });
      const [oldUser, oldLife] = prior.split(':');
      client.removeQueries({ queryKey: ['world-pulse-conversation-label', oldUser, oldLife], exact: false });
    }
    previousScope.current = scope ?? null;
  }, [client, scope]);
  const data = useMemo(() => {
    const value = query.data;
    if (!value) return undefined;
    const { response } = value;
    if (response.version !== 2) return response;
    // Monotonic elapsed time keeps a device-clock change from reviving expired
    // events in a stale cache. The server still checks every new detail/handoff.
    const serverNow = new Date(Date.parse(response.serverNow) + Math.max(0, performance.now() - value.receivedAtMonotonic)).toISOString();
    return { ...response, events: response.events.filter((event) => worldPulseIsDiscoverable(event.occurredAt, serverNow)) };
  }, [query.data, tick]);
  return { ...query, data };
}
