import{describe,expect,it}from'vitest';
import{annualSavingsPercentage,billingStatusPresentation,checkoutBackoffDelay,creditActivityPresentation,membershipBenefits,membershipComparisonGroups,membershipMetrics,membershipPageMode,membershipPricePresentation,normalizeSubscriptionIntent,preferredPaidTier,safeSubscriptionReturnTo,shouldShowSubscriptionIntentCallout,subscriptionHref,subscriptionIntentPresentation}from'./subscriptionPresentation';
import { subscriptionCatalog } from '@together/domain/src/entitlements';
import { hasOpenBuildWorldAccess } from '@together/domain/src/world-access';
import type{SubscriptionPlan,SubscriptionStatus}from'./subscription';

const status=(overrides:Partial<SubscriptionStatus>={}):SubscriptionStatus=>({tier:'kivelle_plus',capabilities:{tier:'kivelle_plus',displayName:'Kivelle+',monthlyPriceUsd:19.99,annualPriceUsd:199.99,maxActiveConversations:20,dailyMessageLimit:null,includedCompanionPhotoDailyLimit:1,includedDatePhotoMonthlyLimit:1,intelligenceProfile:'deep',memoryRetrievalBudget:12,historyRetrievalBudget:3,maxLives:3,maxCustomCompanions:5,worldAccess:'all_standard',earlyWorldAccess:false,monthlyCreditGrant:500,subscriptionCreditRolloverCap:1000,mediaQueue:'priority'},creditBalance:{permanentBalance:10,subscriptionBalance:20,total:30},entitlementKeys:[],billing:{provider:'stripe',status:'active',periodEnd:'2026-09-30T00:00:00Z'},management:{mode:'stripe',label:'Stripe',canManageSubscription:true,manageAction:'portal',canPurchaseCredits:true,managementReason:'Stripe',creditPurchaseReason:null},catalog:[],creditCosts:{},creditPacks:[],creditActivity:[],billingConfigured:{kivelle_plus:true,kivelle_max:true,credits:true,portal:true},...overrides});

describe('subscription presentation',()=>{
  it('builds contextual local-only subscription routes',()=>{expect(subscriptionHref({intent:'photo_sharing',returnTo:'/chat?character=bianca'})).toBe('/subscription?intent=photo_sharing&returnTo=%2Fchat%3Fcharacter%3Dbianca');expect(safeSubscriptionReturnTo('https://evil.example')).toBeNull();expect(safeSubscriptionReturnTo('//evil.example')).toBeNull();});
  it('maps the legacy photo-sharing source and defaults unknown intents',()=>{expect(normalizeSubscriptionIntent(undefined,'share-photo')).toBe('photo_sharing');expect(normalizeSubscriptionIntent('unknown')).toBe('plans');});
  it('keeps paid subscribers on their current tier unless a tier was explicitly requested',()=>{expect(preferredPaidTier('kivelle_max')).toBe('kivelle_max');expect(preferredPaidTier('kivelle_plus')).toBe('kivelle_plus');expect(preferredPaidTier('free')).toBe('kivelle_plus');expect(preferredPaidTier('kivelle_max','kivelle_plus')).toBe('kivelle_plus');});
  it('computes savings and bounded progressive checkout delays',()=>{expect(annualSavingsPercentage(19.99,199.99)).toBe(17);expect(checkoutBackoffDelay(0)).toBe(0);expect(checkoutBackoffDelay(99)).toBe(10000);});
  it('presents active, granted, cancellation, and payment states clearly',()=>{expect(billingStatusPresentation(status()).label).toBe('Active');expect(billingStatusPresentation(status({management:{...status().management,mode:'kivelle'}})).detail).toContain('provided directly');expect(billingStatusPresentation(status({billing:{status:'past_due',periodEnd:'2026-09-01T00:00:00Z'}})).tone).toBe('warning');expect(billingStatusPresentation(status({billing:{status:'active',cancelAtPeriodEnd:true,periodEnd:'2026-09-30T00:00:00Z'}})).label).toBe('Cancellation scheduled');});
  it('uses safe user-facing credit activity labels without metadata',()=>{expect(creditActivityPresentation({id:'1',eventType:'refund',permanentDelta:10,subscriptionDelta:0,createdAt:'2026-08-30T00:00:00Z'})).toMatchObject({label:'Automatic refund',amount:10});});
  it('explains plan-change reductions and restorations without calling them charges',()=>{
    expect(creditActivityPresentation({id:'1',eventType:'adjustment',permanentDelta:0,subscriptionDelta:-200,createdAt:'2026-08-31T00:00:00Z',adjustmentReason:'tier_cap_reduced'})).toMatchObject({label:'Plan limit adjustment',amount:-200});
    expect(creditActivityPresentation({id:'2',eventType:'adjustment',permanentDelta:0,subscriptionDelta:200,createdAt:'2026-08-31T00:01:00Z',adjustmentReason:'tier_cap_restored'})).toMatchObject({label:'Plan Credits restored',amount:200});
  });
  it('switches the membership experience from discovery to an active member dashboard',()=>{expect(membershipPageMode('free')).toBe('discovery');expect(membershipPageMode('kivelle_plus')).toBe('member');expect(membershipPageMode('kivelle_max')).toBe('member');});
  it('hides the redundant generic Credits callout for every membership state',()=>{expect(shouldShowSubscriptionIntentCallout('discovery','credits')).toBe(false);expect(shouldShowSubscriptionIntentCallout('member','credits')).toBe(false);expect(shouldShowSubscriptionIntentCallout('discovery','photo_sharing')).toBe(true);});
  it('derives member metrics and benefits from the authoritative plan instead of mockup values',()=>{const plan=status().capabilities as SubscriptionPlan;expect(membershipMetrics(plan)).toEqual([{key:'lives',value:3,label:'Lives',detail:'available'},{key:'companions',value:5,label:'companions',detail:'custom slots'},{key:'photos',value:1,label:'photos daily',detail:'included generation'}]);expect(membershipBenefits(plan)).toContain('20 active conversations and group chats');expect(membershipBenefits(plan)).toContain('Unlimited messages');expect(membershipBenefits(plan)).toContain('500 monthly Kivelli Credits');expect(membershipBenefits(plan)).toContain('3 Lives and 5 custom companions');});
  it('presents monthly and annual catalog pricing without hard-coded page prices',()=>{const plan=status().capabilities as SubscriptionPlan;expect(membershipPricePresentation(plan,'monthly')).toEqual({primary:'$19.99',period:'/ month',detail:'Billed monthly'});expect(membershipPricePresentation(plan,'annual')).toEqual({primary:'$16.67',period:'/ month',detail:'$199.99 billed yearly'});});
  it('shows localized annual package prices per year, never per month', () => {
    const plan = status().capabilities;
    expect(membershipPricePresentation(plan, 'annual', '€219,99')).toEqual({primary:'€219,99',period:'/ year',detail:'Billed yearly through your app store'});
    expect(membershipPricePresentation(plan, 'monthly', '€21,99').period).toBe('/ month');
    expect(membershipPricePresentation(subscriptionCatalog.free, 'annual').detail).toBe('No subscription required');
  });
  it('describes currently open worlds without inventing a paid world gate', () => {
    const rows = membershipComparisonGroups(Object.values(subscriptionCatalog)).flatMap(group => group.rows);
    const worlds = rows.find(row => row.key === 'worlds')!;
    if (hasOpenBuildWorldAccess(true)) {
      expect(worlds.values.map(value => value.text)).toEqual(['All published worlds','All published worlds','All published worlds']);
      expect(rows.find(row => row.key === 'early_access')).toBeUndefined();
      expect(subscriptionIntentPresentation('worlds').body).toContain('open to everyone');
    } else {
      expect(worlds.values[0]?.text).toBe('Published free worlds');
      expect(rows.find(row => row.key === 'early_access')).toBeDefined();
    }
  });
  it('keeps subscriber-only features out of Free and includes them for both paid tiers', () => {
    const rows = membershipComparisonGroups(Object.values(subscriptionCatalog)).flatMap(group => group.rows);
    for (const key of ['sharing','groups','initiative','memory_controls']) {
      expect(rows.find(row => row.key === key)?.values.map(value => value.included)).toEqual([false,true,true]);
    }
    expect(membershipBenefits(subscriptionCatalog.kivelle_max)).toContain('Share your own photos without using Credits');
    expect(membershipBenefits(subscriptionCatalog.kivelle_max)).not.toContain('Highest media priority and early world access');
  });
  it('keeps daily and monthly photos distinct and honors returned account limits', () => {
    const plan = {...subscriptionCatalog.kivelle_plus, dailyMessageLimit:7, monthlyCreditGrant:777, includedCompanionPhotoDailyLimit:2};
    const rows = membershipComparisonGroups([plan]).flatMap(group => group.rows);
    expect(rows.find(row => row.key === 'messages')?.values[0]?.text).toBe('7 / day');
    expect(rows.find(row => row.key === 'photos')?.values[0]?.text).toBe('2 / day');
    expect(rows.find(row => row.key === 'date_photos')?.values[0]?.text).toBe('1 / month');
    expect(rows.find(row => row.key === 'credits')?.values[0]?.text).toBe('777');
    const benefits = membershipBenefits(plan, []);
    expect(benefits).toContain('7 messages per day');
    expect(benefits).not.toContain('Unlimited messages');
    expect(benefits).not.toContain('Share your own photos without using Credits');
  });

});
