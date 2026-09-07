import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { persistCharacterInitiative } from './kivelle-proactive-delivery.ts';

type Row = Record<string, any>;
const now = new Date('2026-09-07T12:00:00Z');
const yesterday = '2026-09-06T18:00:00Z';

// In-memory PostgREST fixture: execute filters/conditional writes against shared rows,
// so recovery and competing workers exercise the real delivery function.
function fixture() {
  const proactive: Row = { id: 'initiative', user_id: 'user', character_instance_id: 'character', conversation_id: 'conversation',
    open_thread_id: 'thread', dedupe_key: 'thread:thread', content: 'Old queued draft.', reason: 'An unresolved topic from the user',
    status: 'queued', created_at: '2026-09-06T23:30:00Z', updated_at: '2026-09-06T23:30:00Z',
    context: { lastMessageAt: yesterday, messageKind: 'initiative' } };
  const tables: Record<string, Row[]> = {
    together_proactive_messages: [structuredClone(proactive)],
    together_messages: [{ id: 'original', user_id: 'user', character_instance_id: 'character', conversation_id: 'conversation',
      role: 'user', content: 'My museum interview is tomorrow. I am nervous about meeting the director.', created_at: yesterday,
      delivery_status: 'complete', visibility_scope: 'all', content_rating: 'safe' }],
    together_open_threads: [{ id: 'thread', user_id: 'user', character_instance_id: 'character', subject: 'the museum interview',
      topic: 'The user was nervous about meeting the museum director.', source_message_id: 'original', importance: .9,
      expected_at: '2026-09-07T10:00:00Z', followup_count: 0, last_followed_up_at: null, resolved_at: null,
      follow_up_eligible: true, visibility_scope: 'all', content_rating: 'safe' }],
    together_conversations: [{ id: 'conversation', user_id: 'user', continuity_id: 'continuity', kind: 'direct', archived_at: null,
      last_message_at: yesterday, metadata: { chatPreferences: { responseStyle: 'texting', chatLanguage: 'en' } } }],
    together_character_instances: [{ id: 'character', user_id: 'user', continuity_id: 'continuity', relationship_stage: 'friend',
      current_activity: 'opening the bookshop', current_location_id: 'bookshop',
      together_character_templates: { name: 'Evelyn', occupation: 'Bookseller' },
      together_character_versions: { character_bible: { voice: { cadence: 'Dry and spare.' } } } }],
    together_relationship_states: [{ character_instance_id: 'character', user_id: 'user', trust: 40, familiarity: 35, comfort: 30 }],
    together_entitlements: [{ user_id: 'user', tier: 'premium', expires_at: null }],
    together_shared_plans: [], together_life_events: [], together_character_schedule_events: [],
  };
  const failures = { messageInsert: false, threadWrite: false };
  const field = (row: Row, key: string): any => key.split(/->>?/).reduce((value, part) => value?.[part], row);
  class Query {
    predicates: Array<(row: Row) => boolean> = [];
    operation = 'select'; values: Row = {}; singleRow = false; cap = Infinity;
    orders: Array<{ key: string; ascending: boolean }> = [];
    constructor(readonly table: string) {}
    select(_columns = '*') { return this; }
    update(values: Row) { this.operation = 'update'; this.values = values; return this; }
    insert(values: Row) { this.operation = 'insert'; this.values = values; return this; }
    eq(key: string, value: unknown) { this.predicates.push((row) => field(row, key) === value); return this; }
    neq(key: string, value: unknown) { this.predicates.push((row) => field(row, key) !== value); return this; }
    is(key: string, value: unknown) { this.predicates.push((row) => value === null ? field(row, key) == null : field(row, key) === value); return this; }
    in(key: string, values: unknown[]) { this.predicates.push((row) => values.includes(field(row, key))); return this; }
    contains(key: string, values: unknown[]) { this.predicates.push((row) => values.every((value) => field(row, key)?.includes(value))); return this; }
    lt(key: string, value: any) { this.predicates.push((row) => field(row, key) < value); return this; }
    or(expression: string) {
      const alternatives = expression.split(',').map((part) => {
        const match = /^(.*?)\.(is|lt|lte)\.(.*)$/.exec(part)!;
        return (row: Row) => match[2] === 'is' ? field(row, match[1]!) == null :
          match[2] === 'lt' ? field(row, match[1]!) < match[3]! : field(row, match[1]!) <= match[3]!;
      });
      this.predicates.push((row) => alternatives.some((test) => test(row))); return this;
    }
    order(key: string, options: Row = {}) { this.orders.push({ key, ascending: options.ascending !== false }); return this; }
    limit(cap: number) { this.cap = cap; return this; }
    maybeSingle() { this.singleRow = true; return this; }
    single() { this.singleRow = true; return this; }
    then(resolve: (value: any) => unknown, reject?: (error: unknown) => unknown) {
      return Promise.resolve().then(() => {
        if (this.operation === 'insert' && this.table === 'together_messages' && failures.messageInsert) {
          failures.messageInsert = false; return { data: null, error: { code: 'FAILED_INSERT' } };
        }
        if (this.operation === 'update' && this.table === 'together_open_threads' && failures.threadWrite) {
          failures.threadWrite = false; return { data: null, error: { code: 'FAILED_THREAD_WRITE' } };
        }
        const source = tables[this.table] ??= [];
        let rows = source.filter((row) => this.predicates.every((test) => test(row)));
        if (this.operation === 'insert') {
          if (source.some((row) => this.values.response_key && row.response_key === this.values.response_key)) return { data: null, error: { code: '23505' } };
          const inserted = { id: `message-${source.length}`, created_at: now.toISOString(), ...structuredClone(this.values) };
          source.push(inserted); rows = [inserted];
        } else if (this.operation === 'update') rows.forEach((row) => Object.assign(row, structuredClone(this.values)));
        else rows.sort((a, b) => {
          for (const { key, ascending } of this.orders) {
            const first = field(a, key), second = field(b, key);
            if (first != null && second != null && first !== second) return (first > second ? 1 : -1) * (ascending ? 1 : -1);
          }
          return 0;
        });
        rows = rows.slice(0, this.cap);
        return { data: structuredClone(this.singleRow ? rows[0] ?? null : rows), error: null };
      }).then(resolve, reject);
    }
  }
  const db = { from: (table: string) => new Query(table) } as unknown as SupabaseClient;
  return { db, proactive, tables, failures, run: () => persistCharacterInitiative({ db, proactive: structuredClone(tables.together_proactive_messages![0]!), userId: 'user', now, timezone: 'America/New_York' }) };
}

async function withModel(action: (calls: { count: number; prompt: string }) => Promise<void>, onGenerate?: () => void, output?: string) {
  const originalFetch = globalThis.fetch;
  const keys = ['OPENAI_API_KEY', 'KIVELLE_PROACTIVE_VOICE_ENABLED', 'KIVELLE_AI_COST_TELEMETRY_ENABLED'];
  const previous = keys.map((key) => Deno.env.get(key));
  Deno.env.set(keys[0]!, 'test-only'); Deno.env.set(keys[1]!, 'true'); Deno.env.set(keys[2]!, 'false');
  const calls = { count: 0, prompt: '' };
  globalThis.fetch = async (_url, options) => {
    calls.count++; calls.prompt = JSON.parse(String(options?.body)).input; onGenerate?.();
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text',
      text: output ?? '**Evelyn:**\\nHow did the museum interview go?\\nYou sounded nervous last night.' }] }] });
  };
  try { await action(calls); } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, index) => previous[index] === undefined ? Deno.env.delete(key) : Deno.env.set(key, previous[index]!));
  }
}

Deno.test('next-day generation uses current time and original disclosure, then records a shared follow-up', async () => {
  const f = fixture();
  await withModel(async (calls) => {
    const delivered = await f.run();
    assert(delivered);
    assert(calls.prompt.includes('2026-09-07T12:00:00.000Z'));
    assert(calls.prompt.includes('nervous about meeting the director'));
    assertEquals(delivered.proactive.content, 'How did the museum interview go? You sounded nervous last night.');
    assertEquals(f.tables.together_open_threads![0]!.followup_count, 1);
    assertEquals(f.tables.together_open_threads![0]!.follow_up_eligible, true); // An answer may still resolve the thread.
    assertEquals(f.tables.together_messages![1]!.response_key, 'proactive:initiative');
    assertEquals(calls.count, 1);
  });
});

Deno.test('answered topics and overnight user replies suppress generation', async () => {
  for (const changed of ['thread', 'user']) {
    const f = fixture();
    if (changed === 'thread') f.tables.together_open_threads![0]!.resolved_at = '2026-09-07T09:00:00Z';
    else f.tables.together_messages!.push({ role: 'user', user_id: 'user', conversation_id: 'conversation', created_at: '2026-09-07T09:00:00Z' });
    await withModel(async (calls) => {
      assertEquals(await f.run(), null); assertEquals(calls.count, 0);
      assertEquals(f.tables.together_proactive_messages![0]!.status, 'cancelled');
    });
  }
});

Deno.test('a user response during model generation prevents the stale message from being inserted', async () => {
  const f = fixture();
  await withModel(async () => {
    assertEquals(await f.run(), null);
    assertEquals(f.tables.together_messages!.filter((message) => message.role === 'assistant').length, 0);
    assertEquals(f.tables.together_open_threads![0]!.followup_count, 0);
  }, () => f.tables.together_messages!.push({ role: 'user', user_id: 'user', conversation_id: 'conversation', created_at: now.toISOString() }));
});

Deno.test('recovery after a persisted message does not repeat generation or delivery', async () => {
  const f = fixture(); f.failures.threadWrite = true;
  await withModel(async (calls) => {
    await assertRejects(f.run, Error, 'INITIATIVE_THREAD_DELIVERY_WRITE_FAILED');
    assertEquals(f.tables.together_proactive_messages![0]!.status, 'queued');
    assertEquals(f.tables.together_open_threads![0]!.followup_count, 0);
    assert(await f.run());
    assertEquals(calls.count, 1);
    assertEquals(f.tables.together_messages!.filter((message) => message.role === 'assistant').length, 1);
    assertEquals(f.tables.together_open_threads![0]!.followup_count, 1);
  });
});

Deno.test('competing workers produce one generated message', async () => {
  const f = fixture();
  await withModel(async (calls) => {
    const delivered = await Promise.all([f.run(), f.run()]);
    assertEquals(delivered.filter(Boolean).length, 1);
    assertEquals(calls.count, 1);
    assertEquals(f.tables.together_messages!.filter((message) => message.role === 'assistant').length, 1);
  });
});

Deno.test('failed message persistence never marks a follow-up delivered', async () => {
  const f = fixture(); f.failures.messageInsert = true;
  await withModel(async () => {
    await assertRejects(f.run, Error, 'INITIATIVE_MESSAGE_INSERT_FAILED');
    assertEquals(f.tables.together_open_threads![0]!.followup_count, 0);
    assertEquals(f.tables.together_proactive_messages![0]!.status, 'queued');
  });
});

Deno.test('changing chat preferences during generation cancels the obsolete format', async () => {
  const f = fixture();
  await withModel(async () => assertEquals(await f.run(), null), () => {
    f.tables.together_conversations![0]!.metadata.chatPreferences.responseStyle = 'paragraph';
  });
});

Deno.test('a model electing to skip an already discussed topic does not trigger canned fallback', async () => {
  const f = fixture();
  await withModel(async () => {
    assertEquals(await f.run(), null);
    assertEquals(f.tables.together_messages!.filter((message) => message.role === 'assistant').length, 0);
  }, undefined, '""');
});

Deno.test('group plan reminders retain their speaker and survive recent user activity', async () => {
  const f = fixture();
  Object.assign(f.tables.together_proactive_messages![0]!, { open_thread_id: null, dedupe_key: 'group-plan:pre:plan',
    context: { messageKind: 'plan_reminder', groupPlanId: 'plan', lastMessageAt: yesterday } });
  f.tables.together_conversations![0]!.kind = 'group';
  f.tables.together_shared_plans!.push({ id: 'plan', user_id: 'user', participant_instance_ids: ['character'],
    title: 'Gallery coffee', status: 'scheduled', starts_at: '2026-09-07T14:00:00Z', ends_at: '2026-09-07T15:00:00Z' });
  f.tables.together_messages!.push({ role: 'user', user_id: 'user', conversation_id: 'conversation', created_at: now.toISOString() });
  await withModel(async () => {
    assert(await f.run());
    assertEquals(f.tables.together_messages!.at(-1)!.speaker_character_instance_id, 'character');
    assertEquals(f.tables.together_messages!.at(-1)!.content, 'Gallery coffee is at 10:00 AM. See you then.');
  }, undefined, 'Gallery coffee is at 10:00 AM. See you then.');
});

Deno.test('a cancelled plan is checked again after generation', async () => {
  const f = fixture();
  Object.assign(f.tables.together_proactive_messages![0]!, { open_thread_id: null, dedupe_key: 'plan:pre:plan' });
  f.tables.together_shared_plans!.push({ id: 'plan', user_id: 'user', participant_instance_ids: ['character'],
    title: 'Gallery coffee', status: 'scheduled', starts_at: '2026-09-07T14:00:00Z', ends_at: '2026-09-07T15:00:00Z' });
  await withModel(async () => assertEquals(await f.run(), null), () => { f.tables.together_shared_plans![0]!.status = 'cancelled'; },
    'Gallery coffee is at 10:00 AM. See you then.');
});

Deno.test('invalid event output never falls back to narrator prose', async () => {
  const f = fixture();
  Object.assign(f.tables.together_proactive_messages![0]!, { open_thread_id: null, life_event_id: 'event', dedupe_key: 'event:event' });
  f.tables.together_life_events!.push({ id: 'event', user_id: 'user', character_instance_id: 'character', user_should_know: true,
    narrative_summary: 'Evelyn found a damaged first edition.', starts_at: yesterday });
  await withModel(async () => {
    assertEquals(await f.run(), null);
    assertEquals(f.tables.together_messages!.filter((message) => message.role === 'assistant').length, 0);
  }, undefined, '*walks over to you* The first edition is damaged.');
});

Deno.test('disabling initiative during generation prevents insertion', async () => {
  const f = fixture();
  await withModel(async () => {
    assertEquals(await f.run(), null);
    assertEquals(f.tables.together_messages!.filter((message) => message.role === 'assistant').length, 0);
  }, () => { f.tables.together_proactive_messages![0]!.status = 'cancelled'; });
});

Deno.test('disabling open-thread memory suppresses an already queued follow-up', async () => {
  const f = fixture(); f.tables.together_profiles = [{ user_id: 'user', memory_categories: { open_thread: false } }];
  await withModel(async (calls) => { assertEquals(await f.run(), null); assertEquals(calls.count, 0); });
});
