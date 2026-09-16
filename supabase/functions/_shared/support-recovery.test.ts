import {assertEquals,assertRejects} from 'jsr:@std/assert';
import {supportRecoveryContext,recoveryError} from './support-recovery.ts';
function database(failedTable='') {
  const queries:Array<{table:string;fields:string;filters:Record<string,unknown>}>=[];
  const db={from(table:string){
    const q={table,fields:'',filters:{} as Record<string,unknown>};queries.push(q);
    const result=()=>({data:table==='together_support_tickets'?{id:'ticket',user_id:'owner',conversation_id:'chat',ticket_number:42,metadata:{mediaId:'media'}}:[],error:table===failedTable?{message:'private failure'}:null});
    const chain={select(fields:string){q.fields=fields;return chain},eq(key:string,value:unknown){q.filters[key]=value;return chain},order(){return chain},limit(){return chain},maybeSingle(){return Promise.resolve(result())},then(resolve:(value:unknown)=>unknown){return Promise.resolve(result()).then(resolve)}};return chain;
  }};return {db:db as never,queries};
}
Deno.test('case diagnostics scope all customer records to the ticket owner and omit content',async()=>{
  const mock=database();await supportRecoveryContext(mock.db,'ticket');
  for(const q of mock.queries.filter(q=>!['together_support_tickets','together_ops_recovery_actions'].includes(q.table)))assertEquals(q.filters.user_id,'owner');
  assertEquals(mock.queries.some(q=>/storage_path|user_prompt|canonical_text|email_address/.test(q.fields)),false);
  assertEquals(mock.queries.find(q=>q.table==='together_email_outbox')?.filters['payload->>ticketNumber'],'42');
});
Deno.test('partial diagnostic failures fail closed with a safe error',async()=>{
  await assertRejects(()=>supportRecoveryContext(database('together_credit_ledger').db,'ticket'),Error,'Some case diagnostics are unavailable');
});
Deno.test('recovery errors never return raw database details',()=>{
  assertEquals(recoveryError('SQL: RECOVERY_TARGET_MISMATCH').status,409);
  assertEquals(recoveryError('secret SQL').message.includes('secret'),false);
  assertEquals(recoveryError('secret SQL').retryable,true);
});
