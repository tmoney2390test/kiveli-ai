import { z } from 'zod';
import { authenticated, enforceRateLimit, serverEnv } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import {
  billingManagementCapabilities,
  checkoutConfirmationOutcome,
  creditCosts,
  creditPacks,
  subscriptionCatalog,
  type SubscriptionTier,
} from '../../../packages/together-domain/src/index.ts';
import { resolveSubscriptionState, type KivelleSubscriptionState } from '../_shared/kivelle-subscription.ts';
import { verifyWebSurfaceAssertion } from '../_shared/web-adult-access.ts';
import { resolveBillingSurfacePolicy, storeOnlyBillingManagement, type BillingSurfacePolicy } from '../_shared/web-billing-policy.ts';

import {syncRevenueCatUser} from '../_shared/kivelle-revenuecat-sync.ts';
import {readRevenueCatAdapterConfig,type RevenueCatWebhookEvent} from '../_shared/revenuecat.ts';

const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('status')}),
  z.object({action:z.literal('reconcile')}),
  z.object({action:z.literal('checkout'),tier:z.enum(['kivelle_plus','kivelle_max']),billingInterval:z.enum(['monthly','annual']).default('monthly'),requestId:z.string().uuid().optional()}),
  z.object({action:z.literal('credits_checkout'),productKey:z.enum(['credits_100','credits_300','credits_800','credits_2000']),requestId:z.string().uuid().optional()}),
  z.object({action:z.literal('portal'),requestId:z.string().uuid().optional()}),
  z.object({action:z.literal('checkout_confirmation'),sessionId:z.string().regex(/^cs_(test_|live_)?[A-Za-z0-9_]+$/).max(255)}),
]);

type Db=Awaited<ReturnType<typeof authenticated>>['db'];
type BillingConfiguration=ReturnType<typeof billingConfiguration>;

serve(async(request,correlationId)=>{
  const{user,db}=await authenticated(request);
  const input=request.method==='GET'?{action:'status' as const}:await parseBody(request,schema);
  await enforceRateLimit(db,user.id,`together_subscription_${input.action}`,input.action==='status'||input.action==='checkout_confirmation'?120:input.action==='reconcile'?60:12,3600);

  let state=await resolveSubscriptionState(db,user.id);
  const clientSurface=await verifyWebSurfaceAssertion(request,user.id)?'web':'native_or_unknown';
  const billingPolicy=resolveBillingSurfacePolicy(clientSurface);
  const configuration=billingConfiguration(billingPolicy);

  if(input.action==='reconcile'){
    const config=readRevenueCatAdapterConfig();
    if(!config.enabled)throw new AppError('BILLING_NOT_CONFIGURED','App-store verification is unavailable. Try again shortly.',503,true);
    const event:RevenueCatWebhookEvent={id:crypto.randomUUID(),type:'RECONCILE',event_timestamp_ms:Date.now(),app_user_id:user.id,aliases:[],transferred_from:[],transferred_to:[]};
    const result=await syncRevenueCatUser(db,user.id,event,config,serverEnv('KIVELLE_REVENUECAT_SECRET_API_KEY'));
    state=await resolveSubscriptionState(db,user.id);
    return json({data:{state:await publicSubscriptionStatus(db,user.id,state,configuration),verification:state.tier!=='free'?'active':result.verifiedNoPurchase?'verified_none':'syncing'},correlationId},200,correlationId);
  }
  if(input.action==='status')return json({data:await publicSubscriptionStatus(db,user.id,state,configuration),correlationId},200,correlationId);

  if(input.action==='checkout_confirmation'){
    const confirmation=await checkoutConfirmation(db,user.id,input.sessionId);
    if(confirmation.outcome==='succeeded')state=await resolveSubscriptionState(db,user.id);
    return json({data:{...confirmation,state:await publicSubscriptionStatus(db,user.id,state,configuration)},correlationId},200,correlationId);
  }

  if(input.action==='checkout'||input.action==='credits_checkout'){
    throw new AppError('BILLING_NOT_CONFIGURED',input.action==='credits_checkout'
      ?'Credit packs are temporarily unavailable. Purchases will be available through the Apple App Store and Google Play.'
      :'Memberships are purchased through the Apple App Store or Google Play in the Kivelli app.',403);
  }
  if(input.action==='portal'){
    throw new AppError('BILLING_NOT_CONFIGURED','Hosted billing is disabled. Manage app-store memberships in the original store, or contact Kivelli Support for help with legacy billing.',403);
  }

  throw new AppError('NOT_FOUND','That billing action is unavailable.',404);
});

function billingConfiguration(billingPolicy:BillingSurfacePolicy){
  return{
    configured:{kivelle_plus:false,kivelle_max:false,credits:false,portal:false},
    configuredAnnual:{kivelle_plus:false,kivelle_max:false},
    billingPolicy,
  };
}

function managementFor(state:KivelleSubscriptionState){
  return storeOnlyBillingManagement(billingManagementCapabilities({
    tier:state.tier,
    provider:state.billing.provider,
    status:state.billing.status,
    subscriptionId:state.billing.subscriptionId,
    managedByKivelle:state.billing.managedByKivelle,
  }));
}

async function publicSubscriptionStatus(db:Db,userId:string,state:KivelleSubscriptionState,configuration:BillingConfiguration){
  const[{data:activity,error:activityError},{data:latestGrant,error:grantError}]=await Promise.all([
    db.from('together_credit_ledger').select('id,event_type,permanent_delta,subscription_delta,metadata,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(12),
    db.from('together_credit_ledger').select('created_at').eq('user_id',userId).eq('event_type','subscription_grant').order('created_at',{ascending:false}).limit(1).maybeSingle(),
  ]);
  if(activityError||grantError)throw new AppError('INTERNAL_ERROR','Credit activity could not be loaded.',500,true);
  const publicCreditPacks=creditPacks.map((pack)=>({...pack,checkoutConfigured:false}));
  return{
    ...state,
    billing:publicBillingSummary(state.billing),
    management:managementFor(state),
    catalog:(Object.keys(subscriptionCatalog)as SubscriptionTier[]).map((tier)=>publicPlan(tier)),
    creditCosts,
    creditPacks:publicCreditPacks,
    creditActivity:(activity??[]).map((row)=>({id:String(row.id),eventType:String(row.event_type),permanentDelta:Number(row.permanent_delta??0),subscriptionDelta:Number(row.subscription_delta??0),createdAt:String(row.created_at),adjustmentReason:safeAdjustmentReason(row.metadata),...(row.metadata?.action==='expanded_context'?{contextAction:true,contextStatus:String(row.metadata?.status??''),contextChargedCredits:Number(row.metadata?.chargedCredits??0)}:{})})),
    nextCreditGrantAt:nextCreditGrantAt(state,latestGrant?.created_at),
    pricing:{currency:'USD',pricesExcludeTax:true},
    billingConfigured:configuration.configured,
    billingConfiguredAnnual:configuration.configuredAnnual,
    billingPolicy:configuration.billingPolicy,
    billingProvider:null,
  };
}

function safeAdjustmentReason(metadata:unknown):'tier_cap_reduced'|'tier_cap_restored'|'post_subscription_grace_expired'|'refund'|'dispute'|'chargeback'|null{
  if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))return null;
  const reason=(metadata as Record<string,unknown>).reason;
  return['tier_cap_reduced','tier_cap_restored','post_subscription_grace_expired','refund','dispute','chargeback'].includes(String(reason))?reason as 'tier_cap_reduced'|'tier_cap_restored'|'post_subscription_grace_expired'|'refund'|'dispute'|'chargeback':null;
}

async function checkoutConfirmation(db:Db,userId:string,sessionId:string){
  const[{data:events,error:eventError},{data:purchase,error:purchaseError}]=await Promise.all([
    db.from('together_billing_events').select('status,event_type,error_code,created_at').eq('provider','stripe').eq('user_id',userId).contains('payload_summary',{checkoutSessionId:sessionId}).order('created_at',{ascending:false}).limit(5),
    db.from('together_credit_ledger').select('permanent_delta').eq('user_id',userId).eq('event_type','purchase').eq('stripe_checkout_session_id',sessionId).maybeSingle(),
  ]);
  if(eventError||purchaseError)throw new AppError('INTERNAL_ERROR','Checkout confirmation could not be checked.',500,true);
  return checkoutConfirmationOutcome((events??[]).map((event)=>({status:event.status,eventType:event.event_type})),purchase?.permanent_delta);
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
function publicPlan(tier:SubscriptionTier){const plan=subscriptionCatalog[tier];return{tier:plan.tier,displayName:plan.displayName,monthlyPriceUsd:plan.monthlyPriceUsd,annualPriceUsd:plan.annualPriceUsd,maxActiveConversations:plan.maxActiveConversations,dailyMessageLimit:plan.dailyMessageLimit,includedCompanionPhotoDailyLimit:plan.includedCompanionPhotoDailyLimit,includedDatePhotoMonthlyLimit:plan.includedDatePhotoMonthlyLimit,intelligenceProfile:plan.intelligenceProfile,memoryRetrievalBudget:plan.memoryRetrievalBudget,historyRetrievalBudget:plan.historyRetrievalBudget,maxLives:plan.maxLives,maxCustomCompanions:plan.maxCustomCompanions,worldAccess:plan.worldAccess,earlyWorldAccess:plan.earlyWorldAccess,monthlyCreditGrant:plan.monthlyCreditGrant,subscriptionCreditRolloverCap:plan.subscriptionCreditRolloverCap,mediaQueue:plan.mediaQueue};}
function publicBillingSummary(billing:KivelleSubscriptionState['billing']){return{provider:billing.provider??null,store:billing.store??null,status:billing.status??null,billingInterval:billing.billingInterval,periodStart:billing.periodStart??null,periodEnd:billing.periodEnd??null,expiresAt:billing.expiresAt??null,trialEnd:billing.trialEnd??null,cancelAtPeriodEnd:Boolean(billing.cancelAtPeriodEnd),canceledAt:billing.canceledAt??null,paymentIssue:Boolean(billing.paymentIssue),mayPurchaseCredits:false};}
