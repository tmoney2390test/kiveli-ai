import { z } from 'zod';
import { adminClient, serverEnv } from '../_shared/context.ts';
import { parseBody, readRequestText } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import {creditReversalTarget,entitlementsForTier,normalizeSubscriptionTier,resolveCreditPack,resolveCreditPurchaseGrant,type SubscriptionTier} from '../../../packages/together-domain/src/index.ts';
import {grantSubscriptionCreditsForPeriod,resolveSubscriptionState} from '../_shared/kivelle-subscription.ts';
import {normalizeStripeSubscription,retrieveStripeCharge,retrieveStripeCheckoutLineItems,retrieveStripeSubscription,stripeCreditPackForPrice,stripeObjectChargeId,stripeObjectCustomerId,stripeObjectPaymentIntentId,stripeObjectSubscriptionId,stripePeriod,stripeSubscriptionHasAccess,stripeTierForPrice,verifyStripeWebhook,type StripeEvent,type StripeSubscriptionSnapshot} from '../_shared/stripe.ts';
import { track } from '../_shared/together.ts';
import { constantTimeEqual } from '../../../packages/together-domain/src/security.ts';

const legacySchema=z.object({eventId:z.string().trim().min(6).max(200),eventType:z.enum(['subscription_updated','subscription_cancelled','credit_purchase']),provider:z.string().trim().min(1).max(80).default('configured'),userId:z.string().uuid(),tier:z.enum(['free','kivelle_plus','kivelle_max','together_plus','unlimited']).optional(),productKey:z.string().trim().max(160).optional(),periodStart:z.string().datetime().optional(),periodEnd:z.string().datetime().optional(),expiresAt:z.string().datetime().nullable().optional(),creditAmount:z.number().int().positive().max(100000).optional(),metadata:z.record(z.string(),z.unknown()).default({})});
type Db=ReturnType<typeof adminClient>;

serve(async(request,correlationId)=>{
  if(request.method!=='POST')throw new AppError('NOT_FOUND','That endpoint is unavailable.',404);
  const signature=request.headers.get('stripe-signature');
  if(signature){const raw=await readRequestText(request),event=await verifyStripeWebhook(raw,signature);return handleStripeEvent(adminClient(),event,correlationId);}
  const secret=serverEnv('KIVELLE_BILLING_WEBHOOK_SECRET'),supplied=request.headers.get('x-kivelle-billing-secret');if(!supplied||!constantTimeEqual(supplied,secret))throw new AppError('FORBIDDEN','Billing webhook authorization failed.',403);
  return handleLegacyEvent(adminClient(),await parseBody(request,legacySchema),correlationId);
});

async function handleStripeEvent(db:Db,event:StripeEvent,correlationId:string):Promise<Response>{
  const ledger=await beginBillingEvent(db,'stripe',event.id,event.type);if(ledger.idempotent)return json({data:{applied:false,idempotent:true},correlationId},200,correlationId);
  let userId:string|null=null;
  try{
    const object=event.data.object,customerId=stripeObjectCustomerId(object),metadata=metadataForObject(object);
    userId=validUserId(metadata.user_id??object.client_reference_id)??await userForStripeCustomer(db,customerId);
    if(userId&&customerId)await rememberStripeCustomer(db,{userId,customerId,email:typeof object.customer_details?.email==='string'?object.customer_details.email:null});
    let applied=false;
    if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)){
      if(!userId)throw new AppError('VALIDATION_FAILED','Stripe checkout is not linked to a Kivelle account.',400);
      applied=await applyCheckoutCompleted(db,{event,userId,customerId});
    }else if(event.type==='checkout.session.async_payment_failed')applied=false;
    else if(['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed'].includes(event.type)){
      const subscriptionId=stripeObjectSubscriptionId(object);if(!subscriptionId)throw new AppError('VALIDATION_FAILED','Stripe subscription event is incomplete.',400);
      const snapshot=await latestSubscriptionSnapshot(subscriptionId,object,event.type);userId=userId??validUserId(snapshot.metadata.user_id)??await userForStripeCustomer(db,snapshot.customerId);if(!userId)throw new AppError('VALIDATION_FAILED','Stripe subscription is not linked to a Kivelle account.',400);
      if(snapshot.customerId)await rememberStripeCustomer(db,{userId,customerId:snapshot.customerId,email:null});applied=await syncStripeSubscription(db,userId,snapshot,event);
    }else if(['invoice.paid','invoice.payment_failed','invoice.payment_action_required'].includes(event.type)){
      const subscriptionId=stripeObjectSubscriptionId(object);if(!subscriptionId){applied=false;}else{
        const snapshot=await retrieveStripeSubscription(subscriptionId);userId=userId??validUserId(snapshot.metadata.user_id)??await userForStripeCustomer(db,snapshot.customerId);if(!userId)throw new AppError('VALIDATION_FAILED','Stripe invoice is not linked to a Kivelle account.',400);
        await syncStripeSubscription(db,userId,snapshot,event);applied=true;
        if(event.type==='invoice.paid'&&snapshot.status==='active')await grantPaidInvoiceCredits(db,{event,userId,invoice:object,snapshot});
      }
    }else if(['charge.refunded','refund.created','charge.dispute.created'].includes(event.type)){
      const chargeId=stripeObjectChargeId(object),charge=object.object==='charge'?object:chargeId?await retrieveStripeCharge(chargeId):null;
      if(!charge){applied=false;await finishBillingEvent(db,'stripe',event.id,'ignored',userId,{eventType:event.type,customerId});return json({data:{applied:false,ignored:true},correlationId},200,correlationId);}
      const paymentIntentId=stripeObjectPaymentIntentId(charge);if(paymentIntentId){userId=userId??await userForStripeCustomer(db,stripeObjectCustomerId(charge));applied=await applyCreditPurchaseReversal(db,{event,userId,paymentIntentId,charge,disputed:event.type==='charge.dispute.created'});}else applied=false;
    }else if(event.type==='charge.dispute.closed')applied=false;
    await finishBillingEvent(db,'stripe',event.id,applied?'processed':'ignored',userId,{eventType:event.type,customerId,...(event.type.startsWith('checkout.session.')&&typeof object.id==='string'?{checkoutSessionId:object.id}:{})});
    return json({data:{applied,...(userId&&applied?{subscription:await resolveSubscriptionState(db,userId)}:{ignored:!applied})},correlationId},200,correlationId);
  }catch(error){await finishBillingEvent(db,'stripe',event.id,'failed',userId,{eventType:event.type},error instanceof AppError?error.code:'INTERNAL_ERROR');throw error;}
}

async function applyCheckoutCompleted(db:Db,input:{event:StripeEvent;userId:string;customerId:string|null}):Promise<boolean>{
  const object=input.event.data.object,metadata=metadataForObject(object),kind=String(metadata.kind??'');
  if(kind==='credits'){
    if(!['paid','no_payment_required'].includes(String(object.payment_status)))return false;
    const lineItems=await retrieveStripeCheckoutLineItems(String(object.id)),line=lineItems.length===1?lineItems[0]:null,productKey=line&&line.quantity===1?stripeCreditPackForPrice(line.priceId):null,pack=resolveCreditPack(productKey);
    if(!pack)throw new AppError('VALIDATION_FAILED','Stripe checkout did not contain a recognized Kivelle Credit pack.',400);
    const idempotencyKey=`purchase:stripe:${object.id}`,paymentIntentId=stripeObjectPaymentIntentId(object),{data,error}=await db.rpc('kivelle_grant_permanent_credits',{p_user_id:input.userId,p_amount:pack.credits,p_event_type:'purchase',p_idempotency_key:idempotencyKey,p_reference_type:'stripe_checkout_session',p_reference_id:String(object.id),p_metadata:{provider:'stripe',productKey:pack.key,checkoutSessionId:object.id,paymentIntentId,customerId:input.customerId}});if(error)throw new AppError('INTERNAL_ERROR','Purchased credits could not be applied.',500,true);
    await db.from('together_credit_ledger').update({billing_provider:'stripe',stripe_event_id:input.event.id,stripe_checkout_session_id:String(object.id),stripe_payment_intent_id:paymentIntentId}).eq('user_id',input.userId).eq('idempotency_key',idempotencyKey);
    await track(db,input.userId,'credit_purchase_completed',{eventId:input.event.id,provider:'stripe',productKey:pack.key,creditAmount:pack.credits,idempotent:Boolean(data?.idempotent)});return true;
  }
  if(kind==='subscription'){
    const subscriptionId=stripeObjectSubscriptionId(object);if(!subscriptionId)return false;return syncStripeSubscription(db,input.userId,await retrieveStripeSubscription(subscriptionId),input.event);
  }
  return false;
}

async function syncStripeSubscription(db:Db,userId:string,snapshot:StripeSubscriptionSnapshot,event:StripeEvent):Promise<boolean>{
  const mapping=stripeTierForPrice(snapshot.priceId);if(!mapping)return false;
  const accessEndsAt=stripeSubscriptionHasAccess(snapshot.status,snapshot.periodEnd)?snapshot.periodEnd:null,record={user_id:userId,provider:'stripe',provider_customer_id:snapshot.customerId,provider_subscription_id:snapshot.id,provider_product_id:snapshot.productId,provider_price_id:snapshot.priceId,plan_key:mapping.tier,status:snapshot.status,billing_interval:mapping.billingInterval,current_period_start:snapshot.periodStart,current_period_end:snapshot.periodEnd,trial_end:snapshot.trialEnd,cancel_at_period_end:snapshot.cancelAtPeriodEnd,canceled_at:snapshot.canceledAt,access_ends_at:accessEndsAt,last_provider_event_created_at:event.created,metadata:{lastStripeEventId:event.id,apiObject:'subscription'},updated_at:new Date().toISOString()};
  const{data,error}=await db.rpc('kivelle_sync_billing_subscription_state',{p_user_id:record.user_id,p_provider:record.provider,p_provider_customer_id:record.provider_customer_id,p_provider_subscription_id:record.provider_subscription_id,p_provider_product_id:record.provider_product_id,p_provider_price_id:record.provider_price_id,p_plan_key:record.plan_key,p_status:record.status,p_billing_interval:record.billing_interval,p_current_period_start:record.current_period_start,p_current_period_end:record.current_period_end,p_trial_end:record.trial_end,p_cancel_at_period_end:record.cancel_at_period_end,p_canceled_at:record.canceled_at,p_access_ends_at:record.access_ends_at,p_last_provider_event_created_at:record.last_provider_event_created_at,p_metadata:record.metadata});if(error)throw new AppError('INTERNAL_ERROR','Stripe subscription could not be synchronized.',500,true);
  if(data?.stale===true)return false;
  await resolveSubscriptionState(db,userId);await track(db,userId,'billing_webhook_applied',{eventId:event.id,provider:'stripe',eventType:event.type,tier:mapping.tier,status:snapshot.status,cancelAtPeriodEnd:snapshot.cancelAtPeriodEnd});return true;
}

async function grantPaidInvoiceCredits(db:Db,input:{event:StripeEvent;userId:string;invoice:Record<string,any>;snapshot:StripeSubscriptionSnapshot}):Promise<void>{
  const mapping=stripeTierForPrice(input.snapshot.priceId),invoicePeriod=stripePeriod(input.invoice),periodStart=invoicePeriod.start??input.snapshot.periodStart;if(!mapping||!periodStart)return;
  await grantSubscriptionCreditsForPeriod(db,{userId:input.userId,tier:mapping.tier,periodStart,sourceProvider:'stripe',sourceEventId:input.event.id,invoiceId:String(input.invoice.id),subscriptionId:input.snapshot.id});
}

async function applyCreditPurchaseReversal(db:Db,input:{event:StripeEvent;userId:string|null;paymentIntentId:string;charge:Record<string,any>;disputed:boolean}):Promise<boolean>{
  const{data:purchase,error}=await db.from('together_credit_ledger').select('id,user_id,permanent_delta,metadata').eq('stripe_payment_intent_id',input.paymentIntentId).eq('event_type','purchase').maybeSingle();if(error)throw new AppError('INTERNAL_ERROR','Credit purchase history could not be reconciled.',500,true);if(!purchase)return false;
  const userId=input.userId??String(purchase.user_id),target=creditReversalTarget({grantedCredits:Number(purchase.permanent_delta),amountPaid:Number(input.charge.amount),amountReversed:Number(input.charge.amount_refunded??input.charge.amount),disputed:input.disputed});if(target<=0)return false;
  const{error:rpcError}=await db.rpc('kivelle_apply_credit_purchase_reversal',{p_user_id:userId,p_purchase_ledger_id:purchase.id,p_target_credits:target,p_provider:'stripe',p_provider_event_id:input.event.id,p_reason:input.disputed?'dispute':'refund',p_metadata:{paymentIntentId:input.paymentIntentId,chargeId:input.charge.id,cumulativeTarget:target}});if(rpcError)throw new AppError('INTERNAL_ERROR','Credit refund could not be reconciled.',500,true);
  await track(db,userId,input.disputed?'credit_purchase_disputed':'credit_purchase_refunded',{eventId:input.event.id,targetCredits:target});return true;
}

async function handleLegacyEvent(db:Db,input:z.infer<typeof legacySchema>,correlationId:string):Promise<Response>{
  const ledger=await beginBillingEvent(db,'configured',input.eventId,input.eventType);if(ledger.idempotent)return json({data:{applied:false,idempotent:true},correlationId},200,correlationId);
  try{
    if(input.eventType==='credit_purchase'){
      const amount=resolveCreditPurchaseGrant({productKey:input.productKey,reportedCreditAmount:input.creditAmount,source:input.provider});if(!amount)throw new AppError('VALIDATION_ERROR','A recognized credit product is required.',400);
      const{error}=await db.rpc('kivelle_grant_permanent_credits',{p_user_id:input.userId,p_amount:amount,p_event_type:'purchase',p_idempotency_key:`purchase:${input.provider}:${input.eventId}`,p_reference_type:'billing_event',p_reference_id:input.eventId,p_metadata:{provider:input.provider,productKey:input.productKey??null,reportedCreditAmount:input.creditAmount??null,...input.metadata}});if(error)throw new AppError('INTERNAL_ERROR','Purchased credits could not be applied.',500,true);
    }else{
      await syncConfiguredSubscription(db,input);
    }
    await finishBillingEvent(db,'configured',input.eventId,'processed',input.userId,{eventType:input.eventType,provider:input.provider});return json({data:{applied:true,subscription:await resolveSubscriptionState(db,input.userId)},correlationId},200,correlationId);
  }catch(error){await finishBillingEvent(db,'configured',input.eventId,'failed',input.userId,{eventType:input.eventType},error instanceof AppError?error.code:'INTERNAL_ERROR');throw error;}
}

async function syncConfiguredSubscription(db:Db,input:z.infer<typeof legacySchema>):Promise<void>{
  const provider=input.provider==='revenuecat'?'revenuecat':'configured',requestedTier=normalizeSubscriptionTier(input.tier??'free'),now=new Date(),expires=input.expiresAt??input.periodEnd??null,stillPaid=Boolean(expires&&new Date(expires).getTime()>now.getTime()),tier:SubscriptionTier=requestedTier==='free'?'free':requestedTier,status=input.eventType==='subscription_cancelled'?(stillPaid?'active':'canceled'):(tier==='free'?'canceled':'active'),providerSubscriptionId=stringMetadata(input.metadata,'subscriptionId')??stringMetadata(input.metadata,'subscription_id')??`${provider}-${input.userId}`;
  if(tier==='free'){
    await db.from('together_billing_subscriptions').update({status:'canceled',cancel_at_period_end:false,canceled_at:now.toISOString(),access_ends_at:null,last_provider_event_created_at:null,metadata:{...input.metadata,lastBillingEventId:input.eventId},updated_at:now.toISOString()}).eq('user_id',input.userId).eq('provider',provider);
  }else{
    const{error}=await db.from('together_billing_subscriptions').upsert({user_id:input.userId,provider,provider_customer_id:stringMetadata(input.metadata,'customerId')??stringMetadata(input.metadata,'appUserId'),provider_subscription_id:providerSubscriptionId,provider_product_id:input.productKey??null,provider_price_id:input.productKey??null,plan_key:tier,status,billing_interval:stringMetadata(input.metadata,'billingInterval')==='annual'?'annual':'monthly',current_period_start:input.periodStart??null,current_period_end:input.periodEnd??null,trial_end:null,cancel_at_period_end:input.eventType==='subscription_cancelled'&&stillPaid,canceled_at:input.eventType==='subscription_cancelled'?now.toISOString():null,access_ends_at:status==='active'?expires:null,metadata:{...input.metadata,lastBillingEventId:input.eventId},updated_at:now.toISOString()},{onConflict:'provider,provider_subscription_id'});if(error)throw new AppError('INTERNAL_ERROR','Provider subscription could not be synchronized.',500,true);
    if(status==='active'&&input.periodStart)await grantSubscriptionCreditsForPeriod(db,{userId:input.userId,tier,periodStart:input.periodStart,sourceProvider:provider,sourceEventId:input.eventId,subscriptionId:providerSubscriptionId});
  }
  const state=await resolveSubscriptionState(db,input.userId),keys=[...entitlementsForTier(state.tier)];
  const{error}=await db.from('together_entitlements').update({tier:state.tier,entitlement_keys:keys,billing_provider:state.billing.provider??provider,product_key:input.productKey??null,billing_period_start:state.billing.periodStart??null,billing_period_end:state.billing.periodEnd??null,expires_at:state.billing.expiresAt??null,metadata:{...input.metadata,lastBillingEventId:input.eventId},updated_at:now.toISOString()}).eq('user_id',input.userId);if(error)throw new AppError('INTERNAL_ERROR','Subscription entitlement could not be synchronized.',500,true);
}

async function beginBillingEvent(db:Db,provider:'stripe'|'configured',eventId:string,eventType:string):Promise<{idempotent:boolean}>{const{data:existing,error:lookupError}=await db.from('together_billing_events').select('status,attempts,last_attempt_at').eq('provider',provider).eq('event_id',eventId).maybeSingle();if(lookupError)throw new AppError('INTERNAL_ERROR','Billing event state could not be loaded.',500,true);if(existing&&['processed','ignored'].includes(existing.status))return{idempotent:true};if(existing){const stale=existing.status==='processing'&&new Date(existing.last_attempt_at??0).getTime()<Date.now()-5*60_000;if(existing.status==='processing'&&!stale)throw new AppError('CONFLICT','That billing event is already being processed.',409,true);const{data:claimed,error}=await db.from('together_billing_events').update({status:'processing',attempts:Number(existing.attempts??1)+1,last_attempt_at:new Date().toISOString(),error_code:null,updated_at:new Date().toISOString()}).eq('provider',provider).eq('event_id',eventId).in('status',stale?['processing','failed']:['failed']).select('id').maybeSingle();if(error)throw new AppError('INTERNAL_ERROR','Billing event retry could not be claimed.',500,true);if(!claimed)throw new AppError('CONFLICT','That billing event is already being processed.',409,true);return{idempotent:false};}const{error}=await db.from('together_billing_events').insert({provider,event_id:eventId,event_type:eventType,status:'processing',attempts:1,last_attempt_at:new Date().toISOString(),payload_summary:{eventType}});if(error){if(error.code==='23505')throw new AppError('CONFLICT','That billing event is already being processed.',409,true);throw new AppError('INTERNAL_ERROR','Billing event could not be recorded.',500,true);}return{idempotent:false};}
async function finishBillingEvent(db:Db,provider:'stripe'|'configured',eventId:string,status:'processed'|'ignored'|'failed',userId:string|null,summary:Record<string,unknown>,errorCode?:string):Promise<void>{const{error}=await db.from('together_billing_events').update({status,user_id:userId,payload_summary:summary,error_code:errorCode??null,processed_at:status==='failed'?null:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('provider',provider).eq('event_id',eventId);if(error)console.error(JSON.stringify({level:'error',operation:'finish_billing_event',provider,eventId,status,code:error.code}));}
async function userForStripeCustomer(db:Db,customerId:string|null):Promise<string|null>{if(!customerId)return null;const{data}=await db.from('together_billing_customers').select('user_id').eq('provider','stripe').eq('customer_id',customerId).maybeSingle();return data?.user_id?String(data.user_id):null;}
async function rememberStripeCustomer(db:Db,input:{userId:string;customerId:string;email:string|null}):Promise<void>{const{error}=await db.from('together_billing_customers').upsert({user_id:input.userId,provider:'stripe',customer_id:input.customerId,...(input.email?{email:input.email}:{}),metadata:{lastWebhookAt:new Date().toISOString()},updated_at:new Date().toISOString()},{onConflict:'user_id,provider'});if(error)throw new AppError('INTERNAL_ERROR','Stripe customer ownership could not be synchronized.',500,true);}
function metadataForObject(object:Record<string,any>):Record<string,unknown>{const direct=isRecord(object.metadata)?object.metadata:{},subscription=isRecord(object.parent?.subscription_details?.metadata)?object.parent.subscription_details.metadata:{};return{...subscription,...direct};}
function validUserId(value:unknown):string|null{return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)?value:null;}
function isRecord(value:unknown):value is Record<string,unknown>{return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);}
function stringMetadata(metadata:Record<string,unknown>,key:string):string|null{const value=metadata[key];return typeof value==='string'&&value.trim()?value.trim():null;}

async function latestSubscriptionSnapshot(subscriptionId:string,eventObject:Record<string,any>,eventType:string):Promise<StripeSubscriptionSnapshot>{
  try{return await retrieveStripeSubscription(subscriptionId);}
  catch(error){
    // A deleted subscription can briefly become unavailable from the retrieve
    // endpoint. Its signed webhook object is still authoritative for terminal
    // state, while all non-terminal events continue to fail and retry.
    if(eventType==='customer.subscription.deleted'&&eventObject.object==='subscription')return normalizeStripeSubscription(eventObject);
    throw error;
  }
}
