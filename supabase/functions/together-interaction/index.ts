import { z } from 'zod';
import { applyInteractionSceneState, deriveCharacterInteractionProfile, interactionDefinition, matchInteractionIntent, resolveCharacterInitiative, resolveCharacterInteractionDecision, resolveInteractions, resolveMovementDestinations, type CharacterInteractionDecision, type InteractionCandidate, type InteractionLocation, type InteractionRelationshipEvidence } from '../../../packages/together-domain/src/index.ts';
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
  z.object({ action: z.literal('accept_proposal'), characterInstanceId: z.string().uuid(), sceneId: z.string().uuid().optional(), conversationId: z.string().uuid().optional(), proposalActionId:z.string().uuid(),requestId:z.string().trim().min(8).max(120) }),
  z.object({ action: z.literal('dismiss_proposal'), characterInstanceId: z.string().uuid(), sceneId: z.string().uuid().optional(), conversationId: z.string().uuid().optional(), proposalActionId:z.string().uuid() }),
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
    const scene=await ensureScene({ ...context, db, userId:user.id,continuityId:continuity.id,now });
    const resolvedContext={...context,sceneSession:scene};
    const result = resolveCandidateSet(resolvedContext);
    const characterProposal=await ensureCharacterProposal(resolvedContext,result.interactions);
    await track(db, user.id, 'interaction_candidates_viewed', { characterInstanceId: input.characterInstanceId, locationId: context.location.id, sceneId: context.sceneSession?.id ?? null, candidateCount: result.interactions.length });
    const intentMatch=input.intentText?matchInteractionIntent(input.intentText,result.interactions):null;
    return json({ data: { ...result, ...(intentMatch?{intentMatch}:{}),...(characterProposal?{characterProposal}:{}), scene: serializeScene(scene, resolvedContext), place: context.place, presence: context.presence }, correlationId }, 200, correlationId);
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

  if(input.action==='dismiss_proposal'){
    const proposal=await ownedProposal(db,user.id,continuity.id,scene.id,input.proposalActionId);
    if(!['proposed','countered'].includes(String(proposal.decision_status)))throw new AppError('ACTION_NOT_AVAILABLE','That suggestion is no longer waiting for an answer.',409);
    const result={...(proposal.result??{}),proposalDismissed:true,decision:'declined'};
    await db.from('together_scene_actions').update({decision_status:'declined',decision_reason_codes:[...(proposal.decision_reason_codes??[]),'user_declined_proposal'],decided_at:now.toISOString(),completed_at:now.toISOString(),result}).eq('id',proposal.id).eq('user_id',user.id);
    const nextState={...(scene.state??{}),pendingProposalId:null,initiativeCooldownUntil:new Date(now.getTime()+12*60_000).toISOString()};
    const{data:updated}=await db.from('together_scene_sessions').update({state:nextState,updated_at:now.toISOString()}).eq('id',scene.id).eq('user_id',user.id).select('*').single();
    await track(db,user.id,'character_interaction_proposal_dismissed',{sceneId:scene.id,characterInstanceId:input.characterInstanceId,interactionKey:proposal.interaction_key});
    return json({data:{scene:serializeScene(updated??scene,{...context,sceneSession:updated??scene}),interactions:resolveCandidateSet({...context,sceneSession:updated??scene}).interactions,destinations:resolveCandidateSet({...context,sceneSession:updated??scene}).destinations},correlationId},200,correlationId);
  }

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

  if(input.action==='accept_proposal'){
    const proposal=await ownedProposal(db,user.id,continuity.id,scene.id,input.proposalActionId);
    const existing=await existingAction(db,scene.id,input.requestId);
    if(existing)return json({data:await actionResponse({...context,sceneSession:scene},existing),correlationId},200,correlationId);
    if(!['proposed','countered'].includes(String(proposal.decision_status)))throw new AppError('ACTION_NOT_AVAILABLE','That suggestion is no longer waiting for an answer.',409);
    if(proposal.expires_at&&new Date(proposal.expires_at).getTime()<=now.getTime())throw new AppError('ACTION_NOT_AVAILABLE','That suggestion has passed.',409);
    const proposalResult=(proposal.result??{}) as Row;
    const interactionKey=String(proposal.resolved_interaction_key??proposalResult.counterCandidate?.interactionKey??proposal.interaction_key);
    const candidate=candidates.interactions.find((item)=>item.interactionKey===interactionKey);
    if(!candidate)throw new AppError('ACTION_NOT_AVAILABLE','That suggestion no longer fits this scene.',409);
    const action=await insertAction(db,{userId:user.id,continuityId:continuity.id,sceneId:scene.id,characterInstanceId:input.characterInstanceId,interactionKey:candidate.interactionKey,family:candidate.family,requestId:input.requestId,payload:{candidate:{label:candidate.label,durationMinutes:candidate.durationMinutes},proposalActionId:proposal.id},initiatedBy:'character',decisionStatus:'accepted',parentActionId:proposal.id,respondingCharacterInstanceId:input.characterInstanceId});
    await db.from('together_scene_actions').update({decision_status:'accepted',resolved_interaction_key:candidate.interactionKey,decided_at:now.toISOString(),completed_at:now.toISOString(),result:{...proposalResult,proposalAccepted:true}}).eq('id',proposal.id).eq('user_id',user.id);
    const decision=resolveCharacterInteractionDecision({candidate,candidates:candidates.interactions,profile:context.profile,relationship:context.relationship,life:interactionLife(context,scene),scene:interactionScene(scene,context),seed:`proposal:${proposal.id}`,recentSameInteractionCount:await recentInteractionCount(db,scene.id,candidate.interactionKey)});
    const completed=await completeAcceptedInteraction({...context,db,userId:user.id,continuityId:continuity.id,now,scene,candidate,action,decision:{...decision,decision:'accepted',resolvedInteractionKey:candidate.interactionKey}});
    await track(db,user.id,'character_interaction_proposal_accepted',{sceneId:scene.id,characterInstanceId:input.characterInstanceId,interactionKey:candidate.interactionKey});
    return json({data:completed,correlationId},200,correlationId);
  }

  const candidate = candidates.interactions.find((item) => item.interactionKey === input.interactionKey);
  if (!candidate) throw new AppError('ACTION_NOT_AVAILABLE', 'That option is no longer available in this scene.', 409);
  const existing = await existingAction(db, scene.id, input.requestId);
  if (existing) return json({ data: await actionResponse({ ...context, sceneSession: scene }, existing), correlationId }, 200, correlationId);
  const definition = interactionDefinition(candidate.interactionKey);
  if (!definition) throw new AppError('ACTION_NOT_AVAILABLE', 'That interaction is not recognised.', 409);
  const recentSameInteractionCount=await recentInteractionCount(db,scene.id,candidate.interactionKey);
  const decision=resolveCharacterInteractionDecision({candidate,candidates:candidates.interactions,profile:context.profile,relationship:context.relationship,life:interactionLife(context,scene),scene:interactionScene(scene,context),seed:`${input.requestId}:${input.characterInstanceId}`,recentSameInteractionCount});
  const resolvedCandidate=decision.decision==='countered'?candidates.interactions.find((item)=>item.interactionKey===decision.counterInteractionKey):candidate;
  const action = await insertAction(db, { userId: user.id, continuityId: continuity.id, sceneId: scene.id, characterInstanceId: input.characterInstanceId, interactionKey: candidate.interactionKey, family: candidate.family, requestId: input.requestId, payload: { candidate: { label: candidate.label, durationMinutes: candidate.durationMinutes } },initiatedBy:'user',decisionStatus:decision.decision,respondingCharacterInstanceId:input.characterInstanceId,resolvedInteractionKey:decision.decision==='accepted'?candidate.interactionKey:decision.counterInteractionKey,decisionReasonCodes:decision.reasonCodes });
  if(decision.decision!=='accepted'){
    const counterCandidate=decision.decision==='countered'&&resolvedCandidate?{interactionKey:resolvedCandidate.interactionKey,label:resolvedCandidate.label,durationMinutes:resolvedCandidate.durationMinutes}:null;
    const result={label:candidate.label,decision:decision.decision,reasonCodes:decision.reasonCodes,...(counterCandidate?{counterCandidate}:{}),reactionContext:{interactionKey:candidate.interactionKey,label:candidate.label,location:context.place.path,decision:decision.decision,...(counterCandidate?{counterLabel:counterCandidate.label}:{})}};
    const expiresAt=decision.decision==='countered'?new Date(now.getTime()+12*60_000).toISOString():null;
    await db.from('together_scene_actions').update({result,decided_at:now.toISOString(),completed_at:now.toISOString(),expires_at:expiresAt}).eq('id',action.id).eq('user_id',user.id);
    if(decision.decision==='countered')await db.from('together_scene_sessions').update({state:{...(scene.state??{}),pendingProposalId:action.id,initiativeCooldownUntil:expiresAt},updated_at:now.toISOString()}).eq('id',scene.id).eq('user_id',user.id);
    await track(db,user.id,'interaction_decided',{characterInstanceId:input.characterInstanceId,sceneId:scene.id,interactionKey:candidate.interactionKey,decision:decision.decision});
    return json({data:await actionResponse({...context,sceneSession:scene},{...action,result,decision_status:decision.decision}),correlationId},200,correlationId);
  }
  const completed=await completeAcceptedInteraction({...context,db,userId:user.id,continuityId:continuity.id,now,scene,candidate,action,decision});
  return json({ data: completed, correlationId }, 200, correlationId);
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
    input.db.from('together_scene_episodes').select('id,location_id,context_tags,significance,summary,ended_at,action_ids').eq('user_id',input.userId).eq('character_instance_id',input.characterInstanceId).order('ended_at',{ascending:false}).limit(8),
    input.db.from('together_companion_user_patterns').select('pattern_key,category,summary,confidence').eq('user_id',input.userId).eq('character_instance_id',input.characterInstanceId).eq('status','active').order('confidence',{ascending:false}).limit(8),
  ]);
  if (locationResult.error || !locationResult.data) throw new AppError('NOT_FOUND', 'This location is unavailable.', 404);
  const location = asLocation(locationResult.data);
  const nearby = (nearbyResult.data ?? []).filter((row: Row) => row.parent_location_id === locationResult.data.parent_location_id || row.parent_location_id === locationResult.data.id || locationResult.data.parent_location_id === row.id).map(asLocation);
  const template = instance.together_character_templates ?? {};
  const version = instance.together_character_versions ?? {};
  const character = { role: template.character_role, interests: version.interests ?? template.interests ?? [], occupation: template.occupation, personality: version.personality_config, relationshipConfig: version.relationship_config, lifeConfig: version.life_config, boundaries: version.boundaries };
  const relationship = { stage: instance.relationship_stage, trust: relationshipResult.data?.trust, comfort: relationshipResult.data?.comfort, attraction: relationshipResult.data?.attraction, affinity: relationshipResult.data?.affinity, familiarity: relationshipResult.data?.familiarity, conflict: relationshipResult.data?.conflict, romanceEnabled: relationshipResult.data?.romance_enabled !== false };
  const memoryCues=[...(memoryResult.data??[]).map((memory:Row)=>memoryCue(memory,locationId)),...(episodeResult.data??[]).map((episode:Row)=>({memoryId:String(episode.id),type:episode.location_id===locationId?'place_history':'shared_activity',activityTags:(episode.context_tags??[]).map(String),locationId:episode.location_id??undefined,valence:.5,strength:Number(episode.significance??.5),summary:String(episode.summary??''),occurredAt:episode.ended_at??undefined}))];
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
  if (!error && data) { await context.db.from('together_scene_participants').upsert({user_id:context.userId,continuity_id:context.continuityId,scene_session_id:data.id,character_instance_id:context.characterInstanceId,role:'primary_companion',joined_at:data.started_at,witnessed_from_sequence:1,metadata:{canonicalPrimary:true,contextVersion:1}},{onConflict:'scene_session_id,character_instance_id',ignoreDuplicates:true});await track(context.db, context.userId, 'scene_started', { characterInstanceId: context.characterInstanceId, sceneId: data.id, source }); return data; }
  const { data: concurrent } = await context.db.from('together_scene_sessions').select('*').eq('user_id', context.userId).eq('character_instance_id', context.characterInstanceId).is('ended_at', null).order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (concurrent) return concurrent;
  throw new AppError('INTERNAL_ERROR', 'The shared scene could not be started.', 500, true);
}

async function insertAction(db: any, input: { userId: string; continuityId: string; sceneId: string; characterInstanceId: string; interactionKey: string; family: string; requestId: string; payload: Record<string, unknown>;initiatedBy?:'user'|'character'|'system';decisionStatus?:string;respondingCharacterInstanceId?:string;resolvedInteractionKey?:string;parentActionId?:string;decisionReasonCodes?:string[] }) {
  const decisionStatus=input.decisionStatus??'accepted';
  const { data, error } = await db.from('together_scene_actions').insert({ user_id: input.userId, continuity_id: input.continuityId, scene_session_id: input.sceneId, character_instance_id: input.characterInstanceId, interaction_key: input.interactionKey,requested_interaction_key:input.interactionKey, family: input.family, request_id: input.requestId, payload: input.payload,initiated_by:input.initiatedBy??'user',decision_status:decisionStatus,responding_character_instance_id:input.respondingCharacterInstanceId??input.characterInstanceId,resolved_interaction_key:input.resolvedInteractionKey??(decisionStatus==='accepted'?input.interactionKey:null),parent_action_id:input.parentActionId??null,decision_reason_codes:input.decisionReasonCodes??[],decided_at:decisionStatus==='proposed'?null:new Date().toISOString() }).select('*').single();
  if (!error && data) return data as Row;
  const concurrent = await existingAction(db, input.sceneId, input.requestId);
  if (concurrent) return concurrent;
  throw new AppError('INTERNAL_ERROR', 'That interaction could not be saved.', 500, true);
}

async function existingAction(db: any, sceneId: string, requestId: string): Promise<Row | null> { const { data } = await db.from('together_scene_actions').select('*').eq('scene_session_id', sceneId).eq('request_id', requestId).maybeSingle(); return data as Row | null; }

async function recentInteractionCount(db:any,sceneId:string,interactionKey:string){const{count}=await db.from('together_scene_actions').select('id',{count:'exact',head:true}).eq('scene_session_id',sceneId).or(`interaction_key.eq.${interactionKey},resolved_interaction_key.eq.${interactionKey}`).in('decision_status',['accepted','completed']);return Number(count??0);}

async function ownedProposal(db:any,userId:string,continuityId:string,sceneId:string,proposalActionId:string):Promise<Row>{const{data}=await db.from('together_scene_actions').select('*').eq('id',proposalActionId).eq('user_id',userId).eq('continuity_id',continuityId).eq('scene_session_id',sceneId).maybeSingle();if(!data)throw new AppError('ACTION_NOT_AVAILABLE','That suggestion is no longer available.',409);return data as Row;}

function serializeProposal(action:Row|null|undefined){if(!action)return null;const candidate=action.payload?.candidate??{};const counter=action.result?.counterCandidate;return{actionId:String(action.id),interactionKey:String(counter?.interactionKey??action.resolved_interaction_key??action.interaction_key),label:String(counter?.label??candidate.label??action.result?.label??'Spend some time together'),status:String(action.decision_status??'proposed'),source:action.decision_status==='countered'?'counter':'character',expiresAt:action.expires_at??null,parentActionId:action.parent_action_id??null};}

async function ensureCharacterProposal(context:any,candidates:InteractionCandidate[]){
  const now=context.now as Date,scene=context.sceneSession as Row;
  await context.db.from('together_scene_actions').update({decision_status:'expired',completed_at:now.toISOString(),decided_at:now.toISOString()}).eq('user_id',context.userId).eq('scene_session_id',scene.id).in('decision_status',['proposed','countered']).lt('expires_at',now.toISOString());
  const{data:existing}=await context.db.from('together_scene_actions').select('*').eq('user_id',context.userId).eq('scene_session_id',scene.id).in('decision_status',['proposed','countered']).gt('expires_at',now.toISOString()).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(existing)return serializeProposal(existing);
  const initiative=resolveCharacterInitiative({candidates,profile:context.profile,life:interactionLife(context,scene),scene:interactionScene(scene,context),now,seed:`${context.characterInstanceId}:${scene.id}:${Math.floor(now.getTime()/600000)}`});
  if(initiative.kind!=='proposal')return null;
  const candidate=candidates.find((item)=>item.interactionKey===initiative.interactionKey);if(!candidate)return null;
  const requestId=`character-proposal:${scene.id}:${Math.floor(now.getTime()/600000)}:${candidate.interactionKey}`;
  const action=await insertAction(context.db,{userId:context.userId,continuityId:context.continuityId,sceneId:scene.id,characterInstanceId:context.characterInstanceId,interactionKey:candidate.interactionKey,family:candidate.family,requestId,payload:{candidate:{label:candidate.label,durationMinutes:candidate.durationMinutes},reasonCodes:initiative.reasonCodes},initiatedBy:'character',decisionStatus:'proposed',respondingCharacterInstanceId:context.characterInstanceId,decisionReasonCodes:initiative.reasonCodes});
  await context.db.from('together_scene_actions').update({expires_at:initiative.expiresAt,resolved_interaction_key:candidate.interactionKey}).eq('id',action.id).eq('user_id',context.userId);
  const nextState={...(scene.state??{}),pendingProposalId:action.id,lastCharacterInitiativeAt:now.toISOString(),initiativeCooldownUntil:new Date(now.getTime()+12*60_000).toISOString()};
  await context.db.from('together_scene_sessions').update({state:nextState,updated_at:now.toISOString()}).eq('id',scene.id).eq('user_id',context.userId);
  await track(context.db,context.userId,'character_interaction_proposed',{sceneId:scene.id,characterInstanceId:context.characterInstanceId,interactionKey:candidate.interactionKey});
  return serializeProposal({...action,expires_at:initiative.expiresAt,resolved_interaction_key:candidate.interactionKey});
}

function interactionLife(context:any,scene:Row){return{availability:context.presence?.availability??context.presence?.interruptibility,interruptibility:context.presence?.interruptibility,mood:context.presence?.mood??context.instance.current_mood,energy:context.presence?.energy??context.instance.current_energy,expectedEndAt:scene.expected_end_at??context.activeScene?.validUntil??context.presence?.expectedEndAt,now:context.now};}
function interactionScene(scene:Row,context:any){return{id:scene.id,...(scene.state??{}),currentActivityKey:scene.activity_key??context.presence?.activityKey??null,expectedEndAt:scene.expected_end_at??null};}

async function completeAcceptedInteraction(input:any){
  const{db,userId,scene,candidate,action,decision,now}=input as{db:any;userId:string;scene:Row;candidate:InteractionCandidate;action:Row;decision:CharacterInteractionDecision;now:Date};
  let nextState={...applyInteractionSceneState(scene.state??{},candidate),pendingProposalId:null};
  let expectedEnd=scene.expected_end_at??null;
  if(decision.sceneTransition?.kind==='extend')expectedEnd=new Date(Math.max(now.getTime(),expectedEnd?new Date(expectedEnd).getTime():now.getTime())+decision.sceneTransition.minutes*60_000).toISOString();
  else if(!decision.sceneTransition||decision.sceneTransition.kind==='stay')expectedEnd=extendExpectedEnd(scene.expected_end_at,candidate,now);
  if(decision.sceneTransition?.kind==='character_departure'||decision.sceneTransition?.kind==='end'){nextState={...nextState,pendingDeparture:{reason:decision.sceneTransition.reason,requestedAt:now.toISOString()}};expectedEnd=new Date(now.getTime()+3*60_000).toISOString();}
  const{data:updated,error}=await db.from('together_scene_sessions').update({activity_key:String(nextState.currentActivityKey??scene.activity_key??input.presence?.activityKey??'together'),state:nextState,expected_end_at:expectedEnd,updated_at:now.toISOString()}).eq('id',scene.id).eq('user_id',userId).select('*').single();
  if(error||!updated)throw new AppError('INTERNAL_ERROR','That interaction could not be saved.',500,true);
  const evidenceRecorded=await maybeRecordEvidence(db,userId,input.characterInstanceId,action.id,candidate,decision.relationshipEvidence,input.place.clock.timezone,now);
  const media=String(candidate.effects.mediaPolicy??'none')==='explicit'?await queueExplicitScenePhoto({db,userId,characterInstanceId:input.characterInstanceId,conversationId:input.conversation.id,sceneId:scene.id,sharedPlanId:scene.shared_plan_id??undefined,actionId:action.id,label:candidate.label}):null;
  const result={label:candidate.label,decision:'accepted',reasonCodes:decision.reasonCodes,nextState,effects:candidate.effects,evidence:decision.relationshipEvidence??null,evidenceRecorded,sceneTransition:decision.sceneTransition??{kind:'stay'},...(media?{media:{id:media.id,status:media.status}}:{}),reactionContext:{interactionKey:candidate.interactionKey,label:candidate.label,location:input.place.path,decision:'accepted'}};
  await db.from('together_scene_actions').update({decision_status:'accepted',resolved_interaction_key:candidate.interactionKey,decision_reason_codes:decision.reasonCodes,decided_at:now.toISOString(),result,completed_at:now.toISOString()}).eq('id',action.id).eq('user_id',userId);
  await syncConversationScene(db,userId,input.conversation,updated,now);
  await track(db,userId,'interaction_executed',{characterInstanceId:input.characterInstanceId,sceneId:scene.id,interactionKey:candidate.interactionKey,family:candidate.family,decision:'accepted'});
  await track(db,userId,'interaction_family_used',{family:candidate.family});
  return actionResponse({...input,sceneSession:updated},{...action,decision_status:'accepted',result});
}

async function maybeRecordEvidence(db: any, userId: string, characterInstanceId: string, actionId: string, candidate: InteractionCandidate, evidence:InteractionRelationshipEvidence|null|undefined, timezone: string, now: Date) {
  if (!evidence||evidence.quality<=0) return false;
  const { error } = await db.rpc('kivelle_insert_relationship_evidence', { p_user_id: userId, p_character_instance_id: characterInstanceId, p_type: evidence.type, p_source_type: 'scene_action', p_source_id: actionId, p_occurred_at: now.toISOString(), p_quality: evidence.quality, p_valence: evidence.valence, p_timezone: timezone, p_metadata: { interactionKey: candidate.interactionKey, family: candidate.family, source: 'scene',metricDelta:evidence.metricDelta,reasonCodes:evidence.reasonCodes } });
  if(error)return false;
  const{data:relationship}=await db.from('together_relationship_states').select('trust,comfort,attraction,affinity,familiarity,respect,conflict,romantic_interest,commitment').eq('user_id',userId).eq('character_instance_id',characterInstanceId).maybeSingle();
  if(relationship){const update:Row={};for(const[key,delta]of Object.entries(evidence.metricDelta)){const current=Number(relationship[key]??0);update[key]=Math.max(0,Math.min(100,current+Number(delta??0)));}if(Object.keys(update).length){const direction=Object.values(evidence.metricDelta).reduce((sum,value)=>sum+Number(value??0),0);await db.from('together_relationship_states').update({...update,last_relationship_delta:evidence.metricDelta,recent_direction:direction>0?'improving':direction<0?'strained':'steady',updated_at:now.toISOString()}).eq('user_id',userId).eq('character_instance_id',characterInstanceId);}}
  return true;
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
  const{data:proposal}=await context.db.from('together_scene_actions').select('*').eq('user_id',context.userId).eq('scene_session_id',context.sceneSession.id).in('decision_status',['proposed','countered']).gt('expires_at',context.now.toISOString()).order('created_at',{ascending:false}).limit(1).maybeSingle();
  return { action, scene: serializeScene(context.sceneSession, context), interactions: candidates.interactions, destinations: candidates.destinations, place: context.place, reactionContext: action.result?.reactionContext ?? null,...(proposal?{characterProposal:serializeProposal(proposal)}:{}) };
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
function memoryCue(memory:Row,currentLocationId:string){const text=String(memory.canonical_text??'').toLowerCase();const tags=Array.isArray(memory.context_tags)?memory.context_tags.map(String):['photography','karaoke','trivia','arcade','drinks','coffee','books','walking','restaurant','music'].filter((tag)=>text.includes(tag));const negative=/dislikes|does not like|hates|can.t stand/.test(text);const interactionKey=typeof memory.metadata?.interactionKey==='string'?memory.metadata.interactionKey:undefined;return{memoryId:String(memory.id),type:negative?'negative_preference':memory.memory_type==='preference'?'preference':memory.location_id===currentLocationId?'place_history':'shared_activity',activityTags:tags,locationId:memory.location_id??undefined,valence:negative?-.8:.45,strength:Math.max(.25,Number(memory.importance??.5)),...(interactionKey?{interactionKey}:{}),summary:String(memory.canonical_text??'')};}
