import type{SupabaseClient}from'@supabase/supabase-js';

type Row=Record<string,any>;
const permanentCodes=new Set(['DeviceNotRegistered','InvalidCredentials']);

export async function sendCompanionPush(db:SupabaseClient,input:{userId:string;characterName:string;proactive:Row}){
  const{data:tokens}=await db.from('together_push_tokens').select('id,expo_push_token').eq('user_id',input.userId).eq('active',true).limit(5);
  if(!tokens?.length)return;
  try{
    const response=await fetch('https://exp.host/--/api/v2/push/send',{
      method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify(tokens.map((item)=>({to:item.expo_push_token,title:input.characterName,body:String(input.proactive.content??'').slice(0,220),sound:'default',data:{route:String(input.proactive.context?.route??'/chat'),proactiveMessageId:input.proactive.id}}))),
    });
    if(!response.ok){console.warn('Together push delivery failed',response.status);return;}
    const payload=await response.json().catch(()=>({})) as{data?:Array<{status?:string;id?:string;message?:string;details?:{error?:string}}>};
    const tickets=Array.isArray(payload.data)?payload.data:[];
    await Promise.all(tokens.map(async(token,index)=>{
      const ticket=tickets[index]??{},code=String(ticket.details?.error??''),accepted=ticket.status==='ok'&&Boolean(ticket.id);
      await db.from('together_push_deliveries').upsert({user_id:input.userId,push_token_id:token.id,proactive_message_id:input.proactive.id,expo_ticket_id:ticket.id??null,status:accepted?'accepted':'failed',error_code:code||null,error_detail_safe:accepted?null:String(ticket.message??'Push provider rejected the request.').slice(0,500),sent_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'proactive_message_id,push_token_id'});
      if(permanentCodes.has(code))await db.from('together_push_tokens').update({active:false}).eq('id',token.id).eq('user_id',input.userId);
    }));
  }catch(error){console.warn('Together push delivery unavailable',error instanceof Error?error.message:'unknown_error');}
}

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
      await db.from('together_push_deliveries').update({status:delivered?'delivered':'failed',error_code:code||null,error_detail_safe:delivered?null:String(receipt.message??'Push delivery failed.').slice(0,500),checked_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',row.id);
      if(permanentCodes.has(code)&&row.push_token_id)await db.from('together_push_tokens').update({active:false}).eq('id',row.push_token_id);
    }));
  }catch(error){console.warn('Together push receipt check unavailable',error instanceof Error?error.message:'unknown_error');}
}
