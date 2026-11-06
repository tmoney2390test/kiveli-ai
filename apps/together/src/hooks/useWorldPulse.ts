import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { discoverableWorldPulse, worldPulseQueryOptions } from '../lib/worldPulseQuery';

/** Account and Life are part of the cache key because instance projections are private. */
export function useWorldPulse(worldId?: string | null, scope?: string | null, enabled = true) {
  const client = useQueryClient();
  const [tick, setTick] = useState(0);
  const previousScope = useRef<string | null>(null);
  const canLoad = enabled && Boolean(worldId) && Boolean(scope);
  const query = useQuery({
    ...worldPulseQueryOptions(worldId, scope),
    enabled: canLoad,
  });
  useEffect(() => {
    if (!canLoad) return;
    const timer = setInterval(() => setTick((value) => value + 1), 30_000);
    const listener = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      setTick((value) => value + 1);
      // fetchQuery serves fresh cache and coalesces Home/Explore resume requests.
      void client.fetchQuery(worldPulseQueryOptions(worldId, scope)).catch(() => undefined);
    });
    return () => { clearInterval(timer); listener.remove(); };
  }, [canLoad, client, worldId, scope]);
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
  const data = useMemo(() => discoverableWorldPulse(query.data), [query.data, tick]);
  return { ...query, data };
}
