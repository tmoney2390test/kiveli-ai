import{z}from'zod';
import{authenticated,enforceRateLimit}from'../_shared/context.ts';
import{parseBody}from'../_shared/body.ts';
import{json,serve}from'../_shared/http.ts';
import{AppError}from'../_shared/types.ts';
import{creditCosts,subscriptionCatalog,type SubscriptionTier}from'../../../packages/together-domain/src/index.ts';
import{resolveSubscriptionState}from'../_shared/kivelle-subscription.ts';

const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('status')}),
  z.object({action:z.literal('checkout'),tier:z.enum(['kivelle_plus','kivelle_max'])}),
  z.object({action:z.literal('credits_checkout')}),
  z.object({action:z.literal('portal')}),
]);

serve(async(request,correlationId)=>{
  const{user,db}=await authenticated(request);
  const input=request.method==='GET'?{action:'status' as const}:await parseBody(request,schema);
  await enforceRateLimit(db,user.id,`together_subscription_${input.action}`,input.action==='status'?120:12,3600);
  const state=await resolveSubscriptionState(db,user.id);
  const catalog=(Object.keys(subscriptionCatalog)as SubscriptionTier[]).map((tier)=>publicPlan(tier));
  const configured={kivelle_plus:Boolean(configuredUrl('KIVELLE_PLUS_CHECKOUT_URL',user.id,user.email)),kivelle_max:Boolean(configuredUrl('KIVELLE_MAX_CHECKOUT_URL',user.id,user.email)),credits:Boolean(configuredUrl('KIVELLE_CREDITS_CHECKOUT_URL',user.id,user.email)),portal:Boolean(configuredUrl('KIVELLE_BILLING_PORTAL_URL',user.id,user.email))};
  if(input.action==='status')return json({data:{...state,catalog,creditCosts,billingConfigured:configured},correlationId},200,correlationId);
  const envName=input.action==='checkout'?(input.tier==='kivelle_plus'?'KIVELLE_PLUS_CHECKOUT_URL':'KIVELLE_MAX_CHECKOUT_URL'):input.action==='credits_checkout'?'KIVELLE_CREDITS_CHECKOUT_URL':'KIVELLE_BILLING_PORTAL_URL';
  const url=configuredUrl(envName,user.id,user.email);if(!url)throw new AppError('BILLING_NOT_CONFIGURED','Billing checkout is not configured for this build yet.',503);
  return json({data:{url},correlationId},200,correlationId);
});

function publicPlan(tier:SubscriptionTier){const plan=subscriptionCatalog[tier];return{tier:plan.tier,displayName:plan.displayName,monthlyPriceUsd:plan.monthlyPriceUsd,chatDailyLimit:plan.chatDailyLimit,intelligenceProfile:plan.intelligenceProfile,memoryRetrievalBudget:plan.memoryRetrievalBudget,historyRetrievalBudget:plan.historyRetrievalBudget,maxLives:plan.maxLives,maxCustomCompanions:plan.maxCustomCompanions,worldAccess:plan.worldAccess,earlyWorldAccess:plan.earlyWorldAccess,monthlyCreditGrant:plan.monthlyCreditGrant,subscriptionCreditRolloverCap:plan.subscriptionCreditRolloverCap,mediaQueue:plan.mediaQueue};}
function configuredUrl(name:string,userId:string,email?:string|null):string|null{const template=Deno.env.get(name)?.trim();if(!template)return null;const value=template.replaceAll('{user_id}',encodeURIComponent(userId)).replaceAll('{email}',encodeURIComponent(email??''));try{const url=new URL(value);return url.protocol==='https:'?url.toString():null;}catch{return null;}}
