import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { creditCosts, creditPacks, subscriptionCatalog, type CreditPackKey, type SubscriptionTier } from '../../../packages/together-domain/src/index.ts';
import { resolveSubscriptionState } from '../_shared/kivelle-subscription.ts';
import { createStripeCheckoutSession, createStripePortalSession, stripeBillingConfiguration,stripePriceForCreditPack } from '../_shared/stripe.ts';
import { track } from '../_shared/together.ts';

const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('status')}),
  z.object({action:z.literal('checkout'),tier:z.enum(['kivelle_plus','kivelle_max']),billingInterval:z.enum(['monthly','annual']).default('monthly'),requestId:z.string().uuid().optional()}),
  z.object({action:z.literal('credits_checkout'),productKey:z.enum(['credits_100','credits_300','credits_800','credits_2000']),requestId:z.string().uuid().optional()}),
  z.object({action:z.literal('portal'),requestId:z.string().uuid().optional()}),
]);

serve(async(request,correlationId)=>{
  const{user,db}=await authenticated(request);
  const input=request.method==='GET'?{action:'status' as const}:await parseBody(request,schema);
  await enforceRateLimit(db,user.id,`together_subscription_${input.action}`,input.action==='status'?120:12,3600);
  const state=await resolveSubscriptionState(db,user.id);
  const catalog=(Object.keys(subscriptionCatalog)as SubscriptionTier[]).map((tier)=>publicPlan(tier));
  const stripe=stripeBillingConfiguration(),legacy={kivelle_plus:Boolean(configuredUrl('KIVELLE_PLUS_CHECKOUT_URL',user.id,user.email)),kivelle_max:Boolean(configuredUrl('KIVELLE_MAX_CHECKOUT_URL',user.id,user.email)),credits:Boolean(configuredUrl('KIVELLE_CREDITS_CHECKOUT_URL',user.id,user.email)),portal:Boolean(configuredUrl('KIVELLE_BILLING_PORTAL_URL',user.id,user.email))};
  const configured={kivelle_plus:stripe.kivelle_plus||legacy.kivelle_plus,kivelle_max:stripe.kivelle_max||legacy.kivelle_max,credits:stripe.credits||legacy.credits,portal:stripe.portal||legacy.portal};
  const configuredAnnual={kivelle_plus:stripe.kivelle_plus_annual,kivelle_max:stripe.kivelle_max_annual};
  const publicCreditPacks=creditPacks.map((pack)=>({...pack,checkoutConfigured:Boolean(stripePriceForCreditPack(pack.key)||legacy.credits)}));
  if(input.action==='status'){await track(db,user.id,'paywall_viewed',{surface:'subscription',currentTier:state.tier,creditBalance:state.creditBalance.total});return json({data:{...state,catalog,creditCosts,creditPacks:publicCreditPacks,billingConfigured:configured,billingConfiguredAnnual:configuredAnnual,billingProvider:stripe.secretKey?'stripe':Object.values(legacy).some(Boolean)?'configured':null},correlationId},200,correlationId);}
  const requestId=input.requestId??crypto.randomUUID();
  if(input.action==='checkout'&&(input.billingInterval==='annual'?configuredAnnual[input.tier]:stripe[input.tier])){await track(db,user.id,'subscription_checkout_started',{tier:input.tier,billingInterval:input.billingInterval,currentTier:state.tier});const session=await createStripeCheckoutSession(db,{userId:user.id,email:user.email,tier:input.tier,billingInterval:input.billingInterval,requestId});return json({data:{url:session.url,sessionId:session.id,provider:'stripe'},correlationId},200,correlationId);}
  if(input.action==='credits_checkout'&&stripePriceForCreditPack(input.productKey as CreditPackKey)){await track(db,user.id,'credit_checkout_started',{productKey:input.productKey,currentTier:state.tier});const session=await createStripeCheckoutSession(db,{userId:user.id,email:user.email,credits:true,creditPackKey:input.productKey as CreditPackKey,requestId});return json({data:{url:session.url,sessionId:session.id,provider:'stripe'},correlationId},200,correlationId);}
  if(input.action==='portal'&&stripe.portal){const session=await createStripePortalSession(db,{userId:user.id,email:user.email,requestId});return json({data:{url:session.url,sessionId:session.id,provider:'stripe'},correlationId},200,correlationId);}
  if(input.action==='checkout'&&input.billingInterval==='annual')throw new AppError('BILLING_NOT_CONFIGURED','Annual checkout has not been configured for this plan yet.',503);
  const envName=input.action==='checkout'?(input.tier==='kivelle_plus'?'KIVELLE_PLUS_CHECKOUT_URL':'KIVELLE_MAX_CHECKOUT_URL'):input.action==='credits_checkout'?'KIVELLE_CREDITS_CHECKOUT_URL':'KIVELLE_BILLING_PORTAL_URL';
  const url=configuredUrl(envName,user.id,user.email,input.action==='credits_checkout'?input.productKey:undefined);if(!url)throw new AppError('BILLING_NOT_CONFIGURED','Billing checkout is not configured for this build yet.',503);
  return json({data:{url,provider:'configured'},correlationId},200,correlationId);
});

function publicPlan(tier:SubscriptionTier){const plan=subscriptionCatalog[tier];return{tier:plan.tier,displayName:plan.displayName,monthlyPriceUsd:plan.monthlyPriceUsd,annualPriceUsd:plan.annualPriceUsd,chatDailyLimit:plan.chatDailyLimit,introductoryChatDailyLimit:plan.introductoryChatDailyLimit,introductoryChatDays:plan.introductoryChatDays,explicitDialogueMonthlyLimit:plan.explicitDialogueMonthlyLimit,includedDatePhotoMonthlyLimit:plan.includedDatePhotoMonthlyLimit,intelligenceProfile:plan.intelligenceProfile,memoryRetrievalBudget:plan.memoryRetrievalBudget,historyRetrievalBudget:plan.historyRetrievalBudget,maxLives:plan.maxLives,maxCustomCompanions:plan.maxCustomCompanions,worldAccess:plan.worldAccess,earlyWorldAccess:plan.earlyWorldAccess,monthlyCreditGrant:plan.monthlyCreditGrant,subscriptionCreditRolloverCap:plan.subscriptionCreditRolloverCap,mediaQueue:plan.mediaQueue};}
function configuredUrl(name:string,userId:string,email?:string|null,productKey?:string):string|null{const template=Deno.env.get(name)?.trim();if(!template)return null;const value=template.replaceAll('{user_id}',encodeURIComponent(userId)).replaceAll('{email}',encodeURIComponent(email??'')).replaceAll('{product_key}',encodeURIComponent(productKey??''));try{const url=new URL(value);return url.protocol==='https:'?url.toString():null;}catch{return null;}}
