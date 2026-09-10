import {z} from 'zod';
import {resolveCharacterPresence} from '../_shared/together-schedule.ts';
import {authenticated,enforceRateLimit} from '../_shared/context.ts';
import {parseBody} from '../_shared/body.ts';
import {json,serve} from '../_shared/http.ts';
import {AppError} from '../_shared/types.ts';
import {activeContinuity} from '../_shared/together-continuity.ts';
import scenarioCatalog from '../../../content/scenarios/runtime-catalog.json' with {type:'json'};
import {assertLocationAccess,loadWorldProgress} from '../_shared/kivelle-world-progress.ts';
import {requireAiDataConsent} from '../_shared/kivelle-ai-consent.ts';

const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('list')}),
  z.object({action:z.literal('start'),scenarioId:z.string(),conversationId:z.string().uuid(),characterInstanceId:z.string().uuid()}),
  z.object({action:z.literal('pause'),sessionId:z.string().uuid()}),
  z.object({action:z.literal('complete'),sessionId:z.string().uuid()}),
]);
serve(async(request,correlationId)=>{
 const {user,db}=await authenticated(request),input=await parseBody(request,schema),continuity=await activeContinuity(db,user.id);
 await enforceRateLimit(db,user.id,'together_scenario',120,3600);
 if(input.action==='list'){
  const {data,error}=await db.from('together_scenario_sessions').select('*').eq('user_id',user.id).eq('continuity_id',continuity.id).order('updated_at',{ascending:false});
  if(error)throw new AppError('INTERNAL_ERROR','Scenarios could not be loaded.',500,true);
  return json({data:{sessions:data??[]},correlationId},200,correlationId);
 }
 if(input.action==='pause'||input.action==='complete'){
  const {data,error}=await db.from('together_scenario_sessions').update({status:input.action==='pause'?'paused':'completed',updated_at:new Date().toISOString()}).eq('id',input.sessionId).eq('user_id',user.id).eq('continuity_id',continuity.id).select('*').maybeSingle();
  if(error)throw new AppError('INTERNAL_ERROR','Your scenario could not be saved.',500,true);
  if(!data)throw new AppError('NOT_FOUND','That scenario is unavailable.',404);
  const presence=await resolveCharacterPresence({db,userId:user.id,characterInstanceId:String(data.character_instance_id),ensure:false});
  if(presence&&presence.source!=='scenario')await db.from('together_character_instances').update({current_location_id:presence.locationId,current_activity:presence.activity,current_presence_source:presence.source,current_interruptibility:presence.interruptibility}).eq('id',data.character_instance_id).eq('user_id',user.id);
  return json({data,correlationId},200,correlationId);
 }
 await requireAiDataConsent(db,user.id);
 const scenario=scenarioCatalog.find(item=>item.id===input.scenarioId);
 if(!scenario)throw new AppError('NOT_FOUND','That scenario is unavailable.',404);
 const [{data:profile},{data:template},{data:location},{data:world}]=await Promise.all([
  db.from('together_profiles').select('age_verified_at').eq('user_id',user.id).maybeSingle(),
  db.from('together_character_templates').select('published,can_be_selected').eq('id',scenario.characterTemplateId).maybeSingle(),
  db.from('together_locations').select('id,world_id,access_metadata').eq('id',scenario.locationId).maybeSingle(),
  db.from('together_worlds').select('published').eq('id',scenario.worldId).maybeSingle(),
 ]);
 if(!profile?.age_verified_at)throw new AppError('FORBIDDEN','Confirm your age before starting a scenario.',403);
 if(!template?.published||!template.can_be_selected||!world?.published||!location||location.world_id!==scenario.worldId)throw new AppError('NOT_FOUND','That scenario is unavailable.',404);
 await assertLocationAccess(db,user.id,location);
 if(scenario.requiredState){const {state}=await loadWorldProgress(db,user.id,scenario.worldId,continuity.id);if(!(state.flags??[]).includes(scenario.requiredState))throw new AppError('NOT_FOUND','Meet this companion through their world story first.',404);}
 const {data,error}=await db.rpc('together_start_scenario',{p_user:user.id,p_continuity:continuity.id,p_conversation:input.conversationId,p_character:input.characterInstanceId,p_template:scenario.characterTemplateId,p_scenario:scenario.id,p_opening:`${scenario.title}\n\n${scenario.setup}\n\n“${scenario.opening}”`});
 if(error)throw new AppError('CONFLICT','This scenario could not start in that conversation. Reopen it from Scenarios and try again.',409,true);
 return json({data,correlationId},200,correlationId);
});
