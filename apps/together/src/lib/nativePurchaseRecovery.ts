import AsyncStorage from '@react-native-async-storage/async-storage';
import {invoke} from './api';
import {supabase} from './supabase';
import {waitForAuthoritativeRestore,type RestoreSyncResult} from './nativePurchaseSync';
import type {SubscriptionStatus} from './subscription';
export type PendingPurchase={kind:'purchase'|'restore';targetTier?:string;startedAt:number;storePending?:boolean;storeReportsActive?:boolean};
const prefix='kivelle:pending-store-v1:';
let recovery: {userId:string;promise:Promise<RestoreSyncResult>}|null=null;
export async function currentPurchaseAccount(userId:string) {
  const {data}=await supabase.auth.getSession();
  if(data.session?.user.id!==userId)throw new Error('Your account changed. Membership verification will resume when you sign in again.');
}
export async function readPendingPurchase(userId:string):Promise<PendingPurchase|null>{
  const raw=await AsyncStorage.getItem(prefix+userId);
  if(!raw)return null;
  try {const p=JSON.parse(raw);return ['purchase','restore'].includes(p.kind)&&Number.isFinite(p.startedAt)?p:null;}catch{return null;}
}
export async function savePendingPurchase(userId:string,value:PendingPurchase|null){
  if(value)await AsyncStorage.setItem(prefix+userId,JSON.stringify(value));
  else await AsyncStorage.removeItem(prefix+userId);
}
export function resumeNativePurchase(userId:string):Promise<RestoreSyncResult>{
  if(recovery?.userId===userId)return recovery.promise;
  const promise=(async()=>{
    const pending=await readPendingPurchase(userId);
    if(!pending)return {state:'syncing'} as RestoreSyncResult;
    const result=await waitForAuthoritativeRestore(async()=>{
      await currentPurchaseAccount(userId);
      const value=await invoke<{state:SubscriptionStatus;verification:'active'|'verified_none'|'syncing'}>('together-subscription',{action:'reconcile'});
      await currentPurchaseAccount(userId);
      // An old paid tier is not evidence that an upgrade has completed.
      if(pending.targetTier&&value.state.tier!==pending.targetTier)return {verification:'syncing'};
      if(value.verification==='verified_none'&&(pending.storePending||pending.storeReportsActive||pending.kind==='purchase'))return{verification:'syncing'};
      return {data:value.state,verification:value.verification};
    },{delays:[0,2000,5000]});
    await currentPurchaseAccount(userId);
    if(result.state!=='syncing')await savePendingPurchase(userId,null);
    return result;
  })();
  recovery={userId,promise};
  void promise.finally(()=>{if(recovery?.promise===promise)recovery=null;}).catch(()=>undefined);
  return promise;
}
