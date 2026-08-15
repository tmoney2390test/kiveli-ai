import {z} from 'zod';
import {authenticated,enforceRateLimit} from '../_shared/context.ts';
import {parseBody} from '../_shared/body.ts';
import {json,serve} from '../_shared/http.ts';
import {AppError} from '../_shared/types.ts';
import {buildSnapshot,track} from '../_shared/together.ts';
import {getActiveConversation} from '../_shared/together-conversation.ts';
import {activeContinuity} from '../_shared/together-continuity.ts';

const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('set_active'),characterInstanceId:z.string().uuid(),source:z.enum(['home_switcher','discover_profile','companion_manager']).default('home_switcher')}),
  z.object({action:z.literal('meet'),characterTemplateId:z.string().uuid(),source:z.enum(['onboarding','discover_profile']).default('discover_profile')}),
]);
const relationOne=(value:unknown):Record<string,unknown>|null=>{const row=Array.isArray(value)?value[0]:value;return row&&typeof row==='object'?row as Record<string,unknown>:null;};

serve(async(request,correlationId)=>{
  const{user,db}=await authenticated(request);
  await enforceRateLimit(db,user.id,'together_companion',30,3600);
  const input=await parseBody(request,schema);
  const now=new Date().toISOString();
  const continuity=await activeContinuity(db,user.id);

  if(input.action==='set_active'){
    const{data:target}=await db.from('together_character_instances').select('id,contact_added_at,introduced_at,together_character_templates(can_be_selected)').eq('id',input.characterInstanceId).eq('user_id',user.id).eq('continuity_id',continuity.id).maybeSingle();
    const selectable=Boolean(relationOne(target?.together_character_templates)?.can_be_selected);
    if(!target||!selectable||(!target.contact_added_at&&!target.introduced_at))throw new AppError('CONFLICT','Meet this companion before making them active.',409);
    const previous=continuity.active_companion_instance_id;
    const{error}=await db.from('together_continuities').update({active_companion_instance_id:target.id,updated_at:now}).eq('id',continuity.id).eq('user_id',user.id);
    if(error)throw new AppError('INTERNAL_ERROR','Your active companion could not be changed.',500,true);
    await db.from('together_profiles').update({active_companion_instance_id:target.id,updated_at:now}).eq('user_id',user.id);
    await getActiveConversation(db,user.id,target.id,true);
    await track(db,user.id,'active_companion_switched',{continuity_id:continuity.id,from_character_id:previous??null,to_character_id:target.id,source:input.source});
    return json({data:await buildSnapshot(db,user.id),correlationId},200,correlationId);
  }

  const{data:template}=await db.from('together_character_templates').select('*,together_character_versions(*)').eq('id',input.characterTemplateId).maybeSingle();
  const officialAvailable=Boolean(template?.published&&template?.can_be_selected);
  const privateCreation=Boolean(template?.creator_id===user.id&&template?.visibility==='private'&&['ready','published'].includes(String(template?.lifecycle_status)));
  if(!template||(!officialAvailable&&!privateCreation))throw new AppError('NOT_FOUND','That companion is not available to meet.',404);
  const version=(template.together_character_versions??[]).find((item:Record<string,unknown>)=>Number(item.version)===Number(template.current_published_version))??template.together_character_versions?.[0];
  if(!version)throw new AppError('INTERNAL_ERROR','This companion is missing a published identity.',500,true);
  let{data:instance}=await db.from('together_character_instances').select('*').eq('user_id',user.id).eq('continuity_id',continuity.id).eq('character_template_id',template.id).maybeSingle();
  if(!instance){
    const meeting=(template.first_meeting??{}) as Record<string,unknown>;
    let locationId=typeof meeting.location_id==='string'?meeting.location_id:null;
    if(locationId){const{data:valid}=await db.from('together_locations').select('id').eq('id',locationId).maybeSingle();if(!valid)locationId=null;}
    if(!locationId){const{data:presence}=await db.from('together_character_world_presence').select('home_location_id,together_worlds(default_arrival_location_id)').eq('character_version_id',version.id).neq('presence_type','unavailable').order('presence_type',{ascending:true}).limit(1).maybeSingle();locationId=presence?.home_location_id??relationOne(presence?.together_worlds)?.default_arrival_location_id??null;}
    if(!locationId)throw new AppError('CONFLICT','This companion does not have a published first-meeting place yet.',409);
    const created=await db.from('together_character_instances').insert({user_id:user.id,continuity_id:continuity.id,character_template_id:template.id,character_version_id:version.id,relationship_stage:'stranger',current_mood:String(meeting.mood??'curious'),current_location_id:locationId,current_activity:String(meeting.companion_activity??'meeting someone new'),current_energy:'medium',introduced_at:now,contact_added_at:now,metadata:{first_meeting_title:meeting.title??null},updated_at:now}).select('*').single();
    if(created.error||!created.data)throw new AppError('INTERNAL_ERROR','Your first meeting could not begin.',500,true);
    instance=created.data;
  }else{
    const updated=await db.from('together_character_instances').update({introduced_at:instance.introduced_at??now,contact_added_at:instance.contact_added_at??now,updated_at:now}).eq('id',instance.id).eq('user_id',user.id).select('*').single();
    if(updated.data)instance=updated.data;
  }
  await db.from('together_relationship_states').upsert({character_instance_id:instance.id,user_id:user.id},{onConflict:'character_instance_id',ignoreDuplicates:true});
  await Promise.all([db.from('together_continuities').update({active_companion_instance_id:instance.id,updated_at:now}).eq('id',continuity.id).eq('user_id',user.id),db.from('together_profiles').update({active_companion_instance_id:instance.id,updated_at:now}).eq('user_id',user.id)]);
  const conversation=await getActiveConversation(db,user.id,instance.id,true);
  const meeting=(template.first_meeting??{}) as Record<string,unknown>;
  if(conversation?.id&&typeof meeting.opening_line==='string'){
    const{count}=await db.from('together_messages').select('id',{count:'exact',head:true}).eq('conversation_id',conversation.id).eq('user_id',user.id);
    if(!count)await db.from('together_messages').insert({conversation_id:conversation.id,user_id:user.id,character_instance_id:instance.id,role:'assistant',content:meeting.opening_line,delivery_status:'complete'});
  }
  await track(db,user.id,'companion_selected',{continuity_id:continuity.id,character_template_id:template.id,character_instance_id:instance.id,source:input.source});
  await track(db,user.id,'first_meeting_started',{character_instance_id:instance.id,source:input.source});
  return json({data:await buildSnapshot(db,user.id),correlationId},201,correlationId);
});
