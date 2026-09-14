import{useEffect}from'react';
import{useQueryClient}from'@tanstack/react-query';
import{AppState}from'react-native';
import{useAuth}from'../hooks/useAuth';
import{subscriptionStatusQueryKey}from'../hooks/useSubscriptionStatus';
import{nativePurchasesConfigured,onNativeCustomerInfoUpdated,syncNativePurchaseIdentity}from'../lib/nativePurchases';

import {resumeNativePurchase,readPendingPurchase} from '../lib/nativePurchaseRecovery';
export function RevenueCatSessionBridge(){
  const{session}=useAuth(),queryClient=useQueryClient(),userId=session?.user.id??null;
  useEffect(()=>{
    if(!nativePurchasesConfigured())return;
    let cancelled=false;
    void syncNativePurchaseIdentity(userId).then(()=>{if(!cancelled&&userId)void queryClient.invalidateQueries({queryKey:subscriptionStatusQueryKey});}).catch(()=>undefined);
    return()=>{cancelled=true;};
  },[queryClient,userId]);
  useEffect(()=>{
    if(!nativePurchasesConfigured()||!userId)return;
    let cancelled=false;
    const refresh=()=>{
      if(cancelled)return;
      void queryClient.invalidateQueries({queryKey:subscriptionStatusQueryKey});
      void readPendingPurchase(userId).then(p=>p&&!cancelled?resumeNativePurchase(userId):null)
        .then(result=>{if(!cancelled&&result?.state==='active')void queryClient.invalidateQueries({queryKey:subscriptionStatusQueryKey});}).catch(()=>undefined);
    };
    refresh();
    const removeCustomerListener=onNativeCustomerInfoUpdated(refresh);
    // Consumable confirmations can arrive after the SDK customer-info event.
    const timer=setInterval(()=>{
      if(AppState.currentState!=='active'||cancelled)return;
      void readPendingPurchase(userId).then(p=>{if(p?.kind==='credits'&&!cancelled)refresh();}).catch(()=>undefined);
    },60000);
    const appState=AppState.addEventListener('change',(state)=>{if(state==='active'){void syncNativePurchaseIdentity(userId).then(refresh).catch(()=>undefined);}});
    return()=>{cancelled=true;clearInterval(timer);removeCustomerListener();appState.remove();};
  },[queryClient,userId]);
  return null;
}
