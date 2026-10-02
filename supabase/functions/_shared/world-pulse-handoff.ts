import type { SupabaseClient } from '@supabase/supabase-js';
import { worldPulseIsDiscoverable } from '../../../packages/together-domain/src/world-pulse-v2.ts';
import { characterCanSpeak } from '../../../packages/together-domain/src/character-life-state.ts';
import { AppError } from './types.ts';
import { resolveWorldAccess } from './together-place.ts';
import { ensureCanonicalCompanionInstance } from './canonical-companion-meeting.ts';
import { applyWorldPulseEditorialCorrections, worldPulseV2EnabledForWorld } from './kivelle-world-pulse-v2.ts';
import { getActiveConversation } from './together-conversation.ts';
import { enforceActiveConversationLimit, resolveSubscriptionAccess } from './kivelle-subscription.ts';

type Row = Record<string, any>;

export async function requireFreshWorldPulse(input: {
  db: SupabaseClient; userId: string; continuityId: string; occurrenceId: string; now?: Date;
}): Promise<{ occurrence: Row; participants: Row[]; templates: Map<string, Row> }> {
  const { db } = input;
  const result = await db.from('together_world_pulse_occurrences').select('*')
    .eq('id', input.occurrenceId).eq('status', 'published').maybeSingle();
  if (result.error || !result.data) throw new AppError('NOT_FOUND', 'This World Pulse is unavailable.', 404);
  const [occurrence = result.data as Row] = await applyWorldPulseEditorialCorrections(db, [result.data as Row]);
  if (!await worldPulseV2EnabledForWorld(db, String(occurrence.world_id)))
    throw new AppError('NOT_FOUND', 'This World Pulse is unavailable.', 404);
  if (!worldPulseIsDiscoverable(String(occurrence.occurred_at), (input.now ?? new Date()).toISOString())) {
    console.info(JSON.stringify({ metric: 'world_pulse_v2_expired_handoff', occurrenceId: input.occurrenceId }));
    throw new AppError('WORLD_PULSE_EXPIRED', 'This World Pulse has passed.', 410);
  }
  const access = await resolveWorldAccess({ db, userId: input.userId, worldId: String(occurrence.world_id) });
  if (access === 'locked' || access === 'available') throw new AppError('FORBIDDEN', 'This world is unavailable.', 403);
  const participantResult = await db.from('together_world_pulse_occurrence_participants')
    .select('character_template_id,ordinal,role_label_snapshot,default_direct_message_snapshot')
    .eq('occurrence_id', occurrence.id).order('ordinal');
  if (participantResult.error) throw new AppError('INTERNAL_ERROR', 'Pulse participants could not be loaded.', 500, true);
  const participants = ((participantResult.data ?? []) as Row[]).map((participant) => {
    const copy = occurrence.editorial_participant_copy?.[String(participant.character_template_id)];
    return copy ? { ...participant, role_label_snapshot: copy.roleLabel,
      default_direct_message_snapshot: copy.defaultDirectMessage } : participant;
  });
  if (participants.length < 1 || participants.length > 4) throw new AppError('CONFLICT', 'This World Pulse has an invalid cast.', 409);
  const ids = participants.map((item) => String(item.character_template_id));
  if (new Set(ids).size !== ids.length) throw new AppError('CONFLICT', 'This World Pulse has an invalid cast.', 409);
  const templateResult = await db.from('together_character_templates')
    .select('*,together_character_versions(*)').in('id', ids)
    .eq('published', true).eq('lifecycle_status', 'published').eq('visibility', 'public').is('creator_id', null);
  if (templateResult.error || (templateResult.data?.length ?? 0) !== ids.length)
    throw new AppError('CONFLICT', 'A companion in this event is unavailable.', 409);
  const existing = await db.from('together_character_instances').select('character_template_id,life_state')
    .eq('user_id', input.userId).eq('continuity_id', input.continuityId)
    .in('character_template_id', ids);
  if (existing.error) throw new AppError('INTERNAL_ERROR', 'Companion state could not be loaded.', 500, true);
  if ((existing.data ?? []).some((item) => !characterCanSpeak(item.life_state)))
    throw new AppError('CONFLICT', 'A companion in this event cannot join a new conversation in this Life.', 409);
  const templates = new Map((templateResult.data ?? []).map((item) => [String(item.id), item as Row]));
  return { occurrence, participants, templates };
}

export async function ensurePulseInstance(input: {
  db: SupabaseClient; userId: string; continuityId: string; occurrence: Row; template: Row;
}): Promise<Row> {
  const version = (input.template.together_character_versions ?? []).find((item: Row) => Number(item.version) === Number(input.template.current_published_version));
  if (!version) throw new AppError('CONFLICT', 'A companion in this event is unavailable.', 409);
  const presence = await input.db.from('together_character_world_presence').select('id')
    .eq('world_id', input.occurrence.world_id).eq('character_version_id', version.id)
    .eq('presence_type', 'resident').maybeSingle();
  if (presence.error || !presence.data) throw new AppError('CONFLICT', 'A companion no longer lives in this world.', 409);
  const current = await input.db.from('together_character_instances').select('*')
    .eq('user_id', input.userId).eq('continuity_id', input.continuityId)
    .eq('character_template_id', input.template.id).maybeSingle();
  if (current.error) throw new AppError('INTERNAL_ERROR', 'Companion state could not be loaded.', 500, true);
  if (current.data && !characterCanSpeak(current.data.life_state))
    throw new AppError('CONFLICT', 'This companion cannot join a new conversation in this Life.', 409);
  return await ensureCanonicalCompanionInstance({ db: input.db, userId: input.userId,
    continuityId: input.continuityId, template: input.template, version,
    existing: current.data, preferredWorldId: String(input.occurrence.world_id) });
}

export async function openDirectFromWorldPulse(input: {
  db: SupabaseClient; userId: string; continuityId: string;
  occurrenceId: string; characterTemplateId: string; requestId: string;
}): Promise<{ conversation: Row; characterInstanceId: string; characterHandle: string; draft: string; occurrenceId: string }> {
  const { db } = input;
  const { occurrence, participants, templates } = await requireFreshWorldPulse(input);
  const participant = participants.find((item) => item.character_template_id === input.characterTemplateId);
  const template = templates.get(input.characterTemplateId);
  if (!participant || !template) throw new AppError('VALIDATION_FAILED', 'Choose a participant in this World Pulse.', 400);
  const existing = await db.from('together_character_instances').select('id,life_state')
    .eq('user_id', input.userId).eq('continuity_id', input.continuityId)
    .eq('character_template_id', template.id).maybeSingle();
  if (existing.error) throw new AppError('INTERNAL_ERROR', 'Companion state could not be loaded.', 500, true);
  if (existing.data && !characterCanSpeak(existing.data.life_state)) throw new AppError('CONFLICT', 'This companion cannot join a new conversation in this Life.', 409);
  const active = existing.data ? await getActiveConversation(db, input.userId, String(existing.data.id), false) : null;
  if (!active) {
    const subscription = await resolveSubscriptionAccess(db, input.userId);
    await enforceActiveConversationLimit(db, input.userId, subscription.capabilities);
  }
  const instance = await ensurePulseInstance({ db, userId: input.userId, continuityId: input.continuityId, occurrence, template });
  const opened = await db.rpc('kivelle_world_pulse_open_direct', {
    p_user_id: input.userId, p_continuity_id: input.continuityId,
    p_occurrence_id: occurrence.id, p_instance_id: instance.id,
  });
  if (opened.error || !opened.data) throw new AppError('INTERNAL_ERROR', 'The event could not be linked to your chat.', 500, true);
  const saved = await db.from('together_conversations').select('*').eq('id', opened.data)
    .eq('user_id', input.userId).eq('continuity_id', input.continuityId).single();
  if (saved.error || !saved.data) throw new AppError('INTERNAL_ERROR', 'Your chat could not be loaded.', 500, true);
  const conversation = saved.data;
  console.info(JSON.stringify({ metric: 'world_pulse_v2_direct_handoff', occurrenceId: input.occurrenceId,
    characterTemplateId: input.characterTemplateId, conversationId: conversation.id }));
  return { conversation: conversation as Row, characterInstanceId: String(instance.id),
    characterHandle: String(template.public_handle ?? template.slug),
    draft: String(participant.default_direct_message_snapshot), occurrenceId: String(occurrence.id) };
}
