import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';
import { capabilitiesForAccount, creditCost, entitlementsForTier, normalizeSubscriptionTier, selectEffectiveBillingSubscription, subscriptionGrantPeriodKey, type BillingProvider, type CreditAction, type KivelleCapabilities, type NormalizedSubscriptionStatus, type SubscriptionTier } from '../../../packages/together-domain/src/index.ts';

type CreditBalance={permanentBalance:number;subscriptionBalance:number;total:number;subscriptionExpiresAt?:string|null};
export type KivelleSubscriptionAccess={tier:SubscriptionTier;capabilities:KivelleCapabilities;entitlementKeys:string[];billing:KivelleSubscriptionState['billing']};
export type KivelleSubscriptionState={tier:SubscriptionTier;capabilities:KivelleCapabilities;creditBalance:CreditBalance;entitlementKeys:string[];billing:{provider?:string|null;customerId?:string|null;subscriptionId?:string|null;status?:string|null;productKey?:string|null;billingInterval?:'monthly'|'annual';periodStart?:string|null;periodEnd?:string|null;expiresAt?:string|null;trialEnd?:string|null;cancelAtPeriodEnd?:boolean;canceledAt?:string|null;paymentIssue?:boolean;mayPurchaseCredits?:boolean;managedByKivelle?:boolean}};

type NormalizedBillingRow={provider:BillingProvider;provider_customer_id:string|null;provider_subscription_id:string;provider_price_id:string|null;plan_key:SubscriptionTier;status:NormalizedSubscriptionStatus;billing_interval:'monthly'|'annual';current_period_start:string|null;current_period_end:string|null;trial_end:string|null;cancel_at_period_end:boolean;canceled_at:string|null;access_ends_at:string|null;metadata:Record<string,unknown>|null;updated_at:string|null};

export async function resolveSubscriptionState(db:SupabaseClient,userId:string,now=new Date()):Promise<KivelleSubscriptionState>{
  const access=await resolveSubscriptionAccess(db,userId,now);
  await reconcileSubscriptionCreditLifecycle(db,userId,access.capabilities,now);
  await ensureWelcomeCredits(db,userId,access.capabilities);
  const balance=await creditBalance(db,userId);
  return{...access,creditBalance:balance};
}

/** Resolve authoritative paid access without touching the Kivelle Credits ledger. */
export async function resolveSubscriptionAccess(db:SupabaseClient,userId:string,now=new Date()):Promise<KivelleSubscriptionAccess>{
  let{data:row,error}=await db.from('together_entitlements').select('*').eq('user_id',userId).maybeSingle();
  if(error)throw new AppError('INTERNAL_ERROR','Subscription status could not be loaded.',500,true);
  if(!row){const created=await db.from('together_entitlements').insert({user_id:userId,tier:'free',entitlement_keys:[...entitlementsForTier('free')]}).select('*').single();if(created.error||!created.data)throw new AppError('INTERNAL_ERROR','Subscription status could not be prepared.',500,true);row=created.data;}
  const normalized=await loadNormalizedSubscriptions(db,userId),effective=selectEffectiveBillingSubscription(normalized.map((item)=>({provider:item.provider,planKey:item.plan_key,status:item.status,accessEndsAt:item.access_ends_at,currentPeriodEnd:item.current_period_end,updatedAt:item.updated_at})),now),selected=effective?normalized.find((item)=>item.provider===effective.provider&&item.plan_key===effective.planKey&&item.status===effective.status&&(item.access_ends_at??item.current_period_end)===(effective.accessEndsAt??effective.currentPeriodEnd)):newestBillingRow(normalized);
  const expired=Boolean(row.expires_at&&new Date(row.expires_at).getTime()<=now.getTime()),legacyTier=expired?'free':normalizeSubscriptionTier(row.tier),tier=effective?effective.planKey:normalized.length?'free':legacyTier,capabilities=capabilitiesForAccount(tier,row.metadata);
  if(row.tier!==tier||!sameKeys(row.entitlement_keys,capabilities.entitlements)||selected&&row.billing_status!==selected.status){const updated=await db.from('together_entitlements').update({tier,entitlement_keys:[...capabilities.entitlements],...(selected?{billing_provider:selected.provider,billing_customer_id:selected.provider_customer_id??row.billing_customer_id,billing_subscription_id:selected.provider_subscription_id,billing_status:selected.status,product_key:selected.provider_price_id??row.product_key,billing_period_start:selected.current_period_start??null,billing_period_end:selected.current_period_end??null,expires_at:effective?selected.access_ends_at??selected.current_period_end:null}:expired?{metadata:{...(row.metadata??{}),expiredAt:row.expires_at,expiredResolvedAt:now.toISOString()}}:{}),updated_at:now.toISOString()}).eq('user_id',userId).select('*').single();if(updated.data)row=updated.data;}
  const status=selected?.status??row.billing_status??null,rowMetadata=isRecord(row.metadata)?row.metadata:{},selectedMetadata=isRecord(selected?.metadata)?selected.metadata:{},interval=selected?.billing_interval??(rowMetadata.billingInterval==='annual'?'annual':'monthly');
  const productKey=selected?.provider_price_id??row.product_key??null,provider=selected?.provider??row.billing_provider??null;
  const managedByKivelle=provider==='configured'&&Boolean(rowMetadata.adminSubscriptionGrant??selectedMetadata.adminSubscriptionGrant??rowMetadata.promotionGrant??selectedMetadata.promotionGrant??(typeof productKey==='string'&&productKey.endsWith('_test')));
  return{tier,capabilities,entitlementKeys:[...capabilities.entitlements],billing:{provider,customerId:selected?.provider_customer_id??row.billing_customer_id??null,subscriptionId:selected?.provider_subscription_id??row.billing_subscription_id??null,status,productKey,billingInterval:interval,periodStart:selected?.current_period_start??row.billing_period_start??null,periodEnd:selected?.current_period_end??row.billing_period_end??null,expiresAt:selected?.access_ends_at??row.expires_at??null,trialEnd:selected?.trial_end??null,cancelAtPeriodEnd:Boolean(selected?.cancel_at_period_end),canceledAt:selected?.canceled_at??null,paymentIssue:['past_due','unpaid','incomplete'].includes(String(status)),mayPurchaseCredits:tier!=='free'&&status==='active',managedByKivelle}};
}

export async function enforcePhotoSharingEntitlement(db:SupabaseClient,userId:string,now=new Date()):Promise<KivelleSubscriptionAccess>{
  const access=await resolveSubscriptionAccess(db,userId,now);
  if(!access.entitlementKeys.includes('photo_sharing'))throw new AppError('PLAN_LIMIT_REACHED','Share photos with your characters by upgrading to Kivelle+.',403,false);
  return access;
}

export function activeConversationLimitError(capabilities:KivelleCapabilities):AppError{
  return new AppError('PLAN_LIMIT_REACHED',`${capabilities.displayName} supports up to ${capabilities.maxActiveConversations} active conversations. Delete a conversation to start another, or upgrade your plan for more.`,403,false);
}

export function isActiveConversationLimitDatabaseError(error:unknown):boolean{
  return Boolean(error&&typeof error==='object'&&'message'in error&&String((error as{message?:unknown}).message??'').includes('ACTIVE_CONVERSATION_LIMIT_REACHED'));
}

export async function enforceActiveConversationLimit(db:SupabaseClient,userId:string,capabilities?:KivelleCapabilities):Promise<void>{
  const resolved=capabilities??(await resolveSubscriptionAccess(db,userId)).capabilities;
  const{count,error}=await db.from('together_conversations').select('id',{count:'exact',head:true}).eq('user_id',userId).is('archived_at',null).is('user_archived_at',null).in('kind',['direct','first_meeting','group']);
  if(error)throw new AppError('INTERNAL_ERROR','Your conversations could not be counted.',500,true);
  if(Number(count??0)>=resolved.maxActiveConversations)throw activeConversationLimitError(resolved);
}

async function ensureWelcomeCredits(db:SupabaseClient,userId:string,capabilities:KivelleCapabilities):Promise<void>{
  const welcomeKey='welcome-v1';
  const{data:welcome}=await db.from('together_credit_ledger').select('id').eq('user_id',userId).eq('idempotency_key',welcomeKey).maybeSingle();
  if(!welcome&&capabilities.welcomeCredits>0){const{error}=await db.rpc('kivelle_grant_permanent_credits',{p_user_id:userId,p_amount:capabilities.welcomeCredits,p_event_type:'welcome_grant',p_idempotency_key:welcomeKey,p_reference_type:'account',p_reference_id:userId,p_metadata:{reason:'Kivelle welcome credits'}});if(error)throw new AppError('INTERNAL_ERROR','Welcome credits could not be prepared.',500,true);}
}

export async function grantSubscriptionCreditsForPeriod(db:SupabaseClient,input:{userId:string;tier:SubscriptionTier;periodStart:string|Date;sourceProvider:BillingProvider;sourceEventId:string;invoiceId?:string|null;subscriptionId?:string|null;targetMonth?:string|Date}):Promise<void>{
  const capabilities=capabilitiesForAccount(input.tier),grantCycle=`benefit:${new Date(input.targetMonth??input.periodStart).toISOString().slice(0,7)}`;
  if(capabilities.monthlyCreditGrant<=0)return;
  const grantKey=`${subscriptionGrantPeriodKey({userId:input.userId,periodStart:input.periodStart,targetMonth:input.targetMonth})}:target-${capabilities.monthlyCreditGrant}`;
  const{error}=await db.rpc('kivelle_grant_subscription_credit_target',{p_user_id:input.userId,p_target:capabilities.monthlyCreditGrant,p_cap:capabilities.subscriptionCreditRolloverCap,p_cycle:grantCycle,p_idempotency_key:grantKey,p_metadata:{tier:capabilities.tier,cycle:grantCycle,targetGrant:capabilities.monthlyCreditGrant,sourceProvider:input.sourceProvider,sourceEventId:input.sourceEventId,invoiceId:input.invoiceId??null,subscriptionId:input.subscriptionId??null}});
  if(error)throw new AppError('INTERNAL_ERROR','Monthly Kivelle credits could not be prepared.',500,true);
  const stripeEventId=input.sourceProvider==='stripe'&&input.sourceEventId.startsWith('evt_')?input.sourceEventId:null;
  await db.from('together_credit_ledger').update({billing_provider:input.sourceProvider,stripe_event_id:stripeEventId,stripe_invoice_id:input.sourceProvider==='stripe'?input.invoiceId??null:null,stripe_subscription_id:input.sourceProvider==='stripe'?input.subscriptionId??null:null}).eq('user_id',input.userId).eq('idempotency_key',grantKey);
}

export async function creditBalance(db:SupabaseClient,userId:string):Promise<CreditBalance>{
  const{data,error}=await db.from('together_credit_accounts').select('permanent_balance,subscription_balance,subscription_expires_at').eq('user_id',userId).maybeSingle();
  if(error)throw new AppError('INTERNAL_ERROR','Credit balance could not be loaded.',500,true);
  const permanentBalance=Number(data?.permanent_balance??0),subscriptionBalance=Number(data?.subscription_balance??0);return{permanentBalance,subscriptionBalance,total:permanentBalance+subscriptionBalance,subscriptionExpiresAt:data?.subscription_expires_at??null};
}

export async function spendCredits(db:SupabaseClient,input:{userId:string;action:CreditAction;amount?:number;idempotencyKey:string;referenceType:string;referenceId:string;metadata?:Record<string,unknown>}):Promise<{transactionId:string;cost:number;balance:CreditBalance}>{
  const baseCost=creditCost(input.action),requestedAmount=input.amount===undefined?baseCost:Math.floor(Number(input.amount)),cost=Number.isFinite(requestedAmount)?Math.max(baseCost,requestedAmount):baseCost;const{data,error}=await db.rpc('kivelle_spend_credits',{p_user_id:input.userId,p_amount:cost,p_idempotency_key:input.idempotencyKey,p_reference_type:input.referenceType,p_reference_id:input.referenceId,p_metadata:{action:input.action,...(input.metadata??{})}});
  if(error){if(String(error.message??'').includes('INSUFFICIENT_KIVELLE_CREDITS'))throw new AppError('INSUFFICIENT_CREDITS',`This action uses ${cost} Kivelle Credits. Add credits or choose a lower-cost option.`,402);throw new AppError('INTERNAL_ERROR','Kivelle Credits could not be applied.',500,true);}
  return{transactionId:String(data.transactionId),cost,balance:{permanentBalance:Number(data.permanentBalance??0),subscriptionBalance:Number(data.subscriptionBalance??0),total:Number(data.total??0)}};
}
export async function refundCredits(db:SupabaseClient,input:{userId:string;transactionId:string;idempotencyKey:string;metadata?:Record<string,unknown>}):Promise<boolean>{const{error}=await db.rpc('kivelle_refund_credit_transaction',{p_user_id:input.userId,p_transaction_id:input.transactionId,p_idempotency_key:input.idempotencyKey,p_metadata:input.metadata??{}});if(error){console.error('Kivelle credit refund failed',error.message);return false;}return true;}

export async function enforceCreditBalance(db:SupabaseClient,userId:string,action:CreditAction):Promise<CreditBalance>{const state=await resolveSubscriptionState(db,userId);const cost=creditCost(action);if(state.creditBalance.total<cost)throw new AppError('INSUFFICIENT_CREDITS',`This action uses ${cost} Kivelle Credits. You have ${state.creditBalance.total}.`,402);return state.creditBalance;}
export async function enforceExplicitDialogueAllowance(db:SupabaseClient,userId:string,capabilities:KivelleCapabilities,now=new Date()):Promise<void>{
  // Kept as a compatibility seam for existing dialogue callers. Adult dialogue
  // is never metered separately; only the account's global chat allowance applies.
  void db;void userId;void capabilities;void now;
}

export async function reconcileSubscriptionCreditLifecycle(db:SupabaseClient,userId:string,capabilities:KivelleCapabilities,now=new Date()):Promise<void>{
  const{error}=await db.rpc('kivelle_reconcile_subscription_credits',{p_user_id:userId,p_expected_tier:capabilities.tier,p_cap:capabilities.subscriptionCreditRolloverCap,p_paid_active:capabilities.tier!=='free',p_grace_days:30,p_now:now.toISOString()});
  if(error)throw new AppError('INTERNAL_ERROR','Subscription credit balance could not be reconciled.',500,true);
}
export async function enforceLifeLimit(db:SupabaseClient,userId:string,capabilities:KivelleCapabilities):Promise<void>{const{count,error}=await db.from('together_continuities').select('id',{count:'exact',head:true}).eq('user_id',userId);if(error)throw new AppError('INTERNAL_ERROR','Kivelle Lives could not be counted.',500,true);if(Number(count??0)>=capabilities.maxLives)throw new AppError('PLAN_LIMIT_REACHED',`${capabilities.displayName} supports up to ${capabilities.maxLives} Kivelle ${capabilities.maxLives===1?'Life':'Lives'}.`,403);}
export async function enforceCustomCompanionLimit(db:SupabaseClient,userId:string,capabilities:KivelleCapabilities):Promise<void>{const{count,error}=await db.from('together_character_templates').select('id',{count:'exact',head:true}).eq('creator_id',userId).neq('lifecycle_status','archived');if(error)throw new AppError('INTERNAL_ERROR','Custom companions could not be counted.',500,true);if(Number(count??0)>=capabilities.maxCustomCompanions)throw new AppError('PLAN_LIMIT_REACHED',`${capabilities.displayName} supports up to ${capabilities.maxCustomCompanions} custom ${capabilities.maxCustomCompanions===1?'companion':'companions'}.`,403);}

export type DailyPhotoAllowanceStatus={limit:number;used:number;remaining:number;benefitDate:string};
export type DailyPhotoAllowanceClaim={claimed:boolean;remaining:number;benefitDate?:string;reservationKey:string};

export async function dailyPhotoAllowanceStatus(db:SupabaseClient,input:{userId:string;limit:number;now?:Date}):Promise<DailyPhotoAllowanceStatus>{
  const limit=Math.max(0,Math.floor(input.limit));
  const benefitDate=(input.now??new Date()).toISOString().slice(0,10);
  if(limit===0)return{limit:0,used:0,remaining:0,benefitDate};
  const{count,error}=await db.from('together_daily_photo_allowance_claims').select('id',{count:'exact',head:true}).eq('user_id',input.userId).eq('benefit_date',benefitDate);
  if(error)throw new AppError('INTERNAL_ERROR','Your included photo allowance could not be checked.',500,true);
  const used=Math.max(0,Number(count??0));
  return{limit,used,remaining:Math.max(limit-used,0),benefitDate};
}

export async function prepareDailyPhotoOffer(db:SupabaseClient,input:{userId:string;offerId:string;dailyLimit:number;tier:SubscriptionTier}):Promise<DailyPhotoAllowanceClaim&{expired?:boolean}>{
  const reservationKey=`offer:${input.offerId}`;
  if(input.dailyLimit<=0||input.tier==='free')return{claimed:false,remaining:0,reservationKey};
  const{data,error}=await db.rpc('kivelle_prepare_daily_photo_offer',{p_user_id:input.userId,p_offer_id:input.offerId,p_daily_limit:input.dailyLimit,p_tier:input.tier});
  if(error){
    if(String(error.message).includes('MEDIA_OFFER_NOT_PENDING'))throw new AppError('CONFLICT','That photo offer is no longer available.',409);
    throw new AppError('INTERNAL_ERROR','Your included photo could not be reserved.',500,true);
  }
  return{claimed:data?.claimed===true,remaining:Math.max(0,Number(data?.remaining??0)),benefitDate:typeof data?.benefitDate==='string'?data.benefitDate:undefined,reservationKey,expired:data?.expired===true};
}

export async function claimDailyPhotoAllowance(db:SupabaseClient,input:{userId:string;reservationKey:string;dailyLimit:number;tier:SubscriptionTier}):Promise<DailyPhotoAllowanceClaim>{
  if(input.dailyLimit<=0||input.tier==='free')return{claimed:false,remaining:0,reservationKey:input.reservationKey};
  const{data,error}=await db.rpc('kivelle_claim_daily_photo_allowance',{p_user_id:input.userId,p_reservation_key:input.reservationKey,p_daily_limit:input.dailyLimit,p_tier:input.tier});
  if(error)throw new AppError('INTERNAL_ERROR','Your included photo could not be reserved.',500,true);
  return{claimed:data?.claimed===true,remaining:Math.max(0,Number(data?.remaining??0)),benefitDate:typeof data?.benefitDate==='string'?data.benefitDate:undefined,reservationKey:input.reservationKey};
}

export async function releaseDailyPhotoAllowance(db:SupabaseClient,input:{userId:string;reservationKey:unknown}):Promise<boolean>{
  if(typeof input.reservationKey!=='string'||!input.reservationKey)return false;
  const{data,error}=await db.rpc('kivelle_release_daily_photo_allowance',{p_user_id:input.userId,p_reservation_key:input.reservationKey});
  if(error){console.warn('Daily photo reservation could not be released',error.message);return false;}
  return data===true;
}

export async function consumeDailyPhotoAllowance(db:SupabaseClient,input:{userId:string;reservationKey:unknown}):Promise<boolean>{
  if(typeof input.reservationKey!=='string'||!input.reservationKey)return false;
  const{data,error}=await db.rpc('kivelle_consume_daily_photo_allowance',{p_user_id:input.userId,p_reservation_key:input.reservationKey});
  if(error){console.warn('Daily photo reservation could not be finalized',error.message);return false;}
  return data===true;
}

export function dailyPhotoReservationKey(metadata:unknown):string|null{
  if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))return null;
  const value=(metadata as Record<string,unknown>).dailyPhotoReservationKey;
  return typeof value==='string'&&value.length>=8?value:null;
}

async function loadNormalizedSubscriptions(db:SupabaseClient,userId:string):Promise<NormalizedBillingRow[]>{
  const{data,error}=await db.from('together_billing_subscriptions').select('provider,provider_customer_id,provider_subscription_id,provider_price_id,plan_key,status,billing_interval,current_period_start,current_period_end,trial_end,cancel_at_period_end,canceled_at,access_ends_at,metadata,updated_at').eq('user_id',userId);
  // Deployment is migration-first, but this fallback keeps an interrupted rollout
  // from breaking unrelated chat requests before the additive table is present.
  if(error){if(error.code==='42P01')return[];throw new AppError('INTERNAL_ERROR','Provider subscription status could not be loaded.',500,true);}
  return(data??[]) as NormalizedBillingRow[];
}

function sameKeys(current:unknown,expected:readonly string[]):boolean{const a=Array.isArray(current)?current.map(String).sort():[],b=[...expected].sort();return a.length===b.length&&a.every((value,index)=>value===b[index]);}
function newestBillingRow(rows:NormalizedBillingRow[]):NormalizedBillingRow|null{return[...rows].sort((a,b)=>new Date(b.updated_at??0).getTime()-new Date(a.updated_at??0).getTime())[0]??null;}
function isRecord(value:unknown):value is Record<string,unknown>{return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);}
