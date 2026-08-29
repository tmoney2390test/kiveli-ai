import { normalizeSubscriptionTier, type SubscriptionTier } from './entitlements.ts';

export const billingProviders=['stripe','revenuecat','configured'] as const;
export type BillingProvider=typeof billingProviders[number];
export const billingIntervals=['monthly','annual'] as const;
export type BillingInterval=typeof billingIntervals[number];
export const subscriptionStatuses=['trialing','active','past_due','unpaid','paused','canceled','incomplete','incomplete_expired'] as const;
export type NormalizedSubscriptionStatus=typeof subscriptionStatuses[number];

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
