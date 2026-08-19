import { z } from 'zod';
import { adminClient, serverEnv } from '../_shared/context.ts';
import { parseBody, readRequestText } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { canonicalCreditPurchaseAmount,entitlementsForTier, normalizeSubscriptionTier,resolveCreditPurchaseGrant, type SubscriptionTier } from '../../../packages/together-domain/src/index.ts';
import { resolveSubscriptionState } from '../_shared/kivelle-subscription.ts';
import { stripeObjectCustomerId, stripeObjectSubscriptionId, stripePeriod, stripePriceForTier, stripeSubscriptionHasAccess, verifyStripeWebhook, type StripeEvent } from '../_shared/stripe.ts';
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
  try{
    const object=event.data.object,customerId=stripeObjectCustomerId(object),subscriptionId=stripeObjectSubscriptionId(object),metadata=(object.metadata??{}) as Record<string,unknown>;
    const userId=validUserId(metadata.user_id??object.client_reference_id)??await userForStripeCustomer(db,customerId);
    if(!userId){await finishBillingEvent(db,'stripe',event.id,'ignored',null,{reason:'unmapped_customer',customerId,eventType:event.type});return json({data:{applied:false,ignored:true},correlationId},200,correlationId);}
    if(customerId)await rememberStripeCustomer(db,{userId,customerId,email:typeof object.customer_details?.email==='string'?object.customer_details.email:null});
    let applied=false;
    if(event.type==='checkout.session.completed')applied=await applyCheckoutCompleted(db,{event,userId,customerId,subscriptionId});
    else if(['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed'].includes(event.type))applied=await applySubscriptionEvent(db,{event,userId,customerId,subscriptionId});
    else if(event.type==='invoice.payment_failed'){await markBillingStatus(db,userId,'past_due',event.id);applied=true;}
    else if(event.type==='invoice.paid'){await markBillingStatus(db,userId,'active',event.id);await resolveSubscriptionState(db,userId);applied=true;}
    await finishBillingEvent(db,'stripe',event.id,applied?'processed':'ignored',userId,{eventType:event.type,customerId,subscriptionId});
    return json({data:{applied,...(applied?{subscription:await resolveSubscriptionState(db,userId)}:{ignored:true})},correlationId},200,correlationId);
  }catch(error){await finishBillingEvent(db,'stripe',event.id,'failed',null,{eventType:event.type},error instanceof AppError?error.code:'INTERNAL_ERROR');throw error;}
}

async function applyCheckoutCompleted(db:Db,input:{event:StripeEvent;userId:string;customerId:string|null;subscriptionId:string|null}):Promise<boolean>{
  const object=input.event.data.object,metadata=(object.metadata??{}) as Record<string,unknown>,kind=String(metadata.kind??'');
  if(kind==='credits'){
    if(!['paid','no_payment_required'].includes(String(object.payment_status)))return false;
    const productKey=String(metadata.product_key??''),amount=canonicalCreditPurchaseAmount(productKey);if(!amount)throw new AppError('VALIDATION_FAILED','Stripe credit product metadata is invalid.',400);
    const{error}=await db.rpc('kivelle_grant_permanent_credits',{p_user_id:input.userId,p_amount:amount,p_event_type:'purchase',p_idempotency_key:`purchase:stripe:${input.event.id}`,p_reference_type:'billing_event',p_reference_id:input.event.id,p_metadata:{provider:'stripe',checkoutSessionId:object.id,customerId:input.customerId}});
    if(error)throw new AppError('INTERNAL_ERROR','Purchased credits could not be applied.',500,true);
    await track(db,input.userId,'credit_purchase_completed',{eventId:input.event.id,provider:'stripe',productKey,creditAmount:amount});
    await track(db,input.userId,'billing_webhook_applied',{eventId:input.event.id,provider:'stripe',eventType:'credit_purchase',productKey,creditAmount:amount});return true;
  }
  if(kind==='subscription'){
    const tier=validatedTier(metadata.tier);if(!tier)return false;
    await syncStripeEntitlement(db,{userId:input.userId,tier,status:'active',customerId:input.customerId,subscriptionId:input.subscriptionId,productKey:null,billingInterval:billingInterval(metadata.billing_interval),periodStart:null,periodEnd:null,eventId:input.event.id});return true;
  }
  return false;
}

async function applySubscriptionEvent(db:Db,input:{event:StripeEvent;userId:string;customerId:string|null;subscriptionId:string|null}):Promise<boolean>{
  const object=input.event.data.object,metadata=(object.metadata??{}) as Record<string,unknown>,price=object.items?.data?.[0]?.price??{},priceId=typeof price.id==='string'?price.id:null;
  const tier=validatedTier(metadata.tier)??tierForPrice(priceId);if(!tier)return false;
  const active=input.event.type!=='customer.subscription.deleted'&&stripeSubscriptionHasAccess(object.status),period=stripePeriod(object);
  await syncStripeEntitlement(db,{userId:input.userId,tier:active?tier:'free',status:String(object.status??(active?'active':'canceled')),customerId:input.customerId,subscriptionId:input.subscriptionId,productKey:priceId,billingInterval:billingInterval(metadata.billing_interval??price.recurring?.interval),periodStart:period.start,periodEnd:period.end,eventId:input.event.id});
  await track(db,input.userId,active?'subscription_started':'subscription_cancelled',{provider:'stripe',tier:active?tier:'free'});return true;
}

async function syncStripeEntitlement(db:Db,input:{userId:string;tier:SubscriptionTier;status:string;customerId:string|null;subscriptionId:string|null;productKey:string|null;billingInterval:'monthly'|'annual';periodStart:string|null;periodEnd:string|null;eventId:string}):Promise<void>{
  const{data:current}=await db.from('together_entitlements').select('metadata').eq('user_id',input.userId).maybeSingle();const now=new Date().toISOString();
  const{error}=await db.from('together_entitlements').upsert({user_id:input.userId,tier:input.tier,entitlement_keys:[...entitlementsForTier(input.tier)],billing_provider:'stripe',billing_customer_id:input.customerId,billing_subscription_id:input.subscriptionId,billing_status:input.status,product_key:input.productKey,billing_period_start:input.periodStart,billing_period_end:input.periodEnd,expires_at:null,metadata:{...(current?.metadata??{}),lastBillingEventId:input.eventId,stripeStatus:input.status,billingInterval:input.billingInterval},updated_at:now},{onConflict:'user_id'});
  if(error)throw new AppError('INTERNAL_ERROR','Stripe entitlement could not be synchronized.',500,true);
}

async function markBillingStatus(db:Db,userId:string,status:string,eventId:string):Promise<void>{
  const{data:current}=await db.from('together_entitlements').select('metadata').eq('user_id',userId).maybeSingle();
  const{error}=await db.from('together_entitlements').update({billing_status:status,metadata:{...(current?.metadata??{}),lastBillingEventId:eventId,stripeStatus:status},updated_at:new Date().toISOString()}).eq('user_id',userId).eq('billing_provider','stripe');
  if(error)throw new AppError('INTERNAL_ERROR','Stripe billing status could not be synchronized.',500,true);
}

async function handleLegacyEvent(db:Db,input:z.infer<typeof legacySchema>,correlationId:string):Promise<Response>{
  const ledger=await beginBillingEvent(db,'configured',input.eventId,input.eventType);if(ledger.idempotent)return json({data:{applied:false,idempotent:true},correlationId},200,correlationId);
  try{
    if(input.eventType==='credit_purchase'){
      const amount=resolveCreditPurchaseGrant({productKey:input.productKey,reportedCreditAmount:input.creditAmount,source:input.provider});
      if(!amount)throw new AppError('VALIDATION_ERROR','A recognized credit product is required.',400);
      const{error}=await db.rpc('kivelle_grant_permanent_credits',{p_user_id:input.userId,p_amount:amount,p_event_type:'purchase',p_idempotency_key:`purchase:${input.provider}:${input.eventId}`,p_reference_type:'billing_event',p_reference_id:input.eventId,p_metadata:{provider:input.provider,productKey:input.productKey??null,reportedCreditAmount:input.creditAmount??null,...input.metadata}});if(error)throw new AppError('INTERNAL_ERROR','Purchased credits could not be applied.',500,true);
      await track(db,input.userId,'credit_purchase_completed',{eventId:input.eventId,provider:input.provider,productKey:input.productKey??null,creditAmount:amount});
    }else{
      const tier=normalizeSubscriptionTier(input.eventType==='subscription_cancelled'?'free':input.tier??'free'),keys=[...entitlementsForTier(tier)];
      const{error}=await db.from('together_entitlements').upsert({user_id:input.userId,tier,entitlement_keys:keys,billing_provider:input.provider,product_key:input.productKey??null,billing_period_start:input.periodStart??null,billing_period_end:input.periodEnd??null,expires_at:input.expiresAt??null,metadata:{...input.metadata,lastBillingEventId:input.eventId},updated_at:new Date().toISOString()},{onConflict:'user_id'});if(error)throw new AppError('INTERNAL_ERROR','Subscription entitlement could not be synchronized.',500,true);
    }
    await track(db,input.userId,'billing_webhook_applied',{eventId:input.eventId,provider:input.provider,eventType:input.eventType,creditAmount:input.creditAmount??null});await finishBillingEvent(db,'configured',input.eventId,'processed',input.userId,{eventType:input.eventType,provider:input.provider});return json({data:{applied:true,subscription:await resolveSubscriptionState(db,input.userId)},correlationId},200,correlationId);
  }catch(error){await finishBillingEvent(db,'configured',input.eventId,'failed',input.userId,{eventType:input.eventType},error instanceof AppError?error.code:'INTERNAL_ERROR');throw error;}
}

async function beginBillingEvent(db:Db,provider:'stripe'|'configured',eventId:string,eventType:string):Promise<{idempotent:boolean}>{
  const{data:existing,error:lookupError}=await db.from('together_billing_events').select('status').eq('provider',provider).eq('event_id',eventId).maybeSingle();
  if(lookupError)throw new AppError('INTERNAL_ERROR','Billing event state could not be loaded.',500,true);
  if(existing&&existing.status!=='failed')return{idempotent:true};
  if(existing){
    const{data:claimed,error}=await db.from('together_billing_events').update({status:'processing',error_code:null,updated_at:new Date().toISOString()}).eq('provider',provider).eq('event_id',eventId).eq('status','failed').select('id').maybeSingle();
    if(error)throw new AppError('INTERNAL_ERROR','Billing event retry could not be claimed.',500,true);
    return{idempotent:!claimed};
  }
  const{error}=await db.from('together_billing_events').insert({provider,event_id:eventId,event_type:eventType,status:'processing',payload_summary:{eventType}});if(error){if(error.code==='23505')return{idempotent:true};throw new AppError('INTERNAL_ERROR','Billing event could not be recorded.',500,true);}return{idempotent:false};
}

async function finishBillingEvent(db:Db,provider:'stripe'|'configured',eventId:string,status:'processed'|'ignored'|'failed',userId:string|null,summary:Record<string,unknown>,errorCode?:string):Promise<void>{const{error}=await db.from('together_billing_events').update({status,user_id:userId,payload_summary:summary,error_code:errorCode??null,processed_at:status==='failed'?null:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('provider',provider).eq('event_id',eventId);if(error)console.error(JSON.stringify({level:'error',operation:'finish_billing_event',provider,eventId,status,code:error.code}));}
async function userForStripeCustomer(db:Db,customerId:string|null):Promise<string|null>{if(!customerId)return null;const{data}=await db.from('together_billing_customers').select('user_id').eq('provider','stripe').eq('customer_id',customerId).maybeSingle();return data?.user_id?String(data.user_id):null;}
async function rememberStripeCustomer(db:Db,input:{userId:string;customerId:string;email:string|null}):Promise<void>{const{error}=await db.from('together_billing_customers').upsert({user_id:input.userId,provider:'stripe',customer_id:input.customerId,email:input.email,metadata:{lastWebhookAt:new Date().toISOString()},updated_at:new Date().toISOString()},{onConflict:'user_id,provider'});if(error)throw new AppError('INTERNAL_ERROR','Stripe customer ownership could not be synchronized.',500,true);}
function tierForPrice(priceId:string|null):Exclude<SubscriptionTier,'free'>|null{if(!priceId)return null;if([stripePriceForTier('kivelle_plus','monthly'),stripePriceForTier('kivelle_plus','annual')].includes(priceId))return'kivelle_plus';if([stripePriceForTier('kivelle_max','monthly'),stripePriceForTier('kivelle_max','annual')].includes(priceId))return'kivelle_max';return null;}
function validatedTier(value:unknown):Exclude<SubscriptionTier,'free'>|null{return value==='kivelle_plus'||value==='kivelle_max'?value:null;}
function billingInterval(value:unknown):'monthly'|'annual'{return value==='annual'||value==='year'?'annual':'monthly';}
function validUserId(value:unknown):string|null{return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)?value:null;}
