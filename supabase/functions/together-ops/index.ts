import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';

const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('report_client_error'),route:z.string().max(200).default('unknown'),surface:z.string().max(80).default('client'),errorName:z.string().max(100).default('Error'),messageSafe:z.string().min(1).max(600),stackHash:z.string().max(128).optional(),stackSafe:z.string().max(4000).optional(),platform:z.string().max(40).optional(),appVersion:z.string().max(40).optional(),buildId:z.string().max(100).optional(),correlationId:z.string().max(128).optional(),metadata:z.record(z.string(),z.union([z.string().max(300),z.number(),z.boolean(),z.null()])).default({})}),
  z.object({action:z.literal('create_support_ticket'),category:z.enum(['bug','billing','safety','account','feedback','other']),subject:z.string().trim().min(3).max(160),message:z.string().trim().min(10).max(5000),correlationId:z.string().max(128).optional(),conversationId:z.string().uuid().optional()}),
  z.object({action:z.literal('my_tickets')}),
  z.object({action:z.literal('dashboard')}),
  z.object({action:z.literal('update_ticket'),ticketId:z.string().uuid(),status:z.enum(['open','in_progress','waiting','resolved','closed']),priority:z.enum(['low','normal','high','urgent']).optional()}),
]);

serve(async(request,correlationId)=>{
  const{user,db}=await authenticated(request);const input=await parseBody(request,schema);
  if(input.action==='report_client_error'){
    await enforceRateLimit(db,user.id,'client_error_report',30,3600);
    const{error}=await db.from('together_client_error_events').insert({user_id:user.id,route:input.route,surface:input.surface,error_name:input.errorName,message_safe:sanitize(input.messageSafe,600),stack_hash:input.stackHash??null,stack_safe:input.stackSafe?sanitize(input.stackSafe,4000):null,platform:input.platform??null,app_version:input.appVersion??null,build_id:input.buildId??null,correlation_id:input.correlationId??null,metadata:input.metadata});
    if(error)throw new AppError('INTERNAL_ERROR','Diagnostics could not be recorded.',500,true);
    return json({data:{ok:true},correlationId},200,correlationId);
  }
  if(input.action==='create_support_ticket'){
    await enforceRateLimit(db,user.id,'support_ticket',8,86400);
    if(input.conversationId){const{data}=await db.from('together_conversations').select('id').eq('id',input.conversationId).eq('user_id',user.id).maybeSingle();if(!data)throw new AppError('NOT_FOUND','That conversation is unavailable.',404);}
    const{data,error}=await db.from('together_support_tickets').insert({user_id:user.id,category:input.category,subject:input.subject,message:input.message,correlation_id:input.correlationId??correlationId,conversation_id:input.conversationId??null}).select('id,status,created_at').single();
    if(error)throw new AppError('INTERNAL_ERROR','Your support request could not be created.',500,true);
    return json({data:{ticket:data},correlationId},201,correlationId);
  }
  if(input.action==='my_tickets'){
    const{data,error}=await db.from('together_support_tickets').select('id,category,subject,status,priority,created_at,updated_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(30);
    if(error)throw new AppError('INTERNAL_ERROR','Support requests could not be loaded.',500,true);
    return json({data:{tickets:data??[]},correlationId},200,correlationId);
  }
  requireOperationsAccess(user);
  if(input.action==='update_ticket'){
    const{data,error}=await db.from('together_support_tickets').update({status:input.status,...(input.priority?{priority:input.priority}:{}),updated_at:new Date().toISOString()}).eq('id',input.ticketId).select('id,status,priority,updated_at').maybeSingle();
    if(error)throw new AppError('INTERNAL_ERROR','The support request could not be updated.',500,true);if(!data)throw new AppError('NOT_FOUND','That support request is unavailable.',404);
    return json({data:{ticket:data},correlationId},200,correlationId);
  }
  const now=Date.now(),since24=new Date(now-86400000).toISOString(),since7=new Date(now-7*86400000).toISOString(),staleMedia=new Date(now-10*60_000).toISOString();
  const[errors24,errors7,openTickets,newUsers,mediaActive,mediaFailed,mediaStale,callActive,callFailed,pushFailed,usage,recentErrors,recentTickets]=await Promise.all([
    count(db,'together_client_error_events',(query)=>query.gte('created_at',since24)),count(db,'together_client_error_events',(query)=>query.gte('created_at',since7)),count(db,'together_support_tickets',(query)=>query.in('status',['open','in_progress','waiting'])),count(db,'together_profiles',(query)=>query.gte('created_at',since24)),count(db,'together_generated_media',(query)=>query.in('status',['queued','generating'])),count(db,'together_generated_media',(query)=>query.eq('status','failed').gte('created_at',since24)),count(db,'together_generated_media',(query)=>query.in('status',['queued','generating']).lte('created_at',staleMedia)),count(db,'together_voice_call_sessions',(query)=>query.in('status',['creating','ringing','connecting','active','reconnecting','ending'])),count(db,'together_voice_call_sessions',(query)=>query.eq('status','failed').gte('created_at',since24)),count(db,'together_push_deliveries',(query)=>query.eq('status','failed').gte('created_at',since24)),
    db.from('together_ai_usage_events').select('latency_ms,estimated_cost_usd,provider_cost_usd,success,provider,operation,error_code').gte('created_at',since24).limit(2000),
    db.from('together_client_error_events').select('id,route,surface,error_name,message_safe,stack_hash,platform,app_version,correlation_id,created_at').order('created_at',{ascending:false}).limit(30),
    db.from('together_support_tickets').select('id,user_id,category,subject,status,priority,correlation_id,created_at,updated_at').order('created_at',{ascending:false}).limit(50),
  ]);
  const failed=[usage,recentErrors,recentTickets].find((item)=>item.error);if(failed?.error)throw new AppError('INTERNAL_ERROR','Operations telemetry could not be loaded.',500,true);
  const usageRows=usage.data??[],latencies=usageRows.map((row)=>Number(row.latency_ms??0)).filter((value)=>value>0).sort((a,b)=>a-b),success=usageRows.filter((row)=>row.success===true).length,cost=usageRows.reduce((sum,row)=>sum+Number(row.provider_cost_usd??row.estimated_cost_usd??0),0);
  return json({data:{generatedAt:new Date().toISOString(),health:{status:mediaStale+callFailed+pushFailed>0?'attention':'healthy'},metrics:{clientErrors24h:errors24,clientErrors7d:errors7,openSupportTickets:openTickets,newAccounts24h:newUsers,mediaActive,mediaFailed24h:mediaFailed,mediaStale,activeCalls:callActive,failedCalls24h:callFailed,pushFailures24h:pushFailed,aiRequests24h:usageRows.length,aiSuccessRate:usageRows.length?success/usageRows.length:1,aiP95LatencyMs:latencies.length?latencies[Math.min(latencies.length-1,Math.floor(latencies.length*.95))]:0,providerCost24h:cost},recentErrors:recentErrors.data??[],supportTickets:recentTickets.data??[],note:'No prompts, chat messages, transcripts, media URLs, or provider payloads are included.'},correlationId},200,correlationId);
});

function requireOperationsAccess(user:{id:string;app_metadata?:Record<string,unknown>}){const allowed=(Deno.env.get('TOGETHER_ADMIN_USER_IDS')??Deno.env.get('TOGETHER_DEBUG_USER_IDS')??'').split(',').map((value)=>value.trim()).filter(Boolean);if(!allowed.includes(user.id)&&user.app_metadata?.together_admin!==true&&user.app_metadata?.together_internal!==true)throw new AppError('FORBIDDEN','Operations access is required.',403);}
async function count(db:any,table:string,apply:(query:any)=>any){const{count,error}=await apply(db.from(table).select('*',{head:true,count:'exact'}));if(error)throw new AppError('INTERNAL_ERROR','Operations telemetry could not be counted.',500,true);return Number(count??0);}
function sanitize(value:string,limit:number){return value.replace(/sk-[A-Za-z0-9_-]+/g,'[secret]').replace(/Bearer\s+[A-Za-z0-9._-]+/gi,'Bearer [redacted]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]').replace(/[\r\n]{3,}/g,'\n\n').slice(0,limit);}
