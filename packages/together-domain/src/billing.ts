import { normalizeSubscriptionTier, type SubscriptionTier } from './entitlements.ts';

/**
 * Kivelle owns the entitlement model. Providers are ingestion adapters only.
 * Apple and Google are accepted here as dormant direct-adapter seams so a
 * future RevenueCat migration does not require another entitlement rewrite.
 */
export const billingProviders=['stripe','revenuecat','apple','google_play','configured'] as const;
export type BillingProvider=typeof billingProviders[number];
export const appStoreBillingProviders=['revenuecat','apple','google_play'] as const;
export type AppStoreBillingProvider=typeof appStoreBillingProviders[number];
export const billingIntervals=['monthly','annual'] as const;
export type BillingInterval=typeof billingIntervals[number];
export const subscriptionStatuses=['trialing','active','past_due','unpaid','paused','canceled','incomplete','incomplete_expired'] as const;
export type NormalizedSubscriptionStatus=typeof subscriptionStatuses[number];
export const billingManagementModes=['none','stripe','app_store','configured','kivelle'] as const;
export type BillingManagementMode=typeof billingManagementModes[number];
export type BillingManageAction='none'|'portal'|'app_store';
export type BillingManagementCapabilities={
  mode:BillingManagementMode;
  label:string;
  canManageSubscription:boolean;
  manageAction:BillingManageAction;
  canPurchaseCredits:boolean;
  managementReason:string;
  creditPurchaseReason:string|null;
};
export type CheckoutConfirmationOutcome={outcome:'pending'|'succeeded'|'failed';retryable?:boolean;failureReason?:string;purchase?:{kind:'subscription'}|{kind:'credits';creditsAdded:number}};

export type BillingSubscriptionCandidate={
  provider:BillingProvider;
  planKey:SubscriptionTier;
  status:NormalizedSubscriptionStatus;
  accessEndsAt?:string|null;
  currentPeriodEnd?:string|null;
  updatedAt?:string|null;
};

/**
 * Paid access follows the provider lifecycle, not a checkout redirect. We keep a
 * bounded dunning window for past_due subscriptions, but unpaid/paused and all
 * terminal states are denied immediately.
 */
export function subscriptionHasApplicationAccess(status:unknown,accessEndsAt?:unknown,now=new Date()):boolean{
  if(status==='active'||status==='trialing'){
    const end=parseDate(accessEndsAt);
    return end===null||end.getTime()>now.getTime();
  }
  if(status!=='past_due')return false;
  const end=parseDate(accessEndsAt);
  return end!==null&&end.getTime()>now.getTime();
}

export function normalizeSubscriptionStatus(value:unknown):NormalizedSubscriptionStatus{
  return subscriptionStatuses.includes(value as NormalizedSubscriptionStatus)?value as NormalizedSubscriptionStatus:'incomplete';
}

export function billingTierRank(value:unknown):number{
  const tier=normalizeSubscriptionTier(value);
  return tier==='kivelle_max'?2:tier==='kivelle_plus'?1:0;
}

export function isAppStoreBillingProvider(value:unknown):value is AppStoreBillingProvider{
  return appStoreBillingProviders.includes(value as AppStoreBillingProvider);
}

/**
 * Converts provider state and server configuration into account-specific UI
 * capabilities. Clients should never infer management actions from a paid tier
 * or from globally configured Stripe keys alone.
 */
export function billingManagementCapabilities(input:{
  tier:unknown;
  provider?:unknown;
  status?:unknown;
  subscriptionId?:unknown;
  managedByKivelle?:boolean;
  stripePortalConfigured?:boolean;
  configuredPortalConfigured?:boolean;
  creditCheckoutConfigured?:boolean;
}):BillingManagementCapabilities{
  const tier=normalizeSubscriptionTier(input.tier),paid=tier!=='free',provider=typeof input.provider==='string'?input.provider:null,status=normalizeSubscriptionStatus(input.status);
  if(!paid)return{mode:'none',label:'Kivelle Free',canManageSubscription:false,manageAction:'none',canPurchaseCredits:false,managementReason:'There is no paid subscription to manage.',creditPurchaseReason:'Credit packs are available with an active Kivelle+ or Kivelle Max plan.'};
  const mode:BillingManagementMode=input.managedByKivelle?'kivelle':provider==='stripe'?'stripe':isAppStoreBillingProvider(provider)?'app_store':provider==='configured'?'configured':'kivelle';
  const hasSubscription=typeof input.subscriptionId==='string'&&input.subscriptionId.length>0;
  const canManageSubscription=mode==='app_store'||mode==='stripe'&&hasSubscription&&input.stripePortalConfigured===true||mode==='configured'&&input.configuredPortalConfigured===true;
  const manageAction:BillingManageAction=mode==='app_store'?'app_store':canManageSubscription?'portal':'none';
  const active=status==='active';
  const canPurchaseCredits=active&&mode!=='app_store'&&input.creditCheckoutConfigured===true;
  const managementReason=mode==='kivelle'
    ?'Your access is provided directly by Kivelle and does not require billing management.'
    :mode==='app_store'
      ?'This subscription is managed by the app store where it was purchased.'
      :canManageSubscription
        ?`This subscription is managed through ${mode==='stripe'?'Stripe':'your billing provider'}.`
        :'Subscription management is temporarily unavailable. Contact Kivelle Support if you need help.';
  const creditPurchaseReason=canPurchaseCredits?null:mode==='app_store'
    ?'Additional purchases for this subscription are managed through its app store.'
    :!active
      ?'Credit packs become available when the subscription is active.'
      :'Credit packs are not available for this account right now.';
  return{mode,label:mode==='stripe'?'Stripe':mode==='app_store'?'App Store':mode==='configured'?'Billing provider':'Kivelle',canManageSubscription,manageAction,canPurchaseCredits,managementReason,creditPurchaseReason};
}

export function checkoutConfirmationOutcome(events:readonly{status:unknown;eventType:unknown}[],creditsAdded?:unknown):CheckoutConfirmationOutcome{
  if(events.some((event)=>event.status==='processed')){
    const credits=Number(creditsAdded);
    return Number.isFinite(credits)&&credits>0?{outcome:'succeeded',purchase:{kind:'credits',creditsAdded:credits}}:{outcome:'succeeded',purchase:{kind:'subscription'}};
  }
  if(events.some((event)=>event.eventType==='checkout.session.async_payment_failed'))return{outcome:'failed',failureReason:'The payment was not completed. No Kivelle access or credits were applied.'};
  return{outcome:'pending',retryable:true};
}

/** One internal entitlement even if Stripe web and RevenueCat native overlap. */
export function selectEffectiveBillingSubscription(candidates:readonly BillingSubscriptionCandidate[],now=new Date()):BillingSubscriptionCandidate|null{
  return candidates
    .filter((candidate)=>candidate.planKey!=='free'&&subscriptionHasApplicationAccess(candidate.status,candidate.accessEndsAt??candidate.currentPeriodEnd,now))
    .sort((left,right)=>billingTierRank(right.planKey)-billingTierRank(left.planKey)
      ||timestamp(right.accessEndsAt??right.currentPeriodEnd)-timestamp(left.accessEndsAt??left.currentPeriodEnd)
      ||timestamp(right.updatedAt)-timestamp(left.updatedAt))[0]??null;
}

export function subscriptionGrantPeriodKey(input:{userId:string;periodStart:string|Date;targetMonth?:string|Date}):string{
  const period=parseDate(input.targetMonth??input.periodStart);
  if(!period)throw new Error('invalid_subscription_grant_period');
  return`subscription-benefit:${input.userId}:${period.toISOString().slice(0,7)}`;
}

/** Cumulative refund/dispute target; repeated and out-of-order events cannot over-revoke. */
export function creditReversalTarget(input:{grantedCredits:number;amountPaid:number;amountReversed:number;disputed?:boolean}):number{
  const granted=positiveInteger(input.grantedCredits),paid=positiveInteger(input.amountPaid),reversed=Math.max(0,Math.floor(Number(input.amountReversed)||0));
  if(!granted)return 0;
  if(input.disputed)return granted;
  if(!paid||!reversed)return 0;
  return Math.min(granted,Math.ceil(granted*Math.min(paid,reversed)/paid));
}

function positiveInteger(value:unknown):number{return Number.isInteger(Number(value))&&Number(value)>0?Number(value):0;}
function parseDate(value:unknown):Date|null{const date=value instanceof Date?value:typeof value==='string'?new Date(value):null;return date&&Number.isFinite(date.getTime())?date:null;}
function timestamp(value:unknown):number{return parseDate(value)?.getTime()??0;}
