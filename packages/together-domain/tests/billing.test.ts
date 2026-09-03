import{describe,expect,it}from'vitest';
import{billingManagementCapabilities,checkoutConfirmationOutcome,creditReversalTarget,isAppStoreBillingProvider,normalizeSubscriptionStatus,selectEffectiveBillingSubscription,subscriptionGrantPeriodKey,subscriptionHasApplicationAccess}from'../src/billing';

describe('Kivelle billing rules',()=>{
  const now=new Date('2026-08-28T12:00:00Z');
  it('grants access only for paid states and a bounded past-due period',()=>{
    expect(subscriptionHasApplicationAccess('active',null,now)).toBe(true);
    expect(subscriptionHasApplicationAccess('active','2026-08-27T00:00:00Z',now)).toBe(false);
    expect(subscriptionHasApplicationAccess('trialing',null,now)).toBe(true);
    expect(subscriptionHasApplicationAccess('past_due','2026-08-30T00:00:00Z',now)).toBe(true);
    expect(subscriptionHasApplicationAccess('past_due','2026-08-27T00:00:00Z',now)).toBe(false);
    for(const status of['unpaid','paused','canceled','incomplete','incomplete_expired'])expect(subscriptionHasApplicationAccess(status,'2026-09-30T00:00:00Z',now)).toBe(false);
  });
  it('deduplicates Stripe and RevenueCat through one highest effective entitlement',()=>{
    expect(selectEffectiveBillingSubscription([
      {provider:'revenuecat',planKey:'kivelle_plus',status:'active',accessEndsAt:'2026-09-28T00:00:00Z'},
      {provider:'stripe',planKey:'kivelle_max',status:'active',accessEndsAt:'2026-09-20T00:00:00Z'},
    ],now)?.provider).toBe('stripe');
  });
  it('uses a provider-neutral monthly key for subscription benefits',()=>{
    expect(subscriptionGrantPeriodKey({userId:'user',periodStart:'2026-08-14T00:00:00Z'})).toBe('subscription-benefit:user:2026-08');
  });
  it('computes cumulative refund and dispute credit reversals',()=>{
    expect(creditReversalTarget({grantedCredits:300,amountPaid:1199,amountReversed:600})).toBe(151);
    expect(creditReversalTarget({grantedCredits:300,amountPaid:1199,amountReversed:1,disputed:true})).toBe(300);
  });
  it('normalizes unknown provider statuses safely',()=>expect(normalizeSubscriptionStatus('mystery')).toBe('incomplete'));
  it('only offers Stripe management for a real Stripe subscription',()=>{
    expect(billingManagementCapabilities({tier:'kivelle_plus',provider:'stripe',status:'active',subscriptionId:'sub_123',stripePortalConfigured:true,creditCheckoutConfigured:true})).toMatchObject({mode:'stripe',manageAction:'portal',canManageSubscription:true,canPurchaseCredits:true});
    expect(billingManagementCapabilities({tier:'kivelle_max',provider:'configured',status:'active',managedByKivelle:true,stripePortalConfigured:true})).toMatchObject({mode:'kivelle',manageAction:'none',canManageSubscription:false});
  });
  it('routes store subscriptions back to their store and explains unavailable credit packs',()=>{
    expect(billingManagementCapabilities({tier:'kivelle_plus',provider:'revenuecat',status:'active',creditCheckoutConfigured:true})).toMatchObject({mode:'app_store',manageAction:'app_store',canManageSubscription:true,canPurchaseCredits:false});
    expect(billingManagementCapabilities({tier:'kivelle_plus',provider:'apple',status:'active'})).toMatchObject({mode:'app_store',manageAction:'app_store'});
    expect(billingManagementCapabilities({tier:'kivelle_max',provider:'google_play',status:'active'})).toMatchObject({mode:'app_store',manageAction:'app_store'});
    expect(isAppStoreBillingProvider('revenuecat')).toBe(true);
    expect(isAppStoreBillingProvider('stripe')).toBe(false);
    expect(billingManagementCapabilities({tier:'free',provider:null,status:null})).toMatchObject({mode:'none',canManageSubscription:false,canPurchaseCredits:false});
  });
  it('normalizes webhook-backed checkout confirmation without trusting return parameters',()=>{
    expect(checkoutConfirmationOutcome([])).toEqual({outcome:'pending',retryable:true});
    expect(checkoutConfirmationOutcome([{status:'ignored',eventType:'checkout.session.async_payment_failed'}]).outcome).toBe('failed');
    expect(checkoutConfirmationOutcome([{status:'processed',eventType:'checkout.session.completed'}],300)).toEqual({outcome:'succeeded',purchase:{kind:'credits',creditsAdded:300}});
    expect(checkoutConfirmationOutcome([{status:'processed',eventType:'checkout.session.completed'}])).toEqual({outcome:'succeeded',purchase:{kind:'subscription'}});
  });
});
