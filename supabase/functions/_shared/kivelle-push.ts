import { proactiveDeliveryPolicy } from './kivelle-proactive-policy.ts';
import type{SupabaseClient}from'@supabase/supabase-js';

type Row=Record<string,any>;

export function pushProviderErrorDisposition(code:string):'deactivate_device'|'provider_incident'|'retry'{
  if(code==='DeviceNotRegistered')return'deactivate_device';
  if(code==='InvalidCredentials')return'provider_incident';
  return'retry';
}

export function neutralCompanionPushPayload(input:{to:string;characterName:string;route:string;proactiveMessageId:string}){
  return{to:input.to,title:'Kivelle',body:`You have a new message from ${input.characterName}.`,sound:'default',data:{version:1,route:input.route,proactiveMessageId:input.proactiveMessageId,...safeRouteIdentifiers(input.route)}};
}

function safeRouteIdentifiers(route:string):{conversationId?:string;groupId?:string}{
  try{
    const url=new URL(route,'https://kivelli.invalid'),uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const conversationId=url.searchParams.get('conversation')??url.searchParams.get('conversationId');
    const groupId=url.searchParams.get('group')??url.searchParams.get('groupId');
    return{...(conversationId&&uuid.test(conversationId)?{conversationId}:{}),...(groupId&&uuid.test(groupId)?{groupId}:{})};
  }catch{return{};}
}

export async function sendCompanionPush(db:SupabaseClient,input:{userId:string;characterName:string;proactive:Row}){
  const now=new Date();
  const[prefs,deleted]=await Promise.all([
    db.from('together_notification_preferences').select('push_enabled,quiet_hours_start,quiet_hours_end,timezone').eq('user_id',input.userId).maybeSingle(),
    db.from('together_account_deletion_markers').select('user_id').eq('user_id',input.userId).maybeSingle(),
  ]);
  if(!prefs.data?.push_enabled||deleted.data)return;
  if(!(await proactiveDeliveryPolicy(db,input.userId,String(input.proactive.id),now,false)).allowed)return;
  const{data:tokens}=await db.from('together_push_tokens').select('id,expo_push_token').eq('user_id',input.userId).eq('active',true).limit(5);
  if(!tokens?.length)return;
  const route=String(input.proactive.context?.route??'/chat'),expiresAt=validDate(input.proactive.expires_at)??new Date(Date.now()+6*3600_000).toISOString();
  const queued=(await Promise.all(tokens.map(async(token)=>{
    const{data}=await db.from('together_push_deliveries').upsert({user_id:input.userId,push_token_id:token.id,proactive_message_id:input.proactive.id,status:'queued',attempt_count:1,next_attempt_at:null,expires_at:expiresAt,lease_owner:null,lease_expires_at:null,metadata:{characterName:input.characterName.slice(0,120),route:route.slice(0,500)},updated_at:new Date().toISOString()},{onConflict:'proactive_message_id,push_token_id',ignoreDuplicates:true}).select('id,user_id,push_token_id,proactive_message_id,attempt_count,metadata').maybeSingle();
    return data?{...data,expoPushToken:token.expo_push_token}:null;
  }))).filter(Boolean) as PushWork[];
  await deliverPushWork(db,queued);
}

type PushWork={id:string;user_id:string;push_token_id:string;proactive_message_id:string;attempt_count:number;metadata?:Row;expoPushToken:string};

export async function retryPendingPushDeliveries(db:SupabaseClient){
  const now=new Date(),workerId=`life:${crypto.randomUUID()}`;
  await db.from('together_push_deliveries').update({status:'expired',lease_owner:null,lease_expires_at:null,updated_at:now.toISOString()}).in('status',['queued','retry']).lte('expires_at',now.toISOString());
  const{data:claimed}=await db.rpc('kivelle_claim_push_deliveries',{p_worker_id:workerId,p_limit:25});
  const ids=(claimed??[]).map((row:Row)=>String(row.id)).filter(Boolean);if(!ids.length)return{claimed:0,sent:0};
  const work:PushWork[]=[];
  for(const id of ids){
    const{data:delivery}=await db.from('together_push_deliveries').select('id,user_id,push_token_id,proactive_message_id,attempt_count,metadata,expires_at').eq('id',id).eq('lease_owner',workerId).maybeSingle();
    if(!delivery)continue;
    const[token,prefs,deleted]=await Promise.all([
      db.from('together_push_tokens').select('expo_push_token,active').eq('id',delivery.push_token_id).eq('user_id',delivery.user_id).maybeSingle(),
      db.from('together_notification_preferences').select('push_enabled,quiet_hours_start,quiet_hours_end,timezone').eq('user_id',delivery.user_id).maybeSingle(),
      db.from('together_account_deletion_markers').select('user_id').eq('user_id',delivery.user_id).maybeSingle(),
    ]);
    const tokenRow=token.data,prefRow=prefs.data,disabled=!tokenRow?.active||!prefRow?.push_enabled||Boolean(deleted.data);
    if(disabled){await finishPush(db,id,'expired','Push eligibility changed before delivery.');continue;}
    const policy=await proactiveDeliveryPolicy(db,String(delivery.user_id),String(delivery.proactive_message_id),now,false);
    if(!policy.allowed&&policy.reason!=='quiet_hours'){await finishPush(db,id,'expired','Companion message preferences changed.');continue;}
    if(policy.reason==='quiet_hours'){
      await db.from('together_push_deliveries').update({status:'retry',next_attempt_at:new Date(now.getTime()+15*60_000).toISOString(),lease_owner:null,lease_expires_at:null,updated_at:now.toISOString()}).eq('id',id).eq('lease_owner',workerId);continue;
    }
    work.push({...delivery,expoPushToken:String(tokenRow!.expo_push_token)} as PushWork);
  }
  await deliverPushWork(db,work);
  return{claimed:ids.length,sent:work.length};
}

async function deliverPushWork(db:SupabaseClient,work:PushWork[]){
  if(!work.length)return;
  try{
    const response=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(work.map((item)=>neutralCompanionPushPayload({to:item.expoPushToken,characterName:String(item.metadata?.characterName??'Kivelle'),route:String(item.metadata?.route??'/chat'),proactiveMessageId:String(item.proactive_message_id)})))});
    if(!response.ok){
      const code=response.status===401||response.status===403?'InvalidCredentials':`HTTP_${response.status}`;
      await Promise.all(work.map((item)=>schedulePushFailure(db,item,code,'Push provider request failed.')));return;
    }
    const payload=await response.json().catch(()=>({})) as{data?:Array<{status?:string;id?:string;message?:string;details?:{error?:string}}>},tickets=Array.isArray(payload.data)?payload.data:[];
    await Promise.all(work.map(async(item,index)=>{
      const ticket=tickets[index]??{},code=String(ticket.details?.error??''),accepted=ticket.status==='ok'&&Boolean(ticket.id);
      if(accepted)await db.from('together_push_deliveries').update({expo_ticket_id:ticket.id,status:'accepted',error_code:null,error_detail_safe:null,sent_at:new Date().toISOString(),next_attempt_at:null,lease_owner:null,lease_expires_at:null,updated_at:new Date().toISOString()}).eq('id',item.id);
      else await schedulePushFailure(db,item,code||'PROVIDER_REJECTED',String(ticket.message??'Push provider rejected the request.'));
      await applyProviderError(db,{code,tokenId:item.push_token_id,userId:item.user_id});
    }));
  }catch(error){
    await Promise.all(work.map((item)=>schedulePushFailure(db,item,'TRANSPORT_UNAVAILABLE','Push provider transport was unavailable.')));
    console.warn('Together push delivery unavailable',error instanceof Error?error.message:'unknown_error');
  }
}

async function schedulePushFailure(db:SupabaseClient,item:PushWork,code:string,message:string){
  const disposition=pushProviderErrorDisposition(code),terminal=disposition==='deactivate_device'||Number(item.attempt_count)>=4;
  await db.from('together_push_deliveries').update({status:terminal?'failed':'retry',error_code:code.slice(0,100),error_detail_safe:message.slice(0,500),next_attempt_at:terminal?null:new Date(Date.now()+Math.min(60,2**Math.max(1,Number(item.attempt_count)))*60_000+Math.floor(Math.random()*30_000)).toISOString(),lease_owner:null,lease_expires_at:null,updated_at:new Date().toISOString()}).eq('id',item.id);
}

async function finishPush(db:SupabaseClient,id:string,status:'failed'|'expired',message:string){await db.from('together_push_deliveries').update({status,error_detail_safe:message,lease_owner:null,lease_expires_at:null,updated_at:new Date().toISOString()}).eq('id',id);}

export async function reconcilePushReceipts(db:SupabaseClient){
  const{data:rows}=await db.from('together_push_deliveries').select('id,expo_ticket_id,push_token_id').eq('status','accepted').not('expo_ticket_id','is',null).lte('created_at',new Date(Date.now()-15*60_000).toISOString()).order('created_at').limit(100);
  if(!rows?.length)return;
  try{
    const response=await fetch('https://exp.host/--/api/v2/push/getReceipts',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({ids:rows.map((row)=>row.expo_ticket_id)})});
    if(!response.ok)return;
    const payload=await response.json() as{data?:Record<string,{status?:string;message?:string;details?:{error?:string}}>};
    await Promise.all(rows.map(async(row)=>{
      const receipt=payload.data?.[String(row.expo_ticket_id)];if(!receipt)return;
      const code=String(receipt.details?.error??''),delivered=receipt.status==='ok';
      const disposition=pushProviderErrorDisposition(code),retryable=!delivered&&disposition!=='deactivate_device';
      await db.from('together_push_deliveries').update({status:delivered?'delivered':retryable?'retry':'failed',error_code:code||null,error_detail_safe:delivered?null:String(receipt.message??'Push delivery failed.').slice(0,500),next_attempt_at:retryable?new Date(Date.now()+5*60_000).toISOString():null,checked_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',row.id);
      await applyProviderError(db,{code,tokenId:row.push_token_id,userId:null});
    }));
  }catch(error){console.warn('Together push receipt check unavailable',error instanceof Error?error.message:'unknown_error');}
}

function validDate(value:unknown):string|null{const parsed=Date.parse(String(value??''));return Number.isFinite(parsed)?new Date(parsed).toISOString():null;}

async function applyProviderError(db:SupabaseClient,input:{code:string;tokenId?:string|null;userId:string|null}){
  const disposition=pushProviderErrorDisposition(input.code);
  if(disposition==='deactivate_device'&&input.tokenId)await db.from('together_push_tokens').update({active:false,deactivated_at:new Date().toISOString()}).eq('id',input.tokenId);
  if(disposition==='provider_incident')await db.rpc('kivelle_ops_upsert_incident',{p_dedupe_key:'push:expo:invalid_credentials',p_source:'push',p_severity:'critical',p_title:'Expo push credentials are invalid',p_summary_safe:'The push provider rejected Kivelle credentials. Device tokens were preserved.',p_correlation_id:null,p_metadata:{provider:'expo',code:input.code}});
}
