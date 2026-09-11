import { applyVeniceTestRoute, assertVeniceTestRequest, validateVeniceTestSetting, veniceTestCapability, veniceTestStateVersion } from './kivelle-venice-test.ts';
import { contextCredits } from './kivelle-context-price.ts';
import type { DialogueRoutingDecision } from '../../../packages/together-domain/src/ai-routing.ts';

const owner = '0aaaa97b-a210-4d06-893a-7780bed71927', other = '10000000-0000-4000-8000-000000000001';
const assert = (value: unknown) => { if (!value) throw new Error('Assertion failed'); };
async function rejects(run: () => Promise<unknown>) { let rejected = false; try { await run(); } catch { rejected = true; } assert(rejected); }
const base: DialogueRoutingDecision = { provider: 'xai', requestedMode: 'explicit', resolvedMode: 'explicit', reason: 'adult_explicit', explicit: true, adultEligible: true, hardBlocked: false, classification: 'explicit_adult' };
const conversation = (userId = owner, selection = 'uncensored_1_2') => ({ user_id: userId, metadata: { chatPreferences: { veniceTestModel: selection } } });
function database(state: { enabled: boolean; version: number; conversation?: ReturnType<typeof conversation>; error?: boolean }) {
  return { from(table: string) { const filters: Record<string, unknown> = {}; const query = { select() { return query; }, eq(key: string, value: unknown) { filters[key] = value; return query; }, maybeSingle: async () => ({ data: state, error: state.error ? {} : null }), single: async () => ({ data: state.conversation?.user_id === filters.user_id ? state.conversation : null, error: state.error ? {} : null }) }; if (!['kivelle_dialogue_experiments', 'together_conversations'].includes(table)) throw new Error('Unexpected table'); return query; } };
}
async function configured(run: () => Promise<void>) {
  const key = Deno.env.get('VENICE_API_KEY'), flag = Deno.env.get('KIVELLE_VENICE_CHAT_TEST_ENABLED');
  Deno.env.set('VENICE_API_KEY', 'unit-test-only'); Deno.env.delete('KIVELLE_VENICE_CHAT_TEST_ENABLED');
  try { await run(); } finally { if (key === undefined) Deno.env.delete('VENICE_API_KEY'); else Deno.env.set('VENICE_API_KEY', key); if (flag === undefined) Deno.env.delete('KIVELLE_VENICE_CHAT_TEST_ENABLED'); else Deno.env.set('KIVELLE_VENICE_CHAT_TEST_ENABLED', flag); }
}
Deno.test('only the verified owner can select Venice; forged preference and ownership fail closed', () => configured(async () => {
  const db = database({ enabled: true, version: 1 });
  assert(!(await veniceTestCapability(db, other)).available);
  await rejects(() => validateVeniceTestSetting(db, other, other, 'uncensored_1_2'));
  await rejects(() => validateVeniceTestSetting(db, owner, other, 'uncensored_1_2'));
  await rejects(() => validateVeniceTestSetting(db, owner, owner, 'unlisted-model'));
  assert((await applyVeniceTestRoute(db, other, conversation(other), base)).provider === 'xai');
  assert((await applyVeniceTestRoute(db, owner, conversation(other), base)).provider === 'xai');
  assert((await applyVeniceTestRoute(db, owner, conversation(), base)).provider === 'venice');
}));
Deno.test('Off, disabled switch, lookup failure, ordinary replies and policy blocks preserve base routing', () => configured(async () => {
  const state = { enabled: true, version: 1, error: false }, db = database(state);
  for (const route of [{ ...base, provider: 'openai' as const, explicit: false }, { ...base, hardBlocked: true }, { ...base, explicit: false }]) assert((await applyVeniceTestRoute(db, owner, conversation(), route)).provider === route.provider);
  assert((await applyVeniceTestRoute(db, owner, conversation(owner, 'off'), base)).provider === 'xai');
  state.enabled = false; assert((await applyVeniceTestRoute(db, owner, conversation(), base)).provider === 'xai');
  state.enabled = true; state.error = true; assert(!(await veniceTestCapability(db, owner)).available);
  state.error = false; Deno.env.set('KIVELLE_VENICE_CHAT_TEST_ENABLED', 'false'); assert(!(await veniceTestCapability(db, owner)).available);
}));
Deno.test('model selection, config version and revocation invalidate an accepted experiment target', () => configured(async () => {
  const state = { enabled: true, version: 1, conversation: conversation() }, db = database(state);
  const route = await applyVeniceTestRoute(db, owner, state.conversation, base);
  await assertVeniceTestRequest(db, owner, 'chat', route.experiment);
  const before = await veniceTestStateVersion(db, owner, state.conversation);
  state.version++;
  assert(before !== await veniceTestStateVersion(db, owner, state.conversation));
  await rejects(() => assertVeniceTestRequest(db, owner, 'chat', route.experiment));
  state.version--; state.conversation = conversation(owner, 'role_play');
  await rejects(() => assertVeniceTestRequest(db, owner, 'chat', route.experiment));
  state.conversation = conversation(); state.enabled = false;
  const frozenRoute = await applyVeniceTestRoute(db, owner, state.conversation, base, route.experiment);
  assert(frozenRoute.provider === 'venice');
  await rejects(() => assertVeniceTestRequest(db, owner, 'chat', frozenRoute.experiment));
  await rejects(() => assertVeniceTestRequest(db, owner, 'chat', route.experiment));
  await rejects(() => assertVeniceTestRequest(db, other, 'chat', route.experiment));
}));
Deno.test('Venice expanded context uses the selected model and never assumes a cache discount', () => {
  const input = { provider: 'venice', model: 'venice-uncensored-1-2', inputTokens: 32000, outputTokens: 520 };
  assert(contextCredits(input) === 2);
  assert(contextCredits({ ...input, model: 'venice-uncensored-role-play' }) === 3);
  assert(contextCredits({ ...input, model: 'gemma-4-uncensored' }) === 1);
  assert(contextCredits({ ...input, cachedInputTokens: 32000 }) === 2);
});
