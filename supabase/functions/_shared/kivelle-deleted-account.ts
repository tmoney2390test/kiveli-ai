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
  return data?.user_id?String(data.user_id):null;
}
