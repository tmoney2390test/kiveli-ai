import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { eligibleInitiativeThreads, eventInitiativeSource, planInitiativeSource, threadInitiativeSource, userResumedAfterQueue } from './kivelle-proactive-context.ts';

const now = new Date('2026-09-07T12:00:00Z');
Deno.test('a used or already asked thread cannot block a new topic', () => {
  const threads = [
    { id: 'used', importance: 1, expected_at: '2026-09-06T12:00:00Z' },
    { id: 'asked', importance: .99, expected_at: '2026-09-06T12:00:00Z', followup_count: 1 },
    { id: 'resolved', importance: .98, expected_at: '2026-09-06T12:00:00Z', resolved_at: now.toISOString() },
    { id: 'future', importance: .97, expected_at: '2026-09-08T12:00:00Z' },
    { id: 'new', importance: .8, expected_at: '2026-09-06T12:00:00Z' },
  ];
  assertEquals(eligibleInitiativeThreads(threads, new Set(['thread:used']), now).map((thread) => thread.id), ['new']);
});

Deno.test('follow-ups retain the full topic and never claim a reminder was requested', () => {
  const source = threadInitiativeSource({ display_subject: 'your second interview at the museum',
    topic: 'The user was nervous about meeting the director.', source_message_id: 'original', expected_at: now.toISOString() });
  assert(source?.draft.includes('second interview at the museum'));
  assert(source?.summary.includes('nervous about meeting the director'));
  assertEquals(source?.sourceMessageId, 'original');
  assertEquals(threadInitiativeSource({ subject: 'event' }), null);
});

Deno.test('event updates are grounded in the event and never deliver raw narrator prose as a fallback', () => {
  const source = eventInitiativeSource({ narrative_summary: 'Evelyn found a damaged first edition.', starts_at: now.toISOString() });
  assertEquals(source?.summary, 'Evelyn found a damaged first edition.');
  assertEquals(source?.allowFallback, false);
});

Deno.test('quiet-hour plan reminders use current timing and cancelled plans are suppressed', () => {
  const plan = { title: 'Coffee at the gallery', status: 'scheduled', starts_at: '2026-09-07T11:30:00Z', ends_at: '2026-09-07T13:00:00Z' };
  assertEquals(planInitiativeSource(plan, now, 'UTC', false)?.draft, 'Our plan, Coffee at the gallery, has started.');
  assertEquals(planInitiativeSource({ ...plan, status: 'cancelled' }, now, 'UTC', false), null);
  assertEquals(planInitiativeSource({ ...plan, ends_at: '2026-09-07T11:45:00Z' }, now, 'UTC', false), null);
});

Deno.test('resuming chat invalidates a queued ambient message without suppressing an explicit plan reminder', () => {
  const proactive = { created_at: '2026-09-06T23:00:00Z', context: { lastMessageAt: '2026-09-06T18:00:00Z' } };
  const userMessage = { created_at: '2026-09-07T09:00:00Z' };
  assertEquals(userResumedAfterQueue(proactive, userMessage), true);
  assertEquals(userResumedAfterQueue({ ...proactive, dedupe_key: 'plan:pre:123' }, userMessage), false);
});
