import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { cancelSharedPlan, createSharedPlan, rescheduleSharedPlan, updateSharedPlan, writeConversationEvent } from '../_shared/together-plans.ts';
import { track } from '../_shared/together.ts';

const source=z.enum(['chat','manual_planner','location','discover','date','story']);
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('create'),characterInstanceId:z.string().uuid(),activityKey:z.string().trim().min(1).max(120),locationId:z.string().uuid(),startsAt:z.string().datetime(),note:z.string().trim().max(1000).optional(),source,sourceConversationId:z.string().uuid().optional(),sourceMessageId:z.string().uuid().optional(),requestId:z.string().min(8).max(100),title:z.string().trim().max(160).optional(),durationMinutes:z.number().int().min(30).max(360).optional()}),
  z.object({action:z.literal('reschedule'),planId:z.string().uuid(),startsAt:z.string().datetime(),conversationId:z.string().uuid().optional()}),
  z.object({action:z.literal('cancel'),planId:z.string().uuid(),conversationId:z.string().uuid().optional()}),
  z.object({action:z.literal('update'),planId:z.string().uuid(),note:z.string().trim().max(1000).optional(),locationId:z.string().uuid().optional(),activityKey:z.string().trim().max(120).optional(),conversationId:z.string().uuid().optional()}),
  z.object({action:z.literal('list'),characterInstanceId:z.string().uuid().optional(),includeCancelled:z.boolean().optional()}),
  z.object({action:z.literal('get'),planId:z.string().uuid()}),
  z.object({action:z.literal('confirm_proposal'),candidateId:z.string().uuid(),startsAt:z.string().datetime().optional(),activityKey:z.string().trim().max(120).optional(),locationId:z.string().uuid().optional(),planId:z.string().uuid().optional()}),
  z.object({action:z.literal('dismiss_proposal'),candidateId:z.string().uuid()}),
]);

serve(async(request,correlationId)=>{
  const{user,db}=await authenticated(request);
  await enforceRateLimit(db,user.id,'together_plan',60,3600);
  const input=await parseBody(request,schema);

  if(input.action==='list'){
    let query=db.from('together_shared_plans').select('*,together_locations(id,name,slug)').eq('user_id',user.id).order('starts_at');
    if(input.characterInstanceId)query=query.eq('character_instance_id',input.characterInstanceId);
    if(!input.includeCancelled)query=query.neq('status','cancelled');
    const{data,error}=await query;if(error)throw new AppError('INTERNAL_ERROR','Plans could not be loaded.',500,true);
    return json({data:data??[],correlationId},200,correlationId);
  }
  if(input.action==='get'){
    const{data}=await db.from('together_shared_plans').select('*,together_locations(*),together_character_instances(id,together_character_templates(name,slug))').eq('id',input.planId).eq('user_id',user.id).maybeSingle();
    if(!data)throw new AppError('NOT_FOUND','That plan could not be found.',404);
    return json({data,correlationId},200,correlationId);
  }
  if(input.action==='create'){
    const result=await createSharedPlan(db,{userId:user.id,characterInstanceId:input.characterInstanceId,activityKey:input.activityKey,locationId:input.locationId,startsAt:input.startsAt,note:input.note,source:input.source,sourceConversationId:input.sourceConversationId,sourceMessageId:input.sourceMessageId,requestId:input.requestId,title:input.title,durationMinutes:input.durationMinutes});
    return json({data:result,correlationId},result.created?201:200,correlationId);
  }
  if(input.action==='reschedule')return json({data:await rescheduleSharedPlan(db,{userId:user.id,planId:input.planId,startsAt:input.startsAt,conversationId:input.conversationId}),correlationId},200,correlationId);
  if(input.action==='update')return json({data:await updateSharedPlan(db,{userId:user.id,planId:input.planId,note:input.note,locationId:input.locationId,activityKey:input.activityKey,conversationId:input.conversationId}),correlationId},200,correlationId);
  if(input.action==='cancel')return json({data:await cancelSharedPlan(db,{userId:user.id,planId:input.planId,conversationId:input.conversationId}),correlationId},200,correlationId);

  const{data:candidate}=await db.from('together_conversation_actions').select('*').eq('id',input.candidateId).eq('user_id',user.id).eq('status','pending').maybeSingle();
  if(!candidate)throw new AppError('NOT_FOUND','That suggestion is no longer available.',404);
  if(candidate.expires_at&&new Date(candidate.expires_at).getTime()<Date.now())throw new AppError('CONFLICT','That suggestion has expired.',409,true);
  if(input.action==='dismiss_proposal'){
    await db.from('together_conversation_actions').update({status:'dismissed',updated_at:new Date().toISOString()}).eq('id',candidate.id).eq('user_id',user.id);
    await db.from('together_conversation_events').update({metadata:{resolution:'dismissed'}}).eq('entity_type','conversation_action').eq('entity_id',candidate.id).eq('user_id',user.id);
    await track(db,user.id,'plan_proposal_dismissed',{candidateId:candidate.id});
    return json({data:{dismissed:true,candidateId:candidate.id},correlationId},200,correlationId);
  }

  const payload=(candidate.payload??{})as Record<string,unknown>;
  let result:unknown;
  const targetType=String(payload.targetType??'plan');
  if(targetType==='date'&&['plan_cancel','cancel_plan','plan_reschedule','reschedule_plan'].includes(candidate.candidate_type)){
    const sessionId=input.planId??String(payload.planId??payload.targetId??'');
    const{data:session}=await db.from('together_date_sessions').select('*,together_date_templates(name,location_id)').eq('id',sessionId).eq('user_id',user.id).eq('character_instance_id',candidate.character_instance_id).maybeSingle();
    if(!session)throw new AppError('NOT_FOUND','That date could not be found.',404);
    if(['plan_cancel','cancel_plan'].includes(candidate.candidate_type)){
      const{data,error}=await db.from('together_date_sessions').update({status:'deferred',scheduled_for:null,updated_at:new Date().toISOString(),state:{...(session.state??{}),cancelledViaChat:true}}).eq('id',session.id).eq('user_id',user.id).select('*').single();if(error)throw new AppError('INTERNAL_ERROR','That date could not be cancelled.',500,true);result=data;
      await writeConversationEvent(db,{userId:user.id,characterInstanceId:candidate.character_instance_id,conversationId:candidate.conversation_id,eventType:'plan_cancelled',entityType:'date_session',entityId:session.id,metadata:{title:session.together_date_templates?.name??'Date',status:'cancelled',commitmentType:'date'}});
    }else{
      const startsAt=input.startsAt??(typeof payload.proposedStartsAt==='string'?payload.proposedStartsAt:undefined);if(!startsAt)throw new AppError('VALIDATION_FAILED','Choose a new date and time.',400);const start=new Date(startsAt);if(start.getTime()<Date.now()+10*60000)throw new AppError('VALIDATION_FAILED','Choose a future time.',400);
      const{data:conflict}=await db.from('together_shared_plans').select('id,title').eq('user_id',user.id).eq('character_instance_id',candidate.character_instance_id).in('status',['scheduled','active']).lt('starts_at',new Date(start.getTime()+3*3600000).toISOString()).gt('ends_at',start.toISOString()).limit(1).maybeSingle();if(conflict)throw new AppError('PLAN_CONFLICT',`You already have ${conflict.title} at that time.`,409,true);
      const{data,error}=await db.from('together_date_sessions').update({status:'upcoming',scheduled_for:start.toISOString(),updated_at:new Date().toISOString()}).eq('id',session.id).eq('user_id',user.id).select('*').single();if(error)throw new AppError('INTERNAL_ERROR','That date could not be rescheduled.',500,true);result=data;
      await writeConversationEvent(db,{userId:user.id,characterInstanceId:candidate.character_instance_id,conversationId:candidate.conversation_id,eventType:'plan_rescheduled',entityType:'date_session',entityId:session.id,metadata:{title:session.together_date_templates?.name??'Date',startsAt:start.toISOString(),locationId:session.together_date_templates?.location_id,commitmentType:'date'}});
    }
  }
  else if(['plan_cancel','cancel_plan'].includes(candidate.candidate_type)){
    const planId=input.planId??String(payload.planId??payload.targetId??'');
    if(!planId)throw new AppError('VALIDATION_FAILED','Choose which plan to cancel.',400);
    result=await cancelSharedPlan(db,{userId:user.id,planId,conversationId:candidate.conversation_id});
  }else if(['plan_reschedule','reschedule_plan'].includes(candidate.candidate_type)){
    const planId=input.planId??String(payload.planId??payload.targetId??'');
    const startsAt=input.startsAt??(typeof payload.proposedStartsAt==='string'?payload.proposedStartsAt:undefined);
    if(!planId)throw new AppError('VALIDATION_FAILED','Choose which plan to change.',400);
    const proposedLocationId=input.locationId??(typeof payload.proposedLocationId==='string'?payload.proposedLocationId:undefined);
    const proposedActivityKey=input.activityKey??(typeof payload.proposedActivityKey==='string'?payload.proposedActivityKey:undefined);
    if(!startsAt&&!proposedLocationId&&!proposedActivityKey)throw new AppError('VALIDATION_FAILED','Choose what should change.',400);
    if(startsAt)result=await rescheduleSharedPlan(db,{userId:user.id,planId,startsAt,conversationId:candidate.conversation_id});
    if(proposedLocationId||proposedActivityKey)result=await updateSharedPlan(db,{userId:user.id,planId,locationId:proposedLocationId,activityKey:proposedActivityKey,conversationId:candidate.conversation_id});
  }else{
    const startsAt=input.startsAt??(typeof payload.proposedStartsAt==='string'?payload.proposedStartsAt:undefined);
    const activityKey=input.activityKey??String(payload.activityKey??'');
    const locationId=input.locationId??String(payload.locationId??'');
    if(!startsAt||!activityKey||!locationId)throw new AppError('VALIDATION_FAILED','Choose an activity, place, and time before saving.',400);
    result=await createSharedPlan(db,{userId:user.id,characterInstanceId:candidate.character_instance_id,activityKey,locationId,startsAt,source:'chat',sourceConversationId:candidate.conversation_id,sourceMessageId:candidate.assistant_message_id??undefined,requestId:`candidate:${candidate.id}`,title:typeof payload.title==='string'?payload.title:undefined,durationMinutes:Number(payload.durationMinutes)||undefined});
  }
  await db.from('together_conversation_actions').update({status:'applied',updated_at:new Date().toISOString()}).eq('id',candidate.id).eq('user_id',user.id).eq('status','pending');
  await db.from('together_conversation_events').update({metadata:{resolution:'applied'}}).eq('entity_type','conversation_action').eq('entity_id',candidate.id).eq('user_id',user.id);
  await track(db,user.id,'conversation_action_applied',{candidateId:candidate.id,type:candidate.candidate_type});
  return json({data:{applied:true,candidateId:candidate.id,result},correlationId},200,correlationId);
});
