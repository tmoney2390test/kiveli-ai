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
