import { z } from 'zod';
import { applyInteractionSceneState, deriveCharacterInteractionProfile, interactionDefinition, matchInteractionIntent, resolveInteractions, resolveMovementDestinations, type InteractionCandidate, type InteractionLocation } from '../../../packages/together-domain/src/index.ts';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { activeContinuity, requireInstanceInActiveContinuity } from '../_shared/together-continuity.ts';
import { getActiveConversation, mergeConversationSceneMetadata, resolveActiveConversationScene } from '../_shared/together-conversation.ts';
import { resolvePlaceContext, resolveWorldAccess } from '../_shared/together-place.ts';
import { resolveCompanionPresence } from '../_shared/together-schedule.ts';
import { track } from '../_shared/together.ts';
import { waitUntil } from '../_shared/background.ts';
import { finalizeSceneSession } from '../_shared/kivelle-scene-consolidation.ts';
import { kickMediaDispatcher, queueMediaRequest } from '../_shared/together-media.ts';
import { ensurePlanScene } from '../_shared/together-plan-experience.ts';

type Row = Record<string, any>;

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('resolve'), characterInstanceId: z.string().uuid(), conversationId: z.string().uuid().optional(), intentText: z.string().trim().min(1).max(600).optional() }),
  z.object({ action: z.literal('execute'), characterInstanceId: z.string().uuid(), sceneId: z.string().uuid().optional(), conversationId: z.string().uuid().optional(), interactionKey: z.string().trim().min(2).max(120), requestId: z.string().trim().min(8).max(120) }),
  z.object({ action: z.literal('move'), characterInstanceId: z.string().uuid(), sceneId: z.string().uuid().optional(), conversationId: z.string().uuid().optional(), destinationLocationId: z.string().uuid(), requestId: z.string().trim().min(8).max(120) }),
  z.object({ action: z.literal('leave'), characterInstanceId: z.string().uuid(), sceneId: z.string().uuid().optional(), conversationId: z.string().uuid().optional() }),
]);

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  const input = await parseBody(request, schema);
  await enforceRateLimit(db, user.id, `together_interaction_${input.action}`, input.action === 'resolve' ? 60 : 30, 3600);
  const continuity = await activeContinuity(db, user.id);
  await requireInstanceInActiveContinuity(db, user.id, input.characterInstanceId);
  const now = new Date();
  const context = await loadContext({ db, userId: user.id, continuityId: continuity.id, characterInstanceId: input.characterInstanceId, conversationId: input.conversationId, now });

  if (input.action === 'resolve') {
    const result = resolveCandidateSet(context);
    await track(db, user.id, 'interaction_candidates_viewed', { characterInstanceId: input.characterInstanceId, locationId: context.location.id, sceneId: context.sceneSession?.id ?? null, candidateCount: result.interactions.length });
    const intentMatch=input.intentText?matchInteractionIntent(input.intentText,result.interactions):null;
    return json({ data: { ...result, ...(intentMatch?{intentMatch}:{}), scene: serializeScene(context.sceneSession, context), place: context.place, presence: context.presence }, correlationId }, 200, correlationId);
  }

  if (input.action === 'leave') {
    if (!context.sceneSession) throw new AppError('SCENE_NOT_FOUND', 'There is no shared scene to leave right now.', 409);
    if (input.sceneId && input.sceneId !== context.sceneSession.id) throw new AppError('SCENE_EXPIRED', 'That shared scene has already changed.', 409);
    await db.from('together_scene_sessions').update({ ended_at: now.toISOString(), updated_at: now.toISOString() }).eq('id', context.sceneSession.id).eq('user_id', user.id).is('ended_at', null);
    await clearConversationScene(db, user.id, context.conversation, now);
    waitUntil(finalizeSceneSession({db,userId:user.id,sceneSessionId:context.sceneSession.id,now}));
    await track(db, user.id, 'scene_ended', { characterInstanceId: input.characterInstanceId, sceneId: context.sceneSession.id, reason: 'user_left' });
    return json({ data: { scene: { ...context.sceneSession, ended_at: now.toISOString() }, interactions: [], destinations: [] }, correlationId }, 200, correlationId);
  }

  const scene = await ensureScene({ ...context, db, userId: user.id, continuityId: continuity.id, now });
  if (input.sceneId && input.sceneId !== scene.id) throw new AppError('SCENE_EXPIRED', 'That shared scene has already changed.', 409);

  if (input.action === 'move') {
    const result = resolveCandidateSet({ ...context, sceneSession: scene });
    const destination = result.destinations.find((item) => item.effects['destinationLocationId'] === input.destinationLocationId);
    if (!destination) throw new AppError('ACTION_NOT_AVAILABLE', 'That place is no longer a good option right now.', 409);
    const existing = await existingAction(db, scene.id, input.requestId);
    if (existing) return json({ data: await actionResponse({ ...context, sceneSession: scene }, existing), correlationId }, 200, correlationId);
    const destinationPlace = await resolvePlaceContext({ db, locationId: input.destinationLocationId, now, userId: user.id, characterInstanceId: input.characterInstanceId });
    if (destinationPlace.world.id !== context.place.world.id) throw new AppError('ACTION_NOT_AVAILABLE', 'You can only move around this world from here.', 409);
    const access = await resolveWorldAccess({ db, userId: user.id, worldId: destinationPlace.world.id });
    if (access === 'locked') throw new AppError('WORLD_LOCKED', 'That world is not available for this life yet.', 403);
    const movedState = { ...(scene.state ?? {}), recentActionKeys: [...(scene.state?.recentActionKeys ?? []), destination.interactionKey].slice(-10), focus: 'moving', currentActivityKey: 'walking_together' };
    const action = await insertAction(db, { userId: user.id, continuityId: continuity.id, sceneId: scene.id, characterInstanceId: input.characterInstanceId, interactionKey: destination.interactionKey, family: 'move', requestId: input.requestId, payload: { fromLocationId: context.location.id, destinationLocationId: input.destinationLocationId } });
    const { data: updated, error } = await db.from('together_scene_sessions').update({ world_id: destinationPlace.world.id, location_id: input.destinationLocationId, activity_key: 'walking_together', state: movedState, updated_at: now.toISOString() }).eq('id', scene.id).eq('user_id', user.id).select('*').single();
    if (error || !updated) throw new AppError('INTERNAL_ERROR', 'The scene could not move right now.', 500, true);
    await db.from('together_scene_actions').update({ result: { movedTo: { id: destinationPlace.location.id, name: destinationPlace.location.name, path: destinationPlace.path }, nextState: movedState }, completed_at: now.toISOString() }).eq('id', action.id).eq('user_id', user.id);
    await syncConversationScene(db, user.id, context.conversation, updated, now);
    await track(db, user.id, 'scene_moved', { characterInstanceId: input.characterInstanceId, sceneId: scene.id, locationId: input.destinationLocationId });
    return json({ data: await actionResponse({ ...context, sceneSession: updated, place: destinationPlace, location: asLocation(destinationPlace.location) }, { ...action, result: { movedTo: { id: destinationPlace.location.id, name: destinationPlace.location.name } } }), correlationId }, 200, correlationId);
  }

  const candidates = resolveCandidateSet({ ...context, sceneSession: scene });
  const candidate = candidates.interactions.find((item) => item.interactionKey === input.interactionKey);
  if (!candidate) throw new AppError('ACTION_NOT_AVAILABLE', 'That option is no longer available in this scene.', 409);
  const existing = await existingAction(db, scene.id, input.requestId);
  if (existing) return json({ data: await actionResponse({ ...context, sceneSession: scene }, existing), correlationId }, 200, correlationId);
  const definition = interactionDefinition(candidate.interactionKey);
  if (!definition) throw new AppError('ACTION_NOT_AVAILABLE', 'That interaction is not recognised.', 409);
  const action = await insertAction(db, { userId: user.id, continuityId: continuity.id, sceneId: scene.id, characterInstanceId: input.characterInstanceId, interactionKey: candidate.interactionKey, family: candidate.family, requestId: input.requestId, payload: { candidate: { label: candidate.label, durationMinutes: candidate.durationMinutes } } });
  const nextState = applyInteractionSceneState(scene.state ?? {}, candidate);
  const expectedEnd = extendExpectedEnd(scene.expected_end_at, candidate, now);
  const { data: updated, error } = await db.from('together_scene_sessions').update({ activity_key: String(nextState.currentActivityKey ?? scene.activity_key ?? context.presence?.activityKey ?? 'together'), state: nextState, expected_end_at: expectedEnd, updated_at: now.toISOString() }).eq('id', scene.id).eq('user_id', user.id).select('*').single();
  if (error || !updated) throw new AppError('INTERNAL_ERROR', 'That interaction could not be saved.', 500, true);
  const evidenceRecorded = await maybeRecordEvidence(db, user.id, input.characterInstanceId, action.id, candidate, context.place.world.timezone, now);
    const media=String(candidate.effects.mediaPolicy??'none')==='explicit' ? await queueExplicitScenePhoto({db,userId:user.id,characterInstanceId:input.characterInstanceId,conversationId:context.conversation.id,sceneId:scene.id,sharedPlanId:scene.shared_plan_id??undefined,actionId:action.id,label:candidate.label}) : null;
  const result = { label: candidate.label, nextState, effects: candidate.effects, evidenceRecorded, ...(media?{media:{id:media.id,status:media.status}}:{}), reactionContext: { interactionKey: candidate.interactionKey, label: candidate.label, location: context.place.path } };
  await db.from('together_scene_actions').update({ result, completed_at: now.toISOString() }).eq('id', action.id).eq('user_id', user.id);
  await syncConversationScene(db, user.id, context.conversation, updated, now);
  await track(db, user.id, 'interaction_executed', { characterInstanceId: input.characterInstanceId, sceneId: scene.id, interactionKey: candidate.interactionKey, family: candidate.family });
  await track(db, user.id, 'interaction_family_used', { family: candidate.family });
  return json({ data: await actionResponse({ ...context, sceneSession: updated }, { ...action, result }), correlationId }, 200, correlationId);
});

async function loadContext(input: { db: any; userId: string; continuityId: string; characterInstanceId: string; conversationId?: string; now: Date }) {
  const [instanceResult, relationshipResult] = await Promise.all([
    input.db.from('together_character_instances').select('*,together_character_templates(*),together_character_versions(*)').eq('id', input.characterInstanceId).eq('user_id', input.userId).eq('continuity_id', input.continuityId).maybeSingle(),
    input.db.from('together_relationship_states').select('*').eq('user_id', input.userId).eq('character_instance_id', input.characterInstanceId).eq('continuity_id', input.continuityId).maybeSingle(),
  ]);
  const instance = instanceResult.data as Row | null;
  if (instanceResult.error || !instance) throw new AppError('NOT_FOUND', 'That companion is unavailable.', 404);
  const conversation = input.conversationId ? await ownedConversation(input.db, input.userId, input.continuityId, input.conversationId) : await getActiveConversation(input.db, input.userId, input.characterInstanceId, true) as Row | null;
  if (!conversation) throw new AppError('NOT_FOUND', 'That conversation is unavailable.', 404);
  const active = await resolveActiveConversationScene({ db: input.db, userId: input.userId, conversation, characterInstanceId: input.characterInstanceId, now: input.now });
  if (!active.scene || active.scene.interactionMode !== 'co_present') throw new AppError('SCENE_REQUIRED', 'Join them first to do something together.', 409);
  const { data: currentScene } = active.scene.sceneSessionId
    ? await input.db.from('together_scene_sessions').select('*').eq('id', active.scene.sceneSessionId).eq('user_id', input.userId).is('ended_at', null).maybeSingle()
    : await input.db.from('together_scene_sessions').select('*').eq('user_id', input.userId).eq('continuity_id', input.continuityId).eq('character_instance_id', input.characterInstanceId).is('ended_at', null).order('started_at', { ascending: false }).limit(1).maybeSingle();
  const { data: activePlan } = currentScene?.shared_plan_id
    ? await input.db.from('together_shared_plans').select('*').eq('id', currentScene.shared_plan_id).eq('user_id', input.userId).maybeSingle()
    : await input.db.from('together_shared_plans').select('*').eq('user_id', input.userId).eq('continuity_id', input.continuityId).eq('character_instance_id', input.characterInstanceId).in('status', ['scheduled', 'active']).lte('starts_at', new Date(input.now.getTime() + 30 * 60_000).toISOString()).gt('ends_at', input.now.toISOString()).order('starts_at', { ascending: false }).limit(1).maybeSingle();
  const locationId = String(currentScene?.location_id ?? active.scene.locationId);
  const place = await resolvePlaceContext({ db: input.db, locationId, now: input.now, userId: input.userId, characterInstanceId: input.characterInstanceId });
  const access = await resolveWorldAccess({ db: input.db, userId: input.userId, worldId: place.world.id });
  if (access === 'locked') throw new AppError('WORLD_LOCKED', 'That world is not available for this life yet.', 403);
  const [locationResult, nearbyResult, worldResult, presence, memoryResult, episodeResult, patternResult] = await Promise.all([
    input.db.from('together_locations').select('*').eq('id', locationId).maybeSingle(),
    input.db.from('together_locations').select('*').eq('world_id', place.world.id).neq('id', locationId).limit(120),
    input.db.from('together_worlds').select('id,activity_families,metadata').eq('id', place.world.id).maybeSingle(),
    resolveCompanionPresence({ db: input.db, userId: input.userId, characterInstanceId: input.characterInstanceId, now: input.now, ensure: false }),
    input.db.from('together_memories').select('id,memory_type,canonical_text,importance,location_id,context_tags,metadata').eq('user_id',input.userId).eq('character_instance_id',input.characterInstanceId).eq('status','active').order('importance',{ascending:false}).limit(16),
    input.db.from('together_scene_episodes').select('id,location_id,context_tags,significance').eq('user_id',input.userId).eq('character_instance_id',input.characterInstanceId).order('ended_at',{ascending:false}).limit(8),
    input.db.from('together_companion_user_patterns').select('pattern_key,category,summary,confidence').eq('user_id',input.userId).eq('character_instance_id',input.characterInstanceId).eq('status','active').order('confidence',{ascending:false}).limit(8),
  ]);
  if (locationResult.error || !locationResult.data) throw new AppError('NOT_FOUND', 'This location is unavailable.', 404);
  const location = asLocation(locationResult.data);
  const nearby = (nearbyResult.data ?? []).filter((row: Row) => row.parent_location_id === locationResult.data.parent_location_id || row.parent_location_id === locationResult.data.id || locationResult.data.parent_location_id === row.id).map(asLocation);
  const template = instance.together_character_templates ?? {};
  const version = instance.together_character_versions ?? {};
  const character = { role: template.character_role, interests: version.interests ?? template.interests ?? [], occupation: template.occupation, personality: version.personality_config, relationshipConfig: version.relationship_config, lifeConfig: version.life_config, boundaries: version.boundaries };
  const relationship = { stage: instance.relationship_stage, trust: relationshipResult.data?.trust, comfort: relationshipResult.data?.comfort, attraction: relationshipResult.data?.attraction, affinity: relationshipResult.data?.affinity, familiarity: relationshipResult.data?.familiarity, conflict: relationshipResult.data?.conflict, romanceEnabled: relationshipResult.data?.romance_enabled !== false };
  const memoryCues=[...(memoryResult.data??[]).map((memory:Row)=>memoryCue(memory,locationId)),...(episodeResult.data??[]).map((episode:Row)=>({memoryId:String(episode.id),type:episode.location_id===locationId?'place_history':'shared_activity',activityTags:(episode.context_tags??[]).map(String),locationId:episode.location_id??undefined,valence:.5,strength:Number(episode.significance??.5)}))];
  const userPatterns=(patternResult.data??[]).map((pattern:Row)=>({patternKey:String(pattern.pattern_key),category:String(pattern.category),summary:String(pattern.summary),confidence:Number(pattern.confidence??0)}));
  return { ...input, instance, conversation, activeScene: active.scene, sceneSession: currentScene as Row | null, activePlan: activePlan as Row | null, place, location, nearby, world: { activityFamilies: worldResult.data?.activity_families ?? [], metadata: worldResult.data?.metadata ?? {} }, presence, character, relationship, profile: deriveCharacterInteractionProfile(character),memoryCues,userPatterns };
}

function resolveCandidateSet(context: any) {
  const life = { availability: context.presence?.availability ?? context.presence?.interruptibility, interruptibility: context.presence?.interruptibility, mood: context.presence?.mood ?? context.instance.current_mood, energy: context.presence?.energy ?? context.instance.current_energy, expectedEndAt: context.sceneSession?.expected_end_at ?? context.activeScene?.validUntil ?? context.presence?.expectedEndAt, now: context.now };
  const scene = { id: context.sceneSession?.id, ...(context.sceneSession?.state ?? {}), currentActivityKey: context.sceneSession?.activity_key ?? context.presence?.activityKey ?? null, expectedEndAt: context.sceneSession?.expected_end_at ?? null };
  const input = { character: context.character, interactionProfile: context.profile, relationship: context.relationship, world: context.world, location: context.location, scene, life, nearbyLocations: context.nearby, memoryCues:context.memoryCues,userPatterns:context.userPatterns, activePlan: context.activePlan ? { id: String(context.activePlan.id), activityKey: String(context.activePlan.activity_key), locationId: String(context.activePlan.location_id), title: String(context.activePlan.title), startsAt: String(context.activePlan.starts_at), endsAt: String(context.activePlan.ends_at) } : undefined, seed: `${context.characterInstanceId}:${context.location.id}:${context.sceneSession?.id ?? 'entered'}` };
  return { interactions: resolveInteractions(input), destinations: resolveMovementDestinations(input) };
}

async function ensureScene(context: any): Promise<Row> {
  if (context.sceneSession) return context.sceneSession;
  if (context.activePlan) {
    const planScene = await ensurePlanScene({ db: context.db, userId: context.userId, continuityId: context.continuityId, characterInstanceId: context.characterInstanceId, plan: context.activePlan, conversationId: context.conversation.id, now: context.now });
    if (planScene) return planScene;
  }
  const source = context.activeScene.entryReason === 'active_date' ? 'date' : context.activeScene.entryReason === 'shared_plan' ? 'shared_plan' : context.activeScene.entryReason === 'user_drop_in' ? 'drop_in' : 'conversation';
  const payload = { user_id: context.userId, continuity_id: context.continuityId, character_instance_id: context.characterInstanceId, conversation_id: context.conversation.id, world_id: context.place.world.id, location_id: context.place.location.id, source, activity_key: context.presence?.activityKey ?? null, participant_instance_ids: [context.characterInstanceId], started_at: context.now.toISOString(), expected_end_at: context.activeScene.validUntil ?? context.presence?.expectedEndAt ?? new Date(context.now.getTime() + 90 * 60_000).toISOString(), state: { focus: null, recentActionKeys: [], entryReason: context.activeScene.entryReason } };
  const { data, error } = await context.db.from('together_scene_sessions').insert(payload).select('*').single();
  if (!error && data) { await track(context.db, context.userId, 'scene_started', { characterInstanceId: context.characterInstanceId, sceneId: data.id, source }); return data; }
  const { data: concurrent } = await context.db.from('together_scene_sessions').select('*').eq('user_id', context.userId).eq('character_instance_id', context.characterInstanceId).is('ended_at', null).order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (concurrent) return concurrent;
  throw new AppError('INTERNAL_ERROR', 'The shared scene could not be started.', 500, true);
}

async function insertAction(db: any, input: { userId: string; continuityId: string; sceneId: string; characterInstanceId: string; interactionKey: string; family: string; requestId: string; payload: Record<string, unknown> }) {
  const { data, error } = await db.from('together_scene_actions').insert({ user_id: input.userId, continuity_id: input.continuityId, scene_session_id: input.sceneId, character_instance_id: input.characterInstanceId, interaction_key: input.interactionKey, family: input.family, request_id: input.requestId, payload: input.payload }).select('*').single();
  if (!error && data) return data as Row;
  const concurrent = await existingAction(db, input.sceneId, input.requestId);
  if (concurrent) return concurrent;
  throw new AppError('INTERNAL_ERROR', 'That interaction could not be saved.', 500, true);
}

async function existingAction(db: any, sceneId: string, requestId: string): Promise<Row | null> { const { data } = await db.from('together_scene_actions').select('*').eq('scene_session_id', sceneId).eq('request_id', requestId).maybeSingle(); return data as Row | null; }

async function maybeRecordEvidence(db: any, userId: string, characterInstanceId: string, actionId: string, candidate: InteractionCandidate, timezone: string, now: Date) {
  if (!candidate.effects.relationshipEvidenceType && !candidate.effects.momentCandidate) return false;
  const { error } = await db.rpc('kivelle_insert_relationship_evidence', { p_user_id: userId, p_character_instance_id: characterInstanceId, p_type: 'meaningful_conversation', p_source_type: 'scene_action', p_source_id: actionId, p_occurred_at: now.toISOString(), p_quality: candidate.effects.momentCandidate ? .72 : .48, p_valence: .35, p_timezone: timezone, p_metadata: { interactionKey: candidate.interactionKey, family: candidate.family, source: 'scene' } });
  return !error;
}
async function queueExplicitScenePhoto(input:{db:any;userId:string;characterInstanceId:string;conversationId:string;sceneId:string;sharedPlanId?:string;actionId:string;label:string}):Promise<Row|null>{
  try{
    const media=await queueMediaRequest(input.db,{userId:input.userId,characterInstanceId:input.characterInstanceId,source:'user_request',conversationId:input.conversationId,sceneSessionId:input.sceneId,sceneActionId:input.actionId,sharedPlanId:input.sharedPlanId,requestText:input.label,idempotencyKey:`scene-action:${input.actionId}`,force:true});
    if(media&&String(media.status)==='queued')waitUntil(kickMediaDispatcher());
    return media as Row|null;
  }catch(error){
    // A photo failure must never roll back a completed shared action.
    console.warn('Explicit scene photo unavailable',error instanceof Error?error.message:'unknown_error');
    return null;
  }
}

function extendExpectedEnd(current: string | null | undefined, candidate: InteractionCandidate, now: Date) {
  if (!candidate.effects.mayExtendScene) return current ?? null;
  const baseline = current ? new Date(current).getTime() : now.getTime();
  return new Date(Math.max(baseline, now.getTime()) + Math.min(30, candidate.durationMinutes ?? 10) * 60_000).toISOString();
}

async function actionResponse(context: any, action: Row) {
  const candidates = resolveCandidateSet(context);
  return { action, scene: serializeScene(context.sceneSession, context), interactions: candidates.interactions, destinations: candidates.destinations, place: context.place, reactionContext: action.result?.reactionContext ?? null };
}
function serializeScene(scene: Row | null, context: any) { return scene ? { ...scene, placePath: context.place.path, localTime: context.place.clock.localTime } : { id: null, location_id: context.place.location.id, world_id: context.place.world.id, interactionMode: 'co_present', placePath: context.place.path, localTime: context.place.clock.localTime }; }
async function ownedConversation(db: any, userId: string, continuityId: string, conversationId: string) { const { data } = await db.from('together_conversations').select('*').eq('id', conversationId).eq('user_id', userId).eq('continuity_id', continuityId).maybeSingle(); if (!data) throw new AppError('NOT_FOUND', 'That conversation is unavailable.', 404); return data as Row; }
async function clearConversationScene(db: any, userId: string, conversation: Row, now: Date) { await db.from('together_conversations').update({ metadata: mergeConversationSceneMetadata(conversation.metadata ?? {}, null), updated_at: now.toISOString() }).eq('id', conversation.id).eq('user_id', userId); }
async function syncConversationScene(db: any, userId: string, conversation: Row, scene: Row, now: Date) {
  const active = (conversation.metadata?.activeScene ?? {}) as Record<string, unknown>;
  const recent = Array.isArray(scene.state?.recentActionKeys) ? scene.state.recentActionKeys : [];
  const next = {
    version: 1 as const, characterInstanceId: scene.character_instance_id, locationId: scene.location_id, worldId: scene.world_id,
    interactionMode: 'co_present' as const, entryReason: active.entryReason ?? 'continued_scene', enteredAt: active.enteredAt ?? scene.started_at,
    source: active.source ?? 'presence', ...(scene.expected_end_at ? { validUntil: scene.expected_end_at } : {}),
    ...(active.arrivalAcknowledgedAt ? { arrivalAcknowledgedAt: active.arrivalAcknowledgedAt } : {}), updatedAt: now.toISOString(),
    sceneSessionId: scene.id, activityKey: scene.activity_key, ...(recent.at(-1) ? { lastInteractionKey: recent.at(-1) } : {}),
  };
  await db.from('together_conversations').update({ metadata: mergeConversationSceneMetadata(conversation.metadata ?? {}, next as Parameters<typeof mergeConversationSceneMetadata>[1]), updated_at: now.toISOString() }).eq('id', conversation.id).eq('user_id', userId);
}
function asLocation(row: Row): InteractionLocation { return { id: String(row.id), name: String(row.name), category: row.category ?? null, locationType: row.location_type ?? null, hours: row.hours ?? null, possibleActivities: Array.isArray(row.possible_activities) ? row.possible_activities : [], metadata: row.metadata ?? {} }; }
function memoryCue(memory:Row,currentLocationId:string){const text=String(memory.canonical_text??'').toLowerCase();const tags=Array.isArray(memory.context_tags)?memory.context_tags.map(String):['photography','karaoke','trivia','arcade','drinks','coffee','books','walking','restaurant','music'].filter((tag)=>text.includes(tag));const negative=/dislikes|does not like|hates|can.t stand/.test(text);return{memoryId:String(memory.id),type:negative?'negative_preference':memory.memory_type==='preference'?'preference':memory.location_id===currentLocationId?'place_history':'shared_activity',activityTags:tags,locationId:memory.location_id??undefined,valence:negative?-.8:.45,strength:Math.max(.25,Number(memory.importance??.5))};}
