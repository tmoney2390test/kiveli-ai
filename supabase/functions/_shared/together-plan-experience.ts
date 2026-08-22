import type { SupabaseClient } from '@supabase/supabase-js';
import { manualCommitmentEndEligibility, resolveElapsedCommitmentEnd, type CommitmentCompletionReason } from '../../../packages/together-domain/src/index.ts';
import { finalizeSceneSession } from './kivelle-scene-consolidation.ts';
import { AppError } from './types.ts';
import { track } from './together.ts';
import { writeConversationEvent } from './together-plans.ts';
import { mergeConversationSceneMetadata } from './together-conversation.ts';

type Row = Record<string, any>;
export type PlanExperiencePhase = 'early' | 'waiting' | 'together' | 'wrapping_up' | 'completed';
export type ParticipationLevel = 'arrived' | 'brief' | 'participated' | 'meaningful';

export type PlanExperience = {
  plan: Row;
  scene: Row | null;
  phase: PlanExperiencePhase;
  interactions: Row[];
  destinations: Row[];
  companion: { arrived: boolean; state: 'expected' | 'late' | 'absent' | 'cancelled' };
  participation: {
    userPresent: boolean;
    companionPresent: boolean;
    joinedAt?: string;
    firstJoinedAt?: string;
    lastLeftAt?: string;
    attendedSeconds: number;
    joinCount: number;
    meaningfulActionCount: number;
    level: ParticipationLevel;
  };
};

export function initializePlanActivityState(activityKey: string | null | undefined): Record<string, unknown> {
  const type = String(activityKey ?? 'shared_plan').toLowerCase();
  if (type.includes('karaoke')) return { type: 'karaoke', songsCompleted: 0, userPerformed: false, companionPerformed: false };
  if (type.includes('trivia')) return { type: 'trivia', round: 0, userCorrect: 0, companionCorrect: 0 };
  if (type.includes('arcade') || type.includes('game')) return { type: 'arcade', userWins: 0, companionWins: 0, rematches: 0 };
  if (type.includes('photo')) return { type: 'photography', photosTaken: 0, subjects: [], photoTogetherTaken: false };
  if (type.includes('restaurant') || type.includes('dinner') || type.includes('food')) return { type: 'restaurant', ordered: false, sharedDish: false, dessert: false };
  return { type, actions: [] };
}

export async function beginPlanExperience(input: {
  db: SupabaseClient;
  userId: string;
  continuityId: string;
  characterInstanceId: string;
  planId: string;
  requestId: string;
  source?: string;
  now?: Date;
  quiet?: boolean;
}): Promise<PlanExperience> {
  const now = input.now ?? new Date();
  const { data: canonicalPlan } = await input.db.from('together_shared_plans').select('id,status,source,starts_at,ends_at').eq('id', input.planId).eq('user_id', input.userId).eq('continuity_id', input.continuityId).eq('character_instance_id', input.characterInstanceId).maybeSingle();
  if (!canonicalPlan) throw new AppError('NOT_FOUND', 'That plan is unavailable in this Life.', 404);
  if (['completed', 'cancelled', 'missed'].includes(String(canonicalPlan.status))) throw new AppError('CONFLICT', 'That plan has already ended.', 409);
  if (canonicalPlan.ends_at && new Date(String(canonicalPlan.ends_at)).getTime() <= now.getTime()) throw new AppError('CONFLICT', 'That plan has already reached its scheduled end.', 409);
  const { data, error } = await input.db.rpc('kivelle_begin_plan_experience', {
    p_user_id: input.userId,
    p_continuity_id: input.continuityId,
    p_character_instance_id: input.characterInstanceId,
    p_plan_id: input.planId,
    p_request_id: input.requestId,
    p_now: now.toISOString(),
    p_source: input.source ?? 'app',
  });
  if (error) {
    console.error('Plan experience start failed', { code: error.code, details: error.details, hint: error.hint, planId: input.planId, characterInstanceId: input.characterInstanceId });
    throw mapBeginError(error);
  }
  if (!input.quiet) await track(input.db, input.userId, 'plan_joined', { planId: input.planId, characterInstanceId: input.characterInstanceId, requestId: input.requestId });
  const experience = await loadPlanExperience({ ...input, now });
  if (data?.sceneId && !input.quiet) await track(input.db, input.userId, 'plan_scene_started', { planId: input.planId, sceneId: data.sceneId });
  const plan = experience.plan;
  if (experience.scene?.id && plan.source_conversation_id) {
    const { data: conversation } = await input.db.from('together_conversations').select('metadata').eq('id', plan.source_conversation_id).eq('user_id', input.userId).maybeSingle();
    if (conversation) await input.db.from('together_conversations').update({ metadata: mergeConversationSceneMetadata(conversation.metadata ?? {}, { version: 1, characterInstanceId: input.characterInstanceId, locationId: experience.scene.location_id, worldId: experience.scene.world_id, interactionMode: 'co_present', entryReason: 'shared_plan', enteredAt: experience.scene.started_at, source: 'active_event', validUntil: experience.scene.expected_end_at ?? undefined, sceneSessionId: experience.scene.id, activityKey: experience.scene.activity_key, updatedAt: now.toISOString() }), updated_at: now.toISOString() }).eq('id', plan.source_conversation_id).eq('user_id', input.userId);
  }
  if (plan.source_conversation_id && !input.quiet) {
    await writeConversationEvent(input.db, {
      userId: input.userId,
      characterInstanceId: input.characterInstanceId,
      conversationId: String(plan.source_conversation_id),
      eventType: 'plan_joined',
      entityType: 'shared_plan',
      entityId: input.planId,
      metadata: { title: plan.title, joinedAt: now.toISOString(), phase: experience.phase },
    }).catch(() => undefined);
  }
  return experience;
}

export async function loadPlanExperience(input: {
  db: SupabaseClient;
  userId: string;
  continuityId: string;
  characterInstanceId: string;
  planId: string;
  now?: Date;
}): Promise<PlanExperience> {
  const now = input.now ?? new Date();
  const [{ data: plan, error: planError }, { data: attendance }, { data: segments }, { data: activeScene }, { data: latestScene }] = await Promise.all([
    input.db.from('together_shared_plans').select('*,together_locations(id,name,slug),together_worlds(id,name,slug,timezone)').eq('id', input.planId).eq('user_id', input.userId).eq('continuity_id', input.continuityId).eq('character_instance_id', input.characterInstanceId).maybeSingle(),
    input.db.from('together_plan_attendance').select('*').eq('plan_id', input.planId).eq('user_id', input.userId).order('joined_at'),
    input.db.from('together_plan_attendance_segments').select('*').eq('plan_id', input.planId).eq('user_id', input.userId).eq('participant_type', 'user').order('joined_at'),
    input.db.from('together_scene_sessions').select('*').eq('shared_plan_id', input.planId).eq('user_id', input.userId).eq('continuity_id', input.continuityId).eq('character_instance_id', input.characterInstanceId).is('ended_at', null).order('started_at', { ascending: false }).limit(1).maybeSingle(),
    input.db.from('together_scene_sessions').select('*').eq('shared_plan_id', input.planId).eq('user_id', input.userId).eq('continuity_id', input.continuityId).eq('character_instance_id', input.characterInstanceId).order('started_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (planError || !plan) throw new AppError('NOT_FOUND', 'That plan is unavailable in this Life.', 404);
  const userRows = (attendance ?? []).filter((row: Row) => row.participant_type === 'user');
  const characterRow = (attendance ?? []).find((row: Row) => row.participant_type === 'character') as Row | undefined;
  const user = userRows[0] as Row | undefined;
  const activeUser = Boolean(user && !user.left_at);
  const activeCharacter = Boolean(characterRow && !characterRow.left_at);
  let canonicalScene = activeScene as Row | null;
  const beforeScheduledEnd = !plan.ends_at || new Date(String(plan.ends_at)).getTime() > now.getTime();
  if (!canonicalScene && activeUser && activeCharacter && beforeScheduledEnd && ['scheduled', 'active'].includes(String(plan.status))) canonicalScene = await ensurePlanScene({ db: input.db, userId: input.userId, continuityId: input.continuityId, characterInstanceId: input.characterInstanceId, plan, conversationId: plan.source_conversation_id, now });
  if (canonicalScene && activeUser && activeCharacter && !canonicalScene.ended_at) {
    await reconcilePlanSceneParticipant({ db: input.db, userId: input.userId, continuityId: input.continuityId, characterInstanceId: input.characterInstanceId, planId: String(plan.id), sceneId: String(canonicalScene.id), now });
  }
  const participation = calculatePlanParticipation({ attendance: userRows, segments: segments ?? [], actions: await loadActions(input.db, input.planId, input.userId, canonicalScene?.id ?? latestScene?.id), now, activeUser, activeCharacter });
  const state = String(plan.status);
  let phase: PlanExperiencePhase;
  if (['completed', 'missed', 'cancelled'].includes(state)) phase = 'completed';
  else if (canonicalScene) {
    const expectedEnd = canonicalScene.expected_end_at ? new Date(canonicalScene.expected_end_at).getTime() : 0;
    phase = canonicalScene.state?.windingDown || (expectedEnd > 0 && expectedEnd - now.getTime() <= 20 * 60_000) ? 'wrapping_up' : 'together';
  } else if (activeUser && !activeCharacter && new Date(String(plan.starts_at)).getTime() > now.getTime()) phase = 'early';
  else if (activeUser && !activeCharacter) phase = 'waiting';
  else if (new Date(String(plan.starts_at)).getTime() > now.getTime()) phase = 'early';
  else phase = 'waiting';
  const companionState = normalizeCompanionState(plan.companion_state, activeCharacter);
  return {
    plan: { ...plan, attendance: { user: user ?? null, character: characterRow ?? null } },
    scene: canonicalScene ?? (state === 'completed' ? latestScene ?? null : null),
    phase,
    interactions: [],
    destinations: [],
    companion: { arrived: activeCharacter, state: companionState },
    participation: {
      ...participation,
      ...(activeUser && user?.joined_at ? { joinedAt: String(user.joined_at) } : {}),
      ...(user?.joined_at ? { firstJoinedAt: String(user.joined_at) } : {}),
      ...(user?.left_at ? { lastLeftAt: String(user.left_at) } : {}),
    },
  };
}

export async function ensurePlanScene(input: {
  db: SupabaseClient;
  userId: string;
  continuityId: string;
  characterInstanceId: string;
  plan: Row;
  conversationId?: string | null;
  now?: Date;
}): Promise<Row | null> {
  const now = input.now ?? new Date();
  const [{ data: userAttendance }, { data: characterAttendance }, { data: existing }] = await Promise.all([
    input.db.from('together_plan_attendance').select('*').eq('plan_id', input.plan.id).eq('user_id', input.userId).eq('participant_type', 'user').is('left_at', null).maybeSingle(),
    input.db.from('together_plan_attendance').select('*').eq('plan_id', input.plan.id).eq('participant_type', 'character').eq('character_instance_id', input.characterInstanceId).is('left_at', null).maybeSingle(),
    input.db.from('together_scene_sessions').select('*').eq('shared_plan_id', input.plan.id).eq('user_id', input.userId).eq('continuity_id', input.continuityId).eq('character_instance_id', input.characterInstanceId).is('ended_at', null).order('started_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!userAttendance || !characterAttendance) return existing ?? null;
  if (existing) return existing;
  const { data, error } = await input.db.from('together_scene_sessions').insert({
    user_id: input.userId,
    continuity_id: input.continuityId,
    character_instance_id: input.characterInstanceId,
    conversation_id: input.conversationId ?? input.plan.source_conversation_id ?? null,
    shared_plan_id: input.plan.id,
    world_id: input.plan.world_id,
    location_id: input.plan.location_id,
    source: 'shared_plan',
    activity_key: input.plan.activity_key,
    started_at: userAttendance.joined_at ?? now.toISOString(),
    expected_end_at: input.plan.ends_at,
    participant_instance_ids: [input.characterInstanceId],
    state: { planId: input.plan.id, focus: input.plan.activity_key, currentActivityKey: input.plan.activity_key, activity: initializePlanActivityState(input.plan.activity_key), entryReason: 'shared_plan' },
  }).select('*').maybeSingle();
  if (!error && data) return data;
  const { data: concurrent } = await input.db.from('together_scene_sessions').select('*').eq('shared_plan_id', input.plan.id).eq('user_id', input.userId).eq('continuity_id', input.continuityId).eq('character_instance_id', input.characterInstanceId).is('ended_at', null).maybeSingle();
  return concurrent ?? null;
}

export async function wrapPlanExperience(input: {
  db: SupabaseClient;
  userId: string;
  continuityId: string;
  characterInstanceId: string;
  planId: string;
  requestId: string;
  sceneId?: string;
  now?: Date;
}): Promise<PlanExperience> {
  const now = input.now ?? new Date();
  const experience = await loadPlanExperience(input);
  const scene = experience.scene;
  if (String(experience.plan.status) === 'completed') return experience;
  const eligibility = manualCommitmentEndEligibility({
    status: String(experience.plan.status),
    source: String(experience.plan.source ?? ''),
    startsAt: experience.plan.starts_at,
    endsAt: experience.plan.ends_at,
    userPresent: experience.participation.userPresent,
    companionPresent: experience.participation.companionPresent,
    activeScene: Boolean(scene && !scene.ended_at),
  }, now);
  if (eligibility.blocker === 'already_elapsed') return finalizeExpiredPlanExperience(input);
  if (!eligibility.allowed) throw manualEndError(eligibility.blocker);
  if (input.sceneId && input.sceneId !== scene?.id) throw new AppError('CONFLICT', 'That shared scene is no longer active.', 409, true);
  return finishPlanExperience({ ...input, completionReason: 'user_ended', completedAt: now });
}

export async function finalizeExpiredPlanExperience(input: { db: SupabaseClient; userId: string; continuityId: string; characterInstanceId: string; planId: string; now?: Date }): Promise<PlanExperience> {
  const now = input.now ?? new Date();
  const experience = await loadPlanExperience(input);
  const ending = resolveElapsedCommitmentEnd({ status: String(experience.plan.status), source: String(experience.plan.source ?? ''), endsAt: experience.plan.ends_at }, now);
  if (!ending.shouldFinalize || !ending.completedAt) return experience;
  return finishPlanExperience({ ...input, requestId: `elapsed:${input.planId}:${ending.completedAt}`, completionReason: 'elapsed', completedAt: new Date(ending.completedAt) });
}

async function finishPlanExperience(input: {
  db: SupabaseClient;
  userId: string;
  continuityId: string;
  characterInstanceId: string;
  planId: string;
  requestId: string;
  sceneId?: string;
  completionReason: Extract<CommitmentCompletionReason, 'user_ended' | 'elapsed' | 'system_reconciled'>;
  completedAt: Date;
  now?: Date;
}): Promise<PlanExperience> {
  const reconciledAt = input.now ?? new Date();
  const { data, error } = await input.db.rpc('kivelle_finish_plan_experience', {
    p_user_id: input.userId,
    p_continuity_id: input.continuityId,
    p_character_instance_id: input.characterInstanceId,
    p_plan_id: input.planId,
    p_scene_id: input.sceneId ?? null,
    p_request_id: input.requestId,
    p_completion_reason: input.completionReason,
    p_completed_at: input.completedAt.toISOString(),
  });
  if (error) {
    console.error(JSON.stringify({
      level: 'error',
      operation: 'finish_plan_experience_rpc',
      planId: input.planId,
      requestId: input.requestId,
      code: error.code ?? null,
      message: error.message ?? 'unknown_database_error',
    }));
    throw mapFinishError(error);
  }
  const result = (data ?? {}) as Row;
  if (result.requiresProgress) {
    await input.db.rpc('kivelle_progress_shared_plans', { p_user_id: input.userId, p_character_instance_id: input.characterInstanceId, p_now: reconciledAt.toISOString() });
    return loadPlanExperience({ ...input, now: reconciledAt });
  }
  if (!result.transitioned) return loadPlanExperience({ ...input, now: reconciledAt });
  const sceneId = typeof result.sceneId === 'string' ? result.sceneId : input.sceneId;
  return reconcileCompletedPlanExperience({ ...input, sceneId, now: reconciledAt });
}

/**
 * Finish non-transactional enrichments after the canonical database transition.
 * This is safe to retry and is also used after an atomic plan switch.
 */
export async function reconcileCompletedPlanExperience(input: {
  db: SupabaseClient;
  userId: string;
  continuityId: string;
  characterInstanceId: string;
  planId: string;
  sceneId?: string;
  now?: Date;
}): Promise<PlanExperience> {
  const reconciledAt = input.now ?? new Date();
  const experience = await loadPlanExperience({ ...input, now: reconciledAt });
  if (String(experience.plan.status) !== 'completed') return experience;
  if (experience.plan.metadata?.planExperience?.finalizedAt) return experience;
  const reason = String(experience.plan.completion_reason ?? 'user_ended');
  const completionReason: Extract<CommitmentCompletionReason, 'user_ended' | 'elapsed' | 'system_reconciled'> = reason === 'elapsed' || reason === 'system_reconciled' ? reason : 'user_ended';
  const completedAt = new Date(String(experience.plan.completed_at ?? reconciledAt.toISOString()));
  const sceneId = input.sceneId ?? experience.scene?.id;
  let episode: Row | null = null;
  if (sceneId) episode = await finalizeSceneSession({ db: input.db, userId: input.userId, sceneSessionId: sceneId, now: completedAt }).catch(() => null);
  await enrichCompletedPlan({ ...input, completionReason, completedAt, sceneId, episode, reconciledAt });
  return loadPlanExperience({ ...input, now: reconciledAt });
}

async function enrichCompletedPlan(input: {
  db: SupabaseClient;
  userId: string;
  continuityId: string;
  characterInstanceId: string;
  planId: string;
  completionReason: Extract<CommitmentCompletionReason, 'user_ended' | 'elapsed' | 'system_reconciled'>;
  completedAt: Date;
  sceneId?: string;
  episode: Row | null;
  reconciledAt: Date;
}) {
  const experience = await loadPlanExperience({ ...input, now: input.completedAt });
  const { data: current } = await input.db.from('together_shared_plans').select('*').eq('id', input.planId).eq('user_id', input.userId).eq('continuity_id', input.continuityId).maybeSingle();
  if (!current) return;
  const episode = input.episode ?? (await input.db.from('together_scene_episodes').select('id,summary,significance').eq('shared_plan_id', input.planId).order('created_at', { ascending: false }).limit(1).maybeSingle()).data;
  const summary = String(episode?.summary ?? current.metadata?.completionSummary ?? `${current.title} became part of your shared history.`);
  const planExperience = {
    ...(current.metadata?.planExperience ?? {}),
    participationLevel: experience.participation.level,
    attendedSeconds: experience.participation.attendedSeconds,
    meaningfulActionCount: experience.participation.meaningfulActionCount,
    completionReason: input.completionReason,
    completedAt: input.completedAt.toISOString(),
    finalizedAt: input.reconciledAt.toISOString(),
    summary,
  };
  await input.db.from('together_shared_plans').update({
    participation_level: experience.participation.level,
    scene_episode_id: episode?.id ?? current.scene_episode_id ?? null,
    metadata: { ...(current.metadata ?? {}), planExperience },
    updated_at: input.reconciledAt.toISOString(),
  }).eq('id', input.planId).eq('user_id', input.userId).eq('continuity_id', input.continuityId);
  // The completion trigger guarantees a baseline episodic memory. Re-run the
  // idempotent materializer after scene consolidation so that memory receives
  // the richer episode summary, significance, and participation metadata.
  try {
    await input.db.rpc('kivelle_materialize_completed_plan_history', { p_plan_id: input.planId });
  } catch { /* History already exists; enrichment must not undo completion. */ }
  if (current.source !== 'date') {
    await input.db.from('together_life_events').update({ narrative_summary: summary, ends_at: input.completedAt.toISOString(), significance: Math.max(0, Math.min(1, Number(episode?.significance ?? current.metadata?.significance ?? .45))) }).eq('shared_plan_id', input.planId).eq('user_id', input.userId);
  }
  const conversationId = String(current.source_conversation_id ?? experience.scene?.conversation_id ?? '');
  if (conversationId) {
    await input.db.from('together_conversation_events').update({ metadata: { title: current.title, startsAt: current.starts_at, endsAt: input.completedAt.toISOString(), scheduledEndsAt: current.ends_at, status: 'completed', locationId: current.location_id, completionReason: input.completionReason, participationLevel: experience.participation.level, summary } }).eq('user_id', input.userId).eq('conversation_id', conversationId).eq('entity_type', 'shared_plan').eq('entity_id', input.planId).eq('event_type', 'plan_completed');
  }
  await clearPlanConversationScene(input.db, input.userId, [conversationId, String(experience.scene?.conversation_id ?? '')], input.sceneId);
  await track(input.db, input.userId, input.completionReason === 'user_ended' ? 'plan_wrapped_up' : 'plan_elapsed', { planId: input.planId, sceneId: input.sceneId, completedAt: input.completedAt.toISOString() });
  await track(input.db, input.userId, 'plan_completed', { planId: input.planId, completionReason: input.completionReason, participationLevel: experience.participation.level, attendedSeconds: experience.participation.attendedSeconds });
  await track(input.db, input.userId, 'plan_scene_finalized', { planId: input.planId, participationLevel: experience.participation.level, attendedSeconds: experience.participation.attendedSeconds });
  try {
    await input.db.rpc('kivelle_insert_relationship_evidence', { p_user_id: input.userId, p_character_instance_id: input.characterInstanceId, p_type: 'commitment_kept', p_source_type: 'shared_plan', p_source_id: input.planId, p_occurred_at: input.completedAt.toISOString(), p_quality: experience.participation.level === 'meaningful' ? .9 : experience.participation.level === 'participated' ? .65 : .3, p_valence: .25, p_timezone: String(current.user_timezone ?? current.world_timezone ?? 'UTC'), p_metadata: { participationLevel: experience.participation.level, attendedSeconds: experience.participation.attendedSeconds, meaningfulActionCount: experience.participation.meaningfulActionCount, completionReason: input.completionReason } });
  } catch { /* Evidence enrichment must not undo a completed plan. */ }
}

export function calculatePlanParticipation(input: { attendance: Row[]; segments: Row[]; actions: Row[]; now?: Date; activeUser?: boolean; activeCharacter?: boolean }) {
  const now = input.now ?? new Date();
  const segments = input.segments.length ? input.segments : input.attendance.map((row) => ({ joined_at: row.joined_at, left_at: row.left_at }));
  const attendedSeconds = Math.round(segments.reduce((sum, row) => {
    const start = new Date(String(row.joined_at)).getTime();
    const end = row.left_at ? new Date(String(row.left_at)).getTime() : now.getTime();
    return sum + (Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, (end - start) / 1000) : 0);
  }, 0));
  const canonicalActions=input.actions.filter((action)=>!action.decision_status||['accepted','completed'].includes(String(action.decision_status))).filter((action)=>action.result?.proposalAccepted!==true);
  const meaningfulActionCount = canonicalActions.filter((action) => !['leave', 'move'].includes(String(action.family)) && !String(action.interaction_key).includes('look_around')).length;
  const milestone = canonicalActions.some((action) => Boolean(action.result?.effects?.momentCandidate) || Boolean(action.payload?.candidate?.momentCandidate));
  const level: ParticipationLevel = !input.attendance.length ? 'arrived' : attendedSeconds < 300 && meaningfulActionCount === 0 ? 'brief' : attendedSeconds >= 900 && meaningfulActionCount >= 2 || milestone ? 'meaningful' : 'participated';
  return { userPresent: Boolean(input.activeUser ?? input.attendance.some((row) => !row.left_at)), companionPresent: Boolean(input.activeCharacter), attendedSeconds, joinCount: segments.length, meaningfulActionCount, level };
}

async function loadActions(db: SupabaseClient, planId: string, userId: string, sceneId?: string | null) {
  if (!sceneId) return [];
  const { data } = await db.from('together_scene_actions').select('*').eq('scene_session_id', sceneId).eq('user_id', userId).not('completed_at', 'is', null).order('created_at');
  return (data ?? []) as Row[];
}

async function reconcilePlanSceneParticipant(input: {
  db: SupabaseClient;
  userId: string;
  continuityId: string;
  characterInstanceId: string;
  planId: string;
  sceneId: string;
  now: Date;
}) {
  const { error } = await input.db.rpc('kivelle_reconcile_plan_scene_participant', {
    p_user_id: input.userId,
    p_continuity_id: input.continuityId,
    p_character_instance_id: input.characterInstanceId,
    p_plan_id: input.planId,
    p_scene_id: input.sceneId,
    p_now: input.now.toISOString(),
  });
  if (!error) return;
  console.error('Plan scene participant reconciliation failed', {
    code: error.code,
    details: error.details,
    hint: error.hint,
    planId: input.planId,
    sceneId: input.sceneId,
    characterInstanceId: input.characterInstanceId,
  });
  throw new AppError('INTERNAL_ERROR', 'The shared plan scene could not open. Try again.', 500, true);
}

function normalizeCompanionState(value: unknown, arrived: boolean): 'expected' | 'late' | 'absent' | 'cancelled' {
  if (value === 'late' || value === 'absent' || value === 'cancelled') return value;
  return arrived ? 'expected' : 'expected';
}

function mapBeginError(error: { message?: string; code?: string }) {
  const message = String(error.message ?? 'The plan could not be started.');
  if (/not ready/i.test(message)) return new AppError('TOO_EARLY', 'This commitment is not ready to join yet.', 409, true);
  if (/grace/i.test(message)) return new AppError('PLAN_MISSED', 'The grace period for this commitment has ended.', 409);
  if (/missed/i.test(message)) return new AppError('PLAN_MISSED', 'That commitment has already been missed.', 409);
  if (/already over/i.test(message)) return new AppError('CONFLICT', 'That commitment is already over.', 409);
  return new AppError('INTERNAL_ERROR', message, 500, Boolean(error.code));
}

function manualEndError(blocker: string | null) {
  if (blocker === 'date_owned') return new AppError('CONFLICT', 'Finish this authored Date from the Date experience.', 409);
  if (blocker === 'not_started') return new AppError('TOO_EARLY', 'This plan has not started yet.', 409, true);
  if (blocker === 'already_ended') return new AppError('CONFLICT', 'That plan has already ended.', 409);
  if (blocker === 'user_not_present' || blocker === 'companion_not_present') return new AppError('CONFLICT', 'Both of you need to be in the plan before it can be ended together.', 409, true);
  if (blocker === 'scene_not_active') return new AppError('SCENE_REQUIRED', 'Open the shared experience before ending this plan.', 409, true);
  return new AppError('CONFLICT', 'This plan cannot be ended right now.', 409, true);
}

function mapFinishError(error: { message?: string; code?: string }) {
  const message = String(error.message ?? 'The plan could not be ended.');
  if (/date experience/i.test(message)) return new AppError('CONFLICT', 'Finish this authored Date from the Date experience.', 409);
  if (/not started/i.test(message)) return new AppError('TOO_EARLY', 'This plan has not started yet.', 409, true);
  if (/elapsed/i.test(message)) return new AppError('CONFLICT', 'This plan has reached its scheduled end and is being saved.', 409, true);
  if (/attendance|required|scene/i.test(message)) return new AppError('SCENE_REQUIRED', 'The shared plan scene is no longer active.', 409, true);
  if (/already over/i.test(message)) return new AppError('CONFLICT', 'That plan has already ended.', 409);
  if (/unavailable/i.test(message)) return new AppError('NOT_FOUND', 'That plan is unavailable in this Life.', 404);
  return new AppError('INTERNAL_ERROR', 'The plan could not be ended. Try again.', 500, true);
}

async function clearPlanConversationScene(db: SupabaseClient, userId: string, conversationIds: string[], sceneId?: string) {
  for (const conversationId of [...new Set(conversationIds.filter(Boolean))]) {
    const { data: conversation } = await db.from('together_conversations').select('metadata').eq('id', conversationId).eq('user_id', userId).maybeSingle();
    const activeScene = conversation?.metadata?.activeScene as Row | undefined;
    if (!conversation || !activeScene) continue;
    if (sceneId && String(activeScene.sceneSessionId ?? '') !== sceneId) continue;
    await db.from('together_conversations').update({ metadata: mergeConversationSceneMetadata(conversation.metadata ?? {}, null), updated_at: new Date().toISOString() }).eq('id', conversationId).eq('user_id', userId);
  }
}
