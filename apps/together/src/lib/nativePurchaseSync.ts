import type{SubscriptionStatus}from'./subscription';

export type RestoreSyncResult={state:'active'|'verified_none'|'syncing';data?:SubscriptionStatus};

export async function waitForAuthoritativeRestore(
  refetch:()=>Promise<{data?:SubscriptionStatus;verification?:'active'|'verified_none'|'syncing'}>,
  options:{delays?:number[];sleep?:(milliseconds:number)=>Promise<void>}={},
):Promise<RestoreSyncResult>{
  const delays=options.delays??[0,700,1400,2400,4000,6000],sleep=options.sleep??((milliseconds)=>new Promise((resolve)=>setTimeout(resolve,milliseconds)));

  for(const wait of delays){
    if(wait)await sleep(wait);
    try{
      const result=await refetch();
      if(result.data?.tier&&result.data.tier!=='free')return{state:'active',data:result.data};
      if(result.verification==='verified_none'&&result.data?.tier==='free')return{state:'verified_none',data:result.data};
    }catch{return{state:'syncing'};}
  }
  return {state:'syncing'};
}
