import { applyChatTestRoute, assertChatTestRequest, validateChatTestSetting, chatTestCapability, chatTestStateVersion } from './kivelle-chat-model-test.ts';
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
  const names = ['VENICE_API_KEY', 'WAVESPEED_API_KEY', 'KIVELLE_VENICE_CHAT_TEST_ENABLED', 'KIVELLE_WAVESPEED_CHAT_TEST_ENABLED'];
  const saved = names.map(name => Deno.env.get(name));
  Deno.env.delete('WAVESPEED_API_KEY'); Deno.env.delete('KIVELLE_WAVESPEED_CHAT_TEST_ENABLED');
  Deno.env.set('VENICE_API_KEY', 'unit-test-only'); Deno.env.delete('KIVELLE_VENICE_CHAT_TEST_ENABLED');
  try { await run(); } finally { names.forEach((name, i) => { if (saved[i] === undefined) Deno.env.delete(name); else Deno.env.set(name, saved[i]!); }); }
}
Deno.test('only the verified owner can select Venice; forged preference and ownership fail closed', () => configured(async () => {
  const db = database({ enabled: true, version: 1 });
  assert(!(await chatTestCapability(db, other)).available);
  await rejects(() => validateChatTestSetting(db, other, other, 'uncensored_1_2'));
  await rejects(() => validateChatTestSetting(db, owner, other, 'uncensored_1_2'));
  await rejects(() => validateChatTestSetting(db, owner, owner, 'unlisted-model'));
  assert((await applyChatTestRoute(db, other, conversation(other), base)).provider === 'xai');
  assert((await applyChatTestRoute(db, owner, conversation(other), base)).provider === 'xai');
  assert((await applyChatTestRoute(db, owner, conversation(), base)).provider === 'venice');
}));
Deno.test('Off, disabled switch, lookup failure, ordinary replies and policy blocks preserve base routing', () => configured(async () => {
  const state = { enabled: true, version: 1, error: false }, db = database(state);
  for (const route of [{ ...base, provider: 'openai' as const, explicit: false }, { ...base, hardBlocked: true }, { ...base, explicit: false }]) assert((await applyChatTestRoute(db, owner, conversation(), route)).provider === route.provider);
  assert((await applyChatTestRoute(db, owner, conversation(owner, 'off'), base)).provider === 'xai');
  state.enabled = false; assert((await applyChatTestRoute(db, owner, conversation(), base)).provider === 'xai');
  state.enabled = true; state.error = true; assert(!(await chatTestCapability(db, owner)).available);
  state.error = false; Deno.env.set('KIVELLE_VENICE_CHAT_TEST_ENABLED', 'false'); assert(!(await chatTestCapability(db, owner)).available);
}));
Deno.test('model selection, config version and revocation invalidate an accepted experiment target', () => configured(async () => {
  const state = { enabled: true, version: 1, conversation: conversation() }, db = database(state);
  const route = await applyChatTestRoute(db, owner, state.conversation, base);
  await assertChatTestRequest(db, owner, 'chat', route.experiment);
  const before = await chatTestStateVersion(db, owner, state.conversation);
  state.version++;
  assert(before !== await chatTestStateVersion(db, owner, state.conversation));
  await rejects(() => assertChatTestRequest(db, owner, 'chat', route.experiment));
  state.version--; state.conversation = conversation(owner, 'role_play');
  await rejects(() => assertChatTestRequest(db, owner, 'chat', route.experiment));
  state.conversation = conversation(); state.enabled = false;
  const frozenRoute = await applyChatTestRoute(db, owner, state.conversation, base, route.experiment);
  assert(frozenRoute.provider === 'venice');
  await rejects(() => assertChatTestRequest(db, owner, 'chat', frozenRoute.experiment));
  await rejects(() => assertChatTestRequest(db, owner, 'chat', route.experiment));
  await rejects(() => assertChatTestRequest(db, other, 'chat', route.experiment));
}));
Deno.test('Venice expanded context uses the selected model and never assumes a cache discount', () => {
  const input = { provider: 'venice', model: 'venice-uncensored-1-2', inputTokens: 32000, outputTokens: 520 };
  assert(contextCredits(input) === 2);
  assert(contextCredits({ ...input, model: 'venice-uncensored-role-play' }) === 3);
  assert(contextCredits({ ...input, model: 'gemma-4-uncensored' }) === 1);
  assert(contextCredits({ ...input, cachedInputTokens: 32000 }) === 2);
});

Deno.test('WaveSpeed choices require their own key and remain bound to the owner, model, provider and rollout version', () => configured(async () => {
  const state = { enabled: true, version: 1, conversation: conversation(owner, 'deepseek_v4_flash') }, db = database(state);
  assert(!(await chatTestCapability(db, owner)).selections.includes('deepseek_v4_flash'));
  await rejects(() => validateChatTestSetting(db, owner, owner, 'deepseek_v4_flash'));
  Deno.env.set('WAVESPEED_API_KEY', 'unit-test-only');
  await validateChatTestSetting(db, owner, owner, 'deepseek_v4_pro');
  const route = await applyChatTestRoute(db, owner, state.conversation, base);
  assert(route.provider === 'wavespeed' && route.experiment?.model === 'deepseek/deepseek-v4-flash');
  await assertChatTestRequest(db, owner, 'chat', route.experiment);
  await rejects(() => assertChatTestRequest(db, owner, 'chat', { ...route.experiment!, provider: 'venice' }));
  await rejects(() => validateChatTestSetting(db, other, other, 'deepseek_v4_flash'));
  assert((await applyChatTestRoute(db, other, conversation(other, 'deepseek_v4_flash'), base)).provider === 'xai');
  assert((await applyChatTestRoute(db, owner, state.conversation, { ...base, provider: 'openai', explicit: false })).provider === 'openai');
  const version = await chatTestStateVersion(db, owner, state.conversation);
  Deno.env.delete('VENICE_API_KEY');
  const capability = await chatTestCapability(db, owner);
  assert(capability.available && capability.selections.includes('deepseek_v4_pro') && !capability.selections.includes('role_play'));
  assert(version !== await chatTestStateVersion(db, owner, state.conversation));
  await rejects(() => assertChatTestRequest(db, owner, 'chat', route.experiment));
  Deno.env.set('VENICE_API_KEY', 'unit-test-only');
  Deno.env.set('KIVELLE_WAVESPEED_CHAT_TEST_ENABLED', 'false');
  const disabled = await chatTestCapability(db, owner);
  assert(disabled.available && disabled.selections.includes('role_play') && !disabled.selections.includes('deepseek_v4_flash'));
  await rejects(() => assertChatTestRequest(db, owner, 'chat', route.experiment));
}));

Deno.test('WaveSpeed expanded context prices the exact model and observed cache hits', () => {
  const input = { provider: 'wavespeed', model: 'deepseek/deepseek-v4-flash', inputTokens: 64000, outputTokens: 520 };
  assert(contextCredits(input) === 2);
  assert(contextCredits({ ...input, model: 'deepseek/deepseek-v4-pro' }) === 5);
  assert(contextCredits({ ...input, cachedInputTokens: 64000 }) === 1);
});
