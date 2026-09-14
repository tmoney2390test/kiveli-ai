import type {adminClient} from './context.ts';
import type {RevenueCatAdapterConfig} from './revenuecat.ts';
import {AppError} from './types.ts';
export async function revenueCatConfigForUser(db:ReturnType<typeof adminClient>,userId:string,config:RevenueCatAdapterConfig):Promise<RevenueCatAdapterConfig>{
  if(config.acceptSandbox)return config;
  const {data,error}=await db.from('together_billing_sandbox_testers').select('user_id').eq('user_id',userId).maybeSingle();
  if(error)throw new AppError('INTERNAL_ERROR','Store testing eligibility could not be verified.',500,true);
  return data?{...config,acceptSandbox:true}:config;
}
