import {currentPurchaseAccount,readPendingPurchase,savePendingPurchase} from './nativePurchaseRecovery';
import{Platform}from'react-native';
import { nativeProductPrice, type NativeProductPrice } from './nativeProductPrice';
import Purchases,{LOG_LEVEL,type PurchasesPackage}from'react-native-purchases';
import type{BillingInterval,SubscriptionTier}from'./subscription';
import{revenueCatPurchaseError,selectRevenueCatPackage}from'./revenueCatPurchases';

let identityQueue:Promise<void>=Promise.resolve();
let storeBusy=false;
let configured=false;
let identifiedUser:string|null=null;

export function nativePurchasesConfigured():boolean{
  return enabled()&&Boolean(platformApiKey());
}

export function syncNativePurchaseIdentity(userId:string|null):Promise<void>{
  const operation=identityQueue.then(()=>setNativePurchaseIdentity(userId));
  identityQueue=operation.catch(()=>undefined);return operation;
}
async function setNativePurchaseIdentity(userId:string|null):Promise<void>{
  if(!nativePurchasesConfigured())return;
  if(!configured){
    if(!userId)return;
    await Purchases.setLogLevel(__DEV__?LOG_LEVEL.WARN:LOG_LEVEL.ERROR);
    Purchases.configure({apiKey:platformApiKey()!,appUserID:userId,automaticDeviceIdentifierCollectionEnabled:false,diagnosticsEnabled:false});
    configured=true;identifiedUser=userId;return;
  }
  if(userId===identifiedUser)return;
  if(userId){await Purchases.logIn(userId);identifiedUser=userId;}
  else{await Purchases.logOut();identifiedUser=null;}
}

export async function purchaseNativeSubscription(userId:string,tier:Exclude<SubscriptionTier,'free'>,interval:BillingInterval):Promise<{cancelled:boolean;pending:boolean}>{
  await currentPurchaseAccount(userId);
  await requireConfigured(userId);
  const offerings=await Purchases.getOfferings(),offeringId=process.env.EXPO_PUBLIC_KIVELLE_REVENUECAT_OFFERING_ID?.trim(),offering=offeringId?offerings.all[offeringId]??null:offerings.current;
  const selected=selectRevenueCatPackage<PurchasesPackage>(offering?.availablePackages??[],tier,interval);
  if(!selected)throw new Error('The requested RevenueCat package is not available in this app-store offering.');
  if(storeBusy)throw new Error('Another store operation is running.');
  storeBusy=true;
  try{
    if(await readPendingPurchase(userId))throw new Error('Your previous purchase is still syncing. Restore purchases to check it safely.');
    await currentPurchaseAccount(userId);
    await savePendingPurchase(userId,{kind:'purchase',targetTier:tier,startedAt:Date.now()});
    return await withStoreIdentity(userId,async()=>{
      try{await Purchases.purchasePackage(selected);return{cancelled:false,pending:false};}
      catch(error){
        const normalized=revenueCatPurchaseError(error);
        if(normalized.cancelled)await savePendingPurchase(userId,null);
        if(normalized.pending)await savePendingPurchase(userId,{kind:'purchase',targetTier:tier,startedAt:Date.now(),storePending:true});
        if(normalized.cancelled||normalized.pending)return{cancelled:normalized.cancelled,pending:normalized.pending};
        throw new Error(normalized.message);
      }
    });
  }finally{storeBusy=false;}
}

export async function restoreNativePurchases(userId:string):Promise<{storeReportsActiveEntitlement:boolean}>{
  if(storeBusy)throw new Error('Another store operation is running.');
  storeBusy=true;
  try{
    return await withStoreIdentity(userId,async()=>{
      const existing=await readPendingPurchase(userId),pending=existing??{kind:'restore' as const,startedAt:Date.now()};
      await savePendingPurchase(userId,pending);
      const customerInfo=await Purchases.restorePurchases();
      const active=Object.keys(customerInfo.entitlements.active).length>0;
      await savePendingPurchase(userId,{...pending,storeReportsActive:active});
      return{storeReportsActiveEntitlement:active};
    });
  }finally{storeBusy=false;}
}

export function onNativeCustomerInfoUpdated(listener:()=>void):()=>void{
  const wrapped=()=>listener();
  Purchases.addCustomerInfoUpdateListener(wrapped);
  return()=>{Purchases.removeCustomerInfoUpdateListener(wrapped);};
}

export async function loadNativeProductPrices(userId:string):Promise<Record<string,NativeProductPrice>>{
  await requireConfigured(userId);
  const offerings=await Purchases.getOfferings(),offeringId=process.env.EXPO_PUBLIC_KIVELLE_REVENUECAT_OFFERING_ID?.trim(),offering=offeringId?offerings.all[offeringId]??null:offerings.current;
  return Object.fromEntries((offering?.availablePackages??[]).flatMap((item)=>{const price=nativeProductPrice(item.product);return price?[[item.identifier,price]]:[];}));
}

async function requireConfigured(userId:string):Promise<void>{
  if(!nativePurchasesConfigured())throw new Error('App-store billing is not configured for this build.');
  await syncNativePurchaseIdentity(userId);
}
function enabled():boolean{return/^(1|true|yes|on)$/i.test(process.env.EXPO_PUBLIC_KIVELLE_REVENUECAT_ENABLED??'false');}
function platformApiKey():string|null{const value=Platform.OS==='ios'?process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY:Platform.OS==='android'?process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY:null;return value?.trim()||null;}

async function withStoreIdentity<T>(userId:string,operation:()=>Promise<T>):Promise<T>{
  const result=identityQueue.then(async()=>{
    await currentPurchaseAccount(userId);
    await setNativePurchaseIdentity(userId);
    return operation();
  });
  identityQueue=result.then(()=>undefined,()=>undefined);
  return result;
}
