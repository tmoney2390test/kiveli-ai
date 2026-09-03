import {z} from 'zod';
import {constantTimeEqual} from '../../../packages/together-domain/src/security.ts';
import type {NormalizedSubscriptionStatus,SubscriptionTier} from '../../../packages/together-domain/src/index.ts';
import {AppError} from './types.ts';

const paidTierSchema=z.enum(['kivelle_plus','kivelle_max']);
const intervalSchema=z.enum(['monthly','annual']);
const adapterConfigSchema=z.object({
  enabled:z.boolean().default(false),
  acceptSandbox:z.boolean().default(false),
  allowedAppIds:z.array(z.string().trim().min(1)).min(1),
  entitlements:z.object({kivelle_plus:z.string().trim().min(1),kivelle_max:z.string().trim().min(1)}),
  products:z.record(z.string(),z.object({tier:paidTierSchema,billingInterval:intervalSchema})),
});

const webhookEventSchema=z.object({
  id:z.string().trim().min(1).max(240),
  type:z.string().trim().min(1).max(100),
  event_timestamp_ms:z.number().int().positive(),
  app_id:z.string().trim().nullable().optional(),
  app_user_id:z.string().nullable().optional(),
  original_app_user_id:z.string().nullable().optional(),
  aliases:z.array(z.string()).optional().default([]),
  transferred_from:z.array(z.string()).optional().default([]),
  transferred_to:z.array(z.string()).optional().default([]),
  environment:z.enum(['PRODUCTION','SANDBOX']).nullable().optional(),
  store:z.string().nullable().optional(),
  product_id:z.string().nullable().optional(),
  new_product_id:z.string().nullable().optional(),
}).passthrough();

const subscriberSchema=z.object({
  request_date:z.string().optional(),
  subscriber:z.object({
    entitlements:z.record(z.string(),z.object({
      expires_date:z.string().nullable().optional(),
      grace_period_expires_date:z.string().nullable().optional(),
      product_identifier:z.string().nullable().optional(),
      purchase_date:z.string().nullable().optional(),
    }).passthrough()).default({}),
    subscriptions:z.record(z.string(),z.object({
      expires_date:z.string().nullable().optional(),
      grace_period_expires_date:z.string().nullable().optional(),
      purchase_date:z.string().nullable().optional(),
      original_purchase_date:z.string().nullable().optional(),
      unsubscribe_detected_at:z.string().nullable().optional(),
      billing_issues_detected_at:z.string().nullable().optional(),
      period_type:z.string().nullable().optional(),
      store:z.string().nullable().optional(),
      is_sandbox:z.boolean().optional(),
    }).passthrough()).default({}),
  }).passthrough(),
}).passthrough();

export type RevenueCatAdapterConfig=z.infer<typeof adapterConfigSchema>;
export type RevenueCatWebhookEvent=z.infer<typeof webhookEventSchema>;
export type RevenueCatSubscriber=z.infer<typeof subscriberSchema>;
export type NormalizedRevenueCatSubscription={
  tier:Exclude<SubscriptionTier,'free'>;
  productId:string;
  billingInterval:'monthly'|'annual';
  status:NormalizedSubscriptionStatus;
  periodStart:string|null;
  periodEnd:string|null;
  trialEnd:string|null;
  cancelAtPeriodEnd:boolean;
  canceledAt:string|null;
  accessEndsAt:string|null;
  store:string|null;
  sandbox:boolean;
};

const supportedLifecycleEvents=new Set(['INITIAL_PURCHASE','RENEWAL','PRODUCT_CHANGE','CANCELLATION','UNCANCELLATION','BILLING_ISSUE','SUBSCRIPTION_PAUSED','EXPIRATION','TRANSFER','TEMPORARY_ENTITLEMENT_GRANT']);

export function readRevenueCatAdapterConfig(readEnv:(name:string)=>string|undefined=(name)=>Deno.env.get(name)):RevenueCatAdapterConfig{
  const raw=readEnv('KIVELLE_REVENUECAT_CONFIG_JSON');
  if(!raw)return{enabled:false,acceptSandbox:false,allowedAppIds:['not-configured'],entitlements:{kivelle_plus:'kivelle_plus',kivelle_max:'kivelle_max'},products:{}};
  let parsed:unknown;
  try{parsed=JSON.parse(raw);}catch{throw new AppError('INTERNAL_ERROR','RevenueCat adapter configuration is invalid.',500);}
  const result=adapterConfigSchema.safeParse(parsed);
  if(!result.success)throw new AppError('INTERNAL_ERROR','RevenueCat adapter configuration is incomplete.',500);
  return result.data;
}

export function parseRevenueCatWebhook(raw:string):RevenueCatWebhookEvent{
  let parsed:unknown;
  try{parsed=JSON.parse(raw);}catch{throw new AppError('VALIDATION_ERROR','RevenueCat webhook JSON is invalid.',400);}
  const result=z.object({api_version:z.string(),event:webhookEventSchema}).safeParse(parsed);
  if(!result.success)throw new AppError('VALIDATION_ERROR','RevenueCat webhook payload is incomplete.',400);
  return result.data.event;
}

export async function verifyRevenueCatWebhook(input:{rawBody:string;authorization:string|null;signature:string|null;expectedAuthorization:string;signingSecret:string;now?:Date;toleranceSeconds?:number}):Promise<void>{
  if(!input.authorization||!constantTimeEqual(input.authorization,input.expectedAuthorization))throw new AppError('FORBIDDEN','RevenueCat webhook authorization failed.',403);
  const parts=Object.fromEntries((input.signature??'').split(',').map((part)=>{const index=part.indexOf('=');return index>0?[part.slice(0,index).trim(),part.slice(index+1).trim()]:['',''];}).filter(([key])=>key));
  const timestamp=parts.t,received=parts.v1,seconds=Number(timestamp);
  if(!timestamp||!received||!/^[a-f0-9]{64}$/i.test(received)||!Number.isInteger(seconds))throw new AppError('FORBIDDEN','RevenueCat webhook signature is invalid.',403);
  const nowSeconds=Math.floor((input.now??new Date()).getTime()/1000),tolerance=input.toleranceSeconds??300;
  if(Math.abs(nowSeconds-seconds)>tolerance)throw new AppError('FORBIDDEN','RevenueCat webhook signature has expired.',403);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(input.signingSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}.${input.rawBody}`));
  const expected=[...new Uint8Array(digest)].map((byte)=>byte.toString(16).padStart(2,'0')).join('');
  if(!constantTimeEqual(expected,received.toLowerCase()))throw new AppError('FORBIDDEN','RevenueCat webhook signature is invalid.',403);
}

export function validateRevenueCatEvent(event:RevenueCatWebhookEvent,config:RevenueCatAdapterConfig):'process'|'ignore'{
  if(!config.enabled)throw new AppError('BILLING_NOT_CONFIGURED','RevenueCat subscription synchronization is disabled.',503,true);
  if(event.type==='TEST')return'ignore';
  if(!supportedLifecycleEvents.has(event.type))return'ignore';
  if(!event.app_id||!config.allowedAppIds.includes(event.app_id))throw new AppError('FORBIDDEN','RevenueCat webhook app is not authorized.',403);
  if(event.environment==='SANDBOX'&&!config.acceptSandbox)return'ignore';
  return'process';
}

export function revenueCatEventUserIds(event:RevenueCatWebhookEvent):string[]{
  const values=event.type==='TRANSFER'
    ?[...event.transferred_from,...event.transferred_to]
    :[event.app_user_id,event.original_app_user_id,...event.aliases];
  return [...new Set(values.filter((value):value is string=>typeof value==='string'&&isUuid(value)))];
}

export async function fetchRevenueCatSubscriber(appUserId:string,secretApiKey:string,fetcher:typeof fetch=fetch):Promise<RevenueCatSubscriber>{
  const response=await fetcher(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,{headers:{Authorization:`Bearer ${secretApiKey}`,Accept:'application/json'}});
  if(!response.ok)throw new AppError('PROVIDER_UNAVAILABLE','RevenueCat subscriber status could not be verified.',502,true);
  const parsed=subscriberSchema.safeParse(await response.json());
  if(!parsed.success)throw new AppError('PROVIDER_UNAVAILABLE','RevenueCat returned an invalid subscriber status.',502,true);
  return parsed.data;
}

/**
 * Converts RevenueCat's current subscriber snapshot into Kivelle's provider-
 * neutral subscription row. Both entitlement and product mappings must agree;
 * a newly-created dashboard product therefore fails closed until deployed.
 */
export function normalizeRevenueCatSubscriber(snapshot:RevenueCatSubscriber,config:RevenueCatAdapterConfig,now=new Date()):NormalizedRevenueCatSubscription|null{
  const entitlementToTier=new Map<string,Exclude<SubscriptionTier,'free'>>([
    [config.entitlements.kivelle_plus,'kivelle_plus'],
    [config.entitlements.kivelle_max,'kivelle_max'],
  ]);
  const candidates=Object.entries(snapshot.subscriber.entitlements).flatMap(([entitlementId,entitlement])=>{
    const entitlementTier=entitlementToTier.get(entitlementId),productId=entitlement.product_identifier??'';
    const product=config.products[productId];
    if(!entitlementTier||!product||product.tier!==entitlementTier)return[];
    const subscription=snapshot.subscriber.subscriptions[productId];
    if(!subscription)return[];
    const periodEnd=latestIso(entitlement.expires_date,subscription.expires_date),graceEnd=latestIso(entitlement.grace_period_expires_date,subscription.grace_period_expires_date),accessEndsAt=latestIso(periodEnd,graceEnd);
    const accessEndTime=dateTime(accessEndsAt),active=accessEndsAt===null||accessEndTime>now.getTime();
    if(!active)return[];
    const billingIssue=Boolean(subscription.billing_issues_detected_at),trial=String(subscription.period_type??'').toUpperCase()==='TRIAL';
    return[{tier:product.tier,productId,billingInterval:product.billingInterval,status:(billingIssue?'past_due':trial?'trialing':'active') as NormalizedSubscriptionStatus,periodStart:validIso(subscription.purchase_date??subscription.original_purchase_date),periodEnd,trialEnd:trial?periodEnd:null,cancelAtPeriodEnd:Boolean(subscription.unsubscribe_detected_at),canceledAt:validIso(subscription.unsubscribe_detected_at),accessEndsAt,store:subscription.store??null,sandbox:subscription.is_sandbox===true}];
  });
  return candidates.sort((left,right)=>tierRank(right.tier)-tierRank(left.tier)||dateTime(right.accessEndsAt)-dateTime(left.accessEndsAt))[0]??null;
}

function isUuid(value:string):boolean{return/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);}
function tierRank(tier:Exclude<SubscriptionTier,'free'>):number{return tier==='kivelle_max'?2:1;}
function dateTime(value:string|null|undefined):number{const time=value?Date.parse(value):NaN;return Number.isFinite(time)?time:0;}
function validIso(value:string|null|undefined):string|null{const time=dateTime(value);return time>0?new Date(time).toISOString():null;}
function latestIso(...values:Array<string|null|undefined>):string|null{const latest=Math.max(...values.map(dateTime));return latest>0?new Date(latest).toISOString():null;}
