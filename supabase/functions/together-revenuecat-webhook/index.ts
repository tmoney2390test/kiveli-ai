import {adminClient,serverEnv} from '../_shared/context.ts';
import {readRequestText} from '../_shared/body.ts';
import {json,serve} from '../_shared/http.ts';
import {AppError} from '../_shared/types.ts';
import {beginBillingEvent,finishBillingEvent} from '../_shared/kivelle-billing-events.ts';
import {fetchRevenueCatSubscriber,normalizeRevenueCatSubscriber,parseRevenueCatWebhook,readRevenueCatAdapterConfig,revenueCatEventUserIds,validateRevenueCatEvent,verifyRevenueCatWebhook,type NormalizedRevenueCatSubscription,type RevenueCatWebhookEvent} from '../_shared/revenuecat.ts';
import {grantSubscriptionCreditsForPeriod,resolveSubscriptionAccess,resolveSubscriptionState} from '../_shared/kivelle-subscription.ts';
import {track} from '../_shared/together.ts';

type Db=ReturnType<typeof adminClient>;
type StoredSubscription={provider_customer_id:string|null;provider_subscription_id:string;provider_product_id:string|null;provider_price_id:string|null;plan_key:'kivelle_plus'|'kivelle_max';status:string;billing_interval:'monthly'|'annual';current_period_start:string|null;current_period_end:string|null;trial_end:string|null;cancel_at_period_end:boolean;canceled_at:string|null;access_ends_at:string|null;metadata:Record<string,unknown>|null};

serve(async(request,correlationId)=>{
  if(request.method!=='POST')throw new AppError('NOT_FOUND','That endpoint is unavailable.',404);
  const config=readRevenueCatAdapterConfig();
  if(!config.enabled)throw new AppError('BILLING_NOT_CONFIGURED','RevenueCat subscription synchronization is disabled.',503,true);
  const rawBody=await readRequestText(request);
  await verifyRevenueCatWebhook({rawBody,authorization:request.headers.get('authorization'),signature:request.headers.get('x-revenuecat-webhook-signature'),expectedAuthorization:serverEnv('KIVELLE_REVENUECAT_WEBHOOK_AUTHORIZATION'),signingSecret:serverEnv('KIVELLE_REVENUECAT_WEBHOOK_SIGNING_SECRET')});
  const event=parseRevenueCatWebhook(rawBody),decision=validateRevenueCatEvent(event,config),db=adminClient();
  const claim=await beginBillingEvent(db,'revenuecat',event.id,event.type);
  if(claim.idempotent)return json({data:{applied:false,idempotent:true},correlationId},200,correlationId);
  const summary={eventType:event.type,environment:event.environment??null,store:event.store??null};
  if(decision==='ignore'){
    await finishBillingEvent(db,'revenuecat',event.id,'ignored',null,summary);
    return json({data:{applied:false,ignored:true},correlationId},200,correlationId);
  }
  const userIds=revenueCatEventUserIds(event);
  if(!userIds.length){
    await finishBillingEvent(db,'revenuecat',event.id,'failed',null,summary,'VALIDATION_ERROR');
    throw new AppError('VALIDATION_ERROR','RevenueCat subscription is not linked to a Kivelle account.',400);
  }
  try{
    const secretApiKey=serverEnv('KIVELLE_REVENUECAT_SECRET_API_KEY');
    const results=[];
    for(const userId of userIds)results.push(await syncRevenueCatUser(db,userId,event,config,secretApiKey));
    await finishBillingEvent(db,'revenuecat',event.id,'processed',userIds[0]??null,{...summary,userCount:userIds.length});
    return json({data:{applied:results.some(Boolean),userCount:userIds.length},correlationId},200,correlationId);
  }catch(error){
    await finishBillingEvent(db,'revenuecat',event.id,'failed',userIds[0]??null,{...summary,userCount:userIds.length},error instanceof AppError?error.code:'INTERNAL_ERROR');
    throw error;
  }
});

async function syncRevenueCatUser(db:Db,userId:string,event:RevenueCatWebhookEvent,config:ReturnType<typeof readRevenueCatAdapterConfig>,secretApiKey:string):Promise<boolean>{
  // The FK-backed entitlement bootstrap proves the custom RevenueCat App User
  // ID belongs to a real Kivelle account before provider state is accepted.
  await resolveSubscriptionAccess(db,userId);
  const snapshot=await fetchRevenueCatSubscriber(userId,secretApiKey),current=normalizeRevenueCatSubscriber(snapshot,config),stableId=`revenuecat:${userId}`;
  const{data:stored,error}=await db.from('together_billing_subscriptions').select('provider_customer_id,provider_subscription_id,provider_product_id,provider_price_id,plan_key,status,billing_interval,current_period_start,current_period_end,trial_end,cancel_at_period_end,canceled_at,access_ends_at,metadata').eq('user_id',userId).eq('provider','revenuecat');
  if(error)throw new AppError('INTERNAL_ERROR','Stored app-store subscription state could not be loaded.',500,true);
  let applied=false;
  if(current){
    applied=await writeRevenueCatRow(db,{userId,event,subscriptionId:stableId,current});
    for(const row of(stored??[]) as StoredSubscription[]){
      if(row.provider_subscription_id===stableId)continue;
      await cancelRevenueCatRow(db,userId,event,row);
    }
    if(applied&&['INITIAL_PURCHASE','RENEWAL','PRODUCT_CHANGE','UNCANCELLATION','TEMPORARY_ENTITLEMENT_GRANT'].includes(event.type)&&current.periodStart){
      await grantSubscriptionCreditsForPeriod(db,{userId,tier:current.tier,periodStart:current.periodStart,sourceProvider:'revenuecat',sourceEventId:event.id,subscriptionId:stableId});
    }
  }else{
    for(const row of(stored??[]) as StoredSubscription[])applied=(await cancelRevenueCatRow(db,userId,event,row))||applied;
  }
  await db.from('together_entitlements').update({revenuecat_app_user_id:userId,updated_at:new Date().toISOString()}).eq('user_id',userId);
  const state=await resolveSubscriptionState(db,userId);
  await track(db,userId,'billing_webhook_applied',{eventId:event.id,provider:'revenuecat',eventType:event.type,tier:state.tier,status:state.billing.status??null,store:current?.store??event.store??null});
  return applied;
}

async function writeRevenueCatRow(db:Db,input:{userId:string;event:RevenueCatWebhookEvent;subscriptionId:string;current:NormalizedRevenueCatSubscription}):Promise<boolean>{
  const current=input.current,{data,error}=await db.rpc('kivelle_sync_billing_subscription_state',{p_user_id:input.userId,p_provider:'revenuecat',p_provider_customer_id:input.userId,p_provider_subscription_id:input.subscriptionId,p_provider_product_id:current.productId,p_provider_price_id:current.productId,p_plan_key:current.tier,p_status:current.status,p_billing_interval:current.billingInterval,p_current_period_start:current.periodStart,p_current_period_end:current.periodEnd,p_trial_end:current.trialEnd,p_cancel_at_period_end:current.cancelAtPeriodEnd,p_canceled_at:current.canceledAt,p_access_ends_at:current.accessEndsAt,p_last_provider_event_created_at:input.event.event_timestamp_ms,p_metadata:{adapter:'revenuecat',store:current.store,sandbox:current.sandbox,lastRevenueCatEventId:input.event.id,lastRevenueCatEventType:input.event.type}});
  if(error)throw new AppError('INTERNAL_ERROR','App-store subscription could not be synchronized.',500,true);
  return data?.stale!==true;
}

async function cancelRevenueCatRow(db:Db,userId:string,event:RevenueCatWebhookEvent,row:StoredSubscription):Promise<boolean>{
  const now=new Date().toISOString(),{data,error}=await db.rpc('kivelle_sync_billing_subscription_state',{p_user_id:userId,p_provider:'revenuecat',p_provider_customer_id:row.provider_customer_id??userId,p_provider_subscription_id:row.provider_subscription_id,p_provider_product_id:row.provider_product_id,p_provider_price_id:row.provider_price_id,p_plan_key:row.plan_key,p_status:event.type==='SUBSCRIPTION_PAUSED'?'paused':'canceled',p_billing_interval:row.billing_interval,p_current_period_start:row.current_period_start,p_current_period_end:row.current_period_end,p_trial_end:row.trial_end,p_cancel_at_period_end:false,p_canceled_at:now,p_access_ends_at:null,p_last_provider_event_created_at:event.event_timestamp_ms,p_metadata:{...(row.metadata??{}),adapter:'revenuecat',lastRevenueCatEventId:event.id,lastRevenueCatEventType:event.type}});
  if(error)throw new AppError('INTERNAL_ERROR','Expired app-store subscription could not be synchronized.',500,true);
  return data?.stale!==true;
}
