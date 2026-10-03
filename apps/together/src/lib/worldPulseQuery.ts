import { queryOptions } from '@tanstack/react-query';
import { worldPulseIsDiscoverable } from '@together/domain/src/world-pulse-v2';
import { loadWorldPulse, type WorldPulseFeedResponse } from './api/world-pulse';

export type CachedWorldPulse = { response: WorldPulseFeedResponse; receivedAtMonotonic: number };

/** Shared options make focus and native resume reads obey the same freshness policy. */
export function worldPulseQueryOptions(worldId?: string | null, scope?: string | null) {
  return queryOptions({
    queryKey: ['kivelle-world-pulse', scope ?? 'unscoped', worldId ?? 'active'] as const,
    queryFn: async (): Promise<CachedWorldPulse> => ({
      response: await loadWorldPulse(worldId ?? undefined),
      receivedAtMonotonic: performance.now(),
    }),
    staleTime: 120_000,
    gcTime: 15 * 60_000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
}

export function discoverableWorldPulse(value: CachedWorldPulse | undefined, now = performance.now()) {
  if (!value) return undefined;
  const { response } = value;
  if (response.version !== 2) return response;
  // Device clock changes cannot revive expired events. New details and handoffs
  // still receive the authoritative server-side freshness check.
  const serverNow = new Date(Date.parse(response.serverNow) + Math.max(0, now - value.receivedAtMonotonic)).toISOString();
  return { ...response, events: response.events.filter((event) => worldPulseIsDiscoverable(event.occurredAt, serverNow)) };
}
