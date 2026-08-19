import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';
import {resolveCreditPack,type CreditPackKey} from '../../../packages/together-domain/src/media-economics.ts';

export type StripeBillingConfiguration={
  secretKey:boolean;
  webhook:boolean;
  kivelle_plus:boolean;
  kivelle_max:boolean;
  credits:boolean;
  portal:boolean;
};
export type StripeEvent={id:string;type:string;created?:number;data:{object:Record<string,any>}};

const STRIPE_API='https://api.stripe.com/v1';

function optionalEnv(name:string):string|undefined{return Deno.env.get(name)?.trim()||undefined;}
function positiveInteger(value:unknown):number|null{const number=Number(value);return Number.isInteger(number)&&number>0?number:null;}

export function stripeBillingConfiguration():StripeBillingConfiguration{
  const secretKey=Boolean(optionalEnv('STRIPE_SECRET_KEY'));
  return{
    secretKey,
    webhook:Boolean(optionalEnv('STRIPE_WEBHOOK_SECRET')),
    kivelle_plus:secretKey&&Boolean(optionalEnv('STRIPE_PRICE_KIVELLE_PLUS_MONTHLY')),
    kivelle_max:secretKey&&Boolean(optionalEnv('STRIPE_PRICE_KIVELLE_MAX_MONTHLY')),
    credits:secretKey&&(['credits_100','credits_300','credits_800','credits_2000'] as const).some((key)=>Boolean(stripePriceForCreditPack(key))),
    portal:secretKey,
  };
}

export function stripePriceForTier(tier:'kivelle_plus'|'kivelle_max'):string|null{
  return optionalEnv(tier==='kivelle_plus'?'STRIPE_PRICE_KIVELLE_PLUS_MONTHLY':'STRIPE_PRICE_KIVELLE_MAX_MONTHLY')??null;
}

export function stripeCreditAmount():number|null{return positiveInteger(optionalEnv('STRIPE_CREDITS_AMOUNT'));}
export function stripePriceForCreditPack(key:CreditPackKey):string|null{
  const configured=optionalEnv(`STRIPE_PRICE_${key.toUpperCase()}`);if(configured)return configured;
  const legacyAmount=stripeCreditAmount(),pack=resolveCreditPack(key);return pack&&legacyAmount===pack.credits?optionalEnv('STRIPE_PRICE_KIVELLE_CREDITS')??null:null;
}

function publicAppUrl():string{
  const raw=optionalEnv('KIVELLE_PUBLIC_APP_URL')??optionalEnv('KIVELLE_APP_URL');
  if(!raw)throw new AppError('BILLING_NOT_CONFIGURED','Set KIVELLE_PUBLIC_APP_URL before enabling Stripe Checkout.',503);
  try{
    const url=new URL(raw);
    const local=url.hostname==='localhost'||url.hostname==='127.0.0.1';
    if(url.protocol!=='https:'&&!local)throw new Error('HTTPS required');
    return url.toString().replace(/\/$/,'');
  }catch{throw new AppError('BILLING_NOT_CONFIGURED','Kivelle billing return URLs are not configured safely.',503);}
}

function returnUrl(kind:'success'|'cancel'|'portal'):string{
  const override=optionalEnv(kind==='success'?'KIVELLE_CHECKOUT_SUCCESS_URL':kind==='cancel'?'KIVELLE_CHECKOUT_CANCEL_URL':'KIVELLE_BILLING_RETURN_URL');
  const candidate=override??`${publicAppUrl()}/subscription${kind==='success'?'?checkout=success':kind==='cancel'?'?checkout=cancelled':''}`;
  try{const url=new URL(candidate);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('HTTPS required');return url.toString();}
  catch{throw new AppError('BILLING_NOT_CONFIGURED','Kivelle billing return URLs are not configured safely.',503);}
}

async function stripeRequest<T extends Record<string,any>>(path:string,parameters:Record<string,string>,idempotencyKey?:string):Promise<T>{
  const secret=optionalEnv('STRIPE_SECRET_KEY');
  if(!secret)throw new AppError('BILLING_NOT_CONFIGURED','Stripe is not configured for this environment.',503);
  const body=new URLSearchParams();for(const[key,value]of Object.entries(parameters))body.set(key,value);
  const response=await fetch(`${STRIPE_API}${path}`,{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/x-www-form-urlencoded',...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},body});
  const payload=await response.json().catch(()=>({})) as Record<string,any>;
  if(!response.ok){console.error(JSON.stringify({level:'error',operation:'stripe_request',path,status:response.status,requestId:response.headers.get('request-id'),type:payload.error?.type??null,code:payload.error?.code??null}));throw new AppError(response.status===429?'RATE_LIMITED':'PROVIDER_UNAVAILABLE',response.status===429?'Billing is busy. Try again in a moment.':'Stripe could not prepare billing. No charge was created.',response.status===429?429:502,true);}
  return payload as T;
}

export async function ensureStripeCustomer(db:SupabaseClient,input:{userId:string;email?:string|null}):Promise<string>{
  const{data:existing,error}=await db.from('together_billing_customers').select('customer_id').eq('user_id',input.userId).eq('provider','stripe').maybeSingle();
  if(error)throw new AppError('INTERNAL_ERROR','Billing identity could not be loaded.',500,true);
  if(existing?.customer_id)return String(existing.customer_id);
  const customer=await stripeRequest<{id:string}>('/customers',{...(input.email?{email:input.email}:{}),'metadata[user_id]':input.userId,description:'Kivelle account'},`customer:${input.userId}`);
  const now=new Date().toISOString();
  const upsert=await db.from('together_billing_customers').upsert({user_id:input.userId,provider:'stripe',customer_id:customer.id,email:input.email??null,metadata:{createdBy:'kivelle'},updated_at:now},{onConflict:'user_id,provider'}).select('customer_id').single();
  if(upsert.error||!upsert.data)throw new AppError('INTERNAL_ERROR','Billing identity could not be saved.',500,true);
  await db.from('together_entitlements').upsert({user_id:input.userId,billing_provider:'stripe',billing_customer_id:upsert.data.customer_id,updated_at:now},{onConflict:'user_id'});
  return String(upsert.data.customer_id);
}

export async function createStripeCheckoutSession(db:SupabaseClient,input:{userId:string;email?:string|null;tier?:'kivelle_plus'|'kivelle_max';credits?:boolean;creditPackKey?:CreditPackKey;requestId:string}):Promise<{id:string;url:string}>{
  const credits=input.credits===true;
  const pack=credits?resolveCreditPack(input.creditPackKey):null;
  const price=credits&&pack?stripePriceForCreditPack(pack.key):input.tier?stripePriceForTier(input.tier):null;
  const creditAmount=pack?.credits??null;
  if(!price||credits&&!creditAmount||!credits&&!input.tier)throw new AppError('BILLING_NOT_CONFIGURED','That Stripe product has not been configured yet.',503);
  const customer=await ensureStripeCustomer(db,input);
  const kind=credits?'credits':'subscription',metadata:Record<string,string>={user_id:input.userId,kind};
  if(input.tier)metadata.tier=input.tier;if(creditAmount)metadata.credit_amount=String(creditAmount);if(pack)metadata.product_key=pack.key;
  const parameters:Record<string,string>={mode:credits?'payment':'subscription',customer,'line_items[0][price]':price,'line_items[0][quantity]':'1',success_url:returnUrl('success'),cancel_url:returnUrl('cancel'),client_reference_id:input.userId,'billing_address_collection':'auto','metadata[user_id]':input.userId,'metadata[kind]':kind};
  if(input.tier){parameters['metadata[tier]']=input.tier;parameters['subscription_data[metadata][user_id]']=input.userId;parameters['subscription_data[metadata][tier]']=input.tier;parameters['subscription_data[metadata][kind]']='subscription';parameters.allow_promotion_codes='true';}
  if(creditAmount)parameters['metadata[credit_amount]']=String(creditAmount);if(pack)parameters['metadata[product_key]']=pack.key;
  const session=await stripeRequest<{id:string;url?:string|null}>('/checkout/sessions',parameters,`checkout:${input.userId}:${kind}:${input.tier??pack?.key}:${input.requestId}`);
  if(!session.url)throw new AppError('PROVIDER_UNAVAILABLE','Stripe created a session without a checkout URL.',502,true);
  return{id:session.id,url:session.url};
}

export async function createStripePortalSession(db:SupabaseClient,input:{userId:string;email?:string|null;requestId:string}):Promise<{id:string;url:string}>{
  const customer=await ensureStripeCustomer(db,input);
  const session=await stripeRequest<{id:string;url?:string|null}>('/billing_portal/sessions',{customer,return_url:returnUrl('portal')},`portal:${input.userId}:${input.requestId}`);
  if(!session.url)throw new AppError('PROVIDER_UNAVAILABLE','Stripe created a portal session without a URL.',502,true);
  return{id:session.id,url:session.url};
}

export async function verifyStripeWebhook(rawBody:string,signatureHeader:string|null,now=new Date()):Promise<StripeEvent>{
  const secret=optionalEnv('STRIPE_WEBHOOK_SECRET');
  if(!secret)throw new AppError('BILLING_NOT_CONFIGURED','Stripe webhook verification is not configured.',503);
  if(!signatureHeader)throw new AppError('FORBIDDEN','Stripe webhook signature is missing.',403);
  const values=new Map<string,string[]>();for(const part of signatureHeader.split(',')){const index=part.indexOf('=');if(index<1)continue;const key=part.slice(0,index).trim(),value=part.slice(index+1).trim();values.set(key,[...(values.get(key)??[]),value]);}
  const timestamp=Number(values.get('t')?.[0]),signatures=values.get('v1')??[];
  if(!Number.isFinite(timestamp)||Math.abs(Math.floor(now.getTime()/1000)-timestamp)>300||!signatures.length)throw new AppError('FORBIDDEN','Stripe webhook signature is invalid or expired.',403);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const expected=Array.from(new Uint8Array(digest)).map((byte)=>byte.toString(16).padStart(2,'0')).join('');
  if(!signatures.some((signature)=>constantTimeEqual(expected,signature)))throw new AppError('FORBIDDEN','Stripe webhook signature verification failed.',403);
  let event:unknown;try{event=JSON.parse(rawBody);}catch{throw new AppError('VALIDATION_FAILED','Stripe webhook payload is invalid.',400);}
  if(!event||typeof event!=='object'||typeof(event as Record<string,unknown>).id!=='string'||typeof(event as Record<string,unknown>).type!=='string')throw new AppError('VALIDATION_FAILED','Stripe webhook event is incomplete.',400);
  return event as StripeEvent;
}

export function stripeObjectCustomerId(object:Record<string,any>):string|null{return typeof object.customer==='string'?object.customer:typeof object.id==='string'&&object.object==='customer'?object.id:null;}
export function stripeObjectSubscriptionId(object:Record<string,any>):string|null{return typeof object.subscription==='string'?object.subscription:object.object==='subscription'&&typeof object.id==='string'?object.id:null;}
export function stripePeriod(object:Record<string,any>):{start:string|null;end:string|null}{
  const item=object.items?.data?.[0]??{};const start=Number(object.current_period_start??item.current_period_start),end=Number(object.current_period_end??item.current_period_end);
  return{start:Number.isFinite(start)&&start>0?new Date(start*1000).toISOString():null,end:Number.isFinite(end)&&end>0?new Date(end*1000).toISOString():null};
}
export function stripeSubscriptionHasAccess(status:unknown):boolean{return['active','trialing','past_due'].includes(String(status));}

function constantTimeEqual(a:string,b:string):boolean{if(a.length!==b.length)return false;let mismatch=0;for(let index=0;index<a.length;index++)mismatch|=a.charCodeAt(index)^b.charCodeAt(index);return mismatch===0;}
