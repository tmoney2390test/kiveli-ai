import { adminClient, serverEnv } from '../_shared/context.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { runLifeSimulation } from '../_shared/together-life.ts';
import { constantTimeEqual } from '../../../packages/together-domain/src/security.ts';
import { reconcilePushReceipts } from '../_shared/kivelle-push.ts';
import { evaluateOperationalAlerts } from '../_shared/kivelle-ops.ts';
// Keep transitive subscription/media dependencies in Supabase's API deployment bundle.
import '../_shared/kivelle-subscription.ts';

serve(async (request, correlationId) => {
  if (request.method !== 'POST') throw new AppError('NOT_FOUND', 'That endpoint is unavailable.', 404);
  const expected = serverEnv('TOGETHER_LIFE_DISPATCH_SECRET');
  const supplied = request.headers.get('x-together-dispatch-secret');
  if (!supplied || !constantTimeEqual(supplied, expected)) throw new AppError('FORBIDDEN', 'Life dispatch authorization failed.', 403);
  const db = adminClient();
  const now = new Date();
  await reconcilePushReceipts(db);
  const photoCleanup = await cleanupPrivateChatPhotos(db, now);
  const cutoff = new Date(now.getTime() - 20 * 60000).toISOString();
  const { data: instances, error } = await db.from('together_character_instances').select('id,user_id').or(`last_simulated_at.lt.${cutoff},last_simulated_at.is.null`).order('last_simulated_at', { ascending: true, nullsFirst: true }).limit(25);
  if (error) throw new AppError('INTERNAL_ERROR', 'Life dispatch could not load characters.', 500, true);
  const results = { processed: 0, events: 0, messages: 0, failures: 0, photoCleanup };
  for (const instance of instances ?? []) {
    try {
      const run = await runLifeSimulation({ db, userId: instance.user_id, characterInstanceId: instance.id, now, evaluateProactive: true, trigger: 'scheduled_dispatch' });
      results.processed += 1;
      results.events += Array.isArray(run.events) ? run.events.length : 0;
      results.messages += run.proactiveMessage ? 1 : 0;
    } catch (dispatchError) {
      results.failures += 1;
      console.error(JSON.stringify({ level: 'error', operation: 'together_life_dispatch', characterInstanceId: instance.id, message: dispatchError instanceof Error ? dispatchError.message : 'unknown_error' }));
    }
  }
  try {
    await evaluateOperationalAlerts(db,{deliver:true,trigger:'scheduled',now});
  } catch (alertError) {
    // Monitoring must never block the Life simulation it observes.
    console.error(JSON.stringify({level:'error',operation:'kivelle_ops_alert_evaluation',message:alertError instanceof Error?alertError.message:'unknown_error'}));
  }
  return json({ data: results, correlationId }, 200, correlationId);
});

async function cleanupPrivateChatPhotos(db:any,now:Date):Promise<{expired:number;orphans:number;retried:number;failures:number}>{
  const result={expired:0,orphans:0,retried:0,failures:0},orphanCutoff=new Date(now.getTime()-2*60*60_000).toISOString();
  const{data:orphans}=await db.from('together_conversation_attachments').select('id,user_id,storage_path').is('message_id',null).lt('created_at',orphanCutoff).limit(100);
  for(const attachment of orphans??[]){
    const removed=!attachment.storage_path||!(await db.storage.from('together-user-media').remove([attachment.storage_path])).error;
    if(!removed){result.failures+=1;continue;}
    const{error}=await db.from('together_conversation_attachments').delete().eq('id',attachment.id).eq('user_id',attachment.user_id).is('message_id',null);
    if(error)result.failures+=1;else result.orphans+=1;
  }
  const{data:expired}=await db.from('together_conversation_attachments').select('id,user_id,storage_path').not('message_id','is',null).not('storage_path','is',null).lte('expires_at',now.toISOString()).limit(100);
  for(const attachment of expired??[]){
    const{error:removeError}=await db.storage.from('together-user-media').remove([attachment.storage_path]);
    if(removeError){result.failures+=1;continue;}
    const{error}=await db.from('together_conversation_attachments').update({storage_path:null,storage_deleted_at:now.toISOString(),updated_at:now.toISOString()}).eq('id',attachment.id).eq('user_id',attachment.user_id).eq('storage_path',attachment.storage_path);
    if(error)result.failures+=1;else result.expired+=1;
  }
  const{data:jobs}=await db.from('together_storage_cleanup_jobs').select('id,bucket_id,storage_path,attempt_count').eq('status','pending').order('created_at').limit(100);
  for(const job of jobs??[]){
    const{error}=await db.storage.from(job.bucket_id).remove([job.storage_path]);
    if(error){result.failures+=1;await db.from('together_storage_cleanup_jobs').update({attempt_count:Number(job.attempt_count??0)+1,last_error:'storage_remove_failed',updated_at:now.toISOString()}).eq('id',job.id);continue;}
    await db.from('together_storage_cleanup_jobs').update({status:'complete',last_error:null,updated_at:now.toISOString()}).eq('id',job.id);
    result.retried+=1;
  }
  return result;
}
