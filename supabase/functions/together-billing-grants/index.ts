import { adminClient, serverEnv } from '../_shared/context.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { grantSubscriptionCreditsForPeriod } from '../_shared/kivelle-subscription.ts';
import { constantTimeEqual } from '../../../packages/together-domain/src/security.ts';
import type { SubscriptionTier } from '../../../packages/together-domain/src/index.ts';

type AnnualSubscription={user_id:string;provider:'stripe'|'revenuecat'|'configured';provider_subscription_id:string;plan_key:SubscriptionTier;status:string;current_period_start:string|null;current_period_end:string|null;access_ends_at:string|null};

serve(async(request,correlationId)=>{
  if(request.method!=='POST')throw new AppError('NOT_FOUND','That endpoint is unavailable.',404);
  const expected=serverEnv('KIVELLE_BILLING_GRANT_SECRET'),supplied=request.headers.get('x-kivelle-billing-grant-secret');
  if(!supplied||!constantTimeEqual(supplied,expected))throw new AppError('FORBIDDEN','Billing grant authorization failed.',403);
  const db=adminClient(),now=new Date(),month=now.toISOString().slice(0,7);
  const{data,error}=await db.from('together_billing_subscriptions').select('user_id,provider,provider_subscription_id,plan_key,status,current_period_start,current_period_end,access_ends_at').eq('billing_interval','annual').eq('status','active').gt('access_ends_at',now.toISOString()).limit(1000);
  if(error)throw new AppError('INTERNAL_ERROR','Annual subscription benefits could not be loaded.',500,true);
  let granted=0,failed=0;
  for(const row of(data??[]) as AnnualSubscription[]){
    if(!row.current_period_start||row.plan_key==='free')continue;
    try{
      await grantSubscriptionCreditsForPeriod(db,{userId:row.user_id,tier:row.plan_key,periodStart:row.current_period_start,targetMonth:`${month}-01T00:00:00.000Z`,sourceProvider:row.provider,sourceEventId:`annual-scheduled:${row.provider_subscription_id}:${month}`,subscriptionId:row.provider_subscription_id});
      granted+=1;
    }catch(error){failed+=1;console.error(JSON.stringify({level:'error',operation:'annual_credit_grant',subscriptionId:row.provider_subscription_id,month,code:error instanceof AppError?error.code:'INTERNAL_ERROR'}));}
  }
  return json({data:{eligible:(data??[]).length,processed:granted,failed,month},correlationId},failed?207:200,correlationId);
});
