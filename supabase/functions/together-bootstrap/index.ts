import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { buildCharacterPresenceSnapshot, buildExploreCatalogSnapshot, buildSnapshot, resolveLifeState, track } from '../_shared/together.ts';
import { getActiveConversation } from '../_shared/together-conversation.ts';
import { ensureMainContinuity } from '../_shared/together-continuity.ts';
import { isAtLeast18 } from '../../../packages/together-domain/src/adult-access.ts';

const onboardingSchema = z.object({
  action: z.literal('complete_onboarding').optional(),
  ageConfirmed: z.literal(true),
  onboardingChoice:z.enum(['companion','skip']).default('companion'),
  displayName: z.string().trim().min(1).max(50).optional(),
  characterTemplateId: z.string().uuid().optional(),
  worldId:z.string().uuid().optional(),
  interests: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  goals: z.array(z.enum(['Dating','Friendship','Stories','Social worlds'])).max(4).default([]),
  experienceTimezone:z.string().trim().min(1).max(80).default('UTC'),
});
const schema = z.union([
  z.object({ action: z.literal('confirm_age'), ageConfirmed: z.literal(true),dateOfBirth:z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  onboardingSchema,
]);
const relationOne=(value:unknown):Record<string,unknown>|null=>{const row=Array.isArray(value)?value[0]:value;return row&&typeof row==='object'?row as Record<string,unknown>:null;};
type BootstrapTemplate={id:string;name:string;slug:string;current_published_version:number;first_meeting?:Record<string,unknown>|null};
type BootstrapVersion={id:string};
type BootstrapLocation={id:string;world_id:string};

serve(async (request, correlationId) => {
  if (request.method === 'GET') {
    const { user, db } = await authenticated(request);
    const url=new URL(request.url),scope=url.searchParams.get('scope');
    if(scope==='presence'){
      const characterInstanceId=z.string().uuid().safeParse(url.searchParams.get('characterInstanceId'));
      if(!characterInstanceId.success)throw new AppError('VALIDATION_ERROR','Choose a companion to refresh.',400);
      return json({data:await buildCharacterPresenceSnapshot(db,user.id,characterInstanceId.data),correlationId},200,correlationId);
    }
    if(scope==='explore')return json({data:await buildExploreCatalogSnapshot(db,user.id),correlationId},200,correlationId);
    if(scope==='character_schedule'){
      const characterTemplateId=z.string().uuid().safeParse(url.searchParams.get('characterTemplateId'));
      if(!characterTemplateId.success)throw new AppError('VALIDATION_ERROR','Choose a companion whose routine you want to view.',400);
      const{data:template,error:templateError}=await db.from('together_character_templates')
        .select('id,current_published_version,published,can_be_selected,creator_id,visibility,lifecycle_status')
        .eq('id',characterTemplateId.data).maybeSingle();
      const officialAvailable=Boolean(template?.published&&template?.can_be_selected);
      const privateCreation=Boolean(template?.creator_id===user.id&&template?.visibility==='private'&&['ready','published'].includes(String(template?.lifecycle_status)));
      if(templateError||!template||(!officialAvailable&&!privateCreation))throw new AppError('NOT_FOUND','That companion schedule is unavailable.',404);
      const{data:version,error:versionError}=await db.from('together_character_versions').select('id')
        .eq('character_template_id',template.id).eq('version',template.current_published_version).maybeSingle();
      if(versionError||!version)throw new AppError('NOT_FOUND','That companion schedule is unavailable.',404);
      const{data:schedules,error:scheduleError}=await db.from('together_schedule_templates').select('*')
        .eq('character_version_id',version.id).order('day_of_week').order('start_minute').limit(100);
      if(scheduleError)throw new AppError('INTERNAL_ERROR','That routine could not be loaded right now.',500,true);
      return json({data:{characterTemplateId:template.id,characterVersionId:version.id,schedules:schedules??[]},correlationId},200,correlationId);
    }
    const timezoneHeader=request.headers.get('x-kivelle-timezone');
    let requestedTimezone:string|null=null;
    if(timezoneHeader){try{new Intl.DateTimeFormat('en-US',{timeZone:timezoneHeader}).format(new Date());requestedTimezone=timezoneHeader;}catch{/* ignore malformed client timezone */}}
    return json({ data: await buildSnapshot(db, user.id, requestedTimezone), correlationId }, 200, correlationId);
  }
  const { user, db } = await authenticated(request);
  await enforceRateLimit(db, user.id, 'together_bootstrap', 20, 3600);
  const input = await parseBody(request, schema);
  const now = new Date().toISOString();
  if ('action' in input && input.action === 'confirm_age') {
    if(!isAtLeast18(input.dateOfBirth,new Date()))throw new AppError('FORBIDDEN','You must be 18 or older to use Kivelle.',403,false);
    await confirmAdultProfile(db, user, now,input.dateOfBirth);
    await track(db, user.id, 'adult_age_confirmed', { source: 'birthdate' });
    return json({data:await buildSnapshot(db,user.id),correlationId},201,correlationId);
  }

  const existingProfile=await db.from('together_profiles').select('user_id,age_verified_at').eq('user_id',user.id).maybeSingle();
  if(existingProfile.error)throw new AppError('INTERNAL_ERROR','Kivelle could not verify your account setup.',500,true);
  if(!existingProfile.data?.age_verified_at)throw new AppError('CONFLICT','Confirm that you are 18 or older before choosing a companion.',409);
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
  const profileUpdates:Record<string,unknown>={interests:input.interests,experience_goals:input.goals,experience_timezone:experienceTimezone,onboarding_completed_at:now,updated_at:now};
  if(input.displayName)profileUpdates.display_name=input.displayName;
  const{error:profileError}=await db.from('together_profiles').update(profileUpdates).eq('user_id',user.id).not('age_verified_at','is',null);
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

async function confirmAdultProfile(db:SupabaseClient,user:{id:string;email?:string|null;user_metadata?:Record<string,unknown>},now:string,dateOfBirth:string){
  const existing=await db.from('together_profiles').select('user_id,age_verified_at,content_preferences').eq('user_id',user.id).maybeSingle();
  if(existing.error)throw new AppError('INTERNAL_ERROR','Kivelle could not confirm your age.',500,true);
  if(!existing.data){
    const metadata=user.user_metadata??{};
    const candidate=[metadata.display_name,metadata.full_name,metadata.name,user.email?.split('@')[0]].find((value)=>typeof value==='string'&&value.trim());
    const displayName=typeof candidate==='string'?candidate.trim().slice(0,50):'You';
    const created=await db.from('together_profiles').insert({user_id:user.id,display_name:displayName,date_of_birth:dateOfBirth,age_verified_at:now,adult_eligible_at:now,adult_eligibility_method:'self_declared_dob_v2',content_preferences:{contentMode:'explicit',romanceEnabled:true,matureContentEnabled:false,explicitContentEnabled:true,suggestiveMediaEnabled:false,nudityMediaEnabled:false,explicitMediaEnabled:false},onboarding_completed_at:null,updated_at:now});
    if(created.error&&!/duplicate|unique/i.test(created.error.message))throw new AppError('INTERNAL_ERROR','Kivelle could not confirm your age.',500,true);
  }else{
    const contentPreferences={...((existing.data.content_preferences??{}) as Record<string,unknown>),contentMode:'explicit',explicitContentEnabled:true};
    const updated=await db.from('together_profiles').update({date_of_birth:dateOfBirth,age_verified_at:existing.data.age_verified_at??now,adult_eligible_at:now,adult_eligibility_method:'self_declared_dob_v2',content_preferences:contentPreferences,updated_at:now}).eq('user_id',user.id);
    if(updated.error)throw new AppError('INTERNAL_ERROR','Kivelle could not confirm your age.',500,true);
  }
  // This field is analytics-only. Authorization remains tied to the authenticated
  // user and server-owned Kivelle profile, never editable user metadata.
  const metadata=user.user_metadata??{};
  if(metadata.signup_app!=='together')await db.auth.admin.updateUserById(user.id,{user_metadata:{...metadata,signup_app:'together'}});
}

async function unlockOnboardingWorlds(db:SupabaseClient,userId:string,visitedWorldId:string|null,now:string){
  const{data:freeWorlds}=await db.from('together_worlds').select('id').eq('published',true).eq('access_type','free');
  const worldIds=new Set((freeWorlds??[]).map((world:Record<string,unknown>)=>String(world.id)));
  if(visitedWorldId)worldIds.add(visitedWorldId);
  for(const worldId of worldIds)await db.from('together_user_worlds').upsert({user_id:userId,world_id:worldId,access_status:'unlocked',first_visited_at:worldId===visitedWorldId?now:null,last_visited_at:worldId===visitedWorldId?now:null,updated_at:now},{onConflict:'user_id,world_id',ignoreDuplicates:true});
}
