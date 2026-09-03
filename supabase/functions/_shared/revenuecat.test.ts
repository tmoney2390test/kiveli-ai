import{assertEquals,assertRejects}from'jsr:@std/assert@1';
import{normalizeRevenueCatSubscriber,parseRevenueCatWebhook,readRevenueCatAdapterConfig,revenueCatEventUserIds,validateRevenueCatEvent,verifyRevenueCatWebhook,type RevenueCatAdapterConfig,type RevenueCatSubscriber}from'./revenuecat.ts';

const config:RevenueCatAdapterConfig={enabled:true,acceptSandbox:false,allowedAppIds:['app_ios','app_android'],entitlements:{kivelle_plus:'plus',kivelle_max:'max'},products:{plus_monthly:{tier:'kivelle_plus',billingInterval:'monthly'},max_annual:{tier:'kivelle_max',billingInterval:'annual'}}};

Deno.test('RevenueCat configuration and identities are server-authoritative',()=>{
  assertEquals(readRevenueCatAdapterConfig(()=>JSON.stringify(config)),config);
  const event=parseRevenueCatWebhook(JSON.stringify({api_version:'1.0',event:{id:'evt_rc',type:'RENEWAL',event_timestamp_ms:1_800_000_000_000,app_id:'app_ios',app_user_id:'$RCAnonymous',original_app_user_id:'4ca0a3a7-c751-4480-8cb9-d1d8e689b6ca',aliases:['not-a-user'],environment:'PRODUCTION'}}));
  assertEquals(revenueCatEventUserIds(event),['4ca0a3a7-c751-4480-8cb9-d1d8e689b6ca']);
  assertEquals(validateRevenueCatEvent(event,config),'process');
  assertEquals(validateRevenueCatEvent({...event,type:'TEST'},config),'ignore');
  assertEquals(validateRevenueCatEvent({...event,environment:'SANDBOX'},config),'ignore');
});

Deno.test('RevenueCat webhook requires both the configured header and raw-body HMAC',async()=>{
  const timestamp=1_800_000_000,secret='revenuecat-signing-test',authorization='Bearer webhook-test',raw='{"api_version":"1.0","event":{"id":"evt","type":"TEST","event_timestamp_ms":1800000000000}}',signature=await hmac(secret,`${timestamp}.${raw}`);
  await verifyRevenueCatWebhook({rawBody:raw,authorization,signature:`t=${timestamp},v1=${signature}`,expectedAuthorization:authorization,signingSecret:secret,now:new Date(timestamp*1000)});
  await assertRejects(()=>verifyRevenueCatWebhook({rawBody:`${raw} `,authorization,signature:`t=${timestamp},v1=${signature}`,expectedAuthorization:authorization,signingSecret:secret,now:new Date(timestamp*1000)}),Error,'signature is invalid');
  await assertRejects(()=>verifyRevenueCatWebhook({rawBody:raw,authorization:'Bearer wrong',signature:`t=${timestamp},v1=${signature}`,expectedAuthorization:authorization,signingSecret:secret,now:new Date(timestamp*1000)}),Error,'authorization failed');
});

Deno.test('RevenueCat snapshots select the highest mapped active entitlement and fail closed on unknown products',()=>{
  const now=new Date('2026-09-01T12:00:00Z'),snapshot=subscriber({
    plus:{expires_date:'2026-10-01T00:00:00Z',product_identifier:'plus_monthly',purchase_date:'2026-09-01T00:00:00Z'},
    max:{expires_date:'2027-09-01T00:00:00Z',product_identifier:'max_annual',purchase_date:'2026-09-01T00:00:00Z'},
  },{
    plus_monthly:{expires_date:'2026-10-01T00:00:00Z',purchase_date:'2026-09-01T00:00:00Z',period_type:'NORMAL',store:'app_store',is_sandbox:false},
    max_annual:{expires_date:'2027-09-01T00:00:00Z',purchase_date:'2026-09-01T00:00:00Z',period_type:'NORMAL',store:'app_store',is_sandbox:false},
  });
  assertEquals(normalizeRevenueCatSubscriber(snapshot,config,now),{tier:'kivelle_max',productId:'max_annual',billingInterval:'annual',status:'active',periodStart:'2026-09-01T00:00:00.000Z',periodEnd:'2027-09-01T00:00:00.000Z',trialEnd:null,cancelAtPeriodEnd:false,canceledAt:null,accessEndsAt:'2027-09-01T00:00:00.000Z',store:'app_store',sandbox:false});
  const unknown=subscriber({max:{expires_date:'2027-09-01T00:00:00Z',product_identifier:'unmapped'}},{unmapped:{expires_date:'2027-09-01T00:00:00Z'}});
  assertEquals(normalizeRevenueCatSubscriber(unknown,config,now),null);
});

Deno.test('RevenueCat billing grace stays bounded and cancellation keeps paid access only through expiration',()=>{
  const billing=subscriber({plus:{expires_date:'2026-09-01T00:00:00Z',grace_period_expires_date:'2026-09-05T00:00:00Z',product_identifier:'plus_monthly'}},{plus_monthly:{expires_date:'2026-09-01T00:00:00Z',grace_period_expires_date:'2026-09-05T00:00:00Z',purchase_date:'2026-08-01T00:00:00Z',billing_issues_detected_at:'2026-09-01T00:00:00Z',unsubscribe_detected_at:'2026-09-01T00:00:00Z',period_type:'NORMAL',store:'play_store'}});
  const normalized=normalizeRevenueCatSubscriber(billing,config,new Date('2026-09-02T00:00:00Z'));
  assertEquals(normalized?.status,'past_due');
  assertEquals(normalized?.cancelAtPeriodEnd,true);
  assertEquals(normalized?.accessEndsAt,'2026-09-05T00:00:00.000Z');
  assertEquals(normalizeRevenueCatSubscriber(billing,config,new Date('2026-09-06T00:00:00Z')),null);
});

function subscriber(entitlements:Record<string,Record<string,unknown>>,subscriptions:Record<string,Record<string,unknown>>):RevenueCatSubscriber{return{request_date:'2026-09-01T00:00:00Z',subscriber:{entitlements,subscriptions}} as RevenueCatSubscriber;}
async function hmac(secret:string,value:string):Promise<string>{const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']),result=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value));return[...new Uint8Array(result)].map((byte)=>byte.toString(16).padStart(2,'0')).join('');}
