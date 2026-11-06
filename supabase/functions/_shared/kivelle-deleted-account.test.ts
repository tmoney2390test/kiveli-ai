import {assertEquals} from 'jsr:@std/assert@1';
import type {SupabaseClient} from '@supabase/supabase-js';
import {accountDeletionStarted,billingPredatesRecreation,deletedAccountForProviderCustomer} from './kivelle-deleted-account.ts';
function dbWith(rows:Record<string,Record<string,unknown>[]>) {
  return {from:(table:string)=>{let filtered=rows[table]??[];const query={select:()=>query,eq:(key:string,value:unknown)=>{filtered=filtered.filter(row=>row[key]===value);return query;},order:()=>query,limit:()=>query,maybeSingle:async()=>({data:filtered[0]??null,error:null})};return query;}} as unknown as SupabaseClient;
}
Deno.test('new account enrollment preserves old provider-customer tombstones',async()=>{
  const db=dbWith({kivelle_account_recreations:[{user_id:'fresh-user',billing_provider:'stripe',provider_customer_id:'cus_old'}]});
  assertEquals(await accountDeletionStarted(db,'fresh-user'),false);
  assertEquals(await deletedAccountForProviderCustomer(db,'stripe','cus_old'),'fresh-user');
  assertEquals(await deletedAccountForProviderCustomer(db,'stripe','cus_new'),null);
});
Deno.test('delayed billing and consumable events cannot replay into a fresh account',async()=>{
  const recreatedAt='2026-11-04T22:00:00Z',db=dbWith({kivelle_account_recreations:[{user_id:'fresh-user',recreated_at:recreatedAt}]});
  assertEquals(await billingPredatesRecreation(db,'fresh-user','2026-11-04T21:59:59Z'),true);
  assertEquals(await billingPredatesRecreation(db,'fresh-user',null),true);
  assertEquals(await billingPredatesRecreation(db,'fresh-user','invalid'),true);
  assertEquals(await billingPredatesRecreation(db,'fresh-user',Date.parse(recreatedAt)+1000),false);
  assertEquals(await billingPredatesRecreation(db,'first-account',null),false);
});
