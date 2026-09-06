import{useEffect}from'react';
import{useQueryClient}from'@tanstack/react-query';
import{AppState}from'react-native';
import{useAuth}from'../hooks/useAuth';
import{subscriptionStatusQueryKey}from'../hooks/useSubscriptionStatus';
import{nativePurchasesConfigured,onNativeCustomerInfoUpdated,syncNativePurchaseIdentity}from'../lib/nativePurchases';

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
    const refresh=()=>void queryClient.invalidateQueries({queryKey:subscriptionStatusQueryKey});
    const removeCustomerListener=onNativeCustomerInfoUpdated(refresh);
    const appState=AppState.addEventListener('change',(state)=>{if(state==='active'){void syncNativePurchaseIdentity(userId).then(refresh).catch(()=>undefined);}});
    return()=>{removeCustomerListener();appState.remove();};
  },[queryClient,userId]);
  return null;
}
