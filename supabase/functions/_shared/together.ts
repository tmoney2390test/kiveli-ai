import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';
import { experienceClock } from './kivelle-time.ts';
import { resolveCharacterPlaceContext, resolvePlaceContext } from './together-place.ts';
import { activeContinuity } from './together-continuity.ts';
import { normalizeMultimodalPreferences, resolveServerExperienceCapabilities } from './kivelle-multimodal.ts';
import { applyRelationshipProposal, firstDateEligibility, isDurableUserMemory, isRelationshipDirectedPreferenceObject, lifeEventHasExplicitPresenceAuthority, mergeRollingConversationState, nextRelationshipMilestone as selectRelationshipMilestone, relationshipCue, type RelationshipState } from '../../../packages/together-domain/src/index.ts';
import { compactLocationLoreForDirectory } from '../../../packages/together-domain/src/location-depth.ts';

export const TOGETHER_IDS = {
  world: '10000000-0000-4000-8000-000000000001',
  juniper: '11000000-0000-4000-8000-000000000001',
  apartment: '11000000-0000-4000-8000-000000000002',
  rooftop: '11000000-0000-4000-8000-000000000003',
  northside: '11000000-0000-4000-8000-000000000004',
  riverwalk: '11000000-0000-4000-8000-000000000005',
  studio: '11000000-0000-4000-8000-000000000006',
  maya: '12000000-0000-4000-8000-000000000001',
  chloe: '12000000-0000-4000-8000-000000000002',
  alex: '12000000-0000-4000-8000-000000000003',
  mayaVersion: '13000000-0000-4000-8000-000000000001',
  chloeVersion: '13000000-0000-4000-8000-000000000002',
  alexVersion: '13000000-0000-4000-8000-000000000003',
  dinner: '15000000-0000-4000-8000-000000000001',
} as const;

export const relationshipMetrics = ['trust','comfort','attraction','affinity','familiarity','respect','conflict','romantic_interest','commitment'] as const;
const phaseOrder = ['arrival','ordering','early_conversation','personal_conversation','unexpected_moment','dessert','after_date','resolution'] as const;

export function clampRelationship(current: Record<string, unknown>, proposal: Record<string, unknown>, limit = 2): Record<string, number> {
  const source=limit>=8?'date':limit>=4?'meaningful_disclosure':'ordinary_chat';
  const next=applyRelationshipProposal(toDomainRelationship(current),proposal,source);
  return Object.fromEntries(relationshipMetrics.map((metric)=>[metric,next[metric]]));
}

export function firstDateEligible(state: Record<string, unknown>): boolean {
  return firstDateEligibility(toDomainRelationship(state)).eligible;
}

export type RelationshipMilestone = ReturnType<typeof selectRelationshipMilestone>;

export function nextRelationshipMilestone(state: Record<string, unknown>): RelationshipMilestone | null {
  return selectRelationshipMilestone(toDomainRelationship(state));
}

export function describeRelationshipCue(state: Record<string, unknown>): { label: string; detail: string; tone: 'warm'|'spark'|'tense'|'steady' } {
  return relationshipCue(toDomainRelationship(state));
}

function toDomainRelationship(state:Record<string,unknown>):RelationshipState{return{stage:String(state.relationship_stage??state.stage??'stranger') as RelationshipState['stage'],trust:Number(state.trust??0),comfort:Number(state.comfort??0),attraction:Number(state.attraction??0),affinity:Number(state.affinity??0),familiarity:Number(state.familiarity??0),respect:Number(state.respect??0),conflict:Number(state.conflict??0),romantic_interest:Number(state.romantic_interest??0),commitment:Number(state.commitment??0),conversationCount:Number(state.interaction_turn_count??state.conversation_count??state.conversationCount??0),conversationSessionCount:Number(state.conversation_session_count??state.conversationSessionCount??1),meaningfulInteractionCount:Number(state.meaningful_interaction_count??state.meaningfulInteractionCount??state.conversation_count??0),engagementScore:Number(state.engagement_score??state.engagementScore??0),genuineBackAndForthTurns:Number(state.genuine_back_and_forth_turns??state.genuineBackAndForthTurns??0),trivialEngagementScore:Number(state.trivial_engagement_score??state.trivialEngagementScore??0),chemistryHeat:Number(state.chemistry_heat??state.chemistryHeat??0),physicalTension:Number(state.physical_tension??state.physicalTension??0),userFlirtSignals:Number(state.user_flirt_signals??state.userFlirtSignals??0),characterFlirtSignals:Number(state.character_flirt_signals??state.characterFlirtSignals??0),mutualFlirtSignals:Number(state.mutual_flirt_signals??state.mutualFlirtSignals??0),attractionAcknowledged:Boolean(state.attraction_acknowledged??state.attractionAcknowledged),activeMajorConflict:Boolean(state.active_major_conflict??state.activeMajorConflict),romanceEnabled:state.romance_enabled===undefined?state.romanceEnabled!==false:Boolean(state.romance_enabled),romancePathStatus:String(state.romance_path_status??state.romancePathStatus??'open') as RelationshipState['romancePathStatus']};}

export function nextDatePhase(current: string, phases: Array<{ id: string }> = phaseOrder.map((id) => ({ id }))): { phase: string; index: number; completed: boolean } {
  const index = phases.findIndex((phase) => phase.id === current);
  if (index < 0) throw new AppError('VALIDATION_FAILED', 'This date is in an invalid phase.', 400);
  if (index === phases.length - 1) return { phase: phases[index]!.id, index, completed: true };
  return { phase: phases[index + 1]!.id, index: index + 1, completed: index + 1 === phases.length - 1 };
}

export function resolveLifeState(rows: Array<Record<string, unknown>>, now = new Date(), timezone = 'UTC', fallback?:{locationId:string;location:string}): { locationId: string; location: string; activity: string; availability: string; mood: string; energy: string } {
  const clock = experienceClock(timezone, now);
  const minute = clock.minuteOfDay;
  const row = rows.find((entry) => Number(entry.day_of_week) === clock.weekday && minute >= Number(entry.start_minute) && minute < Number(entry.end_minute));
  if (!row) return { locationId: fallback?.locationId ?? '', location: fallback?.location ?? 'Current world', activity: minute < 480 ? 'sleeping' : 'having some unstructured time', availability: minute < 480 ? 'busy' : 'available', mood: 'content', energy: minute > 1260 ? 'low' : 'medium' };
  const location = (row.together_locations as Record<string, unknown> | null)?.name ?? fallback?.location ?? 'Current place';
  return { locationId: String(row.location_id ?? fallback?.locationId ?? ''), location: String(location), activity: String(row.activity), availability: String(row.availability), mood: String(row.mood_influence ?? 'content'), energy: Number(row.energy_delta) > 0 ? 'high' : Number(row.energy_delta) < 0 ? 'low' : 'medium' };
}

export type MemoryCandidate = { memory_type: string; canonical_text: string; dedupe_key: string; subject_key: string; importance: number; confidence: number; sensitivity_category: string; metadata: Record<string, unknown> };

export type OpenThreadCandidate = { topic: string; dedupe_key: string; expected_at: string | null; importance: number; metadata: Record<string, unknown>; subject?:string; display_subject?:string; followup_prompt?:string };

export function normalizeContinuityKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function extractMemories(text: string): MemoryCandidate[] {
  const candidates: MemoryCandidate[] = [];
  const add = (memory_type: string, canonical_text: string, subject_key: string, importance: number, confidence: number, metadata: Record<string, unknown> = {}, sensitivity_category = 'none') => candidates.push({ memory_type, canonical_text, dedupe_key: `${memory_type}:${normalizeContinuityKey(canonical_text)}`, subject_key, importance, confidence, sensitivity_category, metadata });
  const pet = /\bmy\s+(dog|cat|pet)(?:'s| is)?\s+name\s+is\s+([a-z][a-z'-]{1,30})\b/i.exec(text);
  if (pet) {
    const animal = pet[1]!.toLowerCase();
    const name = `${pet[2]![0]!.toUpperCase()}${pet[2]!.slice(1).toLowerCase()}`;
    add('semantic', `User's ${animal} is named ${name}.`, `pet:${animal}:name`, .86, .97, { subject: animal, name }, 'personal');
  }
  const neutral = /\bi\s+(?:do not|don't)\s+(?:hate|dislike)\s+([^.!?]{2,60}?)(?:\s+anymore|\s+now)?(?:[.!?]|$)/i.exec(text);
  const dislike = !neutral ? /\bi\s+(?:really\s+)?(?:hate|can't stand|do not like|don't like)\s+([^.!?]{2,60})/i.exec(text) : null;
  const like = /\bi\s+(?:actually\s+)?(?:really\s+)?(?:love|like|enjoy)\s+([^.!?]{2,60}?)(?:\s+now)?(?:[.!?]|$)/i.exec(text);
  if (neutral) {
    const item = cleanContinuityObject(neutral[1]!);
    add('preference', `User no longer dislikes ${item}.`, `preference:${normalizeContinuityKey(item)}`, .7, .93, { preference: 'neutral', item, correction: true });
  } else if (dislike) {
    const item = cleanContinuityObject(dislike[1]!);
    add('preference', `User dislikes ${item}.`, `preference:${normalizeContinuityKey(item)}`, .7, .91, { preference: 'dislike', item });
  } else if (like) {
    const item = cleanContinuityObject(like[1]!);
    if (!isRelationshipDirectedPreferenceObject(item)) add('preference', `User likes ${item}.`, `preference:${normalizeContinuityKey(item)}`, .6, .84, { preference: 'like', item });
  }
  const emotion = /\bi(?:'m| am)\s+(nervous|anxious|excited|worried|scared)\s+(?:about\s+)?([^.!?]{2,80})/i.exec(text);
  if (emotion) {
    const topic = cleanContinuityObject(emotion[2]!);
    add('emotional', `User feels ${emotion[1]!.toLowerCase()} about ${topic}.`, `emotion:${normalizeContinuityKey(topic)}`, .72, .86, {}, 'personal');
  }
  return candidates;
}

export function extractOpenThread(text: string, now = new Date()): OpenThreadCandidate | null {
  const event = /\b(?:i\s+)?(?:have|got|give|giving|am giving|need to do)\s+(?:a\s+)?(?:huge\s+|big\s+|important\s+)?(presentation|interview|appointment|exam|test|meeting|trip|flight|date|game|event)(?:\s+[^.!?]{0,45}?)?\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.exec(text);
  if (!event) return null;
  const topicName = event[1]!.toLowerCase();
  const topic = `Ask how the user's ${topicName} went.`;
  let expected: Date | null = null;
  const dayName = event[2]!.toLowerCase();
  if (dayName === 'today') expected = new Date(now);
  else if (dayName === 'tomorrow') expected = new Date(now.getTime() + 86400000);
  else if (dayName) {
    const target = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(dayName);
    const delta = (target - now.getDay() + 7) % 7 || 7;
    expected = new Date(now.getTime() + delta * 86400000);
  }
  if (expected) expected.setHours(12, 0, 0, 0);
  const expectedAt = expected?.toISOString() ?? null;
  return { topic, subject:topicName, display_subject:topicName[0]!.toUpperCase()+topicName.slice(1), followup_prompt:`I should tell you how my ${topicName} went.`, dedupe_key: `event:${topicName}:${expectedAt?.slice(0, 10) ?? 'unscheduled'}`, expected_at: expectedAt, importance: .84, metadata: { source: 'conversation', subject: topicName } };
}

export function threadAnswered(thread: Record<string, unknown>, text: string): boolean {
  if (!thread.follow_up_eligible || thread.resolved_at) return false;
  const subject = String((thread.metadata as Record<string, unknown> | null)?.subject ?? String(thread.topic).match(/user's\s+([a-z]+)/i)?.[1] ?? '');
  const outcome = /\b(went|was|did|finished|done|nailed|passed|failed|great|well|bad|okay|ok|terrible|over)\b/i.test(text);
  const refersToSubject = Boolean(subject && new RegExp(`\\b${subject.replace(/[^a-z0-9]/gi, '')}\\b`, 'i').test(text)) || /\b(it|that)\b/i.test(text);
  return outcome && refersToSubject;
}

export function summarizeConversation(turns: Array<{ role: string; content: string }>, limit = 900): string {
  const clean = turns.map((turn) => ({ role: turn.role, content: turn.content.replace(/\s+/g, ' ').trim().slice(0, 280) })).filter((turn) => turn.content).slice(-24);
  const userDetails = clean.filter((turn) => turn.role === 'user').map((turn) => turn.content).slice(-4);
  const characterDetails = clean.filter((turn) => turn.role === 'assistant').map((turn) => turn.content).slice(-3);
  const summary = [userDetails.length ? `User shared: ${userDetails.join(' | ')}` : '', characterDetails.length ? `Character responded: ${characterDetails.join(' | ')}` : ''].filter(Boolean).join('\n');
  return summary.length <= limit ? summary : `${summary.slice(0, limit - 1).trimEnd()}…`;
}

export function mergeConversationSummary(previousValue: string, turns: Array<{ id?: string; role: string; content: string; created_at?: string }>): string {
  return mergeRollingConversationState(previousValue, turns);
}

/**
 * The bootstrap snapshot is the canonical client plan source. Keep attendance
 * on the same shape returned by together-plan so a refresh cannot turn a
 * joined plan back into a joinable one.
 */
export function decorateSnapshotSharedPlan(plan:Record<string,any>):Record<string,any>{
  const{together_plan_attendance:embeddedAttendance,together_plan_participant_responses:embeddedResponses,...canonicalPlan}=plan;
  const attendance=Array.isArray(embeddedAttendance)?embeddedAttendance:[];
  const user=attendance.find((row:Record<string,any>)=>row.participant_type==='user')??null;
  const character=attendance.find((row:Record<string,any>)=>row.participant_type==='character'&&String(row.character_instance_id)===String(plan.character_instance_id))
    ??attendance.find((row:Record<string,any>)=>row.participant_type==='character')
    ??null;
  return{...canonicalPlan,participant_responses:Array.isArray(embeddedResponses)?embeddedResponses:[],attendance:{user,character}};
}

function cleanContinuityObject(value: string): string {
  return value.trim().replace(/\s+(?:a lot|so much|though)$/i, '').toLowerCase();
}

export async function track(db: SupabaseClient, userId: string, eventName: string, properties: Record<string, unknown> = {}): Promise<void> {
  const { error } = await db.rpc('kivelle_track_event', { p_user_id:userId, p_event_name:eventName, p_properties:properties });
  if (error) console.warn('Together analytics failed', eventName, error.message);
}

export async function buildSnapshot(db: SupabaseClient, userId: string): Promise<Record<string, unknown>> {
  const profileCheck=await db.from('together_profiles').select('user_id').eq('user_id',userId).maybeSingle();
  if(profileCheck.error)throw new AppError('INTERNAL_ERROR','Kivelle could not load your account.',500,true);
  if(!profileCheck.data)return buildOnboardingSnapshot(db,userId);
  const continuity=await activeContinuity(db,userId);
  const scheduleTemplates=fetchAllScheduleTemplates(db);
  const [profile, personas, continuities, worlds, locations, userWorlds, characterWorldPresence, instances, discoverable, favorites, schedules, scheduleEvents, relationships, relationshipPlaces, milestones, dates, moments, memories, threads, conversations, sceneSessions, sceneParticipants, events, sharedPlans, conversationEvents, proactive, entitlements, preferences, storyArcs, trips, photoOpportunities, generatedMedia, conversationActions] = await Promise.all([
    db.from('together_profiles').select('*').eq('user_id', userId).maybeSingle(),
    db.from('together_user_personas').select('*').eq('user_id',userId).order('is_default',{ascending:false}).order('created_at'),
    db.from('together_continuities').select('*,together_user_personas(*)').eq('user_id',userId).order('kind').order('created_at'),
    db.from('together_worlds').select('*').eq('published', true),
    db.from('together_locations').select('*'),
    db.from('together_user_worlds').select('*').eq('user_id',userId),
    db.from('together_character_world_presence').select('*'),
    db.from('together_character_instances').select('*, together_character_templates(*), together_character_versions(*)').eq('user_id', userId).eq('continuity_id',continuity.id),
    db.from('together_character_templates').select('*,together_character_versions(*)').or(`and(published.eq.true,can_be_selected.eq.true),creator_id.eq.${userId}`).neq('lifecycle_status','archived').order('name'),
    db.from('together_character_favorites').select('character_template_id').eq('user_id',userId).order('created_at',{ascending:false}),
    scheduleTemplates,
    db.from('together_character_schedule_events').select('*').eq('user_id',userId).eq('continuity_id',continuity.id).gte('ends_at',new Date(Date.now()-86400000).toISOString()).lte('starts_at',new Date(Date.now()+8*86400000).toISOString()).order('starts_at').limit(800),
    db.from('together_relationship_states').select('*').eq('user_id', userId).eq('continuity_id',continuity.id),
    db.from('together_relationship_places').select('*').eq('user_id',userId).eq('continuity_id',continuity.id),
    db.from('together_relationship_milestones').select('*').eq('user_id', userId).eq('continuity_id',continuity.id).order('created_at', { ascending: false }).limit(100),
    db.from('together_date_sessions').select('*, together_date_templates(*)').eq('user_id', userId).eq('continuity_id',continuity.id),
    db.from('together_moments').select('*').eq('user_id', userId).eq('continuity_id',continuity.id).order('occurred_at', { ascending: false }).limit(30),
    db.from('together_memories').select('*').eq('user_id', userId).eq('continuity_id',continuity.id).eq('status', 'active').order('pinned', { ascending: false }).order('importance', { ascending: false }).limit(100),
    db.from('together_open_threads').select('*').eq('user_id', userId).eq('continuity_id',continuity.id).is('resolved_at', null),
    db.from('together_conversations').select('*,together_messages(count)').eq('user_id', userId).eq('continuity_id',continuity.id).order('last_message_at', { ascending: false, nullsFirst: false }),
    db.from('together_scene_sessions').select('*').eq('user_id',userId).eq('continuity_id',continuity.id).is('ended_at',null).order('started_at',{ascending:false}).limit(24),
    db.from('together_scene_participants').select('*').eq('user_id',userId).eq('continuity_id',continuity.id).is('left_at',null).order('joined_at'),
    db.from('together_life_events').select('*').eq('user_id', userId).eq('continuity_id',continuity.id).order('starts_at', { ascending: false }).limit(20),
    db.from('together_shared_plans').select('*,together_plan_attendance(*),together_plan_participant_responses(*)').eq('user_id',userId).eq('continuity_id',continuity.id).order('starts_at',{ascending:false,nullsFirst:false}).limit(200),
    db.from('together_conversation_events').select('*').eq('user_id',userId).eq('continuity_id',continuity.id).order('created_at',{ascending:true}).limit(200),
    db.from('together_proactive_messages').select('*').eq('user_id', userId).eq('continuity_id',continuity.id).in('status', ['queued','sent']).lte('eligible_at', new Date().toISOString()).order('eligible_at', { ascending: false }).limit(10),
    db.from('together_entitlements').select('*').eq('user_id', userId).maybeSingle(),
    db.from('together_notification_preferences').select('*').eq('user_id', userId).maybeSingle(),
    db.from('together_story_arc_instances').select('*,together_story_arc_templates(slug,title,priority,chapters,world_scope,specific_world_id)').eq('user_id', userId).eq('continuity_id',continuity.id).in('status', ['active','paused']).order('updated_at', { ascending: false }),
    db.from('together_trip_templates').select('*').eq('active', true),
    db.from('together_photo_opportunities').select('*').eq('active', true),
    db.from('together_generated_media').select('*').eq('user_id', userId).eq('continuity_id',continuity.id).order('created_at', { ascending: false }).limit(60),
    db.from('together_conversation_actions').select('*').eq('user_id',userId).eq('continuity_id',continuity.id).eq('status','pending').or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order('created_at',{ascending:false}).limit(20),
  ]);
  const failed = [profile,personas,continuities, worlds, locations, userWorlds, characterWorldPresence, instances, discoverable, favorites, schedules, scheduleEvents, relationships,relationshipPlaces, milestones, dates, moments, memories, threads, conversations, sceneSessions,sceneParticipants, events, sharedPlans, conversationEvents, proactive, entitlements, preferences, storyArcs, trips, photoOpportunities, generatedMedia, conversationActions].find((result) => result.error);
  if (failed?.error) throw new AppError('INTERNAL_ERROR', 'Kivelle could not load your world.', 500, true);
  const publishedWorlds=worlds.data??[];
  const publishedWorldIds=new Set(publishedWorlds.map((world)=>String(world.id)));
  const publishedLocations=(locations.data??[]).filter((location)=>publishedWorldIds.has(String(location.world_id)));
  const publishedLocationIds=new Set(publishedLocations.map((location)=>String(location.id)));
  const publishedWorldAccess=(userWorlds.data??[]).filter((access)=>publishedWorldIds.has(String(access.world_id)));
  const publishedCharacterPresence=(characterWorldPresence.data??[]).filter((presence)=>publishedWorldIds.has(String(presence.world_id)));
  const publishedDates=(dates.data??[]).filter((date)=>date.status==='completed'||publishedWorldIds.has(String(date.together_date_templates?.world_id)));
  const publishedLifeEvents=(events.data??[]).filter((event)=>!event.location_id||publishedLocationIds.has(String(event.location_id)));
  const publishedSharedPlans=(sharedPlans.data??[]).filter((plan)=>!plan.world_id||publishedWorldIds.has(String(plan.world_id))||plan.status==='completed').map(decorateSnapshotSharedPlan);
  const now=Date.now(),nowDate=new Date(now);
  const activeScenes=(sceneSessions.data??[]).filter((scene:Record<string,unknown>)=>{
    if(!publishedWorldIds.has(String(scene.world_id)))return false;
    const expected=scene.expected_end_at?new Date(String(scene.expected_end_at)).getTime():new Date(String(scene.started_at)).getTime()+3*60*60*1000;
    return Number.isFinite(expected)&&expected>now;
  });
  const sceneByInstance=new Map(activeScenes.map((scene:Record<string,unknown>)=>[String(scene.character_instance_id),scene]));
  // Scene state is an active, user-entered layer over passive schedule state.
  // The persisted character row stays schedule-owned; snapshot consumers see
  // the shared scene without mutating the character just to render a screen.
  const visibleInstances:Array<Record<string,any>>=(instances.data??[]).map((instance:Record<string,any>):Record<string,any>=>{
    const scene=sceneByInstance.get(String(instance.id));
    if(scene)return {...instance,current_location_id:scene.location_id,current_activity:sceneSnapshotActivity(scene),current_interruptibility:'open',current_presence_source:'scene'};
    if(hasActiveSnapshotCommitment(String(instance.id),nowDate,publishedDates,publishedSharedPlans))return instance;
    const authoritativeEvent=activeAuthoritativeLifeEvent(String(instance.id),nowDate,publishedLifeEvents);
    if(authoritativeEvent)return {...instance,current_location_id:authoritativeEvent.location_id??instance.current_location_id,current_activity:authoritativeEvent.narrative_summary??authoritativeEvent.title??instance.current_activity,current_presence_source:'life_event'};
    const authored=resolveAuthoredSnapshotPresence(instance,nowDate,schedules.data??[],publishedLocations,publishedWorlds,publishedCharacterPresence);
    if(!authored)return instance;
    return {...instance,current_location_id:authored.locationId,current_activity:authored.activity,current_energy:authored.energy,current_interruptibility:authored.interruptibility,current_presence_source:'schedule',current_schedule_event_id:null};
  });
  const stageByInstance = new Map(visibleInstances.map((instance) => [instance.id, instance.relationship_stage]));
  const relationshipCues = Object.fromEntries((relationships.data ?? []).map((relationship) => [relationship.character_instance_id, describeRelationshipCue({ ...relationship, relationship_stage: stageByInstance.get(relationship.character_instance_id) })]));
  const conversationMetadata = (conversations.data ?? []).map((conversation) => ({ ...conversation, message_count: Number(conversation.together_messages?.[0]?.count ?? 0), unread: Boolean(conversation.last_assistant_message_at && (!conversation.last_read_at || new Date(conversation.last_assistant_message_at) > new Date(conversation.last_read_at))) }));
  const mediaRows=generatedMedia.data??[];
  const readyPaths=mediaRows.filter((item)=>item.status==='ready'&&item.storage_path).map((item)=>String(item.storage_path));
  const signed=readyPaths.length?await db.storage.from('together-user-media').createSignedUrls(readyPaths,3600):{data:[]};
  const urlByPath=new Map((signed.data??[]).map((item)=>[item.path,item.signedUrl]));
  const mediaPayload=mediaRows.map((item)=>({...item,signed_url:item.storage_path?urlByPath.get(item.storage_path)??null:null}));
  const durableMemories=(memories.data??[]).filter((memory)=>isDurableUserMemory({memoryType:String(memory.memory_type??'semantic'),canonicalText:String(memory.canonical_text??'')}));
  const discoverableCharacters=await hydrateDiscoverableCharacters(db,discoverable.data??[]);
  const activeInstance=visibleInstances.find((item)=>item.id===continuity.active_companion_instance_id)??visibleInstances[0];
  const versionIds=[...new Set(visibleInstances.map((item)=>String(item.character_version_id)).filter(Boolean))];
  const characterPlaceProfilesResult=versionIds.length?await db.from('together_character_place_profiles').select('*').in('character_version_id',versionIds):{data:[],error:null};
  if(characterPlaceProfilesResult.error)throw new AppError('INTERNAL_ERROR','Kivelle could not load companion place context.',500,true);
  const characterPlaceProfiles=characterPlaceProfilesResult.data??[];
  const currentLocationId=String(activeInstance?.current_location_id??'');
  const currentPlaceContext=activeInstance?await resolveCharacterPlaceContext({db,characterVersionId:String(activeInstance.character_version_id),locationId:publishedLocationIds.has(currentLocationId)?currentLocationId:null,activity:String(activeInstance.current_activity??''),userId,characterInstanceId:String(activeInstance.id)}):null;
  const snapshotLocations=publishedLocations.map(compactSnapshotLocation);
  const profilePayload=profile.data?{...profile.data,active_continuity_id:continuity.id,active_companion_instance_id:activeInstance?.id??null}:profile.data;
  const experienceCapabilities=resolveServerExperienceCapabilities(normalizeMultimodalPreferences(profile.data?.multimodal_preferences),(entitlements.data?.entitlement_keys??[]).map(String)).experience;
  return { profile: profilePayload, activePersona:continuity.together_user_personas??null,activeContinuity:continuity,personas:personas.data??[],continuities:continuities.data??[],worlds:publishedWorlds,userWorlds:publishedWorldAccess,characterWorldPresence:publishedCharacterPresence,currentPlaceContext,locations:snapshotLocations,relationshipPlaces:relationshipPlaces.data??[],characterPlaceProfiles,characters:visibleInstances,discoverableCharacters,favoriteCharacterTemplateIds:(favorites.data??[]).map((item)=>String(item.character_template_id)),schedules:schedules.data??[],scheduleEvents:(scheduleEvents.data??[]).filter((event)=>!event.metadata?.suppressedByPlanId&&(!event.location_id||publishedLocationIds.has(String(event.location_id)))),relationships:relationships.data??[],relationshipMilestones:(milestones.data??[]).filter((milestone)=>milestone.status==='pending'),relationshipMilestoneHistory:(milestones.data??[]).filter((milestone)=>milestone.status!=='pending'),relationshipCues,dates:publishedDates,moments:moments.data??[],memories:durableMemories,openThreads:threads.data??[],conversations:conversationMetadata,sceneSessions:activeScenes,sceneParticipants:sceneParticipants.data??[],sharedPlans:publishedSharedPlans,conversationEvents:conversationEvents.data??[],lifeEvents:publishedLifeEvents,proactiveMessages:proactive.data??[],storyArcs:storyArcs.data??[],trips:trips.data??[],photoOpportunities:photoOpportunities.data??[],generatedMedia:mediaPayload,conversationActions:conversationActions.data??[],entitlements:entitlements.data,experienceCapabilities,notificationPreferences:preferences.data };
}

async function buildOnboardingSnapshot(db:SupabaseClient,userId:string):Promise<Record<string,unknown>>{
  const[worlds,locations,characterWorldPresence,discoverable,entitlements,preferences]=await Promise.all([
    db.from('together_worlds').select('*').eq('published',true),
    db.from('together_locations').select('*'),
    db.from('together_character_world_presence').select('*'),
    db.from('together_character_templates').select('*,together_character_versions(*)').eq('published',true).eq('can_be_selected',true).neq('lifecycle_status','archived').order('name'),
    db.from('together_entitlements').select('*').eq('user_id',userId).maybeSingle(),
    db.from('together_notification_preferences').select('*').eq('user_id',userId).maybeSingle(),
  ]);
  const failed=[worlds,locations,characterWorldPresence,discoverable,entitlements,preferences].find((result)=>result.error);
  if(failed?.error)throw new AppError('INTERNAL_ERROR','Kivelle could not prepare your first meeting.',500,true);
  const publishedWorlds=worlds.data??[],publishedWorldIds=new Set(publishedWorlds.map((world)=>String(world.id)));
  const publishedLocations=(locations.data??[]).filter((location)=>publishedWorldIds.has(String(location.world_id))).map(compactSnapshotLocation);
  const discoverableCharacters=await hydrateDiscoverableCharacters(db,discoverable.data??[]);
  const entitlementKeys=(entitlements.data?.entitlement_keys??[]).map(String);
  return{
    profile:null,activePersona:null,activeContinuity:null,personas:[],continuities:[],
    worlds:publishedWorlds,userWorlds:[],characterWorldPresence:(characterWorldPresence.data??[]).filter((presence)=>publishedWorldIds.has(String(presence.world_id))),currentPlaceContext:null,locations:publishedLocations,relationshipPlaces:[],characterPlaceProfiles:[],
    characters:[],discoverableCharacters,favoriteCharacterTemplateIds:[],schedules:[],scheduleEvents:[],relationships:[],relationshipMilestones:[],relationshipMilestoneHistory:[],relationshipCues:{},dates:[],moments:[],memories:[],openThreads:[],conversations:[],sceneSessions:[],sceneParticipants:[],sharedPlans:[],conversationEvents:[],lifeEvents:[],proactiveMessages:[],storyArcs:[],trips:[],photoOpportunities:[],generatedMedia:[],conversationActions:[],
    entitlements:entitlements.data??null,experienceCapabilities:resolveServerExperienceCapabilities(normalizeMultimodalPreferences(undefined),entitlementKeys).experience,notificationPreferences:preferences.data??null,
  };
}

async function hydrateDiscoverableCharacters(db:SupabaseClient,templates:Array<Record<string,any>>){
  const currentVersions=templates.map((template)=>((template.together_character_versions??[]).find((version:Record<string,unknown>)=>Number(version.version)===Number(template.current_published_version))??template.together_character_versions?.[0]??null)as Record<string,any>|null).filter(Boolean)as Array<Record<string,any>>;
  const referencePaths=[...new Set(currentVersions.flatMap((version)=>[...(Array.isArray(version.appearance_candidates)?version.appearance_candidates.map((candidate:Record<string,unknown>)=>String(candidate.storagePath??'')).filter(Boolean):[]),...(Array.isArray(version.visual_identity?.referenceStoragePaths)?version.visual_identity.referenceStoragePaths.map(String):[])]))];
  const referenceSigned=referencePaths.length?await db.storage.from('kivelle-character-reference').createSignedUrls(referencePaths,3600):{data:[]};
  const referenceUrlByPath=new Map((referenceSigned.data??[]).map((item)=>[item.path,item.signedUrl]));
  return templates.map((template)=>{const selected=(template.together_character_versions??[]).find((version:Record<string,unknown>)=>Number(version.version)===Number(template.current_published_version))??template.together_character_versions?.[0]??null;if(!selected)return{...template,together_character_versions:null};const candidates=(Array.isArray(selected.appearance_candidates)?selected.appearance_candidates:[]).map((candidate:Record<string,unknown>)=>({...candidate,signedUrl:typeof candidate.storagePath==='string'?referenceUrlByPath.get(candidate.storagePath)??null:null}));const selectedId=String(selected.appearance_config?.selectedCandidateId??''),portraitPath=String(candidates.find((candidate:Record<string,unknown>)=>candidate.id===selectedId)?.storagePath??selected.visual_identity?.referenceStoragePaths?.[0]??'');return{...template,together_character_versions:{...selected,appearance_candidates:candidates,portrait_url:portraitPath?referenceUrlByPath.get(portraitPath)??null:null}};});
}

function compactSnapshotLocation(location:Record<string,any>){
  const visual=location.canonical_visual_context??{};
  return{...location,canonical_lore:compactLocationLoreForDirectory(location.canonical_lore),canonical_visual_context:{indoorOutdoor:visual.indoorOutdoor,visualAnchors:Array.isArray(visual.visualAnchors)?visual.visualAnchors.slice(0,3):[]}};
}

async function fetchAllScheduleTemplates(db:SupabaseClient){
  const pageSize=1000,rows:Array<Record<string,unknown>>=[];
  for(let from=0;from<5000;from+=pageSize){
    const page=await db.from('together_schedule_templates').select('*').order('character_version_id').order('day_of_week').order('start_minute').range(from,from+pageSize-1);
    if(page.error)return{data:null,error:page.error};
    rows.push(...(page.data??[]));
    if((page.data?.length??0)<pageSize)break;
  }
  return{data:rows,error:null};
}

function resolveAuthoredSnapshotPresence(instance:Record<string,unknown>,now:Date,schedules:Array<Record<string,any>>,locations:Array<Record<string,any>>,worlds:Array<Record<string,any>>,presences:Array<Record<string,any>>){
  const versionId=String(instance.character_version_id??''),authored=schedules.filter((row)=>String(row.character_version_id)===versionId&&row.metadata?.scheduleMode==='authored');
  if(!authored.length)return null;
  const worldPresence=presences.filter((row)=>String(row.character_version_id)===versionId&&row.presence_type!=='unavailable').sort((left,right)=>Number(right.presence_type==='resident')-Number(left.presence_type==='resident'))[0];
  const locationById=new Map(locations.map((location)=>[String(location.id),location]));
  const authoredLocation=authored.map((row)=>locationById.get(String(row.location_id??''))).find(Boolean);
  const worldId=String(worldPresence?.world_id??authoredLocation?.world_id??''),world=worlds.find((item)=>String(item.id)===worldId);
  const clock=experienceClock(world?.timezone??'UTC',now),row=authored.find((item)=>Number(item.day_of_week)===clock.weekday&&clock.minuteOfDay>=Number(item.start_minute)&&clock.minuteOfDay<Number(item.end_minute));
  const homeId=worldPresence?.home_location_id?String(worldPresence.home_location_id):null;
  if(!row)return{locationId:homeId??(instance.current_location_id?String(instance.current_location_id):null),activity:'Having some unstructured time at home',energy:'medium',interruptibility:'open'};
  const variants=Array.isArray(row.metadata?.activityVariants)?row.metadata.activityVariants.filter((value:unknown)=>typeof value==='string'&&Boolean(value.trim())):[];
  const activity=variants.length?String(variants[snapshotStableIndex(`${row.id}:${clock.localDate}`,variants.length)]):String(row.activity);
  const availability=String(row.availability??'available');
  return{locationId:row.location_id?String(row.location_id):homeId,activity,energy:Number(row.energy_delta)>0?'high':Number(row.energy_delta)<0?'low':'medium',interruptibility:availability==='busy'?'busy':availability==='limited'?'limited':'open'};
}

function hasActiveSnapshotCommitment(instanceId:string,now:Date,dates:Array<Record<string,any>>,plans:Array<Record<string,any>>){
  if(dates.some((row)=>String(row.character_instance_id)===instanceId&&row.status==='active'))return true;
  const active=(row:Record<string,any>)=>{const starts=new Date(String(row.starts_at??row.started_at??'')).getTime(),ends=row.ends_at?new Date(String(row.ends_at)).getTime():starts+2*60*60*1000;return Number.isFinite(starts)&&starts<=now.getTime()&&ends>now.getTime();};
  return plans.some((row)=>String(row.character_instance_id)===instanceId&&!['cancelled','completed'].includes(String(row.status))&&active(row));
}

function activeAuthoritativeLifeEvent(instanceId:string,now:Date,events:Array<Record<string,any>>){
  const active=(row:Record<string,any>)=>{const starts=new Date(String(row.starts_at??row.started_at??'')).getTime(),ends=row.ends_at?new Date(String(row.ends_at)).getTime():starts+2*60*60*1000;return Number.isFinite(starts)&&starts<=now.getTime()&&ends>now.getTime();};
  return events.filter((row)=>String(row.character_instance_id)===instanceId&&active(row)&&lifeEventHasExplicitPresenceAuthority({locationId:row.location_id?String(row.location_id):null,eventType:String(row.event_type??''),metadata:row.metadata??{}})).sort((left,right)=>Number(right.significance??0)-Number(left.significance??0))[0]??null;
}

function snapshotStableIndex(seed:string,length:number){let hash=0;for(let index=0;index<seed.length;index+=1)hash=(Math.imul(31,hash)+seed.charCodeAt(index))|0;return(hash>>>0)%length;}

function sceneSnapshotActivity(scene:Record<string,unknown>){const state=(scene.state??{}) as Record<string,unknown>;const explicit=typeof state.activityLabel==='string'?state.activityLabel.trim():'';if(explicit)return explicit;const key=String(state.currentActivityKey??scene.activity_key??'together').replace(/[_-]+/g,' ').trim();return key&&key!=='together'?key.replace(/^./,(character)=>character.toUpperCase()):'Spending time together';}
