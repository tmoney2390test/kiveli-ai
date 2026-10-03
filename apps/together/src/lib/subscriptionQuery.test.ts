import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { manageSubscription } from './api/account';
import type { SubscriptionStatus } from './subscription';
import { subscriptionQueryOptions, subscriptionStatusKey, subscriptionStatusQueryKey } from './subscriptionQuery';

vi.mock('./api/account', () => ({ manageSubscription: vi.fn() }));
const status = { tier: 'free', creditBalance: { permanentBalance: 40, subscriptionBalance: 0, total: 40 } } as SubscriptionStatus;
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient();
  vi.mocked(manageSubscription).mockReset().mockResolvedValue(status);
});
afterEach(() => { client.clear(); });

it('keeps account membership and balance caches separate', async () => {
  await client.fetchQuery(subscriptionQueryOptions('first-user'));
  expect(client.getQueryData(subscriptionStatusKey('second-user'))).toBeUndefined();
  expect(client.getQueryData(subscriptionStatusKey(null))).toBeUndefined();
  client.setQueryData(subscriptionStatusKey('second-user'), { ...status, tier: 'kivelle_max' });
  expect(client.getQueryData(subscriptionStatusKey('first-user'))).toEqual(status);
  expect(client.getQueryData(subscriptionStatusQueryKey)).toBeUndefined();
});

it('does not refetch a fresh membership merely because another panel mounts', async () => {
  const options = subscriptionQueryOptions('user');
  await client.fetchQuery(options);
  const observer = new QueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => undefined);
  expect(observer.getCurrentResult().data).toEqual(status);
  expect(manageSubscription).toHaveBeenCalledTimes(1);
  unsubscribe();
  observer.destroy();
});

it('cannot repopulate a removed account cache with a late response', async () => {
  let complete!: (result: SubscriptionStatus) => void;
  vi.mocked(manageSubscription).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const pending = client.fetchQuery(subscriptionQueryOptions('old-user')).catch(() => undefined);
  client.removeQueries({ queryKey: subscriptionStatusQueryKey });
  await client.fetchQuery(subscriptionQueryOptions('new-user'));
  complete({ ...status, tier: 'kivelle_max' });
  await pending;
  expect(client.getQueryData(subscriptionStatusKey('old-user'))).toBeUndefined();
  expect(client.getQueryData(subscriptionStatusKey('new-user'))).toEqual(status);
});

it('disables signed-out reads and rejects even an explicit signed-out refetch', async () => {
  const options = subscriptionQueryOptions(null);
  expect(options.enabled).toBe(false);
  await expect(client.fetchQuery({ ...options, retry: false })).rejects.toThrow('Sign in');
  expect(manageSubscription).not.toHaveBeenCalled();
});
