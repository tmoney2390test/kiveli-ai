import type{BillingInterval,SubscriptionTier}from'./subscription';
import {nativeProductPrice,type NativeProductPrice} from './nativeProductPrice';

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

/** A mislabeled offering must never sell a monthly product as an annual plan. */
export function verifiedPackagePrice(product:{priceString:string;subscriptionPeriod:string|null;price?:number},interval:BillingInterval):NativeProductPrice|null{
  if(product.subscriptionPeriod!==(interval==='annual'?'P1Y':'P1M'))return null;
  return nativeProductPrice(product);
}

export function revenueCatPurchaseError(error:unknown):{cancelled:boolean;pending:boolean;message:string;safeToRetry?:boolean}{
  if(error&&typeof error==='object'){
    const value=error as Record<string,unknown>;
    const code=String(value.code??'').toLowerCase();
    // RevenueCat 10.x uses 1 for cancellation and 20 for a pending payment.
    if(value.userCancelled===true||code==='1'||code.includes('purchase_cancelled'))return{cancelled:true,pending:false,message:'Purchase cancelled.'};
    if(code==='20'||code.includes('payment_pending'))return{cancelled:false,pending:true,message:'Your purchase is waiting for store approval. Kivelli will activate it after the store confirms it.'};
    if(['3','4','5'].includes(code))return{cancelled:false,pending:false,safeToRetry:true,message:'The store did not start this purchase. Check that purchases are allowed and the product is available, then try again.'};
    if(code==='6'||code.includes('already_purchased'))return{cancelled:false,pending:false,message:'This membership is already owned by your store account. Use Restore purchases to sync it with Kivelli.'};
    const raw=typeof value.message==='string'?value.message:'';
    if(/pending|deferred|approval/i.test(`${code} ${raw}`))return{cancelled:false,pending:true,message:'Your purchase is waiting for store approval. Kivelli will activate it after the store confirms it.'};
    if(/not available|product.*missing|configuration|offering/i.test(raw))return{cancelled:false,pending:false,message:'That membership is not available in this app-store build yet.'};
    if(/network|offline|timed out|timeout/i.test(raw))return{cancelled:false,pending:false,message:'The app store could not be reached. Check your connection and try again.'};
  }
  return{cancelled:false,pending:false,message:'The store could not confirm this purchase. Refresh its status before trying again.'};
}
