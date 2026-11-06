import type { SupabaseClient } from '@supabase/supabase-js';
import { knownWorldPulseFacts } from '../../../packages/together-domain/src/world-pulse-v2.ts';
import { applyWorldPulseEditorialCorrections, worldPulseV2Enabled } from './kivelle-world-pulse-v2.ts';

export type MajorWorldIncidentContext = {
  id: string;
  title: string;
  occurredAt: string;
  locationName: string;
  publicSummary: string;
  involvement: 'public' | 'participant';
  roleLabel?: string;
  perspective?: string;
  knownFacts?: { id: string; text: string }[];
};

/** Global news, scoped to the speaker's canonical resident world. No Life state
 * is changed by reading this. Only a participant receives their own packet. */
export async function loadRecentMajorWorldIncidents(input: {
  db: SupabaseClient; characterVersionId: string; characterTemplateId: string; now?: Date;
}): Promise<MajorWorldIncidentContext[]> {
  if (!worldPulseV2Enabled()) return [];
  const now = input.now ?? new Date();
  const presence = await input.db.from('together_character_world_presence').select('world_id')
    .eq('character_version_id', input.characterVersionId).eq('presence_type', 'resident');
  if (presence.error) { console.warn(JSON.stringify({ metric: 'major_pulse_context_read_failed', stage: 'presence' })); return []; }
  if (!presence.data?.length) return [];
  const worldIds = [...new Set(presence.data.map((row) => String(row.world_id)))];
  const settings = await input.db.from('together_world_pulse_settings').select('world_id')
    .in('world_id', worldIds).eq('enabled', true);
  if (settings.error) { console.warn(JSON.stringify({ metric: 'major_pulse_context_read_failed', stage: 'settings' })); return []; }
  if (!settings.data?.length) return [];
  const enabledIds = settings.data.map((row) => String(row.world_id));
  const result = await input.db.from('together_world_pulse_occurrences')
    .select('id,world_id,title_snapshot,feed_summary_snapshot,occurred_at,location_id,facts_snapshot,metadata')
    .in('world_id', enabledIds).eq('status', 'published')
    .contains('metadata', { pulseTier: 'major' })
    .gte('occurred_at', new Date(now.getTime() - 120 * 86_400_000).toISOString())
    .lte('occurred_at', now.toISOString())
    .order('occurred_at', { ascending: false }).limit(40);
  if (result.error) { console.warn(JSON.stringify({ metric: 'major_pulse_context_read_failed', stage: 'occurrences' })); return []; }
  if (!result.data?.length) return [];
  const rows = await applyWorldPulseEditorialCorrections(input.db, result.data);
  const ids = rows.map((row) => String(row.id));
  const [participants, locations] = await Promise.all([
    input.db.from('together_world_pulse_occurrence_participants')
      .select('occurrence_id,role_label_snapshot,perspective_snapshot')
      .in('occurrence_id', ids).eq('character_template_id', input.characterTemplateId),
    input.db.from('together_locations').select('id,name')
      .in('id', [...new Set(rows.map((row) => String(row.location_id)))]),
  ]);
  if (participants.error || locations.error) {
    console.warn(JSON.stringify({ metric: 'major_pulse_context_read_failed', stage: 'participants_or_locations' }));
    return [];
  }
  const byOccurrence = new Map((participants.data ?? []).map((row) => [String(row.occurrence_id), row]));
  const byLocation = new Map((locations.data ?? []).map((row) => [String(row.id), String(row.name)]));
  const publicIds = new Set(rows.slice(0, 4).map((row) => String(row.id)));
  const involvedIds = new Set(rows.filter((row) => byOccurrence.has(String(row.id))).slice(0, 3).map((row) => String(row.id)));
  return rows.filter((row) => publicIds.has(String(row.id)) || involvedIds.has(String(row.id)))
    .map((row): MajorWorldIncidentContext => {
      const participant = byOccurrence.get(String(row.id));
      const ownCopy = row.editorial_participant_copy?.[input.characterTemplateId];
      return { id: String(row.id), title: String(row.title_snapshot), occurredAt: String(row.occurred_at),
        locationName: byLocation.get(String(row.location_id)) ?? 'the incident site',
        publicSummary: String(row.feed_summary_snapshot),
        involvement: participant ? 'participant' : 'public',
        ...(participant ? { roleLabel: String(ownCopy?.roleLabel ?? participant.role_label_snapshot),
          perspective: String(ownCopy?.perspective ?? participant.perspective_snapshot),
          knownFacts: knownWorldPulseFacts(row.facts_snapshot, input.characterTemplateId) } : {}),
      };
    });
}
