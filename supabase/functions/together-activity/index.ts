// Compatibility endpoint for older clients. Canonical mutations are delegated to
// the shared-plan service; this function never writes future life events.
import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { cancelSharedPlan, createSharedPlan, rescheduleSharedPlan } from '../_shared/together-plans.ts';
import { TOGETHER_IDS } from '../_shared/together.ts';

const ids=['coffee_juniper','dinner_juniper','riverwalk','open_mic','rooftop_movie','northside_trivia','photo_walk']as const;
const schema=z.union([
  z.object({action:z.literal('create'),activity:z.enum(ids),characterInstanceId:z.string().uuid(),scheduledFor:z.string().datetime(),requestId:z.string().min(8),note:z.string().max(1000).optional()}),
  z.object({action:z.literal('cancel'),planId:z.string().uuid()}),
  z.object({action:z.literal('dismiss_candidate'),candidateId:z.string().uuid()}),
  z.object({action:z.literal('confirm_candidate'),candidateId:z.string().uuid(),scheduledFor:z.string().datetime().optional(),activity:z.enum(ids).optional()}),
  z.object({activity:z.enum(['riverwalk','open_mic','rooftop_movie']),choice:z.enum(['accept','defer'])}),
]);
const legacy:Record<typeof ids[number],{activityKey:string;locationId:string}>={coffee_juniper:{activityKey:'coffee',locationId:TOGETHER_IDS.juniper},dinner_juniper:{activityKey:'dinner',locationId:TOGETHER_IDS.juniper},riverwalk:{activityKey:'walk',locationId:TOGETHER_IDS.riverwalk},open_mic:{activityKey:'open_mic',locationId:TOGETHER_IDS.juniper},rooftop_movie:{activityKey:'movie_night',locationId:TOGETHER_IDS.rooftop},northside_trivia:{activityKey:'trivia',locationId:TOGETHER_IDS.northside},photo_walk:{activityKey:'photo_walk',locationId:TOGETHER_IDS.riverwalk}};

serve(async(request,correlationId)=>{
  const{user,db}=await authenticated(request);await enforceRateLimit(db,user.id,'together_activity',30,3600);const input=await parseBody(request,schema);
  if('action'in input&&input.action==='dismiss_candidate'){const{data}=await db.from('together_conversation_actions').update({status:'dismissed',updated_at:new Date().toISOString()}).eq('id',input.candidateId).eq('user_id',user.id).eq('status','pending').select('id').maybeSingle();if(!data)throw new AppError('NOT_FOUND','That suggestion is no longer available.',404);return json({data:{dismissed:true},correlationId},200,correlationId);}
  if('action'in input&&input.action==='confirm_candidate'){
    const{data:candidate}=await db.from('together_conversation_actions').select('*').eq('id',input.candidateId).eq('user_id',user.id).eq('status','pending').maybeSingle();if(!candidate)throw new AppError('NOT_FOUND','That suggestion is no longer available.',404);const payload=candidate.payload??{};let result:unknown;
    if(['plan_cancel','cancel_plan'].includes(candidate.candidate_type))result=await cancelSharedPlan(db,{userId:user.id,planId:String(payload.planId??payload.targetId),conversationId:candidate.conversation_id});
    else if(['plan_reschedule','reschedule_plan'].includes(candidate.candidate_type)){if(!input.scheduledFor)throw new AppError('VALIDATION_FAILED','Choose a new time first.',400);result=await rescheduleSharedPlan(db,{userId:user.id,planId:String(payload.planId??payload.targetId),startsAt:input.scheduledFor,conversationId:candidate.conversation_id});}
    else{if(!input.scheduledFor||!input.activity)throw new AppError('VALIDATION_FAILED','Choose the plan details first.',400);const option=legacy[input.activity];result=await createSharedPlan(db,{userId:user.id,characterInstanceId:candidate.character_instance_id,activityKey:option.activityKey,locationId:option.locationId,startsAt:input.scheduledFor,source:'chat',sourceConversationId:candidate.conversation_id,sourceMessageId:candidate.assistant_message_id,requestId:`candidate:${candidate.id}`});}
    await db.from('together_conversation_actions').update({status:'applied',updated_at:new Date().toISOString()}).eq('id',candidate.id).eq('user_id',user.id);return json({data:{applied:true,result},correlationId},200,correlationId);
  }
  if('action'in input&&input.action==='cancel')return json({data:await cancelSharedPlan(db,{userId:user.id,planId:input.planId}),correlationId},200,correlationId);
  if('choice'in input&&input.choice==='defer')return json({data:{accepted:false},correlationId},200,correlationId);
  const activity=input.activity,option=legacy[activity];let characterInstanceId:string,startsAt:string,requestId:string,note:string|undefined;
  if('choice'in input){const{data:instance}=await db.from('together_character_instances').select('id').eq('user_id',user.id).eq('character_template_id',TOGETHER_IDS.maya).maybeSingle();if(!instance)throw new AppError('NOT_FOUND','That companion is unavailable.',404);characterInstanceId=instance.id;const next=new Date();next.setDate(next.getDate()+1);next.setHours(19,0,0,0);startsAt=next.toISOString();requestId=crypto.randomUUID();}
  else{characterInstanceId=input.characterInstanceId;startsAt=input.scheduledFor;requestId=input.requestId;note=input.note;}
  const result=await createSharedPlan(db,{userId:user.id,characterInstanceId,activityKey:option.activityKey,locationId:option.locationId,startsAt,note,source:'manual_planner',requestId});return json({data:{accepted:true,...result},correlationId},result.created?201:200,correlationId);
});
