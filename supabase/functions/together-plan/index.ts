import { z } from 'zod';
import { resolveQuickPlanTiming } from '../../../packages/together-domain/src/commitments.ts';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { activeContinuity } from '../_shared/together-continuity.ts';
import { createWindowedCommitment, explainMissedCommitment, joinCommitment, leaveCommitment, loadCommitmentState } from '../_shared/together-commitments.ts';
import { beginPlanExperience, finalizeExpiredPlanExperience, loadPlanExperience, reconcileCompletedPlanExperience, wrapPlanExperience } from '../_shared/together-plan-experience.ts';
import { cancelSharedPlan, createSharedPlan, focusConversationOnPlan, rescheduleSharedPlan, updateSharedPlan, writeConversationEvent } from '../_shared/together-plans.ts';
import { track } from '../_shared/together.ts';

const source=z.enum(['chat','manual_planner','location','discover','date','story']);
const precision=z.enum(['exact','approximate','daypart','window','day']);
const participation=z.enum(['live','flexible','ambient']);
const timingChoice=z.enum(['now','in_one_hour','custom']);
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('create'),characterInstanceId:z.string().uuid(),activityKey:z.string().trim().min(1).max(120),locationId:z.string().uuid(),startsAt:z.string().datetime().optional(),timingChoice:timingChoice.optional(),windowStartsAt:z.string().datetime().optional(),windowEndsAt:z.string().datetime().optional(),timePrecision:precision.optional(),originalTimeExpression:z.string().trim().max(160).optional(),participationMode:participation.optional(),note:z.string().trim().max(1000).optional(),source,sourceConversationId:z.string().uuid().optional(),sourceMessageId:z.string().uuid().optional(),requestId:z.string().min(8).max(100),title:z.string().trim().max(160).optional(),durationMinutes:z.number().int().min(30).max(360).optional()}),
  z.object({action:z.literal('switch'),currentPlanId:z.string().uuid(),characterInstanceId:z.string().uuid(),activityKey:z.string().trim().min(1).max(120),locationId:z.string().uuid(),sourceConversationId:z.string().uuid(),requestId:z.string().min(8).max(100),title:z.string().trim().max(160).optional(),durationMinutes:z.number().int().min(30).max(360).optional(),sceneId:z.string().uuid().optional()}),
  z.object({action:z.literal('reschedule'),planId:z.string().uuid(),startsAt:z.string().datetime().optional(),windowStartsAt:z.string().datetime().optional(),windowEndsAt:z.string().datetime().optional(),timePrecision:precision.optional(),originalTimeExpression:z.string().trim().max(160).optional(),conversationId:z.string().uuid().optional()}),
  z.object({action:z.literal('cancel'),planId:z.string().uuid(),conversationId:z.string().uuid().optional()}),
  z.object({action:z.literal('update'),planId:z.string().uuid(),note:z.string().trim().max(1000).optional(),locationId:z.string().uuid().optional(),activityKey:z.string().trim().max(120).optional(),conversationId:z.string().uuid().optional()}),
  z.object({action:z.literal('join'),planId:z.string().uuid(),characterInstanceId:z.string().uuid(),requestId:z.string().min(8).max(120).optional()}),
  z.object({action:z.literal('leave'),planId:z.string().uuid(),requestId:z.string().min(8).max(120).optional()}),
  z.object({action:z.literal('experience'),planId:z.string().uuid(),characterInstanceId:z.string().uuid()}),
  z.object({action:z.literal('end'),planId:z.string().uuid(),characterInstanceId:z.string().uuid(),requestId:z.string().min(8).max(120),sceneId:z.string().uuid().optional()}),
  z.object({action:z.literal('wrap_up'),planId:z.string().uuid(),characterInstanceId:z.string().uuid(),requestId:z.string().min(8).max(120),sceneId:z.string().uuid().optional()}),
  z.object({action:z.literal('explain_miss'),planId:z.string().uuid(),characterInstanceId:z.string().uuid(),explanation:z.string().trim().min(2).max(2000),conversationId:z.string().uuid().optional()}),
  z.object({action:z.literal('list'),characterInstanceId:z.string().uuid().optional(),includeCancelled:z.boolean().optional()}),
  z.object({action:z.literal('get'),planId:z.string().uuid()}),
  z.object({action:z.literal('confirm_proposal'),candidateId:z.string().uuid(),startsAt:z.string().datetime().optional(),timingChoice:timingChoice.optional(),windowStartsAt:z.string().datetime().optional(),windowEndsAt:z.string().datetime().optional(),timePrecision:precision.optional(),originalTimeExpression:z.string().trim().max(160).optional(),activityKey:z.string().trim().max(120).optional(),locationId:z.string().uuid().optional(),planId:z.string().uuid().optional()}),
  z.object({action:z.literal('dismiss_proposal'),candidateId:z.string().uuid()}),
]);

serve(async(request,correlationId)=>{
  const{user,db}=await authenticated(request);
  await enforceRateLimit(db,user.id,'together_plan',80,3600);
  const input=await parseBody(request,schema);
  const continuity=await activeContinuity(db,user.id);
  const userTimezone=request.headers.get('x-kivelle-timezone')??'UTC';

  if(input.action==='list'){
    let query=db.from('together_shared_plans').select('*,together_locations(id,name,slug),together_plan_attendance(*),together_missed_plan_resolutions(*)').eq('user_id',user.id).eq('continuity_id',continuity.id).order('starts_at',{ascending:true,nullsFirst:false}).order('created_at');
    if(input.characterInstanceId)query=query.eq('character_instance_id',input.characterInstanceId);
    if(!input.includeCancelled)query=query.neq('status','cancelled');
    const{data,error}=await query;if(error)throw new AppError('INTERNAL_ERROR','Plans could not be loaded.',500,true);
    return json({data:data??[],correlationId},200,correlationId);
  }
  if(input.action==='get')return json({data:await loadCommitmentState(db,user.id,input.planId),correlationId},200,correlationId);
  if(input.action==='join')return json({data:await joinCommitment(db,{userId:user.id,continuityId:continuity.id,characterInstanceId:input.characterInstanceId,planId:input.planId,requestId:input.requestId}),correlationId},200,correlationId);
  if(input.action==='leave')return json({data:await leaveCommitment(db,{userId:user.id,continuityId:continuity.id,planId:input.planId,requestId:input.requestId}),correlationId},200,correlationId);
  if(input.action==='experience'){
    const experience=await loadPlanExperience({db,userId:user.id,continuityId:continuity.id,characterInstanceId:input.characterInstanceId,planId:input.planId});
    const data=['scheduled','active'].includes(String(experience.plan.status))&&experience.plan.ends_at&&new Date(experience.plan.ends_at).getTime()<=Date.now()&&!['date'].includes(String(experience.plan.source))
      ? await finalizeExpiredPlanExperience({db,userId:user.id,continuityId:continuity.id,characterInstanceId:input.characterInstanceId,planId:input.planId})
      : experience;
    return json({data,correlationId},200,correlationId);
  }
  if(input.action==='wrap_up'||input.action==='end')return json({data:await wrapPlanExperience({db,userId:user.id,continuityId:continuity.id,characterInstanceId:input.characterInstanceId,planId:input.planId,requestId:input.requestId,sceneId:input.sceneId}),correlationId},200,correlationId);
  if(input.action==='explain_miss')return json({data:await explainMissedCommitment(db,{userId:user.id,continuityId:continuity.id,characterInstanceId:input.characterInstanceId,planId:input.planId,explanation:input.explanation,conversationId:input.conversationId}),correlationId},200,correlationId);

  if(input.action==='switch'){
    const now=new Date();
    const currentExperience=await loadPlanExperience({db,userId:user.id,continuityId:continuity.id,characterInstanceId:input.characterInstanceId,planId:input.currentPlanId,now});
    if(String(currentExperience.plan.source)==='date')throw new AppError('CONFLICT','Return to the Date to change or end this experience.',409,true);
    const{data:conversation}=await db.from('together_conversations').select('id').eq('id',input.sourceConversationId).eq('user_id',user.id).eq('continuity_id',continuity.id).eq('character_instance_id',input.characterInstanceId).is('archived_at',null).maybeSingle();
    if(!conversation)throw new AppError('NOT_FOUND','That conversation is no longer available.',404);
    if(String(currentExperience.plan.location_id)===input.locationId&&String(currentExperience.plan.activity_key)===input.activityKey)throw new AppError('VALIDATION_FAILED','Choose a different activity or place before switching.',400);
    const staged=await createSharedPlan(db,{userId:user.id,characterInstanceId:input.characterInstanceId,activityKey:input.activityKey,locationId:input.locationId,startsAt:now.toISOString(),source:'chat',sourceConversationId:input.sourceConversationId,requestId:input.requestId,title:input.title,durationMinutes:input.durationMinutes,immediate:true,replacementPlanId:input.currentPlanId,deferSideEffects:true});
    if(staged.kind!=='shared_plan')throw new AppError('CONFLICT','A Date cannot replace an active shared plan from chat.',409,true);
    const replacementId=String(staged.commitment.id);
    let switched:Record<string,unknown>;
    try{
      const{data,error}=await db.rpc('kivelle_switch_plan_experience',{p_user_id:user.id,p_continuity_id:continuity.id,p_character_instance_id:input.characterInstanceId,p_from_plan_id:input.currentPlanId,p_to_plan_id:replacementId,p_scene_id:input.sceneId??null,p_request_id:input.requestId,p_now:now.toISOString()});
      if(error)throw error;
      switched=(data??{}) as Record<string,unknown>;
    }catch(error){
      await db.from('together_shared_plans').delete().eq('id',replacementId).eq('user_id',user.id).eq('continuity_id',continuity.id).eq('status','scheduled').eq('metadata->>replacesPlanId',input.currentPlanId);
      console.error('Plan switch failed',{currentPlanId:input.currentPlanId,replacementPlanId:replacementId,code:(error as{code?:string})?.code});
      throw new AppError('CONFLICT','The current plan could not be changed safely. It is still active.',409,true);
    }
    const finish=switched.finish&&typeof switched.finish==='object'?switched.finish as Record<string,unknown>:null;
    const previousSceneId=typeof finish?.sceneId==='string'?finish.sceneId:input.sceneId;
    await reconcileCompletedPlanExperience({db,userId:user.id,continuityId:continuity.id,characterInstanceId:input.characterInstanceId,planId:input.currentPlanId,sceneId:previousSceneId,now}).catch((error)=>console.error('Switched plan history reconciliation failed',{planId:input.currentPlanId,code:(error as{code?:string})?.code}));
    let experience;
    try{experience=await beginPlanExperience({db,userId:user.id,continuityId:continuity.id,characterInstanceId:input.characterInstanceId,planId:replacementId,requestId:`${input.requestId}:sync`,source:'switch',now,quiet:true});}
    catch(error){console.error('Switched plan conversation synchronization failed',{planId:replacementId,code:(error as{code?:string})?.code});experience=await loadPlanExperience({db,userId:user.id,continuityId:continuity.id,characterInstanceId:input.characterInstanceId,planId:replacementId,now});}
    const{data:completionEvents}=await db.from('together_conversation_events').select('id,metadata').eq('user_id',user.id).eq('conversation_id',input.sourceConversationId).eq('entity_type','shared_plan').eq('entity_id',input.currentPlanId).eq('event_type','plan_completed');
    for(const event of completionEvents??[])await db.from('together_conversation_events').update({metadata:{...(event.metadata??{}),switchedToPlanId:replacementId,switchRequestId:input.requestId}}).eq('id',event.id).eq('user_id',user.id);
    const{data:existingSwitch}=await db.from('together_conversation_events').select('id').eq('user_id',user.id).eq('conversation_id',input.sourceConversationId).eq('event_type','plan_switched').eq('metadata->>switchRequestId',input.requestId).maybeSingle();
    if(!existingSwitch)await writeConversationEvent(db,{userId:user.id,characterInstanceId:input.characterInstanceId,conversationId:input.sourceConversationId,eventType:'plan_switched',entityType:'shared_plan',entityId:replacementId,metadata:{title:experience.plan.title,startsAt:experience.plan.starts_at,endsAt:experience.plan.ends_at,status:experience.plan.status,locationId:experience.plan.location_id,location:experience.plan.together_locations?.name??'Current place',activityKey:experience.plan.activity_key,previousPlanId:input.currentPlanId,previousTitle:currentExperience.plan.title,switchRequestId:input.requestId}});
    await focusConversationOnPlan(db,user.id,input.sourceConversationId,replacementId).catch(()=>undefined);
    await track(db,user.id,'plan_switched',{fromPlanId:input.currentPlanId,toPlanId:replacementId,characterInstanceId:input.characterInstanceId}).catch(()=>undefined);
    return json({data:{kind:'shared_plan',commitment:experience.plan,experience,previousPlanId:input.currentPlanId},correlationId},200,correlationId);
  }

  if(input.action==='create'){
    const resolvedStartsAt=resolveQuickPlanTiming(input.timingChoice,input.startsAt);
    if(resolvedStartsAt){
      const result=await createSharedPlan(db,{userId:user.id,characterInstanceId:input.characterInstanceId,activityKey:input.activityKey,locationId:input.locationId,startsAt:resolvedStartsAt,note:input.note,source:input.source,sourceConversationId:input.sourceConversationId,sourceMessageId:input.sourceMessageId,requestId:input.requestId,title:input.title,durationMinutes:input.durationMinutes,immediate:input.timingChoice==='now'});
      if(result.kind==='shared_plan'){
        const end=String(result.commitment.ends_at);
        const{error:updateError}=await db.from('together_shared_plans').update({time_precision:input.timePrecision??'exact',window_starts_at:input.windowStartsAt??resolvedStartsAt,window_ends_at:input.windowEndsAt??end,original_time_expression:input.originalTimeExpression??input.timingChoice??null,participation_mode:input.participationMode??'live',user_timezone:userTimezone,grace_ends_at:new Date(new Date(resolvedStartsAt).getTime()+30*60000).toISOString(),updated_at:new Date().toISOString()}).eq('id',result.commitment.id).eq('user_id',user.id).eq('continuity_id',continuity.id);
        if(updateError)throw new AppError('INTERNAL_ERROR','The plan was saved, but its timing could not be finalized. Try again.',500,true);
        if(input.timingChoice==='now'){
          const experience=await joinCommitment(db,{userId:user.id,continuityId:continuity.id,characterInstanceId:input.characterInstanceId,planId:String(result.commitment.id),requestId:`${input.requestId}:start`});
          return json({data:{...result,experience},correlationId},result.created?201:200,correlationId);
        }
      }
      return json({data:result,correlationId},result.created?201:200,correlationId);
    }
    if(!input.windowStartsAt||!input.windowEndsAt||!input.timePrecision||input.timePrecision==='exact')throw new AppError('VALIDATION_FAILED','Choose an exact time or a real planning window.',400);
    const commitment=await createWindowedCommitment(db,{userId:user.id,continuityId:continuity.id,characterInstanceId:input.characterInstanceId,activityKey:input.activityKey,locationId:input.locationId,windowStartsAt:input.windowStartsAt,windowEndsAt:input.windowEndsAt,timePrecision:input.timePrecision,originalTimeExpression:input.originalTimeExpression,note:input.note,source:input.source,sourceConversationId:input.sourceConversationId,sourceMessageId:input.sourceMessageId,requestId:input.requestId,title:input.title,participationMode:input.participationMode,userTimezone});
    return json({data:{kind:'shared_plan',commitment,created:true},correlationId},201,correlationId);
  }

  if(input.action==='reschedule'){
    if(input.startsAt){
      const result=await rescheduleSharedPlan(db,{userId:user.id,planId:input.planId,startsAt:input.startsAt,conversationId:input.conversationId});
      await db.from('together_shared_plans').update({time_precision:input.timePrecision??'exact',window_starts_at:input.windowStartsAt??input.startsAt,window_ends_at:input.windowEndsAt??result.ends_at,original_time_expression:input.originalTimeExpression??null,user_timezone:userTimezone,grace_ends_at:new Date(new Date(input.startsAt).getTime()+Number(result.grace_minutes??30)*60000).toISOString(),missed_at:null,miss_reason:null,updated_at:new Date().toISOString()}).eq('id',input.planId).eq('user_id',user.id).eq('continuity_id',continuity.id);
      return json({data:await loadCommitmentState(db,user.id,input.planId),correlationId},200,correlationId);
    }
    if(!input.windowStartsAt||!input.windowEndsAt||!input.timePrecision||input.timePrecision==='exact')throw new AppError('VALIDATION_FAILED','Choose a new exact time or planning window.',400);
    const{data:plan}=await db.from('together_shared_plans').select('*').eq('id',input.planId).eq('user_id',user.id).eq('continuity_id',continuity.id).maybeSingle();if(!plan)throw new AppError('NOT_FOUND','That plan could not be found.',404);if(!['proposed','scheduled'].includes(plan.status))throw new AppError('CONFLICT','That commitment cannot be rescheduled now.',409);
    const start=new Date(input.windowStartsAt),end=new Date(input.windowEndsAt);if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw new AppError('VALIDATION_FAILED','That planning window is invalid.',400);
    await db.from('together_shared_plans').update({status:'proposed',starts_at:null,ends_at:null,window_starts_at:start.toISOString(),window_ends_at:end.toISOString(),time_precision:input.timePrecision,original_time_expression:input.originalTimeExpression??null,user_timezone:userTimezone,grace_ends_at:null,missed_at:null,miss_reason:null,updated_at:new Date().toISOString()}).eq('id',plan.id).eq('user_id',user.id).eq('continuity_id',continuity.id);
    if(input.conversationId)await writeConversationEvent(db,{userId:user.id,characterInstanceId:plan.character_instance_id,conversationId:input.conversationId,eventType:'plan_rescheduled',entityType:'shared_plan',entityId:plan.id,metadata:{title:plan.title,status:'proposed',windowStartsAt:start.toISOString(),windowEndsAt:end.toISOString(),timePrecision:input.timePrecision}});
    return json({data:await loadCommitmentState(db,user.id,input.planId),correlationId},200,correlationId);
  }

  if(input.action==='update')return json({data:await updateSharedPlan(db,{userId:user.id,planId:input.planId,note:input.note,locationId:input.locationId,activityKey:input.activityKey,conversationId:input.conversationId}),correlationId},200,correlationId);
  if(input.action==='cancel')return json({data:await cancelSharedPlan(db,{userId:user.id,planId:input.planId,conversationId:input.conversationId}),correlationId},200,correlationId);

  const{data:candidate}=await db.from('together_conversation_actions').select('*').eq('id',input.candidateId).eq('user_id',user.id).eq('continuity_id',continuity.id).eq('status','pending').maybeSingle();
  if(!candidate)throw new AppError('NOT_FOUND','That suggestion is no longer available.',404);
  if(candidate.expires_at&&new Date(candidate.expires_at).getTime()<Date.now())throw new AppError('CONFLICT','That suggestion has expired.',409,true);
  if(input.action==='dismiss_proposal'){
    await db.from('together_conversation_actions').update({status:'dismissed',updated_at:new Date().toISOString()}).eq('id',candidate.id).eq('user_id',user.id);
    await db.from('together_conversation_events').update({metadata:{resolution:'dismissed'}}).eq('entity_type','conversation_action').eq('entity_id',candidate.id).eq('user_id',user.id);
    await track(db,user.id,'plan_proposal_dismissed',{candidateId:candidate.id});
    return json({data:{dismissed:true,candidateId:candidate.id},correlationId},200,correlationId);
  }

  const payload=(candidate.payload??{})as Record<string,unknown>;
  const timingStartsAt=resolveQuickPlanTiming(input.timingChoice,input.startsAt);
  let result:unknown;
  const targetType=String(payload.targetType??'plan');
  if(targetType==='date'&&['plan_cancel','cancel_plan','plan_reschedule','reschedule_plan'].includes(candidate.candidate_type)){
    const sessionId=input.planId??String(payload.planId??payload.targetId??'');
    const{data:session}=await db.from('together_date_sessions').select('*,together_date_templates(name,location_id)').eq('id',sessionId).eq('user_id',user.id).eq('continuity_id',continuity.id).eq('character_instance_id',candidate.character_instance_id).maybeSingle();
    if(!session)throw new AppError('NOT_FOUND','That date could not be found.',404);
    if(['plan_cancel','cancel_plan'].includes(candidate.candidate_type)){
      const{data,error}=await db.from('together_date_sessions').update({status:'deferred',scheduled_for:null,updated_at:new Date().toISOString(),state:{...(session.state??{}),cancelledViaChat:true}}).eq('id',session.id).eq('user_id',user.id).select('*').single();if(error)throw new AppError('INTERNAL_ERROR','That date could not be cancelled.',500,true);result=data;
      await writeConversationEvent(db,{userId:user.id,characterInstanceId:candidate.character_instance_id,conversationId:candidate.conversation_id,eventType:'plan_cancelled',entityType:'date_session',entityId:session.id,metadata:{title:session.together_date_templates?.name??'Date',status:'cancelled',commitmentType:'date'}});
    }else{
      const startsAt=timingStartsAt??(typeof payload.proposedStartsAt==='string'?payload.proposedStartsAt:undefined);if(!startsAt)throw new AppError('VALIDATION_FAILED','Choose an exact time for this Date before saving it.',400);const start=new Date(startsAt);if(input.timingChoice!=='now'&&start.getTime()<Date.now()+10*60000)throw new AppError('VALIDATION_FAILED','Choose a future time.',400);
      const{data:conflict}=await db.from('together_shared_plans').select('id,title').eq('user_id',user.id).eq('continuity_id',continuity.id).eq('character_instance_id',candidate.character_instance_id).in('status',['scheduled','active']).lt('starts_at',new Date(start.getTime()+3*3600000).toISOString()).gt('ends_at',start.toISOString()).limit(1).maybeSingle();if(conflict&&conflict.id!==session.shared_plan_id)throw new AppError('PLAN_CONFLICT',`You already have ${conflict.title} at that time.`,409,true);
      const{data,error}=await db.from('together_date_sessions').update({status:'upcoming',scheduled_for:start.toISOString(),updated_at:new Date().toISOString()}).eq('id',session.id).eq('user_id',user.id).select('*').single();if(error)throw new AppError('INTERNAL_ERROR','That date could not be rescheduled.',500,true);result=data;
      await writeConversationEvent(db,{userId:user.id,characterInstanceId:candidate.character_instance_id,conversationId:candidate.conversation_id,eventType:'plan_rescheduled',entityType:'date_session',entityId:session.id,metadata:{title:session.together_date_templates?.name??'Date',startsAt:start.toISOString(),locationId:session.together_date_templates?.location_id,commitmentType:'date'}});
    }
  }else if(['plan_cancel','cancel_plan'].includes(candidate.candidate_type)){
    const planId=input.planId??String(payload.planId??payload.targetId??'');if(!planId)throw new AppError('VALIDATION_FAILED','Choose which plan to cancel.',400);result=await cancelSharedPlan(db,{userId:user.id,planId,conversationId:candidate.conversation_id});
  }else if(['plan_reschedule','reschedule_plan'].includes(candidate.candidate_type)){
    const planId=input.planId??String(payload.planId??payload.targetId??'');const startsAt=timingStartsAt??(typeof payload.proposedStartsAt==='string'?payload.proposedStartsAt:undefined);if(!planId)throw new AppError('VALIDATION_FAILED','Choose which plan to change.',400);
    const proposedLocationId=input.locationId??(typeof payload.proposedLocationId==='string'?payload.proposedLocationId:undefined),proposedActivityKey=input.activityKey??(typeof payload.proposedActivityKey==='string'?payload.proposedActivityKey:undefined);
    if(!startsAt&&!proposedLocationId&&!proposedActivityKey)throw new AppError('VALIDATION_FAILED','Choose what should change.',400);
    if(startsAt)result=await rescheduleSharedPlan(db,{userId:user.id,planId,startsAt,conversationId:candidate.conversation_id});
    if(proposedLocationId||proposedActivityKey)result=await updateSharedPlan(db,{userId:user.id,planId,locationId:proposedLocationId,activityKey:proposedActivityKey,conversationId:candidate.conversation_id});
  }else{
    // Older action rows and the time-language trigger may expose the inferred
    // time as suggestedStartsAt rather than proposedStartsAt. If there is no
    // explicit planning window, accepting that suggestion keeps the final
    // confirmation idempotent instead of failing with a misleading "choose a
    // time" error. A real window still requires the user-selected exact time.
    const startsAt=timingStartsAt??(typeof payload.proposedStartsAt==='string'?payload.proposedStartsAt:undefined)??((!payload.windowStartsAt&&!payload.windowEndsAt&&typeof payload.suggestedStartsAt==='string')?payload.suggestedStartsAt:undefined);
    const windowStartsAt=input.windowStartsAt??(typeof payload.windowStartsAt==='string'?payload.windowStartsAt:undefined),windowEndsAt=input.windowEndsAt??(typeof payload.windowEndsAt==='string'?payload.windowEndsAt:undefined);
    const candidatePrecision=input.timePrecision??(typeof payload.timePrecision==='string'&&['exact','approximate','daypart','window','day'].includes(payload.timePrecision)?payload.timePrecision as 'exact'|'approximate'|'daypart'|'window'|'day':undefined);
    const activityKey=input.activityKey??String(payload.activityKey??''),locationId=input.locationId??String(payload.locationId??'');if(!activityKey||!locationId)throw new AppError('VALIDATION_FAILED','Choose an activity and place before saving.',400);
    if(startsAt)result=await createSharedPlan(db,{userId:user.id,characterInstanceId:candidate.character_instance_id,activityKey,locationId,startsAt,source:'chat',sourceConversationId:candidate.conversation_id,sourceMessageId:candidate.assistant_message_id??undefined,requestId:`candidate:${candidate.id}`,title:typeof payload.title==='string'?payload.title:undefined,durationMinutes:Number(payload.durationMinutes)||undefined,immediate:input.timingChoice==='now'});
    else if(windowStartsAt&&windowEndsAt&&candidatePrecision&&candidatePrecision!=='exact')result={kind:'shared_plan',commitment:await createWindowedCommitment(db,{userId:user.id,continuityId:continuity.id,characterInstanceId:candidate.character_instance_id,activityKey,locationId,windowStartsAt,windowEndsAt,timePrecision:candidatePrecision,originalTimeExpression:input.originalTimeExpression??(typeof payload.originalTimeExpression==='string'?payload.originalTimeExpression:undefined),source:'chat',sourceConversationId:candidate.conversation_id,sourceMessageId:candidate.assistant_message_id??undefined,requestId:`candidate:${candidate.id}`,title:typeof payload.title==='string'?payload.title:undefined,userTimezone}),created:true};
    else throw new AppError('VALIDATION_FAILED','Choose an exact time or keep the proposed time window.',400);
  }
  if(input.timingChoice==='now'&&(result as Record<string,unknown>)?.kind==='shared_plan'){
    const planResult=result as{kind:'shared_plan';commitment:{id:string};created?:boolean};
    const experience=await joinCommitment(db,{userId:user.id,continuityId:continuity.id,characterInstanceId:String(candidate.character_instance_id),planId:String(planResult.commitment.id),requestId:`candidate:${candidate.id}:start`});
    result={...planResult,experience};
  }
  await db.from('together_conversation_actions').update({status:'applied',updated_at:new Date().toISOString()}).eq('id',candidate.id).eq('user_id',user.id).eq('status','pending');
  await db.from('together_conversation_events').update({metadata:{resolution:'applied'}}).eq('entity_type','conversation_action').eq('entity_id',candidate.id).eq('user_id',user.id);
  await track(db,user.id,'conversation_action_applied',{candidateId:candidate.id,type:candidate.candidate_type});
  return json({data:{applied:true,candidateId:candidate.id,result},correlationId},200,correlationId);
});
