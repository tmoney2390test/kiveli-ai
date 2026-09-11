import { streamWavespeedDialogue } from './kivelle-wavespeed-dialogue.ts';
import { resolveChatTestExperiment } from './kivelle-chat-model-test.ts';
import type { DialogueContext, DialogueRunOptions } from './together-ai.ts';

const assert = (condition: unknown, message = 'Assertion failed') => { if (!condition) throw new Error(message); };
const owner = '0aaaa97b-a210-4d06-893a-7780bed71927';
const model = 'deepseek/deepseek-v4-flash';
const encode = (items: unknown[]) => items.map(item => `data: ${typeof item === 'string' ? item : JSON.stringify(item)}\n\n`).join('');
const reply = { model, choices: [{ delta: { content: 'Hello there.', reasoning_content: 'Never visible' }, finish_reason: 'stop' }] };

async function fixture(run: (f: { options: DialogueRunOptions; context: DialogueContext; rows: any[]; calls: string[]; state: { enabled: boolean; version: number }; conversation: any; db: any }) => Promise<void>) {
  const originalFetch = globalThis.fetch;
  const envNames = ['WAVESPEED_API_KEY', 'KIVELLE_WAVESPEED_CHAT_TEST_ENABLED', 'KIVELLE_VENICE_CHAT_TEST_ENABLED', 'KIVELLE_AI_COST_TELEMETRY_ENABLED'];
  const env = envNames.map(name => Deno.env.get(name));
  Deno.env.set('WAVESPEED_API_KEY', 'unit-test-only');
  Deno.env.delete('KIVELLE_WAVESPEED_CHAT_TEST_ENABLED');
  Deno.env.delete('KIVELLE_VENICE_CHAT_TEST_ENABLED'); Deno.env.delete('KIVELLE_AI_COST_TELEMETRY_ENABLED');
  const state = { enabled: true, version: 1 }, rows: any[] = [], calls: string[] = [];
  const conversation = { user_id: owner, metadata: { chatPreferences: { veniceTestModel: 'deepseek_v4_flash' } } };
  const db = {
    from(table: string) {
      const query = { select() { return query; }, eq() { return query; },
        maybeSingle: async () => ({ data: state, error: null }), single: async () => ({ data: conversation, error: null }),
        insert: async (row: any) => { assert(table === 'together_ai_usage_events'); rows.push(row); return { error: null }; },
      }; return query;
    },
    rpc: async (name: string) => { calls.push(name); return { data: name.includes('acquire') ? 'lease' : true, error: null }; },
  };
  try {
    const experiment = (await resolveChatTestExperiment(db, owner, conversation))!;
    const options: DialogueRunOptions = { route: { provider: 'wavespeed', requestedMode: 'explicit', resolvedMode: 'explicit', reason: 'adult_explicit', classification: 'explicit_adult', adultEligible: true, explicit: true, hardBlocked: false, experiment }, usageScope: { db, userId: owner, conversationId: 'test-chat' } };
    const context = { character: { name: 'Test companion', age: 30 }, userMessage: 'Hello', recent: [], relationship: {}, memories: [] } as unknown as DialogueContext;
    await run({ options, context, rows, calls, state, conversation, db });
  } finally {
    globalThis.fetch = originalFetch;
    envNames.forEach((name, i) => { if (env[i] === undefined) Deno.env.delete(name); else Deno.env.set(name, env[i]!); });
  }
}

Deno.test('WaveSpeed streams the exact model, captures terminal usage and releases its own capacity', () => fixture(async ({ options, context, rows, calls }) => {
  let requests = 0;
  globalThis.fetch = (url, init) => {
    requests++;
    assert(String(url) === 'https://llm.wavespeed.ai/v1/chat/completions');
    const body = JSON.parse(String(init?.body));
    assert(body.model === model && body.stream_options.include_usage && body.max_tokens > 0 && body.max_tokens <= 8192);
    assert(body.reasoning.enabled === false && body.include_reasoning === false && !body.venice_parameters && !body.fallbacks);
    return Promise.resolve(new Response(encode([{ ...reply, model: 'deepseek-v4-flash' }, { choices: [], usage: { prompt_tokens: 9000, completion_tokens: 600, prompt_cache_hit_tokens: 8000, completion_tokens_details: { reasoning_tokens: 50 } }, cost: { usd: 99 } }, '[DONE]'])));
  };
  const events = [];
  for await (const event of streamWavespeedDialogue(context, options)) events.push(event);
  assert(events[0]?.type === 'token' && events[0].token === 'Hello there.');
  const complete = events.at(-1);
  assert(complete?.type === 'complete' && complete.metadata.effectiveReasoning === 'provider_default');
  assert(complete?.type === 'complete' && complete.metadata.chatModelTest?.provider === 'wavespeed' && !complete.metadata.veniceTest);
  assert(requests === 1 && rows.length === 1 && rows[0].success && rows[0].provider === 'wavespeed');
  assert(rows[0].provider_cost_usd == null && Math.abs(rows[0].estimated_cost_usd - 0.000532) < 1e-10);
  assert(calls.at(-1) === 'kivelle_release_provider_slot');
}));

Deno.test('WaveSpeed rejects errors, partial replies, missing/different models and invalid finish reasons without retrying', () => fixture(async ({ options, context, rows, calls }) => {
  const cases = [
    new Response('busy', { status: 429 }), new Response(encode([reply])),
    new Response(encode([{ ...reply, model: 'deepseek/deepseek-v4-pro' }, '[DONE]'])),
    new Response(encode([{ ...reply, model: undefined }, '[DONE]'])),
    new Response(encode([{ ...reply, choices: [{ delta: {}, finish_reason: 'stop' }] }, '[DONE]'])),
    new Response(encode([{ ...reply, choices: [{ delta: { content: 'partial' }, finish_reason: 'content_filter' }] }, '[DONE]'])),
    new Response(encode([reply, { error: 'upstream failed' }, '[DONE]'])),
    new Response('data: {"choices":'),
  ];
  let requests = 0;
  for (const response of cases) {
    globalThis.fetch = () => { requests++; return Promise.resolve(response); };
    let failed = false;
    try { for await (const event of streamWavespeedDialogue(context, { ...options, providerAttemptBudget: { max: 1, used: 0 } })) { void event; } } catch { failed = true; }
    assert(failed);
  }
  assert(requests === cases.length && rows.length === cases.length);
  assert(rows.every(row => !row.success && row.estimated_cost_usd > 0 && row.metadata.usageMissing));
  assert(calls.filter(name => name.includes('release')).length === cases.length);
}));

Deno.test('WaveSpeed cancellation and missing usage preserve conservative cost records', () => fixture(async ({ options, context, rows, calls }) => {
  globalThis.fetch = () => Promise.resolve(new Response(encode([reply, '[DONE]'])));
  for await (const event of streamWavespeedDialogue(context, options)) { assert(event.type === 'token'); break; }
  assert(rows[0].success === false && rows[0].error_code === 'WAVESPEED_CONSUMER_STOPPED');
  const events = [];
  for await (const event of streamWavespeedDialogue(context, options)) events.push(event);
  const completed = events.at(-1);
  assert(completed?.type === 'complete' && completed.metadata.usageMissing && completed.metadata.costSource === 'estimated_upper_bound');
  assert(rows.every(row => row.estimated_cost_usd > 0));
  assert(calls.filter(name => name.includes('release')).length === 2);
}));

Deno.test('WaveSpeed revocation, ownership changes and forged provider fail before outbound requests', () => fixture(async ({ options, context, rows, calls, state, conversation }) => {
  let requests = 0;
  globalThis.fetch = () => { requests++; throw new Error('Unexpected request'); };
  for (const mutate of [() => { state.enabled = false; }, () => { state.enabled = true; conversation.user_id = 'other'; }, () => { conversation.user_id = owner; options.route.experiment!.provider = 'venice'; }]) {
    mutate(); let failed = false;
    try { for await (const event of streamWavespeedDialogue(context, options)) { void event; } } catch { failed = true; }
    assert(failed);
  }
  assert(requests === 0 && rows.length === 0 && calls.length === 0);
}));
