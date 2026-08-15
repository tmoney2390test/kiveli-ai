import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { activeContinuity, continuityById } from '../_shared/together-continuity.ts';
import { buildSnapshot, track } from '../_shared/together.ts';
import { enforceLifeLimit, resolveSubscriptionState } from '../_shared/kivelle-subscription.ts';

const personaFields={displayName:z.string().trim().min(1).max(50),pronouns:z.string().trim().max(40).nullable().optional(),age:z.number().int().min(18).max(120).nullable().optional(),occupation:z.string().trim().max(100).nullable().optional(),biography:z.string().trim().max(1000).nullable().optional(),interests:z.array(z.string().trim().min(1).max(40)).max(12).default([]),communicationConfig:z.record(z.string(),z.unknown()).default({}),metadata:z.record(z.string(),z.unknown()).default({})};
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('create'),...personaFields}),
  z.object({action:z.literal('update'),personaId:z.string().uuid(),displayName:z.string().trim().min(1).max(50).optional(),pronouns:z.string().trim().max(40).nullable().optional(),age:z.number().int().min(18).max(120).nullable().optional(),occupation:z.string().trim().max(100).nullable().optional(),biography:z.string().trim().max(1000).nullable().optional(),interests:z.array(z.string().trim().min(1).max(40)).max(12).optional(),communicationConfig:z.record(z.string(),z.unknown()).optional(),metadata:z.record(z.string(),z.unknown()).optional()}),
  z.object({action:z.literal('start_life'),personaId:z.string().uuid(),title:z.string().trim().min(1).max(80).optional()}),
  z.object({action:z.literal('switch_life'),continuityId:z.string().uuid()}),
  z.object({action:z.literal('delete_life'),continuityId:z.string().uuid(),confirmation:z.literal('DELETE LIFE')}),
  z.object({action:z.literal('delete_persona'),personaId:z.string().uuid(),confirmation:z.literal('DELETE PERSONA')}),
]);

serve(async(request,correlationId)=>{
  const{user,db}=await authenticated(request);const input=await parseBody(request,schema);await enforceRateLimit(db,user.id,`together_persona_${input.action}`,30,3600);const now=new Date().toISOString();
  if(input.action==='create'){
    const{data,error}=await db.from('together_user_personas').insert({user_id:user.id,name:input.displayName,display_name:input.displayName,pronouns:input.pronouns??null,age:input.age??null,occupation:input.occupation??null,biography:input.biography??null,interests:input.interests,communication_config:input.communicationConfig,metadata:input.metadata,is_default:false}).select('*').single();if(error||!data)throw new AppError('INTERNAL_ERROR','Your Persona could not be created.',500,true);await track(db,user.id,'persona_created',{persona_id:data.id});return json({data,correlationId},201,correlationId);
  }
  if(input.action==='update'){
    const changes:Record<string,unknown>={updated_at:now};if(input.displayName!==undefined){changes.display_name=input.displayName;changes.name=input.displayName;}if(input.pronouns!==undefined)changes.pronouns=input.pronouns;if(input.age!==undefined)changes.age=input.age;if(input.occupation!==undefined)changes.occupation=input.occupation;if(input.biography!==undefined)changes.biography=input.biography;if(input.interests!==undefined)changes.interests=input.interests;if(input.communicationConfig!==undefined)changes.communication_config=input.communicationConfig;if(input.metadata!==undefined)changes.metadata=input.metadata;
    const{data,error}=await db.from('together_user_personas').update(changes).eq('id',input.personaId).eq('user_id',user.id).select('*').single();if(error||!data)throw new AppError('NOT_FOUND','That Persona could not be updated.',404);await track(db,user.id,'persona_updated',{persona_id:data.id});return json({data,correlationId},200,correlationId);
  }
  if(input.action==='start_life'){
    const subscription=await resolveSubscriptionState(db,user.id);await enforceLifeLimit(db,user.id,subscription.capabilities);
    const{data:persona}=await db.from('together_user_personas').select('*').eq('id',input.personaId).eq('user_id',user.id).maybeSingle();if(!persona)throw new AppError('NOT_FOUND','That Persona is unavailable.',404);
    const{data,error}=await db.from('together_continuities').insert({user_id:user.id,persona_id:persona.id,kind:'alternate',title:input.title??`${persona.display_name}'s Life`,metadata:{createdFrom:'persona_picker',contextVersion:1}}).select('*,together_user_personas(*)').single();if(error||!data)throw new AppError('INTERNAL_ERROR','That Alternate Life could not be started.',500,true);await db.from('together_profiles').update({active_continuity_id:data.id,active_companion_instance_id:null,updated_at:now}).eq('user_id',user.id);await track(db,user.id,'alternate_life_created',{continuity_id:data.id,persona_id:persona.id,tier:subscription.tier});return json({data:await buildSnapshot(db,user.id),correlationId},201,correlationId);
  }
  if(input.action==='switch_life'){
    const continuity=await continuityById(db,user.id,input.continuityId);if(!continuity)throw new AppError('NOT_FOUND','That Kivelle Life is unavailable.',404);await db.from('together_profiles').update({active_continuity_id:continuity.id,active_companion_instance_id:continuity.active_companion_instance_id??null,updated_at:now}).eq('user_id',user.id);await track(db,user.id,'continuity_switched',{continuity_id:continuity.id,kind:continuity.kind});return json({data:await buildSnapshot(db,user.id),correlationId},200,correlationId);
  }
  if(input.action==='delete_life'){
    const current=await activeContinuity(db,user.id),target=await continuityById(db,user.id,input.continuityId);if(!target)throw new AppError('NOT_FOUND','That Kivelle Life is unavailable.',404);if(target.kind==='main')throw new AppError('CONFLICT','Main Life cannot be deleted.',409);
    const{data:media}=await db.from('together_generated_media').select('storage_path').eq('user_id',user.id).eq('continuity_id',target.id).not('storage_path','is',null);if(media?.length)await db.from('together_storage_cleanup_jobs').insert(media.map((item)=>({user_id:user.id,bucket_id:'together-user-media',storage_path:item.storage_path})));
    const{error}=await db.from('together_continuities').delete().eq('id',target.id).eq('user_id',user.id).eq('kind','alternate');if(error)throw new AppError('INTERNAL_ERROR','That Alternate Life could not be deleted.',500,true);if(current.id===target.id){const{data:main}=await db.from('together_continuities').select('id,active_companion_instance_id').eq('user_id',user.id).eq('kind','main').single();await db.from('together_profiles').update({active_continuity_id:main?.id??null,active_companion_instance_id:main?.active_companion_instance_id??null,updated_at:now}).eq('user_id',user.id);}await track(db,user.id,'alternate_life_deleted',{continuity_id:target.id});return json({data:await buildSnapshot(db,user.id),correlationId},200,correlationId);
  }
  const{data:persona}=await db.from('together_user_personas').select('id,is_default').eq('id',input.personaId).eq('user_id',user.id).maybeSingle();if(!persona)throw new AppError('NOT_FOUND','That Persona is unavailable.',404);if(persona.is_default)throw new AppError('CONFLICT','Your Main Persona cannot be deleted.',409);const{count}=await db.from('together_continuities').select('id',{count:'exact',head:true}).eq('persona_id',persona.id).eq('user_id',user.id);if((count??0)>0)throw new AppError('CONFLICT','Delete this Persona\'s Alternate Lives first.',409);await db.from('together_user_personas').delete().eq('id',persona.id).eq('user_id',user.id);await track(db,user.id,'persona_deleted',{persona_id:persona.id});return json({data:{deleted:true},correlationId},200,correlationId);
});
