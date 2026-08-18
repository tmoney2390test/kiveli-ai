import type { SupabaseClient } from '@supabase/supabase-js';
import { eventIsActive, experienceClock, formatExperienceTime, type ExperienceClock } from './kivelle-time.ts';
import { resolvePlaceContext, type PlaceContext } from './together-place.ts';
import { resolveActiveConversationScene } from './together-conversation.ts';
import { activeEmotionalResidue, retrieveActivatedMemories, type ActivatedMemoryContext } from './kivelle-memory.ts';
import { loadPlacePerspectives, type PlacePerspectiveView } from './kivelle-place-perspective.ts';
import { resolveConversationStyle, type ConversationStyle } from '../../../packages/together-domain/src/conversation-style.ts';
import { classifyConversationQuery, resolvePresentReality } from '../../../packages/together-domain/src/conversation.ts';
import { normalizeMultimodalPreferences, resolveServerExperienceCapabilities } from './kivelle-multimodal.ts';

type Row = Record<string, any>;

export type ContextQueryIntent = 'general'|'schedule'|'plan'|'date'|'story'|'memory_overview'|'social'|'location'|'history';
export type CurrentSceneContext = { locationId: string|null; location: string; activity: string; mood: string; energy: string; availability: string; interruptibility?:string; scheduleEventId?:string; sceneSessionId?:string; lastInteractionKey?:string; startedAt?:string; expectedEndAt?:string; nextObligation?:{title:string;startsAt:string;location?:string|null}; entryReason?:'direct_chat'|'scheduled'|'user_drop_in'|'invited'|'continued_chat'|'shared_plan'|'active_date'; interactionMode:'remote'|'co_present'; sceneBehavior:{acknowledgeArrival:boolean;activityAwareness:boolean;departurePressure:boolean}; source: 'active_date'|'active_plan'|'active_event'|'scene'|'schedule'|'life_engine'|'character_state'; activeEvent?: { id:string; title:string; summary:string; endsAt?:string|null }; activePlan?:{id:string;title:string;activityKey:string;originalLocationId?:string|null;endsAt?:string|null;sceneSessionId?:string;activityState?:Record<string,unknown>;companionAtPlan?:boolean;planAwaitingUser?:boolean;participation?:{joinedAt?:string;attendedSeconds?:number}};activeDate?:{id:string;title:string} };
export type KivelleConversationContext = {
  contentMode?:string;
  photoRequest?:boolean;
  conversationStyle:ConversationStyle;
  experienceCapabilities:ReturnType<typeof resolveServerExperienceCapabilities>;
  persona: Row;
  character: Row;
  clock: ExperienceClock;
  currentScene: CurrentSceneContext;
  life: CurrentSceneContext;
  relationship: Row;
  progression: Row|null;
  upcomingSchedule: Array<{ startsAt:string; label:string; location:string; availability:string }>;
  sharedPlans: Array<{ id:string; title:string; activityKey:string; status:string; startsAt:string; endsAt?:string|null; startsAtLabel:string; endsAtLabel:string; locationId:string|null; location:string; note?:string|null; summary:string }>;
  upcomingCommitments: Array<{ id:string; type:'plan'|'date'; title:string; startsAt:string; location:string }>;
  planningCatalog:Array<{id:string;name:string;slug:string;category:string;activities:string[];hours:Row|null;tags:string[];dateTypes:string[];socialEnergy?:string;privacy?:string;companionSentiment?:number;sharedVisitCount?:number;companionOpinion?:string|null;preferredActivities?:string[]}>;
  dates: { active:Row|null; upcoming:Row[]; unlocked:Row[]; recentCompleted:Row[] };
  activeStory: Row|null;
  memories: Array<{ id:string; text:string; type:string; pinned:boolean; importance:number }>;
  memoryContext: ActivatedMemoryContext;
  emotionalResidue:{tone:string;valence:number;intensity:number;expiresAt:string}|null;
  userPatterns:Array<{id:string;patternKey:string;category:string;summary:string;confidence:number}>;
  recentEpisodes:Array<{id:string;title:string;summary:string;significance:number;locationId?:string|null;endedAt:string}>;
  openThreads: Array<{ id:string; subject:string; displaySubject:string; followupPrompt:string; expectedAt:string|null; eligible:boolean }>;
  social: Array<{ name:string; relationship:string; userHasMet:boolean }>;
  knownLifeEvents: Array<{ id:string; title:string; summary:string; startsAt:string }>;
  location: Row|null;
  place: PlaceContext|null;
  referencedPlaces: PlaceContext[];
  placePerspectives: PlacePerspectiveView[];
  recentMedia: Array<{ id:string; summary:string; createdAt:string; locationId?:string|null }>;
  userAttachments:Array<{id:string;kind:'image';analysisStatus:string;shortDescription?:string;notableDetails:string[];visibleText?:string}>;
  sceneParticipants:Array<{characterInstanceId:string;name:string;role:string;joinedAt:string;socialEnergy?:number;directness?:number;relationshipRelevance?:number}>;
  sharedHistory: Array<{ id:string; type:'moment'|'date'|'plan'; title:string; summary:string; occurredAt:string }>;
  conversationSummary: string;
  conversationFocus: Row|null;
  recent: Array<{ role:string; content:string }>;
  userMessage: string;
  queryIntent: ContextQueryIntent;
  debug: { sources:string[]; limits:Record<string,number> };
};

export function detectContextQueryIntent(message: string): ContextQueryIntent {
  return classifyConversationQuery(message) as ContextQueryIntent;
}

export async function buildKivelleConversationContext(input: {
  db: SupabaseClient; userId:string; instance:Row; conversation:Row; userMessage:string;
  lifeRun:Row; semanticRows?:Row[]; attachments?:Row[]; now?:Date;
}): Promise<KivelleConversationContext> {
  const { db, userId, instance, conversation, userMessage } = input;
  const now = input.now ?? new Date();
  const intent = detectContextQueryIntent(userMessage);
  const [profile,entitlements, continuity, prefs, relationship, milestone, memories, threads, messages, schedules, events, plans, dates, stories, edges, instances, worlds, locations, media, moments, episodes, patterns, residue,relationshipPlaceRows,placeProfileRows] = await Promise.all([
    db.from('together_profiles').select('experience_timezone,interests,content_preferences,conversation_preferences,multimodal_preferences').eq('user_id', userId).maybeSingle(),
    db.from('together_entitlements').select('entitlement_keys').eq('user_id',userId).maybeSingle(),
    db.from('together_continuities').select('id,kind,title,together_user_personas(*)').eq('id',instance.continuity_id).eq('user_id',userId).single(),
    db.from('together_notification_preferences').select('timezone').eq('user_id', userId).maybeSingle(),
    db.from('together_relationship_states').select('*').eq('user_id', userId).eq('character_instance_id', instance.id).single(),
    db.from('together_relationship_milestones').select('id,kind,title,body,prompt,choices').eq('user_id', userId).eq('character_instance_id', instance.id).eq('status', 'pending').maybeSingle(),
    db.from('together_memories').select('*').eq('user_id', userId).eq('character_instance_id', instance.id).in('status', intent === 'history' || intent === 'memory_overview' ? ['active','superseded'] : ['active']).order('pinned', { ascending:false }).order('importance', { ascending:false }).limit(intent === 'memory_overview' ? 40 : 20),
    db.from('together_open_threads').select('*').eq('user_id', userId).eq('character_instance_id', instance.id).is('resolved_at', null).order('expected_at', { ascending:true, nullsFirst:false }).limit(10),
    db.from('together_messages').select('role,content,created_at').eq('conversation_id', conversation.id).order('created_at', { ascending:false }).limit(18),
    db.from('together_character_schedule_events').select('*,together_locations(name,world_id)').eq('user_id',userId).eq('character_instance_id',instance.id).gte('ends_at',now.toISOString()).lte('starts_at',new Date(now.getTime()+7*86400000).toISOString()).order('starts_at').limit(80),
    db.from('together_life_events').select('*').eq('user_id', userId).eq('character_instance_id', instance.id).not('event_type','in','(shared_plan,legacy_shared_plan)').lte('starts_at', now.toISOString()).order('starts_at', { ascending:false }).limit(12),
    db.from('together_shared_plans').select('*,together_locations(name,slug)').eq('user_id', userId).eq('character_instance_id', instance.id).order('starts_at', { ascending:true }).limit(40),
    db.from('together_date_sessions').select('*,together_date_templates(*)').eq('user_id', userId).eq('character_instance_id', instance.id).order('updated_at', { ascending:false }).limit(20),
    db.from('together_story_arc_instances').select('*,together_story_arc_templates(slug,title,priority,chapters)').eq('user_id', userId).eq('character_instance_id', instance.id).in('status',['active','paused']).order('updated_at', { ascending:false }).limit(3),
    db.from('together_character_relationship_edges').select('*').or(`source_template_id.eq.${instance.character_template_id},target_template_id.eq.${instance.character_template_id}`),
    db.from('together_character_instances').select('id,character_template_id,introduced_at,together_character_templates(name)').eq('user_id', userId).eq('continuity_id',instance.continuity_id),
    db.from('together_worlds').select('id,slug,name,access_type,entitlement_key').eq('published',true),
    db.from('together_locations').select('*'),
    db.from('together_generated_media').select('id,location_id,metadata,created_at').eq('user_id', userId).eq('character_instance_id', instance.id).eq('status','ready').order('created_at', { ascending:false }).limit(6),
    db.from('together_moments').select('*').eq('user_id', userId).eq('character_instance_id', instance.id).order('occurred_at', { ascending:false }).limit(intent === 'history' ? 20 : 6),
    db.from('together_scene_episodes').select('*').eq('user_id',userId).eq('character_instance_id',instance.id).order('ended_at',{ascending:false}).limit(intent==='history'?12:5),
    db.from('together_companion_user_patterns').select('*').eq('user_id',userId).eq('character_instance_id',instance.id).eq('status','active').order('confidence',{ascending:false}).limit(8),
    db.from('together_emotional_residue').select('*').eq('user_id',userId).eq('character_instance_id',instance.id).maybeSingle(),
    db.from('together_relationship_places').select('location_id,visit_count,sentiment,confidence,opinion_summary,evidence_count').eq('user_id',userId).eq('character_instance_id',instance.id),
    db.from('together_character_place_profiles').select('location_id,sentiment,confidence,opinion_summary,preferred_activities').eq('character_version_id',instance.character_version_id),
  ]);
  if (relationship.error) throw relationship.error;
  if(continuity.error)throw continuity.error;
  const locationById = new Map((locations.data ?? []).map((item:Row) => [String(item.id), item]));
  const returnedState = (input.lifeRun.state ?? {}) as Row;
  const presence=(input.lifeRun.presence??{}) as Row;
  const activeEvent = eventIsActive(input.lifeRun.activeEvent as Row | undefined, now) ? input.lifeRun.activeEvent as Row : null;
  const activePlanRow=(plans.data??[]).find((plan:Row)=>['scheduled','active'].includes(String(plan.status))&&plan.starts_at&&plan.ends_at&&new Date(plan.starts_at).getTime()-30*60_000<=now.getTime()&&new Date(plan.ends_at).getTime()>now.getTime()) as Row|undefined;
  const activePlanAttendance=activePlanRow?await db.from('together_plan_attendance').select('id,joined_at').eq('plan_id',activePlanRow.id).eq('user_id',userId).eq('participant_type','user').is('left_at',null).maybeSingle():{data:null};
  const activeDateRow=(dates.data??[]).find((date:Row)=>date.status==='active') as Row|undefined;
  const resolvedConversationScene=await resolveActiveConversationScene({db,userId,conversation,characterInstanceId:String(instance.id),now});
  const conversationScene=(resolvedConversationScene.scene??{}) as Row;
  const presentReality=resolvePresentReality({
    activeScene:resolvedConversationScene.scene?{locationId:String(conversationScene.locationId),activity:conversationScene.activityLabel??humanizeSceneActivity(conversationScene.activityKey),expectedEndAt:conversationScene.validUntil}:null,
    activeDate:activeDateRow?{locationId:String(activeDateRow.together_date_templates?.location_id??''),activity:String(activeDateRow.together_date_templates?.name??'Shared experience'),expectedEndAt:activeDateRow.completed_at}:null,
    activePlan:activePlanRow?{locationId:activePlanRow.location_id?String(activePlanRow.location_id):null,activity:String(activePlanRow.title??activePlanRow.activity_key??'Spending time together'),expectedEndAt:activePlanRow.ends_at,userPresent:Boolean(activePlanAttendance.data)}:undefined,
    lifeState:{...returnedState,source:String(input.lifeRun.stateSource??returnedState.source??'life_engine')},
    resolvedPresence:presence,
    characterState:{locationId:instance.current_location_id?String(instance.current_location_id):null,activity:instance.current_activity,mood:instance.current_mood,energy:instance.current_energy,interruptibility:instance.current_interruptibility},
  });
  const locationId = presentReality.locationId?String(presentReality.locationId):null;
  const currentLocation = locationId ? locationById.get(locationId) ?? null : null;
  const place=locationId?await resolvePlaceContext({db,locationId,now,userId,characterInstanceId:String(instance.id)}).catch(()=>null):null;
  const mentionText=normalizePlaceText(userMessage);
  const referencedLocationRows=(locations.data??[]).filter((item:Row)=>String(item.id)!==locationId&&placeMentioned(mentionText,String(item.name??''),String(item.slug??''))).sort((left:Row,right:Row)=>Number(String(right.world_id)===place?.world.id)-Number(String(left.world_id)===place?.world.id)).slice(0,2);
  const referencedPlaces=(await Promise.all(referencedLocationRows.map((item:Row)=>resolvePlaceContext({db,locationId:String(item.id),now,userId,characterInstanceId:String(instance.id)}).catch(()=>null)))).filter((item):item is PlaceContext=>Boolean(item));
  const placePerspectives=await loadPlacePerspectives({db,userId,characterInstanceId:String(instance.id),characterVersionId:String(instance.character_version_id),places:[place,...referencedPlaces].filter((item):item is PlaceContext=>Boolean(item))});
  const requestedWorld=(worlds.data??[]).find((world:Row)=>userMessage.toLowerCase().includes(String(world.name).toLowerCase())||userMessage.toLowerCase().includes(String(world.slug).replace(/-/g,' ')));
  const planningWorldId=String(requestedWorld?.id??place?.world.id??'');
  const timezone = place?.world.timezone ?? profile.data?.experience_timezone ?? prefs.data?.timezone ?? 'UTC';
  const clock = experienceClock(timezone, now);
  const interactionMode:CurrentSceneContext['interactionMode']=(resolvedConversationScene.scene||activeDateRow||activePlanAttendance.data)?'co_present':'remote';
  const entryReason:CurrentSceneContext['entryReason']=resolvedConversationScene.scene?(conversationScene.entryReason??'continued_chat'):activeDateRow?'active_date':activePlanAttendance.data?'shared_plan':'direct_chat';
  const departureAt=presentReality.expectedEndAt??presence.expectedEndAt;
  const departurePressure=Boolean(departureAt&&new Date(String(departureAt)).getTime()-now.getTime()<20*60000);
  const currentScene: CurrentSceneContext = {
    locationId, location: String(place?.location.name ?? currentLocation?.name ?? returnedState.location ?? 'Current place'),
    activity: presentReality.activity,
    mood: presentReality.mood, energy: presentReality.energy,
    availability: presentReality.availability, interruptibility:presentReality.interruptibility,
    ...(presentReality.scheduleEventId?{scheduleEventId:String(presentReality.scheduleEventId)}:{}),...(conversationScene.sceneSessionId?{sceneSessionId:String(conversationScene.sceneSessionId)}:{}),...(conversationScene.lastInteractionKey?{lastInteractionKey:String(conversationScene.lastInteractionKey)}:{}),...(presentReality.activityStartedAt?{startedAt:String(presentReality.activityStartedAt)}:{}),...(presentReality.expectedEndAt?{expectedEndAt:String(presentReality.expectedEndAt)}:{}),
    ...(presence.nextEvent?{nextObligation:{title:String(presence.nextEvent.title),startsAt:String(presence.nextEvent.startsAt),location:locationById.get(String(presence.nextEvent.locationId))?.name??null}}:{}),
    entryReason,interactionMode,sceneBehavior:{acknowledgeArrival:interactionMode==='co_present'&&entryReason==='user_drop_in'&&!conversationScene.arrivalAcknowledgedAt,activityAwareness:interactionMode==='co_present'||presentReality.source==='active_event',departurePressure}, source: presentReality.source,
    ...(activeDateRow?{activeDate:{id:String(activeDateRow.id),title:String(activeDateRow.together_date_templates?.name??'Shared experience')}}:{}),
    ...(activePlanRow?{activePlan:{id:String(activePlanRow.id),title:String(activePlanRow.title),activityKey:String(activePlanRow.activity_key),originalLocationId:activePlanRow.location_id??null,endsAt:activePlanRow.ends_at??null,companionAtPlan:true,planAwaitingUser:!activePlanAttendance.data,...(conversationScene.sceneSessionId?{sceneSessionId:String(conversationScene.sceneSessionId),activityState:(conversationScene as Row).activityState??undefined}:{}),...(activePlanAttendance.data?.joined_at?{participation:{joinedAt:String(activePlanAttendance.data.joined_at)}}:{})}}:{}),
    ...(activeEvent ? { activeEvent:{ id:String(activeEvent.id), title:String(activeEvent.title), summary:String(activeEvent.narrative_summary), endsAt:activeEvent.ends_at ?? null } } : {}),
  };
  const memoryContext=await retrieveActivatedMemories({db,userId,characterInstanceId:String(instance.id),userMessage,intent,storedRows:memories.data??[],semanticRows:input.semanticRows??[],currentScene:{...currentScene,worldId:place?.world.id},relationship:relationship.data??{},recentAssistantMessages:(messages.data??[]).filter((item:Row)=>item.role==='assistant'),now});
  const memoryRows=[...memoryContext.silent,...memoryContext.callbacks,...memoryContext.directRecall];
  const plansView = (plans.data ?? []).map((plan:Row) => ({
    id:String(plan.id), title:String(plan.title), activityKey:String(plan.activity_key), status:String(plan.status), startsAt:String(plan.starts_at), endsAt:plan.ends_at ?? null,
    startsAtLabel:formatExperienceTime(String(plan.starts_at),timezone),endsAtLabel:formatExperienceTime(String(plan.ends_at),timezone),locationId:plan.location_id?String(plan.location_id):null,
    location:String(plan.together_locations?.name ?? locationById.get(String(plan.location_id))?.name ?? 'Current place'), note:plan.note??null,summary:String(plan.metadata?.completionSummary ?? ''),
  }));
  const activePlans = plansView.filter((plan) => isCurrentPlan(plan, now));
  const cancelledOrCompleted=plansView.filter((plan)=>['cancelled','completed'].includes(plan.status)).sort((a,b)=>new Date(b.startsAt).getTime()-new Date(a.startsAt).getTime()).slice(0,2);
  const contextualPlans=[...activePlans.slice(0,5),...cancelledOrCompleted];
  const dateRows = await Promise.all((dates.data??[]).map(async(item:Row)=>{const dateLocationId=String(item.together_date_templates?.location_id??'');const datePlace=dateLocationId?await resolvePlaceContext({db,locationId:dateLocationId,now,userId,characterInstanceId:String(instance.id)}).catch(()=>null):null;return{...item,placeContext:datePlace};}));
  const upcomingDates = dateRows.filter((item:Row) => item.status === 'upcoming' && item.scheduled_for && new Date(item.scheduled_for) >= now);
  const commitments = dedupeCommitments([
    ...activePlans.filter((plan) => ['scheduled','active'].includes(plan.status)).map((plan) => ({ id:plan.id, type:'plan' as const, title:plan.title, startsAt:plan.startsAt, location:plan.location })),
    ...upcomingDates.map((item:Row) => ({ id:String(item.id), type:'date' as const, title:String(item.together_date_templates?.name ?? 'Date'), startsAt:String(item.scheduled_for), location:String(item.placeContext?.path??locationById.get(String(item.together_date_templates?.location_id))?.name??'Current place') })),
  ]).slice(0, 5);
  const worldSchedules=(schedules.data??[]).filter((row:Row)=>!place||String(row.together_locations?.world_id??'')===place.world.id);
  const schedule = worldSchedules.filter((row:Row)=>new Date(row.starts_at)>now&&row.visibility!=='hidden').slice(0,4).map((row:Row)=>({startsAt:String(row.starts_at),label:String(row.metadata?.activityLabel??row.title),location:String(row.together_locations?.name??locationById.get(String(row.location_id))?.name??'Current place'),availability:String(row.interruptibility??'open')}));
  const instanceByTemplate = new Map((instances.data ?? []).map((item:Row) => [String(item.character_template_id), item]));
  const social = (edges.data ?? []).map((edge:Row) => {
    const otherId = String(edge.source_template_id) === String(instance.character_template_id) ? String(edge.target_template_id) : String(edge.source_template_id);
    const other = instanceByTemplate.get(otherId);
    return { name:String(other?.together_character_templates?.name ?? 'Someone in the city'), relationship:String(edge.relationship_type ?? 'acquaintance'), userHasMet:Boolean(other?.introduced_at) };
  }).slice(0, 8);
  const activeStory = buildActiveStory(stories.data?.[0] ?? null);
  const history = retrieveSharedHistory({ intent, moments: moments.data ?? [], dates: dateRows, plans: plansView, now }).slice(0, intent === 'history' ? 12 : 5);
  const emotionalResidue=activeEmotionalResidue(residue.data??null,now);
  const attachmentRows=input.attachments??[];
  const userAttachments=attachmentRows.map((attachment:Row)=>{const analysis=(attachment.analysis_metadata??{}) as Row;return{id:String(attachment.id),kind:'image' as const,analysisStatus:String(attachment.analysis_status??'unavailable'),...(attachment.analysis_status==='ready'&&analysis.shortDescription?{shortDescription:String(analysis.shortDescription)}:{}),notableDetails:attachment.analysis_status==='ready'&&Array.isArray(analysis.notableDetails)?analysis.notableDetails.map(String).slice(0,12):[],...(attachment.analysis_status==='ready'&&analysis.visibleText?{visibleText:String(analysis.visibleText).slice(0,500)}:{})};});
  let sceneParticipants:KivelleConversationContext['sceneParticipants']=[];
  if(currentScene.sceneSessionId){const{data:participantRows}=await db.from('together_scene_participants').select('role,joined_at,character_instance_id,together_character_instances(together_character_templates(name),together_character_versions(personality_config))').eq('scene_session_id',currentScene.sceneSessionId).is('left_at',null).order('joined_at');const participantIds=(participantRows??[]).map((item:Row)=>String(item.character_instance_id));const{data:participantRelationships}=participantIds.length?await db.from('together_relationship_states').select('character_instance_id,trust,comfort,affinity,familiarity').eq('user_id',userId).in('character_instance_id',participantIds):{data:[]};sceneParticipants=(participantRows??[]).map((item:Row)=>{const personality=item.together_character_instances?.together_character_versions?.personality_config??{},participantRelationship=(participantRelationships??[]).find((value:Row)=>String(value.character_instance_id)===String(item.character_instance_id));return{characterInstanceId:String(item.character_instance_id),name:String(item.together_character_instances?.together_character_templates?.name??'Companion'),role:String(item.role),joinedAt:String(item.joined_at),socialEnergy:normalizedPersonalityValue(personality.socialEnergy??personality.social_energy,.5),directness:normalizedPersonalityValue(personality.directness,.5),relationshipRelevance:Math.min(1,(Number(participantRelationship?.trust??0)+Number(participantRelationship?.comfort??0)+Number(participantRelationship?.affinity??0)+Number(participantRelationship?.familiarity??0))/320)};});}
  return {
    conversationStyle:resolveConversationStyle(profile.data?.conversation_preferences),
    experienceCapabilities:resolveServerExperienceCapabilities(normalizeMultimodalPreferences(profile.data?.multimodal_preferences),(entitlements.data?.entitlement_keys??[]).map(String)),
    persona:Array.isArray(continuity.data.together_user_personas)?continuity.data.together_user_personas[0]:continuity.data.together_user_personas,
    character: { ...(instance.together_character_templates ?? {}), personality_config:instance.together_character_versions?.personality_config, communication_style:instance.together_character_versions?.communication_style, boundaries:instance.together_character_versions?.boundaries },
    clock, currentScene, life: currentScene, relationship:{...relationship.data,relationship_stage:instance.relationship_stage}, progression:milestone.data ?? null,
    upcomingSchedule:schedule, sharedPlans:contextualPlans, upcomingCommitments:commitments,
    planningCatalog:(locations.data??[]).filter((item:Row)=>(!planningWorldId||String(item.world_id)===planningWorldId)&&item.category!=='home'&&item.category!=='work').map((item:Row)=>{const learned=(relationshipPlaceRows.data??[]).find((row:Row)=>String(row.location_id)===String(item.id));const authored=(placeProfileRows.data??[]).find((row:Row)=>String(row.location_id)===String(item.id));const useLearned=Number(learned?.evidence_count??0)>0;return{id:String(item.id),worldId:String(item.world_id),worldName:String((worlds.data??[]).find((world:Row)=>String(world.id)===String(item.world_id))?.name??''),name:String(item.name),slug:String(item.slug),category:String(item.category),activities:(item.possible_activities??[]).map(String),hours:item.hours??null,tags:(item.metadata?.tags??[]).map(String),dateTypes:(item.metadata?.date_types??[]).map(String),socialEnergy:item.metadata?.social_energy,privacy:item.metadata?.privacy,companionSentiment:Number(useLearned?learned?.sentiment??0:authored?.sentiment??learned?.sentiment??0),sharedVisitCount:Number(learned?.visit_count??0),companionOpinion:useLearned?learned?.opinion_summary??authored?.opinion_summary??null:authored?.opinion_summary??learned?.opinion_summary??null,preferredActivities:(authored?.preferred_activities??[]).map(String)};}),
    dates:{ active:dateRows.find((item:Row)=>item.status==='active')??null, upcoming:upcomingDates.slice(0,4), unlocked:dateRows.filter((item:Row)=>['unlocked','deferred'].includes(item.status)).slice(0,4), recentCompleted:dateRows.filter((item:Row)=>item.status==='completed').slice(0,4) },
    activeStory, memories:memoryRows.map((item)=>({id:String(item.id),text:String(item.text),type:String(item.type),pinned:Boolean(item.pinned),importance:Number(item.importance??0)})),memoryContext,emotionalResidue,
    userPatterns:(patterns.data??[]).map((item:Row)=>({id:String(item.id),patternKey:String(item.pattern_key),category:String(item.category),summary:String(item.summary),confidence:Number(item.confidence??0)})),
    recentEpisodes:(episodes.data??[]).map((item:Row)=>({id:String(item.id),title:String(item.title),summary:String(item.summary),significance:Number(item.significance??0),locationId:item.location_id??null,endedAt:String(item.ended_at)})),
    openThreads:(threads.data??[]).map((thread:Row)=>threadContext(thread)), social,
    knownLifeEvents:(events.data??[]).filter((item:Row)=>item.user_should_know!==false).map((item:Row)=>({id:String(item.id),title:String(item.title),summary:String(item.narrative_summary),startsAt:String(item.starts_at)})).slice(0,6),
    location:currentLocation,place,referencedPlaces,placePerspectives,userAttachments,sceneParticipants,
    recentMedia:(media.data??[]).map((item:Row)=>({id:String(item.id),summary:String(item.metadata?.sceneSummary??'A recent shared photo.'),createdAt:String(item.created_at),locationId:item.location_id})),
    sharedHistory:history, conversationSummary:typeof conversation.summary==='string'?conversation.summary:'', conversationFocus:resolveConversationFocus(conversation.metadata?.focus as Row|null,plansView,now),
    recent:(messages.data??[]).reverse().map((item:Row)=>({role:String(item.role),content:String(item.content)})), userMessage, queryIntent:intent,
    debug:{sources:['persona','continuity','life-engine','schedule','shared-plans','dates','stories','memory','open-threads','social-graph','location','history'],limits:{memories:memoryRows.length,threads:(threads.data??[]).length,recentMessages:(messages.data??[]).length,history:history.length}},
  };
}

function selectMemories(query:string, stored:Row[], semantic:Row[], intent:ContextQueryIntent):Row[] {
  const terms=new Set(query.toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ').filter((term)=>term.length>2));
  const rows=new Map<string,Row>();
  for(const item of semantic)rows.set(String(item.id??item.dedupe_key??item.canonical_text),item);
  for(const item of stored){const words=String(item.canonical_text??'').toLowerCase().split(/[^a-z0-9]+/);if(intent==='memory_overview'||item.pinned||words.some((word)=>terms.has(word)))rows.set(String(item.id??item.dedupe_key??item.canonical_text),item);}
  return [...rows.values()].sort((a,b)=>Number(b.pinned)-Number(a.pinned)||Number(b.importance??0)-Number(a.importance??0)).slice(0,intent==='memory_overview'?20:10);
}

function threadContext(thread:Row){const subject=String(thread.subject??thread.metadata?.subject??'something important');return{id:String(thread.id),subject,displaySubject:String(thread.display_subject??subject),followupPrompt:String(thread.followup_prompt??`I should tell you how my ${subject} went.`),expectedAt:thread.expected_at??null,eligible:Boolean(thread.follow_up_eligible)};}
function normalizedPersonalityValue(value:unknown,fallback:number){const number=Number(value);return Number.isFinite(number)?Math.max(0,Math.min(1,number)):fallback;}

function nextScheduleRows(rows:Row[],clock:ExperienceClock,now:Date,timezone:string,locations:Map<string,Row>){
  const candidates: Array<{ startsAt:string;label:string;location:string;availability:string;rank:number }> = [];
  for(let dayOffset=0;dayOffset<7;dayOffset++)for(const row of rows){const day=(clock.weekday+dayOffset)%7;if(Number(row.day_of_week)!==day)continue;const rank=dayOffset*1440+Number(row.start_minute)-clock.minuteOfDay;if(rank<=0)continue;candidates.push({startsAt:`${dayOffset===0?'Today':dayOffset===1?'Tomorrow':`In ${dayOffset} days`} · ${minutesLabel(Number(row.start_minute))}`,label:String(row.activity),location:String(row.together_locations?.name??locations.get(String(row.location_id))?.name??'City Life'),availability:String(row.availability),rank});}
  void now;void timezone;return candidates.sort((a,b)=>a.rank-b.rank).map(({rank,...item})=>item);
}
function minutesLabel(value:number){const hour=Math.floor(value/60),minute=value%60;return `${hour%12||12}:${String(minute).padStart(2,'0')} ${hour>=12?'PM':'AM'}`;}
function humanizeSceneActivity(value:unknown){if(typeof value!=='string')return undefined;const normalized=value.replace(/[_-]+/g,' ').trim();return normalized&&normalized!=='together'?normalized.replace(/^./,(character)=>character.toUpperCase()):'Spending time together';}
function normalizePlaceText(value:string){return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function placeMentioned(message:string,name:string,slug:string){const normalizedName=normalizePlaceText(name),normalizedSlug=normalizePlaceText(slug);return Boolean((normalizedName.length>=4&&message.includes(normalizedName))||(normalizedSlug.length>=4&&message.includes(normalizedSlug)));}
function dedupeCommitments<T extends {type:'plan'|'date';title:string;startsAt:string}>(items:T[]):T[]{const seen=new Set<string>();return items.sort((a,b)=>new Date(a.startsAt).getTime()-new Date(b.startsAt).getTime()).filter((item)=>{const key=`${item.title.toLowerCase().replace(/[^a-z0-9]/g,'')}:${item.startsAt.slice(0,13)}`;if(seen.has(key))return false;seen.add(key);return true;});}
function isCurrentPlan(plan:{status:string;startsAt:string;endsAt?:string|null},now:Date){
  if(plan.status==='scheduled'){
    const ends=plan.endsAt?new Date(plan.endsAt).getTime():Number.NaN;
    return !Number.isFinite(ends)||ends>now.getTime();
  }
  if(plan.status!=='active')return false;
  const starts=new Date(plan.startsAt).getTime(),ends=new Date(String(plan.endsAt??'' )).getTime();
  return Number.isFinite(starts)&&Number.isFinite(ends)&&starts<=now.getTime()&&now.getTime()<ends;
}
function isRelevantPlan(plan:{status?:string;endsAt?:string|null},now:Date){
  if(['cancelled','completed','missed'].includes(plan.status??''))return false;
  const ends=plan.endsAt?new Date(plan.endsAt).getTime():Number.NaN;
  return !Number.isFinite(ends)||ends>now.getTime();
}
function buildActiveStory(story:Row|null):Row|null{if(!story)return null;const chapters=story.together_story_arc_templates?.chapters??[];const chapter=chapters.find((item:Row)=>item.id===story.current_chapter_id);return{id:String(story.id),title:String(story.together_story_arc_templates?.title??'A story in progress'),chapterId:String(story.current_chapter_id),chapterTitle:String(chapter?.title??story.current_chapter_id),knownSummary:String(chapter?.narrativeSeed??chapter?.narrative_seed??'Something is unfolding.'),status:String(story.status)};}
export function retrieveSharedHistory(input:{intent:ContextQueryIntent;moments:Row[];dates:Row[];plans:Array<{id:string;title:string;status:string;startsAt:string;summary:string}>;now:Date}){const rows=[...input.moments.map((item)=>({id:String(item.id),type:'moment' as const,title:String(item.title),summary:String(item.summary),occurredAt:String(item.occurred_at)})),...input.dates.filter((item)=>item.status==='completed').map((item)=>({id:String(item.id),type:'date' as const,title:String(item.together_date_templates?.name??'A shared date'),summary:String(item.state?.summary??'A date you experienced together.'),occurredAt:String(item.completed_at??item.updated_at)})),...input.plans.filter((item)=>item.status==='completed').map((item)=>({id:item.id,type:'plan' as const,title:item.title,summary:item.summary,occurredAt:item.startsAt}))];return rows.filter((item)=>new Date(item.occurredAt)<=input.now).sort((a,b)=>new Date(b.occurredAt).getTime()-new Date(a.occurredAt).getTime());}
function resolveConversationFocus(focus:Row|null,plans:Row[],now:Date):Row|null{if(!focus)return null;const updated=new Date(String(focus.updatedAt??0));if(!Number.isFinite(updated.getTime())||now.getTime()-updated.getTime()>7*86400000)return null;if(focus.planId){const plan=plans.find((item)=>item.id===focus.planId);return plan&&isRelevantPlan(plan,now)?{type:'plan',planId:plan.id,title:plan.title,status:plan.status,startsAt:plan.startsAt,endsAt:plan.endsAt,locationId:plan.locationId,location:plan.location,activityKey:plan.activityKey,updatedAt:focus.updatedAt}:null;}return focus;}
