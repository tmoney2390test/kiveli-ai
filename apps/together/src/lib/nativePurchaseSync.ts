import type{SubscriptionStatus}from'./subscription';

export type RestoreSyncResult={state:'active'|'verified_none'|'syncing';data?:SubscriptionStatus};

export async function waitForAuthoritativeRestore(
  refetch:()=>Promise<{data?:SubscriptionStatus}>,
  options:{delays?:number[];sleep?:(milliseconds:number)=>Promise<void>}={},
):Promise<RestoreSyncResult>{
  const delays=options.delays??[0,700,1400,2400,4000,6000],sleep=options.sleep??((milliseconds)=>new Promise((resolve)=>setTimeout(resolve,milliseconds)));
  let confirmedFree=0;
  for(const wait of delays){
    if(wait)await sleep(wait);
    try{
      const result=await refetch();
      if(result.data?.tier&&result.data.tier!=='free')return{state:'active',data:result.data};
      if(result.data?.tier==='free')confirmedFree++;
    }catch{return{state:'syncing'};}
  }
  return confirmedFree>=3?{state:'verified_none'}:{state:'syncing'};
}
