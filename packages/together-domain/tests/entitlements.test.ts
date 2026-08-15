import{describe,expect,it}from'vitest';
import{capabilitiesForTier,creditCost,entitlementsForTier,normalizeSubscriptionTier,subscriptionCatalog}from'../src';

describe('Kivelle subscriptions',()=>{
  it('maps legacy tiers without breaking existing accounts',()=>{expect(normalizeSubscriptionTier('together_plus')).toBe('kivelle_plus');expect(normalizeSubscriptionTier('unlimited')).toBe('kivelle_max');expect(normalizeSubscriptionTier('unexpected')).toBe('free');});
  it('keeps core relationship quality in free while scaling context depth',()=>{const free=capabilitiesForTier('free'),plus=capabilitiesForTier('kivelle_plus'),max=capabilitiesForTier('kivelle_max');expect(entitlementsForTier('free').has('relationship_core')).toBe(true);expect(entitlementsForTier('free').has('plans_dates_moments')).toBe(true);expect(plus.memoryRetrievalBudget).toBeGreaterThan(free.memoryRetrievalBudget);expect(max.historyRetrievalBudget).toBeGreaterThan(plus.historyRetrievalBudget);expect(max.directorPolicy).toBe('normal_and_up');});
  it('defines the intended three-tier pricing and credit grants',()=>{expect(subscriptionCatalog.free.monthlyPriceUsd).toBe(0);expect(subscriptionCatalog.kivelle_plus.monthlyPriceUsd).toBe(14.99);expect(subscriptionCatalog.kivelle_max.monthlyPriceUsd).toBe(29.99);expect(subscriptionCatalog.kivelle_plus.monthlyCreditGrant).toBe(500);expect(subscriptionCatalog.kivelle_max.monthlyCreditGrant).toBe(1500);});
  it('meters expensive media instead of relationship actions',()=>{expect(creditCost('companion_photo')).toBe(10);expect(creditCost('creator_appearance_set')).toBe(40);expect(creditCost('short_video')).toBeGreaterThan(creditCost('premium_photo'));});
});
