import { expect, it, vi } from 'vitest';
import { createRealtimeChannel } from './realtimeChannel';

it('does not reuse a subscribed channel during delayed teardown or a rapid remount', () => {
  const channels = new Map<string, object>();
  const client = { channel: vi.fn((name: string) => {
    if (!channels.has(name)) channels.set(name, { topic: name });
    return channels.get(name);
  }) };
  const old = createRealtimeChannel(client as never, 'inbox-user');
  const replacement = createRealtimeChannel(client as never, 'inbox-user');
  expect(replacement).not.toBe(old);
  expect(channels.size).toBe(2);
  channels.delete((old as unknown as { topic: string }).topic);
  expect([...channels.values()]).toEqual([replacement]);
});
