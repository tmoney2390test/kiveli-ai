import{z}from'zod';
import{adminClient,serverEnv}from'../_shared/context.ts';
import{parseBody}from'../_shared/body.ts';
import{json,serve}from'../_shared/http.ts';
import{AppError}from'../_shared/types.ts';
import{entitlementsForTier,normalizeSubscriptionTier}from'../../../packages/together-domain/src/index.ts';
import{resolveSubscriptionState}from'../_shared/kivelle-subscription.ts';
import{track}from'../_shared/together.ts';

const schema=z.object({eventId:z.string().trim().min(6).max(200),eventType:z.enum(['subscription_updated','subscription_cancelled','credit_purchase']),provider:z.string().trim().min(1).max(80).default('configured'),userId:z.string().uuid(),tier:z.enum(['free','kivelle_plus','kivelle_max','together_plus','unlimited']).optional(),productKey:z.string().trim().max(160).optional(),periodStart:z.string().datetime().optional(),periodEnd:z.string().datetime().optional(),expiresAt:z.string().datetime().nullable().optional(),creditAmount:z.number().int().positive().max(100000).optional(),metadata:z.record(z.string(),z.unknown()).default({})});

serve(async(request,correlationId)=>{
  const secret=serverEnv('KIVELLE_BILLING_WEBHOOK_SECRET');if(request.headers.get('x-kivelle-billing-secret')!==secret)throw new AppError('FORBIDDEN','Billing webhook authorization failed.',403);
  const input=await parseBody(request,schema),db=adminClient();
  const{data:seen}=await db.from('together_analytics_events').select('id').eq('user_id',input.userId).eq('event_name','billing_webhook_applied').contains('properties',{eventId:input.eventId,provider:input.provider}).maybeSingle();
  if(seen)return json({data:{applied:false,idempotent:true},correlationId},200,correlationId);
  if(input.eventType==='credit_purchase'){
    if(!input.creditAmount)throw new AppError('VALIDATION_ERROR','Credit purchase amount is required.',400);
    const{error}=await db.rpc('kivelle_grant_permanent_credits',{p_user_id:input.userId,p_amount:input.creditAmount,p_event_type:'purchase',p_idempotency_key:`purchase:${input.provider}:${input.eventId}`,p_reference_type:'billing_event',p_reference_id:input.eventId,p_metadata:{provider:input.provider,productKey:input.productKey??null,...input.metadata}});if(error)throw new AppError('INTERNAL_ERROR','Purchased credits could not be applied.',500,true);
    await track(db,input.userId,'billing_webhook_applied',{eventId:input.eventId,provider:input.provider,eventType:input.eventType,creditAmount:input.creditAmount});return json({data:{applied:true,subscription:await resolveSubscriptionState(db,input.userId)},correlationId},200,correlationId);
  }
  const tier=normalizeSubscriptionTier(input.eventType==='subscription_cancelled'?'free':input.tier??'free'),keys=[...entitlementsForTier(tier)];
  const{error}=await db.from('together_entitlements').upsert({user_id:input.userId,tier,entitlement_keys:keys,billing_provider:input.provider,product_key:input.productKey??null,billing_period_start:input.periodStart??null,billing_period_end:input.periodEnd??null,expires_at:input.expiresAt??null,metadata:{...input.metadata,lastBillingEventId:input.eventId},updated_at:new Date().toISOString()},{onConflict:'user_id'});if(error)throw new AppError('INTERNAL_ERROR','Subscription entitlement could not be synchronized.',500,true);
  const subscription=await resolveSubscriptionState(db,input.userId);await track(db,input.userId,'billing_webhook_applied',{eventId:input.eventId,provider:input.provider,eventType:input.eventType,tier:subscription.tier});return json({data:{applied:true,subscription},correlationId},200,correlationId);
});
