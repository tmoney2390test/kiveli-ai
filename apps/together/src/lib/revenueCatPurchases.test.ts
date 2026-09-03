import{describe,expect,it}from'vitest';
import{revenueCatPackageIdentifiers,revenueCatPurchaseError,selectRevenueCatPackage}from'./revenueCatPurchases';

describe('RevenueCat native purchase selection',()=>{
  it('selects only the explicit tier and billing-interval package',()=>{
    const packages=[{identifier:'kivelle_plus_monthly',marker:1},{identifier:'kivelle_max_annual',marker:2}];
    expect(selectRevenueCatPackage(packages,'kivelle_max','annual')?.marker).toBe(2);
    expect(selectRevenueCatPackage(packages,'kivelle_plus','annual')).toBeNull();
    expect(revenueCatPackageIdentifiers.kivelle_plus.monthly).toBe('kivelle_plus_monthly');
  });
  it('distinguishes cancellation from a retryable store failure',()=>{
    expect(revenueCatPurchaseError({userCancelled:true})).toMatchObject({cancelled:true});
    expect(revenueCatPurchaseError({message:'network timeout'})).toMatchObject({cancelled:false,message:expect.stringContaining('connection')});
  });
});
