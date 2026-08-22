import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';
import { resolveLifeState, track } from './together.ts';
import { progressStoryArcs, rankEventTemplates } from './together-content.ts';
import { getActiveConversation } from './together-conversation.ts';
import { createMediaOffer } from './together-media-offers.ts';
import { eventIsActive, experienceClock } from './kivelle-time.ts';
import { resolveCharacterBaseLocation, resolvePlaceContext } from './together-place.ts';
import { waitUntil } from './background.ts';
import { activeContinuity } from './together-continuity.ts';
import { ensureCharacterSchedule, resolveCharacterPresence, resolveCompanionPresence } from './together-schedule.ts';
import { finalizeExpiredPlanExperience } from './together-plan-experience.ts';
import { isDurableUserMemory, lifeEventEstablishesPresentReality, shouldSendPlanWaitingCheckIn } from '../../../packages/together-domain/src/index.ts';

type LifeRunInput = { db: SupabaseClient; userId: string; characterInstanceId?: string; now?: Date; evaluateProactive?: boolean; persistCharacterState?:boolean; trigger: 'conversation_continued' | 'home_opened' | 'scheduled_dispatch' };
type EventRow = Record<string, any>;

export async function runLifeSimulation({ db, userId, characterInstanceId, now = new Date(), evaluateProactive = true, persistCharacterState=true, trigger }: LifeRunInput): Promise<Record<string, unknown>> {
  // Routine state resolution is cheap; meaningful events are materialized only
  // by a continued conversation or the protected background dispatcher.
  const simulateEvents = trigger === 'conversation_continued' || trigger === 'scheduled_dispatch';
  const fallbackContinuity=characterInstanceId?null:await activeContinuity(db,userId);const resolvedInstanceId=characterInstanceId??fallbackContinuity?.active_companion_instance_id;
  if(!resolvedInstanceId)throw new AppError('CONFLICT','Choose a companion before simulating this Kivelle Life.',409);
  const { data: instance } = await db.from('together_character_instances').select('*,together_character_templates(name,slug)').eq('user_id', userId).eq('id', resolvedInstanceId).maybeSingle();
  if (!instance) throw new AppError('NOT_FOUND', 'That character is unavailable.', 404);
  const currentPlace=instance.current_location_id?await resolvePlaceContext({db,locationId:String(instance.current_location_id),now,userId,characterInstanceId:String(instance.id)}).catch(()=>null):null;
  let currentWorldId=currentPlace?.world.id;
  if(!currentWorldId){const{data:presence}=await db.from('together_character_world_presence').select('world_id').eq('character_version_id',instance.character_version_id).neq('presence_type','unavailable').order('presence_type',{ascending:true}).limit(1).maybeSingle();currentWorldId=presence?.world_id?String(presence.world_id):undefined;}
  const baseLocation=currentWorldId?await resolveCharacterBaseLocation({db,characterVersionId:String(instance.character_version_id),worldId:currentWorldId}):null;

  const last = new Date(instance.last_simulated_at);
  const simulationStart = Number.isNaN(last.getTime()) || last > now ? now : last;
  const lastEventSimulation = new Date(instance.last_event_simulated_at ?? instance.created_at ?? now.toISOString());
  const eventSimulationStart = Number.isNaN(lastEventSimulation.getTime()) || lastEventSimulation > now ? now : lastEventSimulation;
  const recentCutoff = new Date(now.getTime() - 72 * 3600000).toISOString();
  const [schedules, templates, relationship, latestConversation, preferences, profile, recentEvents, recentProactive, memories, allInstances, sharedPlans] = await Promise.all([
    db.from('together_schedule_templates').select('*,together_locations(name,world_id)').eq('character_version_id', instance.character_version_id),
    db.from('together_event_templates').select('*,together_locations(world_id)').eq('active', true).contains('participant_template_ids', [instance.character_template_id]),
    db.from('together_relationship_states').select('*').eq('character_instance_id', instance.id).single(),
    getActiveConversation(db, userId, instance.id, true).then((data) => ({ data, error: null })),
    db.from('together_notification_preferences').select('*').eq('user_id', userId).maybeSingle(),
    db.from('together_profiles').select('age_verified_at,content_preferences,experience_timezone').eq('user_id', userId).maybeSingle(),
    db.from('together_life_events').select('*').eq('user_id', userId).eq('character_instance_id', instance.id).gte('starts_at', recentCutoff).order('starts_at', { ascending: false }).limit(20),
    db.from('together_proactive_messages').select('*').eq('user_id', userId).eq('character_instance_id', instance.id).order('created_at', { ascending: false }).limit(10),
    db.from('together_memories').select('canonical_text,memory_type,pinned,importance,sensitivity_category').eq('user_id', userId).eq('character_instance_id', instance.id).eq('status', 'active').neq('sensitivity_category', 'sensitive').order('pinned', { ascending: false }).order('importance', { ascending: false }).limit(8),
    db.from('together_character_instances').select('id,character_template_id').eq('user_id', userId).eq('continuity_id',instance.continuity_id),
    db.from('together_shared_plans').select('*,together_locations(name)').eq('user_id', userId).eq('character_instance_id', instance.id).order('starts_at', { ascending: true }),
  ]);
  if (relationship.error) throw new AppError('INTERNAL_ERROR', 'Relationship state is unavailable.', 500, true);
  await unlockEligibleDateSessions(db, userId, instance, relationship.data, now);

  const timezone = String(profile.data?.experience_timezone ?? preferences.data?.timezone ?? 'UTC');
  const worldSchedules=(schedules.data??[]).filter((row:EventRow)=>!currentWorldId||String(row.together_locations?.world_id??'')===currentWorldId);
  for (const plan of sharedPlans.data ?? []) {
    if (plan.source === 'date' || !['scheduled', 'active'].includes(String(plan.status)) || !plan.ends_at || new Date(plan.ends_at).getTime() > now.getTime()) continue;
    await finalizeExpiredPlanExperience({ db, userId, continuityId: String(instance.continuity_id), characterInstanceId: String(instance.id), planId: String(plan.id), now }).catch((error) => console.warn('Plan experience finalization deferred', error instanceof Error ? error.message : 'unknown_error'));
  }
  const progressed=await db.rpc('kivelle_progress_shared_plans',{p_user_id:userId,p_character_instance_id:instance.id,p_now:now.toISOString()});
  if(progressed.error)throw new AppError('INTERNAL_ERROR','Shared plans could not advance safely.',500,true);
  const canonicalPlans=(progressed.data??sharedPlans.data??[])as EventRow[];
  await ensureCharacterSchedule({db,userId,characterInstanceId:String(instance.id),now}).catch((error)=>console.warn('Kivelle schedule generation unavailable',error instanceof Error?error.message:'unknown_error'));
  const scheduleOutcomes=simulateEvents?await materializeScheduleOutcomes({db,userId,instance,from:eventSimulationStart,now,trigger}).catch((error)=>{console.warn('Kivelle schedule outcome materialization unavailable',error instanceof Error?error.message:'unknown_error');return[] as EventRow[]}):[];
  // Passive Life Engine state owns the materialized character row. A shared
  // scene is an interaction overlay and must never rewrite that passive state.
  const passivePresence=await resolveCharacterPresence({db,userId,characterInstanceId:String(instance.id),now,ensure:false}).catch(()=>null);
  const presence=await resolveCompanionPresence({db,userId,characterInstanceId:String(instance.id),now,ensure:false}).catch(()=>null);
  const scheduleState=passivePresence?{locationId:passivePresence.locationId,location:passivePresence.placeContext?.location.name??baseLocation?.name??'Current place',activity:passivePresence.activity,activityKey:passivePresence.activityKey,availability:passivePresence.interruptibility==='open'?'available':passivePresence.interruptibility==='limited'?'limited':'busy',mood:String(instance.current_mood??'content'),energy:String(instance.current_energy??'medium'),interruptibility:passivePresence.interruptibility,scheduleEventId:passivePresence.scheduleEventId,state:passivePresence.state,expectedEndAt:passivePresence.expectedEndAt,nextEvent:passivePresence.nextEvent}:resolveLifeState(worldSchedules as Array<Record<string, unknown>>, now, timezone,baseLocation?{locationId:String(baseLocation.id),location:String(baseLocation.name)}:currentPlace?{locationId:currentPlace.location.id,location:currentPlace.location.name}:undefined);
  const requestedContentMode = profile.data?.age_verified_at ? String(profile.data?.content_preferences?.contentMode ?? 'standard') : 'standard';
  const worldTemplates=(templates.data??[]).filter((row:EventRow)=>row.world_id?String(row.world_id)===currentWorldId:!row.default_location_id||String(row.together_locations?.world_id??'')===currentWorldId);
  const eventCandidates = simulateEvents ? selectEventCandidates(eventSimulationStart, now, worldTemplates, String(instance.simulation_seed), recentEvents.data ?? [], worldSchedules, relationship.data, passivePresence?.locationId??scheduleState.locationId??instance.current_location_id, requestedContentMode,timezone) : [];
  const instanceByTemplate = new Map((allInstances.data ?? []).map((item) => [String(item.character_template_id), String(item.id)]));
  const created: EventRow[] = [...scheduleOutcomes];
  for (const candidate of eventCandidates) {
    const template = candidate.template;
    const participantIds = (template.participant_template_ids ?? []).map((id: string) => instanceByTemplate.get(String(id))).filter(Boolean);
    const { data, error } = await db.from('together_life_events').upsert({
      user_id: userId,
      character_instance_id: instance.id,
      event_template_id: template.id,
      simulation_key: candidate.simulationKey,
      event_type: template.event_type,
      title: template.metadata?.display_title ?? template.name,
      narrative_summary: template.narrative_summary,
      participant_instance_ids: participantIds.length ? participantIds : [instance.id],
      location_id: template.default_location_id,
      significance: template.significance,
      starts_at: candidate.occurredAt,
      ends_at: new Date(new Date(candidate.occurredAt).getTime() + Number(template.duration_minutes) * 60000).toISOString(),
      resulting_state_changes: template.state_effects,
      user_should_know: template.user_visibility !== 'hidden',
      proactive_message_appropriate: template.proactive_eligible,
      metadata: { source: trigger, probability: template.probability, category: template.category ?? template.event_type, tone: template.tone ?? 'mundane', scale: template.scale ?? 'normal', content_level: template.content_level ?? 'standard', content_template_name: template.name, establishesPresence:template.metadata?.establishesPresence===true, presenceAuthority:template.metadata?.establishesPresence===true?'explicit':'contextual' },
    }, { onConflict: 'character_instance_id,simulation_key', ignoreDuplicates: true }).select('*').maybeSingle();
    if (!error && data) {
      created.push(data);
      await db.from('together_content_usage').insert({ user_id: userId, character_instance_id: instance.id, content_kind: 'event', content_key: String(template.id), used_at: candidate.occurredAt, metadata: { category: template.category ?? template.event_type } });
    }
  }
  if (simulateEvents) {
    const arcEvents = await progressStoryArcs({ db, userId, instance, relationship: relationship.data, now, seed: String(instance.simulation_seed),currentWorldId }).catch((error) => { console.warn('Together story arc progression unavailable', error instanceof Error ? error.message : 'unknown_error'); return [] as EventRow[]; });
    created.push(...arcEvents);
    for (const event of arcEvents) {
      await db.from('together_content_usage').insert({ user_id: userId, character_instance_id: instance.id, content_kind: 'arc', content_key: String(event.metadata?.arc_slug ?? event.story_arc_instance_id ?? event.id), used_at: event.starts_at, metadata: { chapter_id: event.metadata?.chapter_id } });
      if(event.user_should_know&&Number(event.significance)>=.8){
        waitUntil(createMediaOffer(db,{userId,characterInstanceId:String(instance.id),source:'story',lifeEventId:String(event.id),storyArcId:String(event.story_arc_instance_id),offerKey:`story:${event.story_arc_instance_id}:${event.metadata?.chapter_id??event.id}`,title:String(event.title??'A photo from this chapter'),previewMetadata:{eventTitle:event.title,locationId:event.location_id}}).catch((error)=>{console.warn('Together story photo offer unavailable',error instanceof Error?error.message:'unknown_error');return null;}));
      }
    }
  }

  const activePlanRow = canonicalPlans.filter((plan)=>plan.status==='active'&&new Date(plan.starts_at)<=now&&new Date(plan.ends_at)>now).sort((a,b)=>Number(b.metadata?.significance??0)-Number(a.metadata?.significance??0))[0];
  const activePlan=activePlanRow?{id:activePlanRow.id,event_type:'shared_plan_active',title:activePlanRow.title,narrative_summary:`spending time with you at ${activePlanRow.title}`,location_id:activePlanRow.location_id,significance:Number(activePlanRow.metadata?.significance??.5),starts_at:activePlanRow.starts_at,ends_at:activePlanRow.ends_at,resulting_state_changes:{sharedActivity:activePlanRow.activity_key},metadata:{canonicalPlanId:activePlanRow.id}}:null;
  const activeLifeEvents=[...created,...(recentEvents.data??[])].filter((event):event is EventRow=>Boolean(event)&&eventIsActive(event,now));
  const influential=[activePlan,...activeLifeEvents].filter((event):event is EventRow=>Boolean(event)).sort((a,b)=>Number(b.significance)-Number(a.significance))[0];
  const eventPresenceInfluence=activeLifeEvents.filter((event)=>lifeEventEstablishesPresentReality(
    {locationId:event.location_id?String(event.location_id):null,eventType:String(event.event_type??''),metadata:event.metadata??{}},
    {locationId:scheduleState.locationId},
  )).sort((a,b)=>Number(b.significance)-Number(a.significance))[0];
  const presenceInfluence=activePlan??eventPresenceInfluence;
  const life=applyEventInfluence(scheduleState,presenceInfluence);
  const presenceSource=activePlan?'plan':eventPresenceInfluence?'life_event':passivePresence?.source==='schedule'?'schedule':passivePresence?.source==='plan'?'plan':passivePresence?.source==='life_event'?'life_event':'fallback';
  if(persistCharacterState)await db.from('together_character_instances').update({ ...(life.locationId?{current_location_id:life.locationId}:{}), current_activity: life.activity, current_mood: life.mood, current_energy: life.energy, current_schedule_event_id:presenceSource==='schedule'?passivePresence?.scheduleEventId??null:null,current_interruptibility:passivePresence?.interruptibility??'open',current_presence_source:presenceSource,life_engine_version:'life_engine_v3_user_timezone', last_simulated_at: now.toISOString(), ...(simulateEvents ? { last_event_simulated_at: now.toISOString() } : {}), updated_at: now.toISOString() }).eq('id', instance.id).eq('user_id', userId);

  const { data: dueThreads } = await db.from('together_open_threads').update({ follow_up_eligible: true, updated_at: now.toISOString() }).eq('user_id', userId).eq('character_instance_id', instance.id).is('resolved_at', null).lte('expected_at', now.toISOString()).select('*');
  const prefs = preferences.data ?? { character_initiated_messages: true, push_enabled: false, quiet_hours_start: '23:00', quiet_hours_end: '08:00', timezone: 'UTC' };
  const durableMemory=(memories.data??[]).find((memory)=>isDurableUserMemory({memoryType:String(memory.memory_type??'semantic'),canonicalText:String(memory.canonical_text??'')}));
  let proactive: EventRow | null = null;
  if (prefs.character_initiated_messages === false) {
    await db.from('together_proactive_messages').update({ status: 'cancelled', updated_at: now.toISOString() }).eq('user_id', userId).eq('character_instance_id', instance.id).eq('status', 'queued');
  } else if (evaluateProactive) {
    proactive = await deliverDueMessage(db, userId, instance, latestConversation.data, prefs, now);
    if (!proactive) {
      const scheduleMessageEvent=trigger==='scheduled_dispatch'&&passivePresence?.scheduleEventId&&passivePresence.interruptibility==='open'&&!['sleep','work','travel'].includes(String(passivePresence.activityKey))?{id:passivePresence.scheduleEventId,event_type:'schedule_presence',title:passivePresence.activity,narrative_summary:String(passivePresence.activity),location_id:passivePresence.locationId,significance:.56,starts_at:passivePresence.activityStartedAt,ends_at:passivePresence.expectedEndAt,user_should_know:true,proactive_message_appropriate:true,metadata:{source:'character_schedule',scheduleEventId:passivePresence.scheduleEventId}}:null;
      proactive = await createProactiveCandidate({ db, userId, instance, relationship: relationship.data, conversation: latestConversation.data, prefs, now, dueThreads: dueThreads ?? [], events: [...(scheduleMessageEvent?[scheduleMessageEvent]:[]),...created, ...(recentEvents.data ?? [])], plans:canonicalPlans, recentProactive: recentProactive.data ?? [], memory: durableMemory?.canonical_text });
    }
  }

  return { state: life, stateSource:presenceSource, presence, activeEvent: influential ?? null, events: created, proactiveMessage: proactive, eligibleThreads: dueThreads ?? [], elapsedDays: Math.max(0, Math.floor((now.getTime() - eventSimulationStart.getTime()) / 86400000)), eventsSimulated: simulateEvents, timezone };
}

async function materializeScheduleOutcomes(input:{db:SupabaseClient;userId:string;instance:EventRow;from:Date;now:Date;trigger:LifeRunInput['trigger']}):Promise<EventRow[]>{
  const from=new Date(Math.max(input.from.getTime(),input.now.getTime()-72*3600000));
  const{data:completed,error}=await input.db.from('together_character_schedule_events').select('*')
    .eq('user_id',input.userId).eq('character_instance_id',input.instance.id)
    .eq('metadata->>outcomeEligible','true').gte('ends_at',from.toISOString()).lte('ends_at',input.now.toISOString())
    .order('ends_at',{ascending:true}).limit(24);
  if(error||!completed?.length)return[];
  const{data:recent}=await input.db.from('together_life_events').select('id,starts_at,metadata').eq('user_id',input.userId)
    .eq('character_instance_id',input.instance.id).eq('event_type','schedule_outcome')
    .gte('starts_at',new Date(input.now.getTime()-24*3600000).toISOString()).limit(4);
  if((recent??[]).length>=1)return[];
  for(const schedule of completed as EventRow[]){
    const probability=Math.max(0,Math.min(.5,Number(schedule.metadata?.outcomeProbability??0)));
    if(!probability||(stableHash(`${input.instance.simulation_seed}:schedule-outcome:${schedule.id}`)%10000)/10000>=probability)continue;
    const variants=Array.isArray(schedule.metadata?.outcomeVariants)?schedule.metadata.outcomeVariants.filter((value:unknown)=>typeof value==='string'&&value.trim()):[];
    if(!variants.length)continue;
    const narrative=String(variants[stableHash(`${schedule.id}:variant`)%variants.length]);
    const significance=Math.max(.35,Math.min(.78,Number(schedule.metadata?.outcomeSignificance??.56)));
    const{data}=await input.db.from('together_life_events').upsert({
      user_id:input.userId,continuity_id:input.instance.continuity_id,character_instance_id:input.instance.id,
      event_type:'schedule_outcome',title:String(schedule.metadata?.outcomeTitle??schedule.metadata?.activityLabel??schedule.title),narrative_summary:narrative,
      participant_instance_ids:[input.instance.id],location_id:schedule.location_id,significance,
      starts_at:schedule.ends_at,ends_at:schedule.ends_at,resulting_state_changes:{},
      user_should_know:true,proactive_message_appropriate:schedule.metadata?.outcomeProactive===true,
      simulation_key:`schedule-outcome:${schedule.id}`,metadata:{source:'character_schedule',scheduleEventId:schedule.id,activityKey:schedule.activity_key,trigger:input.trigger,establishesPresence:false,presenceAuthority:'contextual'}
    },{onConflict:'character_instance_id,simulation_key',ignoreDuplicates:true}).select('*').maybeSingle();
    if(data)return[data];
  }
  return[];
}

async function createProactiveCandidate(input: { db: SupabaseClient; userId: string; instance: EventRow; relationship: EventRow; conversation: EventRow | null; prefs: EventRow; now: Date; dueThreads: EventRow[]; events: EventRow[]; plans:EventRow[]; recentProactive: EventRow[]; memory?: string }): Promise<EventRow | null> {
  const { db, userId, instance, relationship, conversation, prefs, now } = input;
  if (!instance.contact_added_at && !instance.introduced_at) return null;
  if (relationship?.active_major_conflict || Number(relationship?.conflict ?? 0) > 60) return null;
  const hoursSinceConversation = conversation?.last_message_at ? (now.getTime() - new Date(conversation.last_message_at).getTime()) / 3600000 : 48;
  const lastProactive = input.recentProactive.find((item) => item.status !== 'cancelled' && item.status !== 'failed');
  const hoursSinceProactive = lastProactive ? (now.getTime() - new Date(lastProactive.created_at).getTime()) / 3600000 : Infinity;
  if (hoursSinceProactive < 18) return null;

  const dueThread = input.dueThreads.sort((a, b) => Number(b.importance) - Number(a.importance))[0];
  let source: EventRow | null = null;
  let dedupeKey = '';
  let content = '';
  let reason = '';
  let lifeEventId: string | null = null;
  let openThreadId: string | null = null;
  if (dueThread && hoursSinceConversation >= 4) {
    const subject = String(dueThread.metadata?.subject ?? String(dueThread.topic).match(/user's\s+([a-z]+)/i)?.[1] ?? 'event');
    dedupeKey = `thread:${dueThread.id}`;
    content = composeProactiveMessage({ threadSubject: subject });
    reason = `Follow-up: ${subject}`;
    openThreadId = String(dueThread.id);
  } else {
    const upcomingPlan=input.plans.filter((plan)=>plan.status==='scheduled').map((plan)=>({plan,hours:(new Date(plan.starts_at).getTime()-now.getTime())/3600000})).find((item)=>item.hours>=2&&item.hours<=4);
    const completedPlan=input.plans.filter((plan)=>plan.status==='completed'&&Number(plan.metadata?.significance??0)>=.65&&plan.completed_at&&now.getTime()-new Date(plan.completed_at).getTime()<=24*3600000).sort((a,b)=>new Date(b.completed_at).getTime()-new Date(a.completed_at).getTime())[0];
    if(upcomingPlan&&hoursSinceConversation>=2&&stableHash(`${instance.simulation_seed}:plan-reminder:${upcomingPlan.plan.id}`)%100<55){
      dedupeKey=`plan:pre:${upcomingPlan.plan.id}`;content=`I'm wrapping up before ${upcomingPlan.plan.title}. Still good for ${new Date(upcomingPlan.plan.starts_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:String(prefs.timezone??'UTC')})}?`;reason=`Upcoming plan: ${upcomingPlan.plan.title}`;
    }else if(completedPlan&&hoursSinceConversation>=5&&stableHash(`${instance.simulation_seed}:plan-callback:${completedPlan.id}`)%100<40){
      dedupeKey=`plan:post:${completedPlan.id}`;content=`Okay, ${completedPlan.title} was a good call.`;reason=`Completed plan: ${completedPlan.title}`;
    }
    if(dedupeKey){/* plan-aware proactive selected */}
    else{
    source = input.events.filter((event) => event.proactive_message_appropriate && Number(event.significance) >= .55 && new Date(event.starts_at).getTime() <= now.getTime() && now.getTime() - new Date(event.starts_at).getTime() <= 48 * 3600000 && event.metadata?.planStatus !== 'cancelled').sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())[0] ?? null;
    if (!source || hoursSinceConversation < 5 || !shouldInitiateEventMessage(source, String(instance.relationship_stage), hoursSinceConversation, String(instance.simulation_seed))) return null;
    dedupeKey = `event:${source.id}`;
    content = composeProactiveMessage({ eventTitle: String(source.title), eventSummary: String(source.narrative_summary), memory: input.memory });
    reason = `Life event: ${source.title}`;
    lifeEventId = String(source.id);
    }
  }
  const existing = await db.from('together_proactive_messages').select('id').eq('user_id', userId).eq('character_instance_id', instance.id).eq('dedupe_key', dedupeKey).maybeSingle();
  if (existing.data) return null;

  const quiet = isQuietHours(now, String(prefs.quiet_hours_start ?? '23:00'), String(prefs.quiet_hours_end ?? '08:00'), String(prefs.timezone ?? 'UTC'));
  const eligibleAt = quiet ? nextDeliveryTime(now, String(prefs.quiet_hours_start ?? '23:00'), String(prefs.quiet_hours_end ?? '08:00'), String(prefs.timezone ?? 'UTC')) : now;
  const { data, error } = await db.from('together_proactive_messages').insert({ user_id: userId, character_instance_id: instance.id, life_event_id: lifeEventId, open_thread_id: openThreadId, dedupe_key: dedupeKey, content, reason, eligible_at: eligibleAt.toISOString(), expires_at: new Date(eligibleAt.getTime() + 30 * 3600000).toISOString(), conversation_id: conversation?.id ?? null, context: { relationship_stage: instance.relationship_stage, quiet_hours_deferred: quiet } }).select('*').single();
  if (error || !data) return null;
  await track(db, userId, 'proactive_message_created', { proactiveMessageId: data.id, source: openThreadId ? 'open_thread' : reason.startsWith('Upcoming plan')?'shared_plan_pre':reason.startsWith('Completed plan')?'shared_plan_post':'life_event', deferred: quiet });
  if (quiet) return data;
  return deliverMessage(db, userId, instance, conversation, prefs, data, now);
}

async function deliverDueMessage(db: SupabaseClient, userId: string, instance: EventRow, conversation: EventRow | null, prefs: EventRow, now: Date): Promise<EventRow | null> {
  if (isQuietHours(now, String(prefs.quiet_hours_start ?? '23:00'), String(prefs.quiet_hours_end ?? '08:00'), String(prefs.timezone ?? 'UTC'))) return null;
  await db.from('together_proactive_messages').update({ status: 'cancelled', updated_at: now.toISOString() }).eq('user_id', userId).eq('character_instance_id', instance.id).eq('status', 'queued').lt('expires_at', now.toISOString());
  const { data } = await db.from('together_proactive_messages').select('*').eq('user_id', userId).eq('character_instance_id', instance.id).eq('status', 'queued').lte('eligible_at', now.toISOString()).or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`).order('eligible_at').limit(1).maybeSingle();
  return data ? deliverMessage(db, userId, instance, conversation, prefs, data, now) : null;
}

async function deliverMessage(db: SupabaseClient, userId: string, instance: EventRow, conversation: EventRow | null, prefs: EventRow, proactive: EventRow, now: Date): Promise<EventRow|null> {
  if(!await proactiveMessageStillRelevant(db,userId,proactive,now)){
    await db.from('together_proactive_messages').update({status:'cancelled',updated_at:now.toISOString()}).eq('id',proactive.id).eq('user_id',userId).eq('status','queued');
    return null;
  }
  let sentMessageId: string | null = proactive.sent_message_id ?? null;
  if (conversation?.id && !sentMessageId) {
    const { data: message } = await db.from('together_messages').insert({ conversation_id: conversation.id, user_id: userId, character_instance_id: instance.id, role: 'assistant', content: proactive.content, delivery_status: 'complete', provider_metadata: { provider: 'life-engine', proactive: true, proactive_message_id: proactive.id } }).select('id,created_at').single();
    if (message) {
      sentMessageId = message.id;
      await db.from('together_conversations').update({ last_message_at: message.created_at, updated_at: message.created_at }).eq('id', conversation.id).eq('user_id', userId);
    }
  }
  const { data: delivered } = await db.from('together_proactive_messages').update({ status: 'sent', sent_message_id: sentMessageId, updated_at: now.toISOString() }).eq('id', proactive.id).eq('user_id', userId).eq('status', 'queued').select('*').maybeSingle();
  if (delivered?.life_event_id && sentMessageId && conversation?.id) {
    const { data: event } = await db.from('together_life_events').select('*').eq('id', delivered.life_event_id).eq('user_id', userId).maybeSingle();
    if (event && shouldOfferAutomaticPhoto(event)) {
      try {
        await createMediaOffer(db, { userId, characterInstanceId: String(instance.id), source: 'life_event', conversationId: String(conversation.id), messageId: sentMessageId, lifeEventId: String(event.id), offerKey: `life:${event.id}`, title:String(event.title??'A photo from right now'),previewMetadata:{eventTitle:event.title,locationId:event.location_id} });
      } catch (error) { console.warn('Together contextual life photo offer unavailable', error instanceof Error ? error.message : 'unknown_error'); }
    }
  }
  if (delivered && prefs.push_enabled) await sendPushNotifications(db, userId, String((instance.together_character_templates as EventRow | undefined)?.name ?? 'Kivelle'), delivered);
  return delivered ?? proactive;
}

async function proactiveMessageStillRelevant(db:SupabaseClient,userId:string,proactive:EventRow,now:Date):Promise<boolean>{
  if(!proactive.life_event_id)return true;
  const{data:event}=await db.from('together_life_events').select('event_type,metadata').eq('id',String(proactive.life_event_id)).eq('user_id',userId).maybeSingle();
  if(!event||event.event_type!=='commitment_waiting')return true;
  const planId=String((event.metadata as EventRow|undefined)?.canonicalPlanId??'');
  if(!planId)return false;
  const[{data:plan},{data:attendance}]=await Promise.all([
    db.from('together_shared_plans').select('status,starts_at,ends_at,window_starts_at,window_ends_at,grace_ends_at,participation_mode,companion_state').eq('id',planId).eq('user_id',userId).maybeSingle(),
    db.from('together_plan_attendance').select('participant_type,joined_at').eq('plan_id',planId).eq('user_id',userId),
  ]);
  if(!plan)return false;
  const rows=attendance??[],userAttendance=rows.find((row)=>row.participant_type==='user'),characterAttendance=rows.find((row)=>row.participant_type==='character');
  return shouldSendPlanWaitingCheckIn({status:String(plan.status),startsAt:plan.starts_at,endsAt:plan.ends_at,windowStartsAt:plan.window_starts_at,windowEndsAt:plan.window_ends_at,graceEndsAt:plan.grace_ends_at,participationMode:plan.participation_mode,userJoinedAt:userAttendance?.joined_at,characterJoinedAt:characterAttendance?.joined_at,companionState:plan.companion_state},now);
}

function shouldOfferAutomaticPhoto(event:EventRow):boolean {
  if(!event.user_should_know||Number(event.significance??0)<.58)return false;
  return /coffee|caf[eé]|photo|shoot|rooftop|movie|gallery|birthday|trip|riverwalk|concert|open mic|outfit/i.test(`${event.title} ${event.narrative_summary}`);
}

async function sendPushNotifications(db: SupabaseClient, userId: string, characterName: string, proactive: EventRow): Promise<void> {
  const { data: tokens } = await db.from('together_push_tokens').select('id,expo_push_token').eq('user_id', userId).eq('active', true).limit(5);
  if (!tokens?.length) return;
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(tokens.map((item) => ({ to: item.expo_push_token, title: characterName, body: proactive.content, sound: 'default', data: { route: '/chat', proactiveMessageId: proactive.id } }))) });
    if (!response.ok) console.warn('Together push delivery failed', response.status);
  } catch (error) { console.warn('Together push delivery unavailable', error instanceof Error ? error.message : 'unknown_error'); }
}

function selectEventCandidates(last: Date, now: Date, templates: EventRow[], seed: string, recent: EventRow[], schedules: EventRow[], relationship: EventRow, locationId?: string | null, contentMode = 'standard',timezone='UTC'): Array<{ template: EventRow; occurredAt: string; simulationKey: string }> {
  if (!templates.length || now <= last) return [];
  const output: Array<{ template: EventRow; occurredAt: string; simulationKey: string }> = [];
  const recentTemplateDates = new Map(recent.map((item) => [String(item.event_template_id), new Date(item.starts_at).getTime()]));
  const cursor = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate()));
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let inspected = 0;
  while (cursor <= lastDay && inspected++ < 31) {
    const day = cursor.toISOString().slice(0, 10);
    if (cursor <= now) {
      const ranked = rankEventTemplates({ templates, relationship, recentEvents: recent, now: cursor, seed: `${seed}:${day}`, contentMode, locationId });
      const selected = ranked.find((template) => {
        const occurred = scheduledOccurrence(cursor, template, schedules, seed,timezone);
        const repeatedRecently = recentTemplateDates.has(String(template.id)) && occurred.getTime() - Number(recentTemplateDates.get(String(template.id))) < 72 * 3600000;
        const roll = (stableHash(`${seed}:chance:${day}:${template.id}`) % 10000) / 10000;
        const probability = Number(template.probability ?? 0) * (template.scale === 'micro' ? 1.15 : 1);
        return !repeatedRecently && roll < probability;
      });
      if (selected) {
        const occurred = scheduledOccurrence(cursor, selected, schedules, seed,timezone);
        if (occurred > last && occurred <= now) output.push({ template: selected, occurredAt: occurred.toISOString(), simulationKey: `${day}:${selected.id}` });
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return output.sort((a, b) => Number(b.template.significance) - Number(a.template.significance)).slice(0, 2).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

function scheduledOccurrence(day: Date, template: EventRow, schedules: EventRow[], seed: string,timezone='UTC'): Date {
  const clock=experienceClock(timezone,day);
  const matching = schedules.filter((entry) => Number(entry.day_of_week) === clock.weekday && String(entry.location_id) === String(template.default_location_id) && Number(entry.end_minute) - Number(entry.start_minute) >= 20);
  const entry = matching[stableHash(`${seed}:${day.toISOString().slice(0, 10)}:${template.id}:schedule`) % matching.length];
  let minute=12*60+(stableHash(`${seed}:hour:${template.id}:${day.toISOString().slice(0,10)}`)%7)*60;
  if (entry) {
    const span = Math.max(1, Number(entry.end_minute) - Number(entry.start_minute) - 15);
    minute = Number(entry.start_minute) + stableHash(`${seed}:${template.id}:${day.toISOString().slice(0, 10)}`) % span;
  }
  return localMinuteOnDate(clock.localDate,minute,timezone);
}

function localMinuteOnDate(localDate:string,minute:number,timezone:string){const desired=Date.parse(`${localDate}T${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}:00Z`);let candidate=new Date(desired);for(let attempt=0;attempt<2;attempt++){const actual=experienceClock(timezone,candidate),actualStamp=Date.parse(`${actual.localDate}T${actual.localTime}:00Z`);candidate=new Date(candidate.getTime()+desired-actualStamp);}return candidate;}

function applyEventInfluence(life: Record<string, any>, event?: EventRow): Record<string, any> {
  if (!event) return life;
  const effects = event.resulting_state_changes ?? {};
  const mood = effects.mood && typeof effects.mood === 'object' ? Object.entries(effects.mood).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] : null;
  const levels = ['low', 'medium', 'high'];
  const energyIndex = Math.max(0, Math.min(2, levels.indexOf(String(life.energy)) + Number(effects.energy ?? 0)));
  const companionName=String((event.metadata as EventRow|undefined)?.companion_name??'').trim();
  const prefix=companionName?new RegExp(`^${companionName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s+`,'i'):null;
  const eventActivity = ['work','shared_plan','shared_plan_active'].includes(String(event.event_type)) ? String(event.narrative_summary).replace(prefix??/^$/,'').replace(/[.]$/, '') : life.activity;
  return { ...life, locationId:event.location_id ?? life.locationId, mood: mood ?? life.mood, energy: levels[energyIndex], activity: eventActivity };
}

function shouldInitiateEventMessage(event: EventRow, stage: string, hoursSinceConversation: number, seed: string): boolean {
  const stageWeight = ['friend','flirting','dating','exclusive','long_term'].includes(stage) ? 42 : 18;
  const threshold = Math.min(78, stageWeight + Math.floor(hoursSinceConversation));
  return event.proactive_message_appropriate && Number(event.significance) >= .55 && stableHash(`${seed}:proactive:${event.id}`) % 100 < threshold;
}

function composeProactiveMessage(input: { eventTitle?: string; eventSummary?: string; threadSubject?: string; memory?: string }): string {
  if (input.threadSubject) return `Hey—how did your ${input.threadSubject} go? You mentioned it was important.`;
  if (input.memory) return `Something today reminded me of ${memoryCallback(input.memory)}. Not a dramatic story—just a nice little callback.`;
  return input.eventSummary?.trim() || 'Something happened in the city today that I think you would appreciate.';
}

function isQuietHours(now: Date, start: string, end: string, timezone: string): boolean {
  const minute = localMinute(now, timezone), startMinute = parseMinute(start), endMinute = parseMinute(end);
  return startMinute > endMinute ? minute >= startMinute || minute < endMinute : minute >= startMinute && minute < endMinute;
}

function nextDeliveryTime(now: Date, start: string, end: string, timezone: string): Date {
  const candidate = new Date(now);
  for (let step = 0; step < 100; step++) { candidate.setUTCMinutes(candidate.getUTCMinutes() + 15); if (!isQuietHours(candidate, start, end, timezone)) return candidate; }
  return new Date(now.getTime() + 8 * 3600000);
}

function parseMinute(value: string): number { const [hour = '0', minute = '0'] = value.split(':'); return Number(hour) * 60 + Number(minute); }
function localMinute(now: Date, timezone: string): number { try { const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now); return Number(parts.find((part) => part.type === 'hour')?.value ?? 0) * 60 + Number(parts.find((part) => part.type === 'minute')?.value ?? 0); } catch { return now.getUTCHours() * 60 + now.getUTCMinutes(); } }
function memoryCallback(memory: string): string { return memory.replace(/^User's\s+/i, 'your ').replace(/^User\s+(?:likes|dislikes|feels|has|is)\s+/i, '').replace(/[.!]$/, '').slice(0, 80); }
function stableHash(value: string): number { let hash = 2166136261; for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return hash >>> 0; }

async function unlockEligibleDateSessions(db: SupabaseClient, userId: string, instance: EventRow, relationship: EventRow, now: Date): Promise<void> {
  const { data: sessions } = await db.from('together_date_sessions').select('id,together_date_templates(unlock_rules)').eq('user_id', userId).eq('character_instance_id', instance.id).eq('status', 'locked');
  for (const session of sessions ?? []) {
    const rules = (session.together_date_templates as EventRow | null)?.unlock_rules ?? {};
    const stages = Array.isArray(rules.allowed_stages) ? rules.allowed_stages : [];
    const eligible = (!stages.length || stages.includes(instance.relationship_stage)) &&
      Number(relationship.familiarity ?? 0) >= Number(rules.familiarity ?? 0) &&
      Number(relationship.trust ?? 0) >= Number(rules.trust ?? 0) &&
      Number(relationship.attraction ?? 0) >= Number(rules.attraction ?? 0) &&
      Number(relationship.comfort ?? 0) >= Number(rules.comfort ?? 0) &&
      Number(relationship.conflict ?? 0) <= Number(rules.max_conflict ?? 45);
    if (!eligible) continue;
    const { data } = await db.from('together_date_sessions').update({ status: 'unlocked', updated_at: now.toISOString() }).eq('id', session.id).eq('status', 'locked').select('id').maybeSingle();
    if (data) await track(db, userId, 'date_unlocked', { dateSessionId: data.id });
  }
}
