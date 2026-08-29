import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { stripeCreditPackForPrice, stripePriceForCreditPack, stripePriceForTier, stripeTierForPrice, verifyStripeWebhook } from './stripe.ts';

Deno.test({name:'Stripe catalog maps only configured server-side prices',permissions:{env:true},fn:()=>{
  const names=['STRIPE_PRICE_KIVELLE_PLUS_MONTHLY','STRIPE_PRICE_CREDITS_100'] as const,previous=names.map((name)=>Deno.env.get(name));
  try{
    Deno.env.set(names[0],'price_plus_test');Deno.env.set(names[1],'price_credits_test');
    assertEquals(stripePriceForTier('kivelle_plus','monthly'),'price_plus_test');
    assertEquals(stripeTierForPrice('price_plus_test'),{tier:'kivelle_plus',billingInterval:'monthly'});
    assertEquals(stripeTierForPrice('price_client_supplied'),null);
    assertEquals(stripePriceForCreditPack('credits_100'),'price_credits_test');
    assertEquals(stripeCreditPackForPrice('price_credits_test'),'credits_100');
    assertEquals(stripeCreditPackForPrice('price_client_supplied'),null);
  }finally{names.forEach((name,index)=>previous[index]===undefined?Deno.env.delete(name):Deno.env.set(name,previous[index]!));}
}});

Deno.test({name:'Stripe webhook verifies exact raw body and rejects tampering',permissions:{env:true},fn:async()=>{
  const previous=Deno.env.get('STRIPE_WEBHOOK_SECRET'),secret='whsec_local_test',timestamp=1_800_000_000,raw='{"id":"evt_test","type":"invoice.paid","data":{"object":{}}}';
  Deno.env.set('STRIPE_WEBHOOK_SECRET',secret);
  try{
    const signature=await hmac(secret,`${timestamp}.${raw}`),header=`t=${timestamp},v1=${signature}`;
    assertEquals((await verifyStripeWebhook(raw,header,new Date(timestamp*1000))).id,'evt_test');
    await assertRejects(()=>verifyStripeWebhook(`${raw} `,header,new Date(timestamp*1000)),Error,'signature verification failed');
    await assertRejects(()=>verifyStripeWebhook(raw,'t=1,v1=invalid',new Date(timestamp*1000)),Error,'invalid or expired');
  }finally{previous===undefined?Deno.env.delete('STRIPE_WEBHOOK_SECRET'):Deno.env.set('STRIPE_WEBHOOK_SECRET',previous);}
}});

async function hmac(secret:string,value:string):Promise<string>{
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const result=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value));
  return Array.from(new Uint8Array(result)).map((byte)=>byte.toString(16).padStart(2,'0')).join('');
}
