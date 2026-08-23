import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';
import { assertCharacterResidentInWorld } from './together-place.ts';
import { track } from './together.ts';

type Row = Record<string, any>;

export type ResolvedPlanRoster = {
  participantInstanceIds: string[];
  participantNames: string[];
  groupConversationId?: string;
  groupTitle?: string;
};

/** Mirror the canonical future-planning evidence onto every non-anchor member. */
export async function recordGroupPlanCommitment(db: SupabaseClient, input: {
  userId: string;
  plan: Row;
}) {
  const anchorId = String(input.plan.character_instance_id);
  const ids = planParticipantIds(input.plan).filter((id) => id !== anchorId);
  for (const characterInstanceId of ids) {
    try {
      await db.rpc('kivelle_insert_relationship_evidence', {
        p_user_id: input.userId,
        p_character_instance_id: characterInstanceId,
        p_type: 'future_planning',
        p_source_type: 'shared_plan',
        p_source_id: input.plan.id,
        p_occurred_at: input.plan.created_at ?? new Date().toISOString(),
        p_quality: .65,
        p_valence: .4,
        p_timezone: String(input.plan.user_timezone ?? input.plan.world_timezone ?? 'UTC'),
        p_metadata: { groupPlan: true, participantInstanceIds: planParticipantIds(input.plan), title: input.plan.title, startsAt: input.plan.starts_at },
      });
    } catch { /* The plan is canonical even if optional evidence is unavailable. */ }
  }
}

/** Resolve the server-authoritative plan roster from the conversation. */
export async function resolveSharedPlanRoster(db: SupabaseClient, input: {
  userId: string;
  continuityId: string;
  anchorCharacterInstanceId: string;
  sourceConversationId?: string;
  worldId: string;
}): Promise<ResolvedPlanRoster> {
  if (!input.sourceConversationId) return { participantInstanceIds: [input.anchorCharacterInstanceId], participantNames: [] };
  const { data: conversation } = await db.from('together_conversations').select('id,kind,title').eq('id', input.sourceConversationId).eq('user_id', input.userId).eq('continuity_id', input.continuityId).is('archived_at', null).maybeSingle();
  if (!conversation) throw new AppError('NOT_FOUND', 'That conversation is no longer available.', 404);
  if (conversation.kind !== 'group') return { participantInstanceIds: [input.anchorCharacterInstanceId], participantNames: [] };

  const { data: participants, error } = await db.from('together_conversation_participants').select('character_instance_id,together_character_instances!inner(id,character_version_id,together_character_templates(name))').eq('conversation_id', conversation.id).eq('user_id', input.userId).eq('continuity_id', input.continuityId).is('left_at', null).order('joined_at');
  if (error) throw new AppError('INTERNAL_ERROR', 'The group roster could not be verified for this plan.', 500, true);
  const rows = (participants ?? []) as Row[];
  const participantInstanceIds = [...new Set(rows.map((row) => String(row.character_instance_id)))];
  if (participantInstanceIds.length < 2 || participantInstanceIds.length > 5 || !participantInstanceIds.includes(input.anchorCharacterInstanceId)) throw new AppError('CONFLICT', 'The group roster changed. Reopen the group and try again.', 409, true);
  for (const row of rows) await assertCharacterResidentInWorld({ db, characterVersionId: String(row.together_character_instances.character_version_id), worldId: input.worldId });
  return {
    participantInstanceIds,
    participantNames: rows.map((row) => String(row.together_character_instances.together_character_templates?.name ?? '')).filter(Boolean),
    groupConversationId: String(conversation.id),
    groupTitle: String(conversation.title ?? '').trim() || undefined,
  };
}

/**
 * Expand the canonical anchor scene into a real multi-character scene. This is
 * idempotent and intentionally runs after the existing atomic join RPC.
 */
export async function synchronizeGroupPlanPresence(db: SupabaseClient, input: {
  userId: string;
  continuityId: string;
  plan: Row;
  requestId: string;
  now: Date;
}) {
  const ids = planParticipantIds(input.plan);
  if (ids.length <= 1) return;
  const anchorId = String(input.plan.character_instance_id);
  const startsAt = new Date(String(input.plan.starts_at ?? '')).getTime();
  // Joining shortly before the scheduled time records the user waiting, but
  // companions are not canonically present until the plan actually begins.
  if (Number.isFinite(startsAt) && startsAt > input.now.getTime()) return;
  const joinedAt = input.now.toISOString();
  // The atomic begin RPC already owns the anchor's attendance and segment.
  // Only add the remaining companions here, otherwise the anchor receives a
  // second open segment and attended time is counted twice.
  for (const characterInstanceId of ids.filter((id) => id !== anchorId)) {
    const { data: current } = await db.from('together_plan_attendance').select('id,left_at').eq('plan_id', input.plan.id).eq('participant_type', 'character').eq('character_instance_id', characterInstanceId).maybeSingle();
    if (current) {
      if (current.left_at) await db.from('together_plan_attendance').update({ left_at: null, updated_at: joinedAt, metadata: { groupPlan: true, groupConversationId: input.plan.source_conversation_id } }).eq('id', current.id);
    } else {
      const { error } = await db.from('together_plan_attendance').insert({ user_id: input.userId, continuity_id: input.continuityId, plan_id: input.plan.id, participant_type: 'character', character_instance_id: characterInstanceId, joined_at: joinedAt, source: 'system', metadata: { groupPlan: true, groupConversationId: input.plan.source_conversation_id } });
      if (error && error.code !== '23505') throw new AppError('INTERNAL_ERROR', 'The group could not join this plan safely.', 500, true);
    }
    const { data: openSegment, error: openSegmentError } = await db.from('together_plan_attendance_segments').select('id').eq('plan_id', input.plan.id).eq('participant_type', 'character').eq('character_instance_id', characterInstanceId).is('left_at', null).maybeSingle();
    if (openSegmentError) throw new AppError('INTERNAL_ERROR', 'Group attendance could not be verified.', 500, true);
    if (!openSegment) {
      const segmentRequestId = `${input.requestId}:companion:${characterInstanceId}`;
      const { error: segmentError } = await db.from('together_plan_attendance_segments').insert({ user_id: input.userId, continuity_id: input.continuityId, plan_id: input.plan.id, participant_type: 'character', character_instance_id: characterInstanceId, joined_at: joinedAt, source: 'system', request_id: segmentRequestId });
      if (segmentError && segmentError.code !== '23505') throw new AppError('INTERNAL_ERROR', 'Group attendance could not be recorded.', 500, true);
    }
  }

  const { data: scene } = await db.from('together_scene_sessions').select('*').eq('shared_plan_id', input.plan.id).eq('user_id', input.userId).eq('continuity_id', input.continuityId).eq('character_instance_id', anchorId).is('ended_at', null).order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (!scene) return;
  for (const characterInstanceId of ids) {
    const { data: priorScenes, error: priorSceneLookupError } = await db.from('together_scene_participants').select('id,joined_at,metadata').eq('character_instance_id', characterInstanceId).neq('scene_session_id', scene.id).is('left_at', null);
    if (priorSceneLookupError) throw new AppError('INTERNAL_ERROR', 'The group could not leave its previous scene safely.', 500, true);
    for (const prior of priorScenes ?? []) {
      const leftAt = new Date(String(prior.joined_at)).getTime() > input.now.getTime() ? String(prior.joined_at) : joinedAt;
      const { error: priorSceneError } = await db.from('together_scene_participants').update({
        left_at: leftAt,
        updated_at: joinedAt,
        metadata: { ...(prior.metadata ?? {}), leftReason: 'joined_group_plan', nextSceneId: scene.id },
      }).eq('id', prior.id).is('left_at', null);
      if (priorSceneError) throw new AppError('INTERNAL_ERROR', 'The group could not leave its previous scene safely.', 500, true);
    }
    const { error } = await db.from('together_scene_participants').upsert({
      user_id: input.userId,
      continuity_id: input.continuityId,
      scene_session_id: scene.id,
      character_instance_id: characterInstanceId,
      role: characterInstanceId === anchorId ? 'primary_companion' : 'participant',
      joined_at: scene.started_at ?? joinedAt,
      left_at: null,
      witnessed_from_sequence: 1,
      witnessed_to_sequence: null,
      metadata: { groupPlan: true, groupConversationId: input.plan.source_conversation_id, contextVersion: 1 },
    }, { onConflict: 'scene_session_id,character_instance_id' });
    if (error) throw new AppError('INTERNAL_ERROR', 'The group scene could not be opened safely.', 500, true);
  }
  await db.from('together_scene_sessions').update({
    participant_instance_ids: ids,
    state: { ...(scene.state ?? {}), participantCount: ids.length, groupPlan: true, groupConversationId: input.plan.source_conversation_id },
    updated_at: joinedAt,
  }).eq('id', scene.id).eq('user_id', input.userId);
}

/** Give every companion in a completed group plan their own canonical recall. */
export async function enrichCompletedGroupPlan(db: SupabaseClient, input: {
  userId: string;
  continuityId: string;
  plan: Row;
  summary: string;
  completedAt: Date;
  participationLevel: string;
  attendedSeconds: number;
  meaningfulActionCount: number;
  completionReason: string;
}) {
  const ids = planParticipantIds(input.plan);
  if (ids.length <= 1) return;
  if (input.plan.metadata?.groupPlanExperience?.finalizedAt) return;
  const { data: instances } = await db.from('together_character_instances').select('id,together_character_templates(name)').in('id', ids).eq('user_id', input.userId).eq('continuity_id', input.continuityId);
  const names = (instances ?? []).map((row: Row) => String(row.together_character_templates?.name ?? '')).filter(Boolean);
  const sharedSummary = input.summary || `User and ${joinNames(names)} spent time together for ${input.plan.title}.`;
  for (const characterInstanceId of ids) {
    if (characterInstanceId !== String(input.plan.character_instance_id)) {
      const { error: memoryError } = await db.from('together_memories').upsert({
        user_id: input.userId,
        character_instance_id: characterInstanceId,
        memory_type: 'episodic',
        canonical_text: sharedSummary,
        dedupe_key: `shared-plan:${input.plan.id}:group:${characterInstanceId}`,
        importance: Math.max(.42, Math.min(1, Number(input.plan.metadata?.significance ?? .5))),
        confidence: .95,
        sensitivity_category: 'none',
        status: 'active',
        visibility: 'group_visible',
        group_conversation_id: input.plan.source_conversation_id,
        metadata: { sharedPlanId: input.plan.id, locationId: input.plan.location_id, participantInstanceIds: ids, groupPlan: true },
      }, { onConflict: 'character_instance_id,dedupe_key' });
      if (memoryError) throw new AppError('INTERNAL_ERROR', 'Group plan memory could not be finalized.', 500, true);
    }
    if (characterInstanceId !== String(input.plan.character_instance_id)) {
      for (const evidence of [
        { type: 'commitment_kept', quality: input.participationLevel === 'meaningful' ? .9 : input.participationLevel === 'participated' ? .65 : .3, valence: .25 },
        { type: 'shared_plan_completed', quality: Math.max(.65, Number(input.plan.metadata?.significance ?? .5)), valence: .55 },
      ]) try {
        await db.rpc('kivelle_insert_relationship_evidence', {
          p_user_id: input.userId,
          p_character_instance_id: characterInstanceId,
          p_type: evidence.type,
          p_source_type: 'shared_plan',
          p_source_id: input.plan.id,
          p_occurred_at: input.completedAt.toISOString(),
          p_quality: evidence.quality,
          p_valence: evidence.valence,
          p_timezone: String(input.plan.user_timezone ?? input.plan.world_timezone ?? 'UTC'),
          p_metadata: { groupPlan: true, participantInstanceIds: ids, participationLevel: input.participationLevel, attendedSeconds: input.attendedSeconds, meaningfulActionCount: input.meaningfulActionCount, completionReason: input.completionReason },
        });
      } catch { /* Completion is canonical even if optional evidence enrichment is unavailable. */ }
    }
  }
  const historyResults = await Promise.all([
    db.from('together_life_events').update({ participant_instance_ids: ids, narrative_summary: sharedSummary }).eq('shared_plan_id', input.plan.id).eq('user_id', input.userId),
    db.from('together_moments').update({ participant_instance_ids: ids, summary: sharedSummary }).eq('shared_plan_id', input.plan.id).eq('user_id', input.userId),
  ]);
  if (historyResults.some((result) => result.error)) throw new AppError('INTERNAL_ERROR', 'Group plan history could not be finalized.', 500, true);
  await track(db, input.userId, 'group_plan_completed', { planId: input.plan.id, conversationId: input.plan.source_conversation_id, participantCount: ids.length, participationLevel: input.participationLevel }).catch(() => undefined);
  const finalizedAt = new Date().toISOString();
  const { data: latest } = await db.from('together_shared_plans').select('metadata').eq('id', input.plan.id).eq('user_id', input.userId).eq('continuity_id', input.continuityId).maybeSingle();
  const metadata = latest?.metadata ?? input.plan.metadata ?? {};
  const { error: markerError } = await db.from('together_shared_plans').update({
    metadata: { ...metadata, groupPlanExperience: { finalizedAt, participantInstanceIds: ids } },
    updated_at: finalizedAt,
  }).eq('id', input.plan.id).eq('user_id', input.userId).eq('continuity_id', input.continuityId);
  if (markerError) throw new AppError('INTERNAL_ERROR', 'Group plan history could not be marked complete.', 500, true);
}

export function planParticipantIds(plan: Row): string[] {
  const values = Array.isArray(plan.participant_instance_ids) ? plan.participant_instance_ids.map(String) : [];
  return [...new Set([String(plan.character_instance_id), ...values].filter(Boolean))];
}

function joinNames(names: string[]) {
  if (!names.length) return 'the group';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}
