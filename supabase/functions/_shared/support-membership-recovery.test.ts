import {assertEquals,assertRejects} from 'jsr:@std/assert';
import {recoverSupportMembership} from './support-membership-recovery.ts';
const input={ticketId:'case',targetId:'case',requestId:'request',reason:'Confirmed store issue'};
Deno.test('membership recovery requires admin before touching customer records',async()=>{
  const db={from(){throw new Error('Unexpected database access')}} as never;
  await assertRejects(()=>recoverSupportMembership(db,'actor','support',input),Error,'administrator');
  await assertRejects(()=>recoverSupportMembership(db,'actor','admin',{...input,targetId:'other'}),Error,'selected support case');
});
Deno.test('completed membership retries return the saved result without verifying or granting again',async()=>{
  let providerOrUpdate=false;
  const outcome={status:'verified',message:'Already reconciled'};
  const db={from(table:string){
    const chain={select(){return chain},eq(){return chain},upsert(){return Promise.resolve({error:null})},update(){providerOrUpdate=true;throw Error('Unexpected mutation')},maybeSingle(){return Promise.resolve({error:null,data:table==='together_support_tickets'?{id:'case',user_id:'owner',category:'billing'}:table==='together_account_deletion_markers'?null:{ticket_id:'case',action:'reconcile_membership',target_id:'case',reason:input.reason,outcome}})}};return chain;
  }} as never;
  assertEquals(await recoverSupportMembership(db,'actor','admin',input),outcome);
  assertEquals(providerOrUpdate,false);
  await assertRejects(()=>recoverSupportMembership(db,'actor','admin',{...input,reason:'Changed reason'}),Error,'different details');
});
