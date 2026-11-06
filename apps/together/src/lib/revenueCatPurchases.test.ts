import{describe,expect,it}from'vitest';
import{revenueCatPackageIdentifiers,revenueCatPurchaseError,selectRevenueCatPackage,verifiedPackagePrice}from'./revenueCatPurchases';

describe('RevenueCat native purchase selection',()=>{
  it('selects only the explicit tier and billing-interval package',()=>{
    const packages=[{identifier:'kivelle_plus_monthly',marker:1},{identifier:'kivelle_max_annual',marker:2}];
    expect(selectRevenueCatPackage(packages,'kivelle_max','annual')?.marker).toBe(2);
    expect(selectRevenueCatPackage(packages,'kivelle_plus','annual')).toBeNull();
    expect(revenueCatPackageIdentifiers.kivelle_plus.monthly).toBe('kivelle_plus_monthly');
  });
  it('distinguishes cancellation from a retryable store failure',()=>{
    expect(revenueCatPurchaseError({userCancelled:true})).toMatchObject({cancelled:true});
    expect(revenueCatPurchaseError({code:'1'})).toMatchObject({cancelled:true,pending:false});
    expect(revenueCatPurchaseError({code:'20'})).toMatchObject({cancelled:false,pending:true});
    expect(revenueCatPurchaseError({code:'6'}).message).toContain('Restore purchases');
    expect(revenueCatPurchaseError({code:'5'})).toMatchObject({safeToRetry:true});
    expect(revenueCatPurchaseError({message:'network timeout'})).toMatchObject({cancelled:false,message:expect.stringContaining('connection')});
    expect(revenueCatPurchaseError({code:'PURCHASE_PENDING_ERROR',message:'Awaiting approval'})).toMatchObject({pending:true,cancelled:false});
  });
  it('rejects an offering whose store billing period disagrees with its package label',()=>{
    expect(verifiedPackagePrice({priceString:'$199.99',subscriptionPeriod:'P1Y'},'annual')?.period).toBe('/ year');
    expect(verifiedPackagePrice({priceString:'$19.99',subscriptionPeriod:'P1M'},'annual')).toBeNull();
    expect(verifiedPackagePrice({priceString:'$199.99',subscriptionPeriod:'P1Y'},'monthly')).toBeNull();
  });
});
