import {assertEquals,assertThrows} from 'jsr:@std/assert';
import {storeCreditEvent} from './revenuecat-credits.ts';
import {parseRevenueCatWebhook,readRevenueCatAdapterConfig,validateRevenueCatEvent} from './revenuecat.ts';
const config=readRevenueCatAdapterConfig(()=>JSON.stringify({enabled:true,allowedAppIds:['apple'],entitlements:{kivelle_plus:'plus',kivelle_max:'max'},products:{}}));
const event=(overrides:Record<string,unknown>={})=>parseRevenueCatWebhook(JSON.stringify({api_version:'1.0',event:{id:'event',type:'NON_RENEWING_PURCHASE',event_timestamp_ms:1,app_id:'apple',store:'APP_STORE',environment:'PRODUCTION',product_id:'app.kivelli.credits.100',transaction_id:'tx',...overrides}}));
Deno.test('consumables use the allowlisted pack amount, never a provider or client credit amount',()=>{
  assertEquals(storeCreditEvent(event({credits:999999}),config),{credits:100,refund:false,transactionId:'tx'});
  assertEquals(storeCreditEvent(event({product_id:'unknown'}),config),null);
  assertEquals(storeCreditEvent(event({type:'CANCELLATION'}),config)?.refund,true);
  assertThrows(()=>storeCreditEvent(event({transaction_id:null}),config));
  assertThrows(()=>storeCreditEvent(event({store:'STRIPE'}),config));
});
Deno.test('consumables require authorized apps and sandbox eligibility',()=>{
  assertEquals(validateRevenueCatEvent(event(),config),'process');
  assertEquals(validateRevenueCatEvent(event({environment:'SANDBOX'}),config),'ignore');
  assertThrows(()=>validateRevenueCatEvent(event({app_id:'wrong'}),config));
});
