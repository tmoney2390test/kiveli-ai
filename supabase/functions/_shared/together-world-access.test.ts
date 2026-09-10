import { resolveWorldAccess } from './together-place.ts';

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
}

function worldOnlyDb(world: Record<string, unknown> | null) {
  return {
    from(table: string) {
      if (table !== 'together_worlds') throw new Error(`Build access should not query ${table}`);
      const query = {
        select() { return query; },
        eq() { return query; },
        async maybeSingle() { return { data: world, error: null }; },
      };
      return query;
    },
  };
}

function accessDb(input: {world: Record<string, unknown>; userWorld?: Record<string, unknown> | null; entitlements?: Record<string, unknown> | null}) {
  return {
    from(table: string) {
      const query = {
        select() { return query; },
        eq() { return query; },
        async maybeSingle() {
          if (table === 'together_worlds') return { data: input.world, error: null };
          if (table === 'together_user_worlds') return { data: input.userWorld ?? null, error: null };
          if (table === 'together_entitlements') return { data: input.entitlements ?? null, error: null };
          throw new Error(`Unexpected table ${table}`);
        },
      };
      return query;
    },
  };
}

Deno.test('build access includes a published subscription world without an entitlement lookup', async () => {
  const db = worldOnlyDb({ published: true, access_type: 'subscription', entitlement_key: 'worlds.standard', metadata: {} });
  const access = await resolveWorldAccess({ db: db as never, userId: 'user', worldId: 'port-vervelle' });
  assertEquals(access, 'included', 'published worlds should be open during the build');
});

Deno.test('build access keeps unpublished worlds locked', async () => {
  const db = worldOnlyDb({ published: false, access_type: 'subscription', entitlement_key: 'worlds.standard', metadata: {} });
  const access = await resolveWorldAccess({ db: db as never, userId: 'user', worldId: 'private-draft' });
  assertEquals(access, 'locked', 'unpublished worlds must remain inaccessible');
});

Deno.test('subscriber early access ignores a legacy free-account unlock', async () => {
  const db = accessDb({
    world: { published: true, access_type: 'subscription', entitlement_key: 'worlds.standard', metadata: { subscriber_early_access: true } },
    userWorld: { access_status: 'unlocked' },
    entitlements: { tier: 'free', entitlement_keys: [] },
  });
  const access = await resolveWorldAccess({ db: db as never, userId: 'user', worldId: 'vespormoor' });
  assertEquals(access, 'locked', 'legacy build unlocks must not bypass subscriber early access');
});

Deno.test('Kivelle+ includes subscriber early-access worlds', async () => {
  const db = accessDb({
    world: { published: true, access_type: 'subscription', entitlement_key: 'worlds.standard', metadata: { subscriber_early_access: true } },
    entitlements: { tier: 'kivelle_plus', entitlement_keys: [] },
  });
  const access = await resolveWorldAccess({ db: db as never, userId: 'user', worldId: 'calders-run' });
  assertEquals(access, 'included', 'paid subscribers should receive early access');
});
