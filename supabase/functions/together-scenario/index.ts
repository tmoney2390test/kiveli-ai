import {z} from 'zod';
import {authenticated,enforceRateLimit} from '../_shared/context.ts';
import {parseBody} from '../_shared/body.ts';
import {json,serve} from '../_shared/http.ts';
import {AppError} from '../_shared/types.ts';
import {activeContinuity} from '../_shared/together-continuity.ts';
import {scenarioCatalog,scenarioSessionView,storylineFor} from '../_shared/scenario-catalog.ts';
import {assertLocationAccess,loadWorldProgress} from '../_shared/kivelle-world-progress.ts';
import {resolveWorldAccess} from '../_shared/together-place.ts';
import {requireAiDataConsent} from '../_shared/kivelle-ai-consent.ts';
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('list')}),
 z.object({action:z.literal('start'),scenarioId:z.string().max(110),conversationId:z.string().uuid(),characterInstanceId:z.string().uuid(),continuityId:z.string().uuid()}),
 z.object({action:z.literal('pause'),sessionId:z.string().uuid(),revision:z.number().int().nonnegative()}),
 z.object({action:z.literal('complete'),sessionId:z.string().uuid(),revision:z.number().int().nonnegative()}),
 z.object({action:z.literal('checkpoint'),sessionId:z.string().uuid(),revision:z.number().int().nonnegative(),requestId:z.string().uuid(),note:z.string().trim().min(10).max(600)}),
]);
serve(async(request,correlationId)=>{
 const {user,db}=await authenticated(request),input=await parseBody(request,schema),continuity=await activeContinuity(db,user.id);
 await enforceRateLimit(db,user.id,'together_scenario',120,3600);
 if(input.action==='list'){
  const {data,error}=await db.from('together_scenario_sessions').select('*').eq('user_id',user.id).eq('continuity_id',continuity.id).order('updated_at',{ascending:false});
  if(error)throw new AppError('INTERNAL_ERROR','Scenarios could not be loaded.',500,true);
  return json({data:{sessions:(data??[]).map(scenarioSessionView)},correlationId},200,correlationId);
 }
 if(input.action!=='start'){
  const {data:session,error:readError}=await db.from('together_scenario_sessions').select('*').eq('id',input.sessionId).eq('user_id',user.id).eq('continuity_id',continuity.id).maybeSingle();
  if(readError)throw new AppError('INTERNAL_ERROR','Your story could not be loaded.',500,true);
  if(!session)throw new AppError('NOT_FOUND','That scenario is unavailable.',404);
  const story=storylineFor(session.scenario_id);
  if(input.action==='checkpoint'){
   if(!story)throw new AppError('VALIDATION_ERROR','This scenario has no chapter checkpoints.',400);
   const {data,error}=await db.rpc('together_scenario_checkpoint',{p_user:user.id,p_continuity:continuity.id,p_session:session.id,p_request:input.requestId,p_revision:input.revision,p_note:input.note,p_chapter_count:story.chapters.length});
   if(error)throw new AppError('CONFLICT',error.message.includes('WAIT_FOR_REPLY')?'Wait for the current reply to finish before saving this chapter.':error.message.includes('PLAY_CHAPTER_FIRST')?'Play this chapter in the conversation before saving its outcome.':'Your story changed. Reopen the chapter controls and try again.',409,false);
   return json({data:scenarioSessionView(data),correlationId},200,correlationId);
  }
  if(input.action==='complete'&&story)throw new AppError('VALIDATION_ERROR','Save the final chapter outcome to complete this storyline.',400);
  const {data,error}=await db.from('together_scenario_sessions').update({status:input.action==='pause'?'paused':'completed',updated_at:new Date().toISOString()}).eq('id',session.id).eq('user_id',user.id).eq('continuity_id',continuity.id).eq('revision',input.revision).select('*').maybeSingle();
  if(error||!data)throw new AppError('CONFLICT','Your story changed. Reopen the controls and try again.',409,false);
  return json({data:scenarioSessionView(data),correlationId},200,correlationId);
 }
 if(input.continuityId!==continuity.id)throw new AppError('CONFLICT','Your Life changed. Reopen Scenarios in your current Life.',409);
 await requireAiDataConsent(db,user.id);
 const scenario=scenarioCatalog.find(s=>s.id===input.scenarioId);
 if(!scenario)throw new AppError('NOT_FOUND','That scenario is unavailable.',404);
 const [{data:profile},{data:template},{data:location},{data:world}]=await Promise.all([
  db.from('together_profiles').select('age_verified_at').eq('user_id',user.id).maybeSingle(),
  db.from('together_character_templates').select('published,can_be_selected').eq('id',scenario.characterTemplateId).maybeSingle(),
  db.from('together_locations').select('id,world_id,access_metadata').eq('id',scenario.locationId).maybeSingle(),
  db.from('together_worlds').select('published').eq('id',scenario.worldId).maybeSingle(),
 ]);
 if(!profile?.age_verified_at)throw new AppError('FORBIDDEN','Confirm your age before starting a scenario.',403);
 if(!template?.published||!template.can_be_selected||!world?.published||!location||location.world_id!==scenario.worldId)throw new AppError('NOT_FOUND','That scenario is unavailable.',404);
 if(await resolveWorldAccess({db,userId:user.id,worldId:scenario.worldId})==='locked')throw new AppError('FORBIDDEN','Unlock this world in Membership to start its scenarios.',403);
 await assertLocationAccess(db,user.id,location);
 if(scenario.requiredState){const {state}=await loadWorldProgress(db,user.id,scenario.worldId,continuity.id);if(!(state.flags??[]).includes(scenario.requiredState))throw new AppError('NOT_FOUND','Discover this story through its world first.',404);}
 if(storylineFor(scenario.id)){
  const {data:finished}=await db.from('together_scenario_sessions').select('*').eq('user_id',user.id).eq('continuity_id',continuity.id).eq('scenario_id',scenario.id).eq('status','completed').maybeSingle();
  if(finished){if(finished.conversation_id!==input.conversationId||finished.character_instance_id!==input.characterInstanceId)throw new AppError('CONFLICT','Read this story from its saved conversation.',409);return json({data:scenarioSessionView(finished),correlationId},200,correlationId);}
 }
 const opening=[scenario.title,scenario.setup,scenario.opening].filter(Boolean).join('\n\n');
 const {data,error}=await db.rpc('together_start_scenario',{p_user:user.id,p_continuity:continuity.id,p_conversation:input.conversationId,p_character:input.characterInstanceId,p_template:scenario.characterTemplateId,p_scenario:scenario.id,p_opening:opening});
 if(error)throw new AppError('CONFLICT','This scenario could not start in that conversation. Reopen it from Scenarios and try again.',409,false);
 return json({data:scenarioSessionView(data),correlationId},200,correlationId);
});
