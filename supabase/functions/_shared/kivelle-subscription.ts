import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';
import { capabilitiesForTier, creditCost, entitlementsForTier, normalizeSubscriptionTier, type CreditAction, type KivelleCapabilities, type SubscriptionTier } from '../../../packages/together-domain/src/index.ts';

type CreditBalance={permanentBalance:number;subscriptionBalance:number;total:number};
export type KivelleSubscriptionState={tier:SubscriptionTier;capabilities:KivelleCapabilities;creditBalance:CreditBalance;entitlementKeys:string[];billing:{provider?:string|null;productKey?:string|null;periodStart?:string|null;periodEnd?:string|null;expiresAt?:string|null}};

const calendarCycle=(now=new Date())=>`${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}`;
const billingCycle=(value:unknown,now:Date)=>{if(typeof value==='string'&&value){const date=new Date(value);if(Number.isFinite(date.getTime()))return`billing:${date.toISOString().slice(0,10)}`;}return`calendar:${calendarCycle(now)}`;};

export async function resolveSubscriptionState(db:SupabaseClient,userId:string,now=new Date()):Promise<KivelleSubscriptionState>{
  let{data:row,error}=await db.from('together_entitlements').select('*').eq('user_id',userId).maybeSingle();
  if(error)throw new AppError('INTERNAL_ERROR','Subscription status could not be loaded.',500,true);
  if(!row){const created=await db.from('together_entitlements').insert({user_id:userId,tier:'free',entitlement_keys:[...entitlementsForTier('free')]}).select('*').single();if(created.error||!created.data)throw new AppError('INTERNAL_ERROR','Subscription status could not be prepared.',500,true);row=created.data;}
  const expired=Boolean(row.expires_at&&new Date(row.expires_at).getTime()<=now.getTime());const tier=expired?'free':normalizeSubscriptionTier(row.tier),capabilities=capabilitiesForTier(tier);
  if(row.tier!==tier||!sameKeys(row.entitlement_keys,capabilities.entitlements)){const updated=await db.from('together_entitlements').update({tier,entitlement_keys:[...capabilities.entitlements],...(expired?{metadata:{...(row.metadata??{}),expiredAt:row.expires_at,expiredResolvedAt:now.toISOString()}}:{}),updated_at:now.toISOString()}).eq('user_id',userId).select('*').single();if(updated.data)row=updated.data;}
  await ensureCreditGrants(db,userId,capabilities,now,billingCycle(row.billing_period_start,now));
  const balance=await creditBalance(db,userId);
  return{tier,capabilities,creditBalance:balance,entitlementKeys:[...capabilities.entitlements],billing:{provider:row.billing_provider??null,productKey:row.product_key??null,periodStart:row.billing_period_start??null,periodEnd:row.billing_period_end??null,expiresAt:row.expires_at??null}};
}

export async function ensureCreditGrants(db:SupabaseClient,userId:string,capabilities:KivelleCapabilities,now=new Date(),grantCycle=billingCycle(null,now)):Promise<void>{
  const welcomeKey='welcome-v1';
  const{data:welcome}=await db.from('together_credit_ledger').select('id').eq('user_id',userId).eq('idempotency_key',welcomeKey).maybeSingle();
  if(!welcome&&capabilities.welcomeCredits>0){const{error}=await db.rpc('kivelle_grant_permanent_credits',{p_user_id:userId,p_amount:capabilities.welcomeCredits,p_event_type:'welcome_grant',p_idempotency_key:welcomeKey,p_reference_type:'account',p_reference_id:userId,p_metadata:{reason:'Kivelle welcome credits'}});if(error)throw new AppError('INTERNAL_ERROR','Welcome credits could not be prepared.',500,true);}
  if(capabilities.monthlyCreditGrant<=0)return;
  const{data:cycleRows,error:cycleError}=await db.from('together_credit_ledger').select('subscription_delta,metadata').eq('user_id',userId).eq('event_type','subscription_grant').contains('metadata',{cycle:grantCycle});
  if(cycleError)throw new AppError('INTERNAL_ERROR','Monthly Kivelle credit history could not be checked.',500,true);
  const alreadyGranted=(cycleRows??[]).reduce((sum,row)=>sum+Math.max(0,Number(row.subscription_delta??0)),0),remaining=Math.max(0,capabilities.monthlyCreditGrant-alreadyGranted);
  if(remaining<=0)return;
  const grantKey=`subscription:${grantCycle}:target-${capabilities.monthlyCreditGrant}`;
  const{error}=await db.rpc('kivelle_grant_subscription_credits',{p_user_id:userId,p_amount:remaining,p_cap:capabilities.subscriptionCreditRolloverCap,p_cycle:grantCycle,p_idempotency_key:grantKey,p_metadata:{tier:capabilities.tier,cycle:grantCycle,targetGrant:capabilities.monthlyCreditGrant,alreadyGranted}});
  if(error)throw new AppError('INTERNAL_ERROR','Monthly Kivelle credits could not be prepared.',500,true);
}

export async function creditBalance(db:SupabaseClient,userId:string):Promise<CreditBalance>{
  const{data,error}=await db.from('together_credit_accounts').select('permanent_balance,subscription_balance').eq('user_id',userId).maybeSingle();
  if(error)throw new AppError('INTERNAL_ERROR','Credit balance could not be loaded.',500,true);
  const permanentBalance=Number(data?.permanent_balance??0),subscriptionBalance=Number(data?.subscription_balance??0);return{permanentBalance,subscriptionBalance,total:permanentBalance+subscriptionBalance};
}

export async function spendCredits(db:SupabaseClient,input:{userId:string;action:CreditAction;idempotencyKey:string;referenceType:string;referenceId:string;metadata?:Record<string,unknown>}):Promise<{transactionId:string;cost:number;balance:CreditBalance}>{
  const cost=creditCost(input.action);const{data,error}=await db.rpc('kivelle_spend_credits',{p_user_id:input.userId,p_amount:cost,p_idempotency_key:input.idempotencyKey,p_reference_type:input.referenceType,p_reference_id:input.referenceId,p_metadata:{action:input.action,...(input.metadata??{})}});
  if(error){if(String(error.message??'').includes('INSUFFICIENT_KIVELLE_CREDITS'))throw new AppError('INSUFFICIENT_CREDITS',`This action uses ${cost} Kivelle Credits. Add credits or choose a lower-cost option.`,402);throw new AppError('INTERNAL_ERROR','Kivelle Credits could not be applied.',500,true);}
  return{transactionId:String(data.transactionId),cost,balance:{permanentBalance:Number(data.permanentBalance??0),subscriptionBalance:Number(data.subscriptionBalance??0),total:Number(data.total??0)}};
}
export async function refundCredits(db:SupabaseClient,input:{userId:string;transactionId:string;idempotencyKey:string;metadata?:Record<string,unknown>}):Promise<boolean>{const{error}=await db.rpc('kivelle_refund_credit_transaction',{p_user_id:input.userId,p_transaction_id:input.transactionId,p_idempotency_key:input.idempotencyKey,p_metadata:input.metadata??{}});if(error){console.error('Kivelle credit refund failed',error.message);return false;}return true;}

export async function enforceCreditBalance(db:SupabaseClient,userId:string,action:CreditAction):Promise<CreditBalance>{const state=await resolveSubscriptionState(db,userId);const cost=creditCost(action);if(state.creditBalance.total<cost)throw new AppError('INSUFFICIENT_CREDITS',`This action uses ${cost} Kivelle Credits. You have ${state.creditBalance.total}.`,402);return state.creditBalance;}
export async function enforceChatAllowance(db:SupabaseClient,userId:string,capabilities:KivelleCapabilities,now=new Date()):Promise<void>{if(capabilities.chatDailyLimit===null)return;const start=new Date(now);start.setUTCHours(0,0,0,0);const{count,error}=await db.from('together_messages').select('id',{count:'exact',head:true}).eq('user_id',userId).eq('role','user').gte('created_at',start.toISOString());if(error)throw new AppError('INTERNAL_ERROR','Daily chat allowance could not be checked.',500,true);if(Number(count??0)>=capabilities.chatDailyLimit)throw new AppError('PLAN_LIMIT_REACHED',`Kivelle Free includes ${capabilities.chatDailyLimit} messages per day. Upgrade for unlimited conversations.`,429);}
export async function enforceLifeLimit(db:SupabaseClient,userId:string,capabilities:KivelleCapabilities):Promise<void>{const{count,error}=await db.from('together_continuities').select('id',{count:'exact',head:true}).eq('user_id',userId);if(error)throw new AppError('INTERNAL_ERROR','Kivelle Lives could not be counted.',500,true);if(Number(count??0)>=capabilities.maxLives)throw new AppError('PLAN_LIMIT_REACHED',`${capabilities.displayName} supports up to ${capabilities.maxLives} Kivelle ${capabilities.maxLives===1?'Life':'Lives'}.`,403);}
export async function enforceCustomCompanionLimit(db:SupabaseClient,userId:string,capabilities:KivelleCapabilities):Promise<void>{const{count,error}=await db.from('together_character_templates').select('id',{count:'exact',head:true}).eq('creator_id',userId).neq('lifecycle_status','archived');if(error)throw new AppError('INTERNAL_ERROR','Custom companions could not be counted.',500,true);if(Number(count??0)>=capabilities.maxCustomCompanions)throw new AppError('PLAN_LIMIT_REACHED',`${capabilities.displayName} supports up to ${capabilities.maxCustomCompanions} custom ${capabilities.maxCustomCompanions===1?'companion':'companions'}.`,403);}

function sameKeys(current:unknown,expected:readonly string[]):boolean{const a=Array.isArray(current)?current.map(String).sort():[],b=[...expected].sort();return a.length===b.length&&a.every((value,index)=>value===b[index]);}
