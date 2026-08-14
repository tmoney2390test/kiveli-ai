import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { TOGETHER_IDS, track } from '../_shared/together.ts';

const activityIds=['coffee_juniper','dinner_juniper','riverwalk','open_mic','rooftop_movie','northside_trivia','photo_walk'] as const;
const schema=z.union([
  z.object({action:z.literal('create'),activity:z.enum(activityIds),characterInstanceId:z.string().uuid(),scheduledFor:z.string().datetime(),requestId:z.string().uuid(),note:z.string().trim().max(240).optional()}),
  z.object({action:z.literal('cancel'),planId:z.string().uuid()}),
  z.object({activity:z.enum(['riverwalk','open_mic','rooftop_movie']),choice:z.enum(['accept','defer'])}),
]);

const options={
  coffee_juniper:{title:'Coffee at Juniper',summary:'You and your companion are meeting at Juniper for coffee and an easy catch-up.',location:TOGETHER_IDS.juniper,duration:60},
  dinner_juniper:{title:'Dinner at Juniper',summary:'You and your companion have dinner at Juniper on the calendar.',location:TOGETHER_IDS.juniper,duration:90},
  riverwalk:{title:'Sunset Riverwalk',summary:'You and your companion are taking an unhurried walk along the Riverwalk as the city lights come on.',location:TOGETHER_IDS.riverwalk,duration:75},
  open_mic:{title:'Open Mic at Juniper',summary:'You and your companion have a table near the stage planned for Juniper’s open mic.',location:TOGETHER_IDS.juniper,duration:120},
  rooftop_movie:{title:'Rooftop Movie Night',summary:'You and your companion are watching a movie under the city lights at Skyline Rooftop.',location:TOGETHER_IDS.rooftop,duration:150},
  northside_trivia:{title:'Trivia at Northside',summary:'You and your companion are teaming up for trivia at Northside Bar.',location:TOGETHER_IDS.northside,duration:120},
  photo_walk:{title:'City Photo Walk',summary:'You and your companion are exploring the Riverwalk with cameras and no pressure to hurry.',location:TOGETHER_IDS.riverwalk,duration:90},
} as const;

serve(async(request,correlationId)=>{
  const{user,db}=await authenticated(request);
  await enforceRateLimit(db,user.id,'together_activity',30,3600);
  const input=await parseBody(request,schema);

  if('action'in input&&input.action==='cancel'){
    const{data:plan}=await db.from('together_life_events').select('id,metadata,starts_at').eq('id',input.planId).eq('user_id',user.id).eq('event_type','shared_plan').maybeSingle();
    if(!plan)throw new AppError('NOT_FOUND','That plan could not be found.',404);
    if(new Date(plan.starts_at).getTime()<=Date.now())throw new AppError('CONFLICT','A plan that has already started cannot be cancelled.',409);
    const{error}=await db.from('together_life_events').update({metadata:{...(plan.metadata??{}),planStatus:'cancelled',cancelledAt:new Date().toISOString()},user_should_know:false}).eq('id',plan.id).eq('user_id',user.id);
    if(error)throw new AppError('INTERNAL_ERROR','The plan could not be cancelled.',500,true);
    await track(db,user.id,'shared_plan_cancelled',{planId:plan.id});
    return json({data:{cancelled:true,planId:plan.id},correlationId},200,correlationId);
  }

  if('choice'in input&&input.choice==='defer')return json({data:{accepted:false},correlationId},200,correlationId);
  const activity=input.activity;
  const legacy='choice'in input;
  const scheduledFor=legacy?nextEvening():input.scheduledFor;
  const start=new Date(scheduledFor);
  if(!Number.isFinite(start.getTime()))throw new AppError('VALIDATION_FAILED','Choose a valid time for the plan.',400);
  if(start.getTime()<Date.now()+10*60000)throw new AppError('VALIDATION_FAILED','Choose a time at least ten minutes from now.',400);
  if(start.getTime()>Date.now()+45*86400000)throw new AppError('VALIDATION_FAILED','Plans can be scheduled up to 45 days ahead.',400);

  const{data:companion}=legacy
    ?await db.from('together_character_instances').select('*').eq('user_id',user.id).eq('character_template_id',TOGETHER_IDS.maya).maybeSingle()
    :await db.from('together_character_instances').select('*').eq('user_id',user.id).eq('id',input.characterInstanceId).maybeSingle();
  if(!companion)throw new AppError('NOT_FOUND','That companion is unavailable.',404);
  if(!companion.contact_added_at)throw new AppError('CONFLICT','Get to know each other a little first.',409);

  const item=options[activity];
  const requestId=legacy?crypto.randomUUID():input.requestId;
  const simulationKey=`shared-plan:${requestId}`;
  const{data:existing}=await db.from('together_life_events').select('*').eq('character_instance_id',companion.id).eq('simulation_key',simulationKey).maybeSingle();
  if(existing)return json({data:{accepted:true,plan:existing},correlationId},200,correlationId);
  const endsAt=new Date(start.getTime()+item.duration*60000).toISOString();
  const metadata={source:'user_plan',planStatus:'scheduled',activityKey:activity,requestId,...(!legacy&&input.note?{note:input.note}:{}),createdAt:new Date().toISOString()};
  const{data:plan,error}=await db.from('together_life_events').insert({user_id:user.id,character_instance_id:companion.id,event_type:'shared_plan',simulation_key:simulationKey,title:item.title,narrative_summary:item.summary,participant_instance_ids:[companion.id],location_id:item.location,significance:.68,starts_at:start.toISOString(),ends_at:endsAt,resulting_state_changes:{sharedActivity:activity,status:'planned'},user_should_know:true,proactive_message_appropriate:false,metadata}).select('*').single();
  if(error||!plan){console.error(JSON.stringify({level:'error',operation:'shared_plan_create',correlationId,code:error?.code}));throw new AppError('INTERNAL_ERROR','The plan could not be saved. Try again.',500,true);}
  await track(db,user.id,'shared_plan_created',{activity,planId:plan.id,scheduledFor:start.toISOString(),characterInstanceId:companion.id});
  return json({data:{accepted:true,plan},correlationId},201,correlationId);
});

function nextEvening(){const date=new Date();date.setUTCDate(date.getUTCDate()+1);date.setUTCHours(23,0,0,0);return date.toISOString();}
