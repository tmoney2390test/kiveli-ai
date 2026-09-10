import {adminClient,serverEnv} from '../_shared/context.ts';
import {readRequestText} from '../_shared/body.ts';
import {json,serve} from '../_shared/http.ts';
import {AppError} from '../_shared/types.ts';
import {beginBillingEvent,finishBillingEvent} from '../_shared/kivelle-billing-events.ts';
import {parseRevenueCatWebhook,readRevenueCatAdapterConfig,revenueCatEventUserIds,validateRevenueCatEvent,verifyRevenueCatWebhook} from '../_shared/revenuecat.ts';
import {syncRevenueCatUser} from '../_shared/kivelle-revenuecat-sync.ts';

serve(async(request,correlationId)=>{
  if(request.method!=='POST')throw new AppError('NOT_FOUND','That endpoint is unavailable.',404);
  const config=readRevenueCatAdapterConfig();
  if(!config.enabled)throw new AppError('BILLING_NOT_CONFIGURED','RevenueCat subscription synchronization is disabled.',503,true);
  const rawBody=await readRequestText(request);
  await verifyRevenueCatWebhook({rawBody,authorization:request.headers.get('authorization'),signature:request.headers.get('x-revenuecat-webhook-signature'),expectedAuthorization:serverEnv('KIVELLE_REVENUECAT_WEBHOOK_AUTHORIZATION'),signingSecret:serverEnv('KIVELLE_REVENUECAT_WEBHOOK_SIGNING_SECRET')});
  const event=parseRevenueCatWebhook(rawBody),decision=validateRevenueCatEvent(event,config),db=adminClient();
  const claim=await beginBillingEvent(db,'revenuecat',event.id,event.type);
  if(claim.idempotent)return json({data:{applied:false,idempotent:true},correlationId},200,correlationId);
  const summary={eventType:event.type,environment:event.environment??null,store:event.store??null};
  if(decision==='ignore'){
    await finishBillingEvent(db,'revenuecat',event.id,'ignored',null,summary);
    return json({data:{applied:false,ignored:true},correlationId},200,correlationId);
  }
  const userIds=revenueCatEventUserIds(event);
  if(!userIds.length){
    await finishBillingEvent(db,'revenuecat',event.id,'failed',null,summary,'VALIDATION_ERROR');
    throw new AppError('VALIDATION_ERROR','RevenueCat subscription is not linked to a Kivelle account.',400);
  }
  try{
    const secretApiKey=serverEnv('KIVELLE_REVENUECAT_SECRET_API_KEY');
    const results=[];
    for(const userId of userIds)results.push(await syncRevenueCatUser(db,userId,event,config,secretApiKey));
    await finishBillingEvent(db,'revenuecat',event.id,'processed',userIds[0]??null,{...summary,userCount:userIds.length});
    return json({data:{applied:results.some(result=>result.applied),userCount:userIds.length},correlationId},200,correlationId);
  }catch(error){
    await finishBillingEvent(db,'revenuecat',event.id,'failed',userIds[0]??null,{...summary,userCount:userIds.length},error instanceof AppError?error.code:'INTERNAL_ERROR');
    throw error;
  }
});
