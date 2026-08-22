import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { buildSnapshot, resolveLifeState, track } from '../_shared/together.ts';
import { getActiveConversation } from '../_shared/together-conversation.ts';
import { ensureMainContinuity } from '../_shared/together-continuity.ts';

const schema = z.object({
  ageConfirmed: z.literal(true),
  onboardingChoice:z.enum(['companion','skip']).default('companion'),
  displayName: z.string().trim().min(1).max(50).optional(),
  characterTemplateId: z.string().uuid().optional(),
  worldId:z.string().uuid().optional(),
  interests: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  goals: z.array(z.enum(['Dating','Friendship','Stories','Social worlds'])).max(4).default([]),
  experienceTimezone:z.string().trim().min(1).max(80).default('UTC'),
});
const relationOne=(value:unknown):Record<string,unknown>|null=>{const row=Array.isArray(value)?value[0]:value;return row&&typeof row==='object'?row as Record<string,unknown>:null;};
type BootstrapTemplate={id:string;name:string;slug:string;current_published_version:number;first_meeting?:Record<string,unknown>|null};
type BootstrapVersion={id:string};
type BootstrapLocation={id:string;world_id:string};

serve(async (request, correlationId) => {
  if (request.method === 'GET') {
    const { user, db } = await authenticated(request);
    const requestedTimezone=request.headers.get('x-kivelle-timezone');
    if(requestedTimezone){try{new Intl.DateTimeFormat('en-US',{timeZone:requestedTimezone}).format(new Date());const updatedAt=new Date().toISOString();await Promise.all([db.from('together_profiles').update({experience_timezone:requestedTimezone,updated_at:updatedAt}).eq('user_id',user.id),db.from('together_notification_preferences').update({timezone:requestedTimezone,updated_at:updatedAt}).eq('user_id',user.id)]);}catch{/* ignore malformed client timezone */}}
    return json({ data: await buildSnapshot(db, user.id), correlationId }, 200, correlationId);
  }
  const { user, db } = await authenticated(request);
  await enforceRateLimit(db, user.id, 'together_bootstrap', 20, 3600);
  const input = await parseBody(request, schema);
  const now = new Date().toISOString();
  const skip=input.onboardingChoice==='skip';
  let selectedWorld:Record<string,unknown>|null=null;
  if(input.worldId){const{data,error}=await db.from('together_worlds').select('id,slug,name').eq('id',input.worldId).eq('published',true).maybeSingle();if(error||!data)throw new AppError('VALIDATION_ERROR','Choose an available world to continue.',400);selectedWorld=data;}

  let selectedTemplate:BootstrapTemplate|null=null,selectedVersion:BootstrapVersion|null=null,meeting:Record<string,unknown>={},meetingLocation:BootstrapLocation|null=null;
  if(!skip){
    if(!input.characterTemplateId)throw new AppError('VALIDATION_ERROR','Choose an available companion to continue.',400);
    const templateResult=await db.from('together_character_templates').select('id,name,slug,current_published_version,published,can_be_selected,first_meeting').eq('id',input.characterTemplateId).eq('published',true).eq('can_be_selected',true).maybeSingle();
    if(templateResult.error||!templateResult.data)throw new AppError('VALIDATION_ERROR','Choose an available companion to continue.',400);
    selectedTemplate=templateResult.data;
    const versionResult=await db.from('together_character_versions').select('id').eq('character_template_id',selectedTemplate.id).eq('version',selectedTemplate.current_published_version).maybeSingle();
    if(versionResult.error||!versionResult.data)throw new AppError('INTERNAL_ERROR','That companion is not ready to meet yet.',500,true);
    selectedVersion=versionResult.data;
    meeting=(selectedTemplate.first_meeting??{}) as Record<string,unknown>;
    const meetingLocationId=typeof meeting.location_id==='string'?meeting.location_id:null;
    if(!meetingLocationId)throw new AppError('CONFLICT','That companion does not have a published first-meeting place yet.',409);
    // Query the canonical location directly. Embedding together_worlds here is
    // ambiguous because worlds also point back to their default arrival place.
    const locationResult=await db.from('together_locations').select('id,world_id').eq('id',meetingLocationId).maybeSingle();
    if(locationResult.error||!locationResult.data)throw new AppError('CONFLICT','That first-meeting place is unavailable.',409);
    meetingLocation=locationResult.data;
    if(input.worldId&&String(meetingLocation.world_id)!==input.worldId)throw new AppError('VALIDATION_ERROR','Choose a companion who can meet you in that world.',400);
  }

  let experienceTimezone='UTC';try{new Intl.DateTimeFormat('en-US',{timeZone:input.experienceTimezone}).format(new Date());experienceTimezone=input.experienceTimezone;}catch{/* use UTC */}
  const{error:profileError}=await db.from('together_profiles').upsert({user_id:user.id,display_name:input.displayName??user.user_metadata?.display_name??user.email?.split('@')[0]??'You',age_verified_at:now,interests:input.interests,experience_goals:input.goals,experience_timezone:experienceTimezone,onboarding_completed_at:now,updated_at:now},{onConflict:'user_id'});
  if(profileError)throw new AppError('INTERNAL_ERROR','Could not start your Kivelle story.',500,true);
  const continuity=await ensureMainContinuity(db,user.id);
  await Promise.all([db.from('together_notification_preferences').upsert({user_id:user.id,timezone:experienceTimezone},{onConflict:'user_id'}),db.from('together_entitlements').upsert({user_id:user.id,revenuecat_app_user_id:user.id},{onConflict:'user_id',ignoreDuplicates:true})]);

  if(skip){
    await unlockOnboardingWorlds(db,user.id,input.worldId??null,now);
    const worldSlug=String(selectedWorld?.slug??'');
    await track(db,user.id,'onboarding_started',{world:worldSlug||null,mode:'skip'});
    await track(db,user.id,'onboarding_skipped',{world:worldSlug||null,stage:input.worldId?'companion':'world'});
    await track(db,user.id,'onboarding_completed',{world:worldSlug||null,mode:'skip'});
    return json({data:await buildSnapshot(db,user.id),correlationId},201,correlationId);
  }
  if(!selectedTemplate||!selectedVersion||!meetingLocation)throw new AppError('INTERNAL_ERROR','Your first meeting could not be prepared.',500,true);
  let{data:companion}=await db.from('together_character_instances').select('id,character_template_id').eq('user_id',user.id).eq('continuity_id',continuity.id).eq('character_template_id',selectedTemplate.id).maybeSingle();
  if(!companion){const created=await db.from('together_character_instances').insert({user_id:user.id,continuity_id:continuity.id,character_template_id:selectedTemplate.id,character_version_id:selectedVersion.id,relationship_stage:'stranger',current_mood:String(meeting.mood??'curious'),current_location_id:meetingLocation.id,current_activity:String(meeting.companion_activity??'meeting someone new'),current_energy:'medium',introduced_at:now,contact_added_at:now,metadata:{first_meeting_title:meeting.title??null},updated_at:now}).select('id,character_template_id').single();if(created.error||!created.data)throw new AppError('INTERNAL_ERROR',`Could not prepare your first meeting with ${selectedTemplate.name}.`,500,true);companion=created.data;}
  await db.from('together_relationship_states').upsert({ character_instance_id: companion.id, user_id: user.id }, { onConflict: 'character_instance_id', ignoreDuplicates: true });
  await Promise.all([db.from('together_continuities').update({active_companion_instance_id:companion.id,updated_at:now}).eq('id',continuity.id).eq('user_id',user.id),db.from('together_profiles').update({ active_companion_instance_id: companion.id,active_continuity_id:continuity.id, updated_at: now }).eq('user_id', user.id)]);

  const conversation=await getActiveConversation(db, user.id, companion.id, true);
  if(conversation?.id&&typeof meeting.opening_line==='string'){const{count}=await db.from('together_messages').select('id',{count:'exact',head:true}).eq('conversation_id',conversation.id).eq('user_id',user.id);if(!count)await db.from('together_messages').insert({conversation_id:conversation.id,user_id:user.id,character_instance_id:companion.id,role:'assistant',content:meeting.opening_line,delivery_status:'complete'});}
  await unlockOnboardingWorlds(db,user.id,String(meetingLocation.world_id),now);

  const { data: schedules } = await db.from('together_schedule_templates').select('*,together_locations(name,world_id)').eq('character_version_id', selectedVersion.id);
  const life = schedules?.length
    ? resolveLifeState((schedules as Array<Record<string,unknown>>).filter((row)=>String(relationOne(row.together_locations)?.world_id??'')===meetingLocation.world_id),new Date(),experienceTimezone,{locationId:meetingLocation.id,location:String(meeting.title??'First meeting')})
    : { mood: String(meeting.mood??'curious'), locationId: meetingLocation.id, activity: String(meeting.companion_activity??'meeting someone new'), energy: 'medium' };
  await db.from('together_character_instances').update({ current_mood: life.mood, current_location_id: life.locationId, current_activity: life.activity, current_energy: life.energy, last_simulated_at: now, updated_at: now }).eq('id', companion.id);
  let meetingWorld=String(meetingLocation.world_id);
  if(selectedWorld&&String(selectedWorld.id)===String(meetingLocation.world_id))meetingWorld=String(selectedWorld.slug??meetingWorld);
  else{const{data:world}=await db.from('together_worlds').select('slug').eq('id',meetingLocation.world_id).maybeSingle();if(world?.slug)meetingWorld=String(world.slug);}
  await track(db, user.id, 'onboarding_started', { world: meetingWorld, mode:'companion' });
  await track(db, user.id, 'companion_selected', { character_template_id: selectedTemplate.id, character_slug: selectedTemplate.slug, source: 'onboarding' });
  await track(db, user.id, 'onboarding_completed', { world: meetingWorld, character_template_id: selectedTemplate.id, mode:'companion' });
  return json({ data: await buildSnapshot(db, user.id), correlationId }, 201, correlationId);
});

async function unlockOnboardingWorlds(db:SupabaseClient,userId:string,visitedWorldId:string|null,now:string){
  const{data:freeWorlds}=await db.from('together_worlds').select('id').eq('published',true).eq('access_type','free');
  const worldIds=new Set((freeWorlds??[]).map((world:Record<string,unknown>)=>String(world.id)));
  if(visitedWorldId)worldIds.add(visitedWorldId);
  for(const worldId of worldIds)await db.from('together_user_worlds').upsert({user_id:userId,world_id:worldId,access_status:'unlocked',first_visited_at:worldId===visitedWorldId?now:null,last_visited_at:worldId===visitedWorldId?now:null,updated_at:now},{onConflict:'user_id,world_id',ignoreDuplicates:true});
}
