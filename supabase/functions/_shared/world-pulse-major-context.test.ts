import { assertEquals } from 'jsr:@std/assert@1';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadRecentMajorWorldIncidents } from './world-pulse-major-context.ts';

function fakeDb(rows: Record<string, unknown[]>) {
  const reads: string[] = [];
  return { reads, db: { from(table: string) {
    reads.push(table);
    const query = {
      select() { return query; }, eq() { return query; }, in() { return query; },
      contains() { return query; }, gte() { return query; }, lte() { return query; },
      order() { return query; }, limit() { return query; },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve(resolve({ data: rows[table] ?? [], error: null }));
      },
    };
    return query;
  } } as unknown as SupabaseClient };
}

Deno.test('major incidents give residents public news but only witnesses their own packet', async () => {
  const now = new Date('2026-10-20T20:00:00Z');
  const rows = {
    together_character_world_presence: [{ world_id: 'eos' }],
    together_world_pulse_settings: [{ world_id: 'eos' }],
    together_world_pulse_occurrences: [
      { id: 'recent', world_id: 'eos', title_snapshot: 'The Reservoir Falls',
        feed_summary_snapshot: 'The main reservoir drops and water allotments tighten.',
        occurred_at: '2026-10-19T18:30:00Z', location_id: 'solace',
        facts_snapshot: [{ id: 'own', text: 'The bypass was partly open.', knownByCharacterTemplateIds: ['elian'] },
          { id: 'other', text: 'Naomi hid a note.', knownByCharacterTemplateIds: ['naomi'] }] },
      { id: 'older', world_id: 'eos', title_snapshot: 'The Colony Goes Cold',
        feed_summary_snapshot: 'Heating failed in two districts before crews restored it.',
        occurred_at: '2026-10-10T18:30:00Z', location_id: 'caldera', facts_snapshot: [] },
    ],
    together_world_pulse_editorial_corrections: [],
    together_world_pulse_occurrence_participants: [{ occurrence_id: 'recent', role_label_snapshot: 'Located the bypass',
      perspective_snapshot: 'I found the valve but not who opened it.' }],
    together_locations: [{ id: 'solace', name: 'Solace Reservoir' }, { id: 'caldera', name: 'Caldera Reactor' }],
  };
  const { db } = fakeDb(rows);
  const context = await loadRecentMajorWorldIncidents({ db, characterVersionId: 'version', characterTemplateId: 'elian', now });
  assertEquals(context.length, 2);
  assertEquals(context[0]?.involvement, 'participant');
  assertEquals(context[0]?.knownFacts, [{ id: 'own', text: 'The bypass was partly open.' }]);
  assertEquals(context[1]?.involvement, 'public');
  assertEquals(context[1]?.perspective, undefined);
});

Deno.test('nonresidents do not receive another world’s incident memory', async () => {
  const { db, reads } = fakeDb({ together_character_world_presence: [] });
  assertEquals(await loadRecentMajorWorldIncidents({ db, characterVersionId: 'visitor', characterTemplateId: 'visitor' }), []);
  assertEquals(reads, ['together_character_world_presence']);
});
