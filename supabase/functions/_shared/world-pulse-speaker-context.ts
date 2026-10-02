import type { SupabaseClient } from '@supabase/supabase-js';
import { applyWorldPulseEditorialCorrections, worldPulseV2Enabled } from './kivelle-world-pulse-v2.ts';
import { knownWorldPulseFacts } from '../../../packages/together-domain/src/world-pulse-v2.ts';

export type LinkedWorldPulseSpeakerContext = {
  eventId: string;
  title: string;
  occurredAt: string;
  locationName: string;
  roleLabel: string;
  perspective: string;
  knownFacts: { id: string; text: string }[];
  userSaw: { id: string; text: string }[];
};

export async function loadLinkedWorldPulseForSpeaker(input: {
  db: SupabaseClient; userId: string; continuityId: string; conversationId: string;
  characterTemplateId: string; userMessage?: string; now?: Date;
}): Promise<LinkedWorldPulseSpeakerContext | null> {
  if (!worldPulseV2Enabled()) return null;
  const now = (input.now ?? new Date()).toISOString();
  const linkResult = await input.db.from('together_world_pulse_conversation_links')
    .select('occurrence_id,context_snapshot,target_character_template_ids')
    .eq('user_id', input.userId).eq('continuity_id', input.continuityId)
    .eq('conversation_id', input.conversationId).gt('active_until', now)
    .order('created_at', { ascending: false }).limit(6);
  if (linkResult.error) return null;
  const links = (linkResult.data ?? []).filter((item) => item.target_character_template_ids?.includes(input.characterTemplateId));
  const message = (input.userMessage ?? '').toLowerCase();
  const link = links.find((item) => String(item.context_snapshot?.title ?? '').toLowerCase().split(/[^a-z0-9]+/)
    .some((word) => word.length > 4 && message.includes(word))) ?? links[0];
  if (!link) return null;
  const [occurrenceResult, participantResult] = await Promise.all([
    input.db.from('together_world_pulse_occurrences').select('id,title_snapshot,occurred_at,location_id,facts_snapshot')
      .eq('id', link.occurrence_id).maybeSingle(),
    input.db.from('together_world_pulse_occurrence_participants')
      .select('role_label_snapshot,perspective_snapshot,knowledge_snapshot')
      .eq('occurrence_id', link.occurrence_id).eq('character_template_id', input.characterTemplateId).maybeSingle(),
  ]);
  const occurrence = occurrenceResult.data, participant = participantResult.data;
  if (occurrenceResult.error || participantResult.error || !occurrence || !participant) return null;
  const [display = occurrence as Record<string, any>] = await applyWorldPulseEditorialCorrections(input.db, [occurrence]);
  const participantCopy = display.editorial_participant_copy?.[input.characterTemplateId];
  const locationResult = await input.db.from('together_locations').select('name').eq('id', occurrence.location_id).maybeSingle();
  const userSaw = Array.isArray(link.context_snapshot?.userVisibleFacts)
    ? link.context_snapshot.userVisibleFacts.map((fact: Record<string, unknown>) => ({ id: String(fact.id ?? ''), text: String(fact.text ?? '') })).filter((fact: { id: string; text: string }) => fact.id && fact.text)
    : [];
  return {
    eventId: String(occurrence.id), title: String(display.title_snapshot),
    occurredAt: String(occurrence.occurred_at), locationName: String(locationResult.data?.name ?? 'the event location'),
    roleLabel: String(participantCopy?.roleLabel ?? participant.role_label_snapshot),
    perspective: String(participantCopy?.perspective ?? participant.perspective_snapshot),
    knownFacts: knownWorldPulseFacts(display.facts_snapshot, input.characterTemplateId), userSaw,
  };
}
