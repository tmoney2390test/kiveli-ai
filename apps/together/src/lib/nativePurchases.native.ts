import{Platform}from'react-native';
import Purchases,{LOG_LEVEL,type PurchasesPackage}from'react-native-purchases';
import type{BillingInterval,SubscriptionTier}from'./subscription';
import{revenueCatPurchaseError,selectRevenueCatPackage}from'./revenueCatPurchases';

let configured=false;
let identifiedUser:string|null=null;

export function nativePurchasesConfigured():boolean{
  return enabled()&&Boolean(platformApiKey());
}

export async function syncNativePurchaseIdentity(userId:string|null):Promise<void>{
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
  await requireConfigured(userId);
  const offerings=await Purchases.getOfferings(),offeringId=process.env.EXPO_PUBLIC_KIVELLE_REVENUECAT_OFFERING_ID?.trim(),offering=offeringId?offerings.all[offeringId]??null:offerings.current;
  const selected=selectRevenueCatPackage<PurchasesPackage>(offering?.availablePackages??[],tier,interval);
  if(!selected)throw new Error('The requested RevenueCat package is not available in this app-store offering.');
  try{await Purchases.purchasePackage(selected);return{cancelled:false,pending:false};}
  catch(error){const normalized=revenueCatPurchaseError(error);if(normalized.cancelled||normalized.pending)return{cancelled:normalized.cancelled,pending:normalized.pending};throw new Error(normalized.message);}
}

export async function restoreNativePurchases(userId:string):Promise<{storeReportsActiveEntitlement:boolean}>{
  await requireConfigured(userId);
  const customerInfo=await Purchases.restorePurchases();
  return{storeReportsActiveEntitlement:Object.keys(customerInfo.entitlements.active).length>0};
}

export function onNativeCustomerInfoUpdated(listener:()=>void):()=>void{
  const wrapped=()=>listener();
  Purchases.addCustomerInfoUpdateListener(wrapped);
  return()=>{Purchases.removeCustomerInfoUpdateListener(wrapped);};
}

export async function loadNativeProductPrices(userId:string):Promise<Record<string,string>>{
  await requireConfigured(userId);
  const offerings=await Purchases.getOfferings(),offeringId=process.env.EXPO_PUBLIC_KIVELLE_REVENUECAT_OFFERING_ID?.trim(),offering=offeringId?offerings.all[offeringId]??null:offerings.current;
  return Object.fromEntries((offering?.availablePackages??[]).map((item)=>[item.identifier,item.product.priceString]));
}

async function requireConfigured(userId:string):Promise<void>{
  if(!nativePurchasesConfigured())throw new Error('App-store billing is not configured for this build.');
  await syncNativePurchaseIdentity(userId);
}
function enabled():boolean{return/^(1|true|yes|on)$/i.test(process.env.EXPO_PUBLIC_KIVELLE_REVENUECAT_ENABLED??'false');}
function platformApiKey():string|null{const value=Platform.OS==='ios'?process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY:Platform.OS==='android'?process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY:null;return value?.trim()||null;}
