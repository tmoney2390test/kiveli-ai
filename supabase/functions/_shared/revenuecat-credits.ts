import {creditPacks} from '../../../packages/together-domain/src/index.ts';
import type {RevenueCatAdapterConfig,RevenueCatWebhookEvent} from './revenuecat.ts';
import {AppError} from './types.ts';
import type {adminClient} from './context.ts';
import {accountDeletionStarted} from './kivelle-deleted-account.ts';

// Only signed store events grant consumables. Client balances and receipt IDs
// are never evidence of payment, and consumables never unlock entitlements.
export function storeCreditEvent(event:RevenueCatWebhookEvent,config:RevenueCatAdapterConfig){
  const key=config.creditProducts?.[event.product_id??''];
  if(!key)return null;
  if(!['NON_RENEWING_PURCHASE','CANCELLATION'].includes(event.type))return null;
  const pack=creditPacks.find(pack=>pack.key===key&&pack.active);
  if(!pack||!['APP_STORE','PLAY_STORE'].includes(event.store??'')||!['PRODUCTION','SANDBOX'].includes(event.environment??'')||
    typeof event.transaction_id!=='string'||!event.transaction_id||event.transaction_id.length>512){
    throw new AppError('VALIDATION_ERROR','Store credit transaction is incomplete.',400);
  }
  return {credits:pack.credits,refund:event.type==='CANCELLATION',transactionId:event.transaction_id};
}

export async function applyStoreCreditEvent(db:ReturnType<typeof adminClient>,userId:string,event:RevenueCatWebhookEvent,config:RevenueCatAdapterConfig){
  const purchase=storeCreditEvent(event,config);
  if(!purchase)return false;
  if(await accountDeletionStarted(db,userId))return false;
  const {error}=await db.rpc('kivelle_apply_store_credit_purchase',{
    p_user_id:userId,p_store:event.store,p_environment:event.environment,p_transaction_id:purchase.transactionId,
    p_product_id:event.product_id,p_credits:purchase.credits,p_refund:purchase.refund,
  });
  if(error)throw new AppError('INTERNAL_ERROR','Store credits could not be synchronized.',500,true);
  return true;
}
