import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { WorldPulseV2Event } from '@together/domain/src/world-pulse-v2';
import { loadWorldPulse } from './api/world-pulse';
import { discoverableWorldPulse, worldPulseQueryOptions, type CachedWorldPulse } from './worldPulseQuery';

vi.mock('./api/world-pulse', () => ({ loadWorldPulse: vi.fn() }));
const serverNow = '2026-10-03T12:00:00.000Z';
const event = (id: string, occurredAt: string): WorldPulseV2Event => ({
  id, worldId: 'world', templateId: id, title: id, feedSummary: 'A local celebration',
  eventType: 'social', occurredAt, endsAt: occurredAt, significance: 1,
  location: { id: 'place', slug: 'place', name: 'Place' }, participants: [],
});
const response = { version: 2 as const, worldId: 'world', serverNow, generatedAt: serverNow, events: [] };

describe('Pulse cache lifecycle', () => {
  let client: QueryClient;
  beforeEach(() => {
    client = new QueryClient();
    vi.useFakeTimers();
    vi.setSystemTime(serverNow);
    vi.mocked(loadWorldPulse).mockReset().mockResolvedValue(response);
  });
  afterEach(() => { client.clear(); vi.useRealTimers(); });

  it('serves fresh cache on resume and coalesces concurrent stale reads', async () => {
    const options = worldPulseQueryOptions('world', 'user:life');
    await client.fetchQuery(options);
    vi.advanceTimersByTime(119_999);
    await Promise.all([client.fetchQuery(options), client.fetchQuery(options)]);
    expect(loadWorldPulse).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    await Promise.all([client.fetchQuery(options), client.fetchQuery(options)]);
    expect(loadWorldPulse).toHaveBeenCalledTimes(2);
  });

  it('keeps private projections separate across accounts, Lives and worlds', async () => {
    for (const [world, scope] of [['world', 'a:life1'], ['world', 'a:life2'], ['world', 'b:life1'], ['other-world', 'a:life1']]) {
      const options = worldPulseQueryOptions(world, scope);
      expect(client.getQueryData(options.queryKey)).toBeUndefined();
      await client.fetchQuery(options);
    }
    expect(loadWorldPulse).toHaveBeenCalledTimes(4);
  });

  it('expires cached cards using elapsed time even if the device clock moves back', () => {
    const cached: CachedWorldPulse = { receivedAtMonotonic: 1000, response: { ...response, events: [
      event('nearly-expired', '2026-10-02T12:00:01.000Z'),
      event('expired', '2026-10-02T11:59:59.999Z'),
      event('future', '2026-10-03T12:01:00.000Z'),
    ] } };
    expect(discoverableWorldPulse(cached, 1000)?.events.map(value => value.id)).toEqual(['nearly-expired']);
    vi.setSystemTime('2020-01-01');
    expect(discoverableWorldPulse(cached, 2000)?.events.map(value => value.id)).toEqual(['nearly-expired']);
    expect(discoverableWorldPulse(cached, 2001)?.events).toEqual([]);
    expect(cached.response.events).toHaveLength(3);
  });

  it('preserves the V1 adapter and unloaded state', () => {
    const legacy: CachedWorldPulse = { receivedAtMonotonic: 0, response: { worldId: 'world', generatedAt: serverNow, events: [], items: [] } };
    expect(discoverableWorldPulse(legacy)).toBe(legacy.response);
    expect(discoverableWorldPulse(undefined)).toBeUndefined();
  });
});
