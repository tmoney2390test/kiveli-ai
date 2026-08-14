import {z} from 'zod';
import {authenticated,enforceRateLimit} from '../_shared/context.ts';
import {parseBody} from '../_shared/body.ts';
import {json,serve} from '../_shared/http.ts';
import {AppError} from '../_shared/types.ts';
import {buildSnapshot,TOGETHER_IDS,track} from '../_shared/together.ts';
import {getActiveConversation} from '../_shared/together-conversation.ts';

const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('set_active'),characterInstanceId:z.string().uuid(),source:z.enum(['home_switcher','discover_profile','companion_manager']).default('home_switcher')}),
  z.object({action:z.literal('meet'),characterTemplateId:z.string().uuid(),source:z.enum(['onboarding','discover_profile']).default('discover_profile')}),
]);

serve(async(request,correlationId)=>{
  const{user,db}=await authenticated(request);
  await enforceRateLimit(db,user.id,'together_companion',30,3600);
  const input=await parseBody(request,schema);
  const now=new Date().toISOString();

  if(input.action==='set_active'){
    const{data:target}=await db.from('together_character_instances').select('id,contact_added_at,introduced_at,together_character_templates(can_be_selected)').eq('id',input.characterInstanceId).eq('user_id',user.id).maybeSingle();
    const selectable=Boolean((target?.together_character_templates as Record<string,unknown>|null)?.can_be_selected);
    if(!target||!selectable||(!target.contact_added_at&&!target.introduced_at))throw new AppError('CONFLICT','Meet this companion before making them active.',409);
    const{data:profile}=await db.from('together_profiles').select('active_companion_instance_id').eq('user_id',user.id).maybeSingle();
    const{error}=await db.from('together_profiles').update({active_companion_instance_id:target.id,updated_at:now}).eq('user_id',user.id);
    if(error)throw new AppError('INTERNAL_ERROR','Your active companion could not be changed.',500,true);
    await getActiveConversation(db,user.id,target.id,true);
    await track(db,user.id,'active_companion_switched',{from_character_id:profile?.active_companion_instance_id??null,to_character_id:target.id,source:input.source});
    return json({data:await buildSnapshot(db,user.id),correlationId},200,correlationId);
  }

  const{data:template}=await db.from('together_character_templates').select('*,together_character_versions(*)').eq('id',input.characterTemplateId).eq('published',true).eq('can_be_selected',true).maybeSingle();
  if(!template)throw new AppError('NOT_FOUND','That companion is not available to meet.',404);
  const version=(template.together_character_versions??[]).find((item:Record<string,unknown>)=>Number(item.version)===Number(template.current_published_version))??template.together_character_versions?.[0];
  if(!version)throw new AppError('INTERNAL_ERROR','This companion is missing a published identity.',500,true);
  let{data:instance}=await db.from('together_character_instances').select('*').eq('user_id',user.id).eq('character_template_id',template.id).maybeSingle();
  if(!instance){
    const created=await db.from('together_character_instances').insert({user_id:user.id,character_template_id:template.id,character_version_id:version.id,relationship_stage:'stranger',current_mood:'curious',current_location_id:TOGETHER_IDS.juniper,current_activity:'spending time at Juniper Café',current_energy:'medium',introduced_at:now,contact_added_at:now,updated_at:now}).select('*').single();
    if(created.error||!created.data)throw new AppError('INTERNAL_ERROR','Your first meeting could not begin.',500,true);
    instance=created.data;
  }else{
    const updated=await db.from('together_character_instances').update({introduced_at:instance.introduced_at??now,contact_added_at:instance.contact_added_at??now,updated_at:now}).eq('id',instance.id).eq('user_id',user.id).select('*').single();
    if(updated.data)instance=updated.data;
  }
  await db.from('together_relationship_states').upsert({character_instance_id:instance.id,user_id:user.id},{onConflict:'character_instance_id',ignoreDuplicates:true});
  await db.from('together_profiles').update({active_companion_instance_id:instance.id,updated_at:now}).eq('user_id',user.id);
  await getActiveConversation(db,user.id,instance.id,true);
  const{data:dateTemplates}=await db.from('together_date_templates').select('id').eq('active',true);
  for(const dateTemplate of dateTemplates??[])await db.from('together_date_sessions').upsert({user_id:user.id,character_instance_id:instance.id,date_template_id:dateTemplate.id,status:'locked'},{onConflict:'user_id,character_instance_id,date_template_id',ignoreDuplicates:true});
  await track(db,user.id,'companion_selected',{character_template_id:template.id,character_instance_id:instance.id,source:input.source});
  await track(db,user.id,'first_meeting_started',{character_instance_id:instance.id,source:input.source});
  return json({data:await buildSnapshot(db,user.id),correlationId},201,correlationId);
});
