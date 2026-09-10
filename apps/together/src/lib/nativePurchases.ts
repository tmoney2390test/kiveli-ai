import type { NativeProductPrice } from './nativeProductPrice';
import type{BillingInterval,SubscriptionTier}from'./subscription';

export function nativePurchasesConfigured():boolean{return false;}
export function syncNativePurchaseIdentity(userId:string|null):Promise<void>{void userId;return Promise.resolve();}
export function purchaseNativeSubscription(userId:string,tier:Exclude<SubscriptionTier,'free'>,interval:BillingInterval):Promise<{cancelled:boolean;pending:boolean}>{void userId;void tier;void interval;return Promise.reject(new Error('App-store purchases are available only in the Kivelle iOS and Android apps.'));}
export function restoreNativePurchases(userId:string):Promise<{storeReportsActiveEntitlement:boolean}>{void userId;return Promise.reject(new Error('Purchase restoration is available only in the Kivelle iOS and Android apps.'));}
export function onNativeCustomerInfoUpdated(listener:()=>void):()=>void{void listener;return()=>undefined;}
export function loadNativeProductPrices(userId:string):Promise<Record<string,NativeProductPrice>>{void userId;return Promise.resolve({});}
