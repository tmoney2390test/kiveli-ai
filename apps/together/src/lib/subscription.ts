export type SubscriptionTier='free'|'kivelle_plus'|'kivelle_max';
export type BillingInterval='monthly'|'annual';
export type SubscriptionPlan={tier:SubscriptionTier;displayName:string;monthlyPriceUsd:number;annualPriceUsd:number|null;chatDailyLimit:number|null;introductoryChatDailyLimit:number|null;introductoryChatDays:number;includedCompanionPhotoDailyLimit:number;includedDatePhotoMonthlyLimit:number;intelligenceProfile:'core'|'deep'|'director';memoryRetrievalBudget:number;historyRetrievalBudget:number;maxLives:number;maxCustomCompanions:number;worldAccess:'free'|'all_standard';earlyWorldAccess:boolean;monthlyCreditGrant:number;subscriptionCreditRolloverCap:number;mediaQueue:'standard'|'priority'|'highest'};
export type CreditBalance={permanentBalance:number;subscriptionBalance:number;total:number;subscriptionExpiresAt?:string|null};
export type CreditPack={key:'credits_100'|'credits_300'|'credits_800'|'credits_2000';credits:number;priceUsd:number;displayPrice:string;companionPhotoEquivalent:number;popular?:boolean;active:boolean;checkoutConfigured:boolean};
export type CreditActivityEvent={id:string;eventType:string;permanentDelta:number;subscriptionDelta:number;createdAt:string};
export type BillingManagement={mode:'none'|'stripe'|'app_store'|'configured'|'kivelle';label:string;canManageSubscription:boolean;manageAction:'none'|'portal'|'app_store';canPurchaseCredits:boolean;managementReason:string;creditPurchaseReason:string|null};
export type SubscriptionStatus={
  tier:SubscriptionTier;
  capabilities:SubscriptionPlan&{recentTurnBudget?:number;directorPolicy?:string;welcomeCredits?:number};
  creditBalance:CreditBalance;
  entitlementKeys:string[];
  billing:{provider?:string|null;status?:string|null;billingInterval?:BillingInterval;periodStart?:string|null;periodEnd?:string|null;expiresAt?:string|null;trialEnd?:string|null;cancelAtPeriodEnd?:boolean;canceledAt?:string|null;paymentIssue?:boolean;mayPurchaseCredits?:boolean};
  management:BillingManagement;
  catalog:SubscriptionPlan[];
  creditCosts:Record<string,number>;
  creditPacks:CreditPack[];
  creditActivity:CreditActivityEvent[];
  nextCreditGrantAt?:string|null;
  pricing?:{currency:string;pricesExcludeTax:boolean};
  billingConfigured:{kivelle_plus:boolean;kivelle_max:boolean;credits:boolean;portal:boolean};
  billingConfiguredAnnual?:{kivelle_plus:boolean;kivelle_max:boolean};
  billingProvider?:'stripe'|'configured'|null;
};
export type CheckoutConfirmation={outcome:'pending'|'succeeded'|'failed';retryable?:boolean;failureReason?:string;purchase?:{kind:'subscription'}|{kind:'credits';creditsAdded:number};state:SubscriptionStatus};

export const tierOrder:SubscriptionTier[]=['free','kivelle_plus','kivelle_max'];
export function tierDescription(tier:SubscriptionTier):string{return tier==='free'?'Meet someone and experience a full Kivelle relationship in any published world.':tier==='kivelle_plus'?'Deeper continuity, more Lives and companions, and monthly media credits.':'The deepest Kivelle context, Director intelligence, highest limits, and priority media.';}
export function intelligenceLabel(profile:string):string{return profile==='director'?'Kivelle Director':profile==='deep'?'Deep continuity':'Core continuity';}
