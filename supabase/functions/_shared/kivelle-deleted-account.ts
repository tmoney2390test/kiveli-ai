import type{SupabaseClient}from'@supabase/supabase-js';
import{AppError}from'./types.ts';

/** Billing/provider callbacks may acknowledge a deleted account, never rebuild it. */
export async function accountDeletionStarted(db:SupabaseClient,userId:string):Promise<boolean>{
  const{data,error}=await db.from('together_account_deletion_markers').select('user_id').eq('user_id',userId).maybeSingle();
  if(error)throw new AppError('INTERNAL_ERROR','Account lifecycle state could not be verified.',500,true);
  return Boolean(data);
}

export async function deletedAccountForProviderCustomer(db:SupabaseClient,provider:string,customerId:string):Promise<string|null>{
  const{data,error}=await db.from('together_account_deletion_markers').select('user_id').eq('billing_provider',provider).eq('provider_customer_id',customerId).maybeSingle();
  if(error)throw new AppError('INTERNAL_ERROR','Deleted billing identity could not be reconciled.',500,true);
  if(data?.user_id)return String(data.user_id);
  const archived=await db.from('kivelle_account_recreations').select('user_id').eq('billing_provider',provider).eq('provider_customer_id',customerId).limit(1).maybeSingle();
  if(archived.error)throw new AppError('INTERNAL_ERROR','Deleted billing identity could not be reconciled.',500,true);
  return archived.data?.user_id?String(archived.data.user_id):null;
}

/** Missing provider timestamps fail closed only for deliberately recreated accounts. */
export async function billingPredatesRecreation(db:SupabaseClient,userId:string,occurredAt:number|string|null|undefined):Promise<boolean>{
  const {data,error}=await db.from('kivelle_account_recreations').select('recreated_at').eq('user_id',userId).order('recreated_at',{ascending:false}).limit(1).maybeSingle();
  if(error)throw new AppError('INTERNAL_ERROR','Account lifecycle state could not be verified.',500,true);
  if(!data)return false;
  const eventTime=typeof occurredAt==='number'?occurredAt:Date.parse(occurredAt??'');
  return !Number.isFinite(eventTime)||eventTime<Date.parse(String(data.recreated_at));
}
