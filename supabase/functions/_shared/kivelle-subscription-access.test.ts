import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import type { SupabaseClient } from '@supabase/supabase-js';
import { entitlementsForTier } from '../../../packages/together-domain/src/index.ts';
import { resolveSubscriptionAccess } from './kivelle-subscription.ts';

const now = new Date('2026-10-26T12:00:00Z');
const userId = 'test-subscriber';
const billing = (overrides: Record<string, unknown> = {}) => ({
  provider: 'stripe',
  provider_customer_id: 'customer',
  provider_subscription_id: 'subscription',
  provider_price_id: 'max_monthly',
  plan_key: 'kivelle_max',
  status: 'active',
  billing_interval: 'monthly',
  current_period_start: '2026-10-01T00:00:00Z',
  current_period_end: '2026-11-01T00:00:00Z',
  access_ends_at: '2026-11-01T00:00:00Z',
  trial_end: null,
  cancel_at_period_end: false,
  canceled_at: null,
  metadata: {},
  updated_at: now.toISOString(),
  ...overrides,
});
const entitlement = () => ({
  user_id: userId,
  tier: 'kivelle_max',
  entitlement_keys: [...entitlementsForTier('kivelle_max')],
  billing_provider: 'stripe',
  billing_subscription_id: 'subscription',
  billing_status: 'active',
  billing_period_start: '2026-09-01T00:00:00Z',
  billing_period_end: '2026-10-01T00:00:00Z',
  expires_at: '2026-10-01T00:00:00Z',
  metadata: {},
});

/** Only the access tables exist here: touching credits or other users fails. */
function fixture(
  subscriptions = [billing()],
  cached: Record<string, unknown> | null = entitlement(),
  providerError: unknown = null,
) {
  const updates: Record<string, unknown>[] = [];
  let row = cached;
  const db = {
    from(table: string) {
      if (
        !['together_entitlements', 'together_billing_subscriptions'].includes(table)
      ) throw new Error(`Unexpected access: ${table}`);
      let patch: Record<string, unknown> | undefined;
      const result = () =>
        table === 'together_billing_subscriptions'
          ? { data: subscriptions, error: providerError }
          : { data: row, error: null };
      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          assertEquals([column, value], ['user_id', userId]);
          return query;
        },
        order() {
          return query;
        },
        update(value: Record<string, unknown>) {
          patch = value;
          return query;
        },
        insert(value: Record<string, unknown>) {
          patch = value;
          return query;
        },
        maybeSingle: async () => result(),
        single: async () => {
          if (patch) {
            updates.push(patch);
            row = { ...row, ...patch };
          }
          return result();
        },
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
          Promise.resolve(result()).then(resolve, reject),
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { db, updates, row: () => row };
}

Deno.test('same-tier renewal repairs expired cached periods without reducing Max access', async () => {
  const f = fixture();
  const access = await resolveSubscriptionAccess(f.db, userId, now);
  assertEquals(access.tier, 'kivelle_max');
  assertEquals(access.capabilities.maxActiveConversations, 50);
  assertEquals(f.updates.length, 1);
  assertEquals(f.row()?.expires_at, '2026-11-01T00:00:00Z');
  assertEquals(f.row()?.billing_period_start, '2026-10-01T00:00:00Z');
  assertEquals(f.row()?.billing_period_end, '2026-11-01T00:00:00Z');
  await resolveSubscriptionAccess(f.db, userId, now);
  assertEquals(
    f.updates.length,
    1,
    'Repeated reads must not rewrite an already synchronized renewal',
  );
});

Deno.test('read-only checks still return provider access without modifying the cache', async () => {
  const f = fixture();
  assertEquals(
    (await resolveSubscriptionAccess(f.db, userId, now, true)).capabilities.maxActiveConversations,
    50,
  );
  assertEquals(f.updates.length, 0);
  assertEquals(f.row()?.expires_at, '2026-10-01T00:00:00Z');
});

Deno.test('same-tier Plus renewal repairs its expired cache and retains the 20-chat limit', async () => {
  const f = fixture([billing({ plan_key: 'kivelle_plus', provider_price_id: 'plus_monthly' })], {
    ...entitlement(),
    tier: 'kivelle_plus',
    entitlement_keys: [...entitlementsForTier('kivelle_plus')],
  });
  const access = await resolveSubscriptionAccess(f.db, userId, now);
  assertEquals(access.tier, 'kivelle_plus');
  assertEquals(access.capabilities.maxActiveConversations, 20);
  assertEquals(f.row()?.expires_at, '2026-11-01T00:00:00Z');
  assertEquals(f.row()?.billing_period_end, '2026-11-01T00:00:00Z');
  await resolveSubscriptionAccess(f.db, userId, now);
  assertEquals(f.updates.length, 1);
});

Deno.test('renewal selects the highest active plan across stores and ignores a newer cancellation', async () => {
  const f = fixture([
    billing({
      provider: 'revenuecat',
      provider_subscription_id: 'apple-sub',
      plan_key: 'kivelle_plus',
      metadata: { store: 'APP_STORE' },
    }),
    billing(),
    billing({
      provider: 'configured',
      provider_subscription_id: 'old-sub',
      status: 'canceled',
      updated_at: '2026-10-27T00:00:00Z',
    }),
  ]);
  const access = await resolveSubscriptionAccess(f.db, userId, now);
  assertEquals(access.tier, 'kivelle_max');
  assertEquals(access.billing.provider, 'stripe');
});

Deno.test('annual App Store subscription restores Plus access and store management', async () => {
  const f = fixture([
    billing({
      provider: 'revenuecat',
      provider_subscription_id: 'apple-sub',
      plan_key: 'kivelle_plus',
      billing_interval: 'annual',
      metadata: { store: 'APP_STORE' },
      access_ends_at: '2027-01-01T00:00:00Z',
    }),
  ]);
  const access = await resolveSubscriptionAccess(f.db, userId, now);
  assertEquals(access.capabilities.maxActiveConversations, 20);
  assertEquals(access.billing.store, 'app_store');
  assertEquals(access.billing.billingInterval, 'annual');
  assertEquals(f.row()?.expires_at, '2027-01-01T00:00:00Z');
});

for (const status of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired']) {
  Deno.test(`${status} provider record overrides a stale paid entitlement`, async () => {
    const f = fixture([billing({ status })], {
      ...entitlement(),
      expires_at: '2027-01-01T00:00:00Z',
    });
    assertEquals(
      (await resolveSubscriptionAccess(f.db, userId, now)).capabilities.maxActiveConversations,
      5,
    );
    assertEquals(f.row()?.tier, 'free');
  });
}

Deno.test('access expires at the boundary; past-due grace must have a future end', async () => {
  for (const status of ['active', 'trialing', 'past_due']) {
    const expired = fixture([billing({ status, access_ends_at: now.toISOString() })]);
    assertEquals((await resolveSubscriptionAccess(expired.db, userId, now)).tier, 'free');
    const grace = fixture([billing({ status })]);
    assertEquals((await resolveSubscriptionAccess(grace.db, userId, now)).tier, 'kivelle_max');
    const open = fixture([billing({ status, access_ends_at: null, current_period_end: null })]);
    assertEquals(
      (await resolveSubscriptionAccess(open.db, userId, now)).tier,
      status === 'past_due' ? 'free' : 'kivelle_max',
    );
  }
});

Deno.test('legacy access is used only when provider records are absent', async () => {
  const valid = fixture([], { ...entitlement(), expires_at: '2027-01-01T00:00:00Z' });
  assertEquals((await resolveSubscriptionAccess(valid.db, userId, now)).tier, 'kivelle_max');
  const expired = fixture([]);
  assertEquals((await resolveSubscriptionAccess(expired.db, userId, now)).tier, 'free');
  const unavailable = fixture([], entitlement(), { code: 'TIMEOUT' });
  await assertRejects(
    () => resolveSubscriptionAccess(unavailable.db, userId, now),
    Error,
    'Provider subscription status could not be loaded.',
  );
  assertEquals(
    unavailable.updates.length,
    0,
    'A provider outage must not downgrade the stored subscription',
  );
});
