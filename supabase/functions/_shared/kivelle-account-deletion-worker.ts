import type{SupabaseClient}from'@supabase/supabase-js';
import{cancelStripeSubscriptionNow}from'./stripe.ts';

type Row=Record<string,any>;

/**
 * Resumes accepted deletion requests after transient billing, database, or
 * object-storage failures. The deletion marker remains authoritative while a
 * job is queued, so retries cannot restore application access.
 */
export async function retryAccountDeletionCleanup(db:SupabaseClient,now=new Date()){
  const staleProcessingCutoff=new Date(now.getTime()-5*60_000).toISOString();
  const{data:jobs}=await db.from('together_account_deletion_jobs')
    .select('id,user_id,attempt_count,storage_job_ids,auth_user_owned,billing_cancellation_required,billing_canceled,correlation_id')
    .or(`and(status.eq.retry,next_attempt_at.lte.${now.toISOString()}),and(status.eq.processing,updated_at.lte.${staleProcessingCutoff})`).order('next_attempt_at').limit(10);
  let completed=0,retried=0,failed=0;
  for(const job of jobs??[]){
    const attempts=Number(job.attempt_count??0)+1;
    const claimed=await db.from('together_account_deletion_jobs').update({status:'processing',attempt_count:attempts,updated_at:now.toISOString()}).eq('id',job.id).in('status',['retry','processing']).select('id').maybeSingle();
    if(!claimed.data)continue;
    let phase='account_deletion_retry_failed';
    try{
      const{data:marker,error:markerError}=await db.from('together_account_deletion_markers').select('user_id,user_fingerprint,billing_provider,provider_subscription_id').eq('user_id',job.user_id).maybeSingle();
      if(markerError||!marker)throw new Error('deletion_marker_missing');

      if(job.billing_cancellation_required&&!job.billing_canceled){
        phase='billing_cancellation_failed';
        if(String(marker.billing_provider??'').toLowerCase()!=='stripe'||!marker.provider_subscription_id)throw new Error('stripe_subscription_missing');
        await cancelStripeSubscriptionNow(String(marker.provider_subscription_id),String(job.correlation_id??job.id));
        await db.from('together_billing_subscriptions').update({status:'canceled',cancel_at_period_end:false,canceled_at:now.toISOString(),access_ends_at:now.toISOString(),updated_at:now.toISOString()}).eq('user_id',job.user_id).eq('provider','stripe').eq('provider_subscription_id',marker.provider_subscription_id);
        await db.from('together_account_deletion_jobs').update({billing_canceled:true,updated_at:now.toISOString()}).eq('id',job.id);
      }

      phase='application_data_delete_failed';
      await stopAccountWork(db,String(job.user_id),now);
      const deletion=job.auth_user_owned
        ? await db.auth.admin.deleteUser(String(job.user_id))
        : await db.rpc('kivelle_delete_application_user_data',{p_user_id:job.user_id});
      if(deletion.error&&!isAlreadyDeletedError(deletion.error))throw deletion.error;
      await db.from('together_account_deletion_markers').update({auth_user_deleted:Boolean(job.auth_user_owned)}).eq('user_id',job.user_id);

      phase='storage_cleanup_pending';
      const ids=Array.isArray(job.storage_job_ids)?job.storage_job_ids.map(String):[];
      if(ids.length)await db.from('together_storage_cleanup_jobs').update({status:'pending',updated_at:now.toISOString()}).in('id',ids).neq('status','complete');
      await processStorageJobs(db,ids,now);
      const{count}=ids.length?await db.from('together_storage_cleanup_jobs').select('id',{head:true,count:'exact'}).in('id',ids).neq('status','complete'):{count:0};
      if(count){
        const outcome=await scheduleRetry(db,job.id,attempts,'storage_cleanup_pending',now);
        outcome==='failed'?failed+=1:retried+=1;
        continue;
      }

      await db.from('together_account_deletion_jobs').update({status:'complete',failure_code:null,completed_at:now.toISOString(),updated_at:now.toISOString()}).eq('id',job.id);
      const receipt=await db.from('together_account_deletion_receipts').insert({id:job.id,user_fingerprint:marker.user_fingerprint,billing_provider:marker.billing_provider??null,billing_canceled:Boolean(job.billing_canceled)||Boolean(job.billing_cancellation_required),storage_object_count:ids.length,correlation_id:job.correlation_id??null});
      if(receipt.error&&receipt.error.code!=='23505')console.warn(JSON.stringify({level:'warn',operation:'account_deletion_retry_receipt',jobId:job.id,code:'receipt_write_failed'}));
      completed+=1;
    }catch{
      const outcome=await scheduleRetry(db,job.id,attempts,phase,now);
      outcome==='failed'?failed+=1:retried+=1;
    }
  }
  return{claimed:jobs?.length??0,completed,retried,failed};
}

async function stopAccountWork(db:SupabaseClient,userId:string,now:Date){
  await Promise.all([
    db.from('together_generated_media').update({status:'failed',failure_code:'account_deleted',failure_reason_safe:'Account deleted.',updated_at:now.toISOString()}).eq('user_id',userId).in('status',['queued','generating']),
    db.from('together_proactive_messages').update({status:'cancelled',updated_at:now.toISOString()}).eq('user_id',userId).eq('status','queued'),
    db.from('together_push_tokens').update({active:false,deactivated_at:now.toISOString()}).eq('user_id',userId),
  ]);
}

async function processStorageJobs(db:SupabaseClient,ids:string[],now:Date){
  if(!ids.length)return;
  const{data:storageJobs}=await db.from('together_storage_cleanup_jobs').select('id,bucket_id,storage_path,attempt_count').in('id',ids).eq('status','pending');
  for(const storage of storageJobs??[]){
    const removal=await db.storage.from(String(storage.bucket_id)).remove([String(storage.storage_path)]);
    await db.from('together_storage_cleanup_jobs').update(removal.error?{attempt_count:Number(storage.attempt_count??0)+1,last_error:'storage_remove_failed',updated_at:now.toISOString()}:{status:'complete',last_error:null,updated_at:now.toISOString()}).eq('id',storage.id).eq('status','pending');
  }
}

async function scheduleRetry(db:SupabaseClient,id:string,attempts:number,failureCode:string,now:Date):Promise<'retry'|'failed'>{
  if(attempts>=8){await db.from('together_account_deletion_jobs').update({status:'failed',failure_code:failureCode,updated_at:now.toISOString()}).eq('id',id);return'failed';}
  const delay=Math.min(360,5*2**Math.max(0,attempts-1));
  await db.from('together_account_deletion_jobs').update({status:'retry',failure_code:failureCode,next_attempt_at:new Date(now.getTime()+delay*60_000).toISOString(),updated_at:now.toISOString()}).eq('id',id);
  return'retry';
}

function isAlreadyDeletedError(error:Row){return Number(error?.status)===404||String(error?.message??'').toLowerCase().includes('not found');}
