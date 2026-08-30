import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import {
  billingManagementCapabilities,
  checkoutConfirmationOutcome,
  creditCosts,
  creditPacks,
  subscriptionCatalog,
  type CreditPackKey,
  type SubscriptionTier,
} from '../../../packages/together-domain/src/index.ts';
import { resolveSubscriptionState, type KivelleSubscriptionState } from '../_shared/kivelle-subscription.ts';
import {
  createStripeCheckoutSession,
  createStripePortalSession,
  ensureStripeCustomer,
  listStripeSubscriptions,
  stripeBillingConfiguration,
  stripePriceForCreditPack,
} from '../_shared/stripe.ts';
import { track } from '../_shared/together.ts';

const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('status')}),
  z.object({action:z.literal('checkout'),tier:z.enum(['kivelle_plus','kivelle_max']),billingInterval:z.enum(['monthly','annual']).default('monthly'),requestId:z.string().uuid().optional()}),
  z.object({action:z.literal('credits_checkout'),productKey:z.enum(['credits_100','credits_300','credits_800','credits_2000']),requestId:z.string().uuid().optional()}),
  z.object({action:z.literal('portal'),requestId:z.string().uuid().optional()}),
  z.object({action:z.literal('checkout_confirmation'),sessionId:z.string().regex(/^cs_(test_|live_)?[A-Za-z0-9_]+$/).max(255)}),
]);

type Db=Awaited<ReturnType<typeof authenticated>>['db'];
type BillingConfiguration=ReturnType<typeof configurationForUser>;

serve(async(request,correlationId)=>{
  const{user,db}=await authenticated(request);
  const input=request.method==='GET'?{action:'status' as const}:await parseBody(request,schema);
  await enforceRateLimit(db,user.id,`together_subscription_${input.action}`,input.action==='status'||input.action==='checkout_confirmation'?120:12,3600);

  let state=await resolveSubscriptionState(db,user.id);
  const configuration=configurationForUser(user.id,user.email);

  if(input.action==='status')return json({data:await publicSubscriptionStatus(db,user.id,state,configuration),correlationId},200,correlationId);

  if(input.action==='checkout_confirmation'){
    const confirmation=await checkoutConfirmation(db,user.id,input.sessionId);
    if(confirmation.outcome==='succeeded')state=await resolveSubscriptionState(db,user.id);
    return json({data:{...confirmation,state:await publicSubscriptionStatus(db,user.id,state,configuration)},correlationId},200,correlationId);
  }

  const requestId=input.requestId??crypto.randomUUID();
  const management=managementFor(state,configuration);

  if(input.action==='checkout'){
    const checkoutConfigured=input.billingInterval==='annual'?configuration.configuredAnnual[input.tier]:configuration.configured[input.tier];
    if(!checkoutConfigured)throw new AppError('BILLING_NOT_CONFIGURED',`${input.billingInterval==='annual'?'Annual':'Monthly'} checkout is not available for this plan right now.`,503);
    if(state.tier!=='free'||state.billing.status&&['active','trialing','past_due','unpaid','paused','incomplete'].includes(state.billing.status)){
      if(management.manageAction==='portal')return portalResponse(db,user,requestId,state,configuration,correlationId);
      throw new AppError('SUBSCRIPTION_ALREADY_ACTIVE',management.managementReason,409);
    }
    if(configuration.stripe[input.tier]){
      const customerId=await ensureStripeCustomer(db,{userId:user.id,email:user.email});
      const remote=await listStripeSubscriptions(customerId);
      const manageable=remote.find((subscription)=>['active','trialing','past_due','unpaid','paused','incomplete'].includes(subscription.status));
      if(manageable){
        const portal=await createStripePortalSession(db,{userId:user.id,email:user.email,requestId});
        return json({data:{url:portal.url,sessionId:portal.id,provider:'stripe',redirectedToPortal:true},correlationId},200,correlationId);
      }
      await track(db,user.id,'subscription_checkout_started',{tier:input.tier,billingInterval:input.billingInterval,currentTier:state.tier});
      const session=await createStripeCheckoutSession(db,{userId:user.id,email:user.email,tier:input.tier,billingInterval:input.billingInterval,requestId});
      return json({data:{url:session.url,sessionId:session.id,provider:'stripe'},correlationId},200,correlationId);
    }
    const envName=input.tier==='kivelle_plus'?'KIVELLE_PLUS_CHECKOUT_URL':'KIVELLE_MAX_CHECKOUT_URL';
    const url=configuredUrl(envName,user.id,user.email);
    if(!url)throw new AppError('BILLING_NOT_CONFIGURED','Checkout is not available for this plan right now.',503);
    return json({data:{url,provider:'configured'},correlationId},200,correlationId);
  }

  if(input.action==='credits_checkout'){
    if(!management.canPurchaseCredits)throw new AppError('PLAN_LIMIT_REACHED',management.creditPurchaseReason??'Credit packs are not available for this account right now.',403);
    if(stripePriceForCreditPack(input.productKey as CreditPackKey)){
      await track(db,user.id,'credit_checkout_started',{productKey:input.productKey,currentTier:state.tier});
      const session=await createStripeCheckoutSession(db,{userId:user.id,email:user.email,credits:true,creditPackKey:input.productKey as CreditPackKey,requestId});
      return json({data:{url:session.url,sessionId:session.id,provider:'stripe'},correlationId},200,correlationId);
    }
    const url=configuredUrl('KIVELLE_CREDITS_CHECKOUT_URL',user.id,user.email,input.productKey);
    if(!url)throw new AppError('BILLING_NOT_CONFIGURED','Credit checkout is not available right now.',503);
    return json({data:{url,provider:'configured'},correlationId},200,correlationId);
  }

  if(input.action==='portal'){
    if(management.manageAction!=='portal')throw new AppError('CONFLICT',management.managementReason,409);
    return portalResponse(db,user,requestId,state,configuration,correlationId);
  }

  throw new AppError('NOT_FOUND','That billing action is unavailable.',404);
});

function configurationForUser(userId:string,email?:string|null){
  const stripe=stripeBillingConfiguration();
  const legacy={
    kivelle_plus:Boolean(configuredUrl('KIVELLE_PLUS_CHECKOUT_URL',userId,email)),
    kivelle_max:Boolean(configuredUrl('KIVELLE_MAX_CHECKOUT_URL',userId,email)),
    credits:Boolean(configuredUrl('KIVELLE_CREDITS_CHECKOUT_URL',userId,email)),
    portal:Boolean(configuredUrl('KIVELLE_BILLING_PORTAL_URL',userId,email)),
  };
  return{
    stripe,
    legacy,
    configured:{kivelle_plus:stripe.kivelle_plus||legacy.kivelle_plus,kivelle_max:stripe.kivelle_max||legacy.kivelle_max,credits:stripe.credits||legacy.credits,portal:stripe.portal||legacy.portal},
    configuredAnnual:{kivelle_plus:stripe.kivelle_plus_annual,kivelle_max:stripe.kivelle_max_annual},
  };
}

function managementFor(state:KivelleSubscriptionState,configuration:BillingConfiguration){
  return billingManagementCapabilities({
    tier:state.tier,
    provider:state.billing.provider,
    status:state.billing.status,
    subscriptionId:state.billing.subscriptionId,
    managedByKivelle:state.billing.managedByKivelle,
    stripePortalConfigured:configuration.stripe.portal,
    configuredPortalConfigured:configuration.legacy.portal,
    creditCheckoutConfigured:configuration.configured.credits,
  });
}

async function publicSubscriptionStatus(db:Db,userId:string,state:KivelleSubscriptionState,configuration:BillingConfiguration){
  const[{data:activity,error:activityError},{data:latestGrant,error:grantError}]=await Promise.all([
    db.from('together_credit_ledger').select('id,event_type,permanent_delta,subscription_delta,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(12),
    db.from('together_credit_ledger').select('created_at').eq('user_id',userId).eq('event_type','subscription_grant').order('created_at',{ascending:false}).limit(1).maybeSingle(),
  ]);
  if(activityError||grantError)throw new AppError('INTERNAL_ERROR','Credit activity could not be loaded.',500,true);
  const publicCreditPacks=creditPacks.map((pack)=>({...pack,checkoutConfigured:Boolean(stripePriceForCreditPack(pack.key)||configuration.legacy.credits)}));
  return{
    ...state,
    billing:publicBillingSummary(state.billing),
    management:managementFor(state,configuration),
    catalog:(Object.keys(subscriptionCatalog)as SubscriptionTier[]).map((tier)=>publicPlan(tier)),
    creditCosts,
    creditPacks:publicCreditPacks,
    creditActivity:(activity??[]).map((row)=>({id:String(row.id),eventType:String(row.event_type),permanentDelta:Number(row.permanent_delta??0),subscriptionDelta:Number(row.subscription_delta??0),createdAt:String(row.created_at)})),
    nextCreditGrantAt:nextCreditGrantAt(state,latestGrant?.created_at),
    pricing:{currency:'USD',pricesExcludeTax:true},
    billingConfigured:configuration.configured,
    billingConfiguredAnnual:configuration.configuredAnnual,
    billingProvider:configuration.stripe.secretKey?'stripe':Object.values(configuration.legacy).some(Boolean)?'configured':null,
  };
}

async function checkoutConfirmation(db:Db,userId:string,sessionId:string){
  const[{data:events,error:eventError},{data:purchase,error:purchaseError}]=await Promise.all([
    db.from('together_billing_events').select('status,event_type,error_code,created_at').eq('provider','stripe').eq('user_id',userId).contains('payload_summary',{checkoutSessionId:sessionId}).order('created_at',{ascending:false}).limit(5),
    db.from('together_credit_ledger').select('permanent_delta').eq('user_id',userId).eq('event_type','purchase').eq('stripe_checkout_session_id',sessionId).maybeSingle(),
  ]);
  if(eventError||purchaseError)throw new AppError('INTERNAL_ERROR','Checkout confirmation could not be checked.',500,true);
  return checkoutConfirmationOutcome((events??[]).map((event)=>({status:event.status,eventType:event.event_type})),purchase?.permanent_delta);
}

async function portalResponse(db:Db,user:{id:string;email?:string|null},requestId:string,state:KivelleSubscriptionState,configuration:BillingConfiguration,correlationId:string){
  if(state.billing.provider==='stripe'&&configuration.stripe.portal){
    const session=await createStripePortalSession(db,{userId:user.id,email:user.email,requestId});
    return json({data:{url:session.url,sessionId:session.id,provider:'stripe'},correlationId},200,correlationId);
  }
  const url=configuredUrl('KIVELLE_BILLING_PORTAL_URL',user.id,user.email);
  if(!url)throw new AppError('BILLING_NOT_CONFIGURED','Subscription management is temporarily unavailable. Contact Kivelle Support for help.',503);
  return json({data:{url,provider:'configured'},correlationId},200,correlationId);
}

function nextCreditGrantAt(state:KivelleSubscriptionState,latestGrant?:string|null):string|null{
  if(state.tier==='free'||state.capabilities.monthlyCreditGrant<=0||!['active','trialing','past_due'].includes(String(state.billing.status)))return null;
  if(state.billing.billingInterval==='monthly'&&futureDate(state.billing.periodEnd))return state.billing.periodEnd??null;
  const base=futureDate(state.billing.periodStart)?state.billing.periodStart:latestGrant??state.billing.periodStart;
  if(!base)return null;
  const next=new Date(base);if(Number.isNaN(next.getTime()))return null;
  next.setUTCMonth(next.getUTCMonth()+1);
  while(next.getTime()<=Date.now())next.setUTCMonth(next.getUTCMonth()+1);
  return next.toISOString();
}

function futureDate(value?:string|null):boolean{if(!value)return false;const time=new Date(value).getTime();return Number.isFinite(time)&&time>Date.now();}
function publicPlan(tier:SubscriptionTier){const plan=subscriptionCatalog[tier];return{tier:plan.tier,displayName:plan.displayName,monthlyPriceUsd:plan.monthlyPriceUsd,annualPriceUsd:plan.annualPriceUsd,chatDailyLimit:plan.chatDailyLimit,introductoryChatDailyLimit:plan.introductoryChatDailyLimit,introductoryChatDays:plan.introductoryChatDays,includedCompanionPhotoDailyLimit:plan.includedCompanionPhotoDailyLimit,includedDatePhotoMonthlyLimit:plan.includedDatePhotoMonthlyLimit,intelligenceProfile:plan.intelligenceProfile,memoryRetrievalBudget:plan.memoryRetrievalBudget,historyRetrievalBudget:plan.historyRetrievalBudget,maxLives:plan.maxLives,maxCustomCompanions:plan.maxCustomCompanions,worldAccess:plan.worldAccess,earlyWorldAccess:plan.earlyWorldAccess,monthlyCreditGrant:plan.monthlyCreditGrant,subscriptionCreditRolloverCap:plan.subscriptionCreditRolloverCap,mediaQueue:plan.mediaQueue};}
function publicBillingSummary(billing:KivelleSubscriptionState['billing']){return{provider:billing.provider??null,status:billing.status??null,billingInterval:billing.billingInterval,periodStart:billing.periodStart??null,periodEnd:billing.periodEnd??null,expiresAt:billing.expiresAt??null,trialEnd:billing.trialEnd??null,cancelAtPeriodEnd:Boolean(billing.cancelAtPeriodEnd),canceledAt:billing.canceledAt??null,paymentIssue:Boolean(billing.paymentIssue),mayPurchaseCredits:Boolean(billing.mayPurchaseCredits)};}
function configuredUrl(name:string,userId:string,email?:string|null,productKey?:string):string|null{const template=Deno.env.get(name)?.trim();if(!template)return null;const value=template.replaceAll('{user_id}',encodeURIComponent(userId)).replaceAll('{email}',encodeURIComponent(email??'')).replaceAll('{product_key}',encodeURIComponent(productKey??''));try{const url=new URL(value);return url.protocol==='https:'?url.toString():null;}catch{return null;}}
