import { streamVeniceDialogue, veniceDialogueBody } from './kivelle-venice-dialogue.ts';
import { resolveChatTestExperiment } from './kivelle-chat-model-test.ts';
import type { DialogueContext, DialogueRunOptions } from './together-ai.ts';

const assert = (condition: unknown, message = 'Assertion failed') => { if (!condition) throw new Error(message); };
const owner = '0aaaa97b-a210-4d06-893a-7780bed71927';
const model = 'venice-uncensored-1-2';
const encode = (items: unknown[]) => items.map(item => `data: ${typeof item === 'string' ? item : JSON.stringify(item)}\n\n`).join('');
const reply = { model, choices: [{ delta: { content: 'Hello there.', reasoning_content: 'Never visible' }, finish_reason: 'stop' }] };

async function fixture(run: (f: { options: DialogueRunOptions; context: DialogueContext; rows: any[]; calls: string[]; state: { enabled: boolean; version: number }; conversation: any; db: any }) => Promise<void>) {
  const originalFetch = globalThis.fetch;
  const envNames = ['VENICE_API_KEY', 'KIVELLE_VENICE_CHAT_TEST_ENABLED', 'KIVELLE_AI_COST_TELEMETRY_ENABLED'];
  const env = envNames.map(name => Deno.env.get(name));
  Deno.env.set('VENICE_API_KEY', 'unit-test-only');
  Deno.env.delete('KIVELLE_VENICE_CHAT_TEST_ENABLED'); Deno.env.delete('KIVELLE_AI_COST_TELEMETRY_ENABLED');
  const state = { enabled: true, version: 1 }, rows: any[] = [], calls: string[] = [];
  const conversation = { user_id: owner, metadata: { chatPreferences: { veniceTestModel: 'uncensored_1_2' } } };
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
    const options: DialogueRunOptions = { route: { provider: 'venice', requestedMode: 'explicit', resolvedMode: 'explicit', reason: 'adult_explicit', classification: 'explicit_adult', adultEligible: true, explicit: true, hardBlocked: false, experiment }, usageScope: { db, userId: owner, conversationId: 'test-chat' } };
    const context = { character: { name: 'Test companion', age: 30 }, userMessage: 'Hello', recent: [], relationship: {}, memories: [] } as unknown as DialogueContext;
    await run({ options, context, rows, calls, state, conversation, db });
  } finally {
    globalThis.fetch = originalFetch;
    envNames.forEach((name, i) => { if (env[i] === undefined) Deno.env.delete(name); else Deno.env.set(name, env[i]!); });
  }
}

Deno.test('Venice adapter records terminal usage, sends bounded text-only parameters and releases capacity', () => fixture(async ({ options, context, rows, calls }) => {
  let requests = 0;
  globalThis.fetch = (_url, init) => {
    requests++;
    const body = JSON.parse(String(init?.body));
    assert(body.model === model && body.stream_options.include_usage && body.max_completion_tokens > 0);
    assert(!body.reasoning_effort && !body.tools && !body.fallbacks);
    assert(body.venice_parameters.include_venice_system_prompt === false);
    return Promise.resolve(new Response(encode([reply, { choices: [], usage: { prompt_tokens: 100, completion_tokens: 3 }, cost: { usd: 0.00003 } }, '[DONE]'])));
  };
  const events = [];
  for await (const event of streamVeniceDialogue(context, options)) events.push(event);
  assert(events[0]?.type === 'token' && events[0].token === 'Hello there.');
  assert(events.at(-1)?.type === 'complete');
  assert(requests === 1 && rows.length === 1 && rows[0].success && rows[0].provider_cost_usd === 0.00003);
  assert(calls.at(-1) === 'kivelle_release_provider_slot');
  assert(!('temperature' in veniceDialogueBody(model, 'Hello', 20)));
}));

Deno.test('Venice errors, truncation and model mismatch never fall back and still record cost and release capacity', () => fixture(async ({ options, context, rows, calls }) => {
  const cases = [new Response('busy', { status: 429 }), new Response(encode([reply])), new Response(encode([{ ...reply, model: 'unexpected-model' }, '[DONE]'])), new Response(encode([{ ...reply, choices: [{ delta: {}, finish_reason: 'stop' }] }, '[DONE]']))];
  let requests = 0;
  for (const response of cases) {
    globalThis.fetch = () => { requests++; return Promise.resolve(response); };
    let failed = false;
    try { for await (const event of streamVeniceDialogue(context, { ...options, providerAttemptBudget: { max: 1, used: 0 } })) { void event; } } catch { failed = true; }
    assert(failed);
  }
  assert(requests === cases.length && rows.length === cases.length);
  assert(rows.every(row => !row.success && row.estimated_cost_usd > 0 && row.metadata.usageMissing));
  assert(calls.filter(name => name.includes('release')).length === cases.length);
}));

Deno.test('Venice consumer cancellation and usage-less success keep conservative cost telemetry', () => fixture(async ({ options, context, rows, calls }) => {
  globalThis.fetch = () => Promise.resolve(new Response(encode([reply, { cost: { usd: 0.001 } }, '[DONE]'])));
  for await (const event of streamVeniceDialogue(context, options)) { assert(event.type === 'token'); break; }
  assert(rows[0].success === false && rows[0].error_code === 'VENICE_CONSUMER_STOPPED' && rows[0].estimated_cost_usd > 0);
  const events = [];
  for await (const event of streamVeniceDialogue(context, options)) events.push(event);
  const completed = events.at(-1);
  assert(completed?.type === 'complete' && completed.metadata.usageMissing === true);
  assert(rows[1].provider_cost_usd === 0.001 && rows[1].metadata.usageMissing);
  assert(calls.filter(name => name.includes('release')).length === 2);
}));

Deno.test('revocation prevents the next outbound request even with a previously selected model', () => fixture(async ({ options, context, rows, calls, state }) => {
  state.enabled = false;
  let requests = 0, failed = false;
  globalThis.fetch = () => { requests++; throw new Error('Unexpected provider request'); };
  try { for await (const event of streamVeniceDialogue(context, options)) { void event; } } catch { failed = true; }
  assert(failed && requests === 0 && rows.length === 0 && calls.length === 0);
}));
