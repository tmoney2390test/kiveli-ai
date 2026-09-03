import type{BillingInterval,SubscriptionTier}from'./subscription';

export type PurchasableTier=Exclude<SubscriptionTier,'free'>;
export type RevenueCatPackageLike={identifier:string};
export const revenueCatPackageIdentifiers:Record<PurchasableTier,Record<BillingInterval,string>>={
  kivelle_plus:{monthly:'kivelle_plus_monthly',annual:'kivelle_plus_annual'},
  kivelle_max:{monthly:'kivelle_max_monthly',annual:'kivelle_max_annual'},
};

export function selectRevenueCatPackage<T extends RevenueCatPackageLike>(packages:readonly T[],tier:PurchasableTier,interval:BillingInterval):T|null{
  const expected=revenueCatPackageIdentifiers[tier][interval];
  return packages.find((item)=>item.identifier===expected)??null;
}

export function revenueCatPurchaseError(error:unknown):{cancelled:boolean;message:string}{
  if(error&&typeof error==='object'){
    const value=error as Record<string,unknown>;
    if(value.userCancelled===true||String(value.code??'').toLowerCase().includes('purchase_cancelled'))return{cancelled:true,message:'Purchase cancelled.'};
    const raw=typeof value.message==='string'?value.message:'';
    if(/not available|product.*missing|configuration|offering/i.test(raw))return{cancelled:false,message:'That membership is not available in this app-store build yet.'};
    if(/network|offline|timed out|timeout/i.test(raw))return{cancelled:false,message:'The app store could not be reached. Check your connection and try again.'};
  }
  return{cancelled:false,message:'The app store could not complete that purchase. You were not charged by Kivelle.'};
}
