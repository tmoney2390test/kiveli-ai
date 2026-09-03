import{useEffect}from'react';
import{useQueryClient}from'@tanstack/react-query';
import{useAuth}from'../hooks/useAuth';
import{subscriptionStatusQueryKey}from'../hooks/useSubscriptionStatus';
import{nativePurchasesConfigured,syncNativePurchaseIdentity}from'../lib/nativePurchases';

export function RevenueCatSessionBridge(){
  const{session}=useAuth(),queryClient=useQueryClient(),userId=session?.user.id??null;
  useEffect(()=>{
    if(!nativePurchasesConfigured())return;
    let cancelled=false;
    void syncNativePurchaseIdentity(userId).then(()=>{if(!cancelled&&userId)void queryClient.invalidateQueries({queryKey:subscriptionStatusQueryKey});}).catch(()=>undefined);
    return()=>{cancelled=true;};
  },[queryClient,userId]);
  return null;
}
