import {assertEquals, assertRejects} from 'jsr:@std/assert@1';
import type {SupabaseClient} from '@supabase/supabase-js';
import {saveProfileHighlights} from './kivelle-profile-showcase.ts';
import {profileHighlights} from '../../../packages/together-domain/src/profile-showcase.ts';

const id = (n:number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function database({foreignLife=false, conflict=false, badMedia=false}={}) {
  const life = {id:id(1), user_id:'owner', metadata:{contextVersion:1, keepMe:'unchanged'}};
  const rows:Record<string,Array<Record<string,unknown>>> = {
    together_continuities:[life],
    together_character_instances:[{id:id(2),user_id:'owner',continuity_id:foreignLife?id(9):id(1)}, {id:id(3),user_id:'other',continuity_id:id(1)}],
    together_generated_media:[{id:id(4),user_id:'owner',continuity_id:id(1),media_type:'image',status:'ready',metadata:{hiddenIntermediate:badMedia}}, {id:id(5),user_id:'owner',continuity_id:id(1),media_type:'video',status:'failed',metadata:{}}],
  };
  const updates:Array<Record<string,unknown>>=[];
  const db={from(table:string) {
    let filtered=rows[table] ?? [], changes:Record<string,unknown>|null=null;
    const result=()=>{if(changes){updates.push(changes);if(conflict)return{data:null,error:null};}return{data:filtered,error:null};};
    const query={select(){return query;},eq(key:string,value:unknown){filtered=filtered.filter(row=>key==='metadata'?JSON.stringify(row[key])===value:row[key]===value);return query;},in(key:string,values:unknown[]){filtered=filtered.filter(row=>values.includes(row[key]));return query;},update(value:Record<string,unknown>){changes=value;return query;},maybeSingle(){const r=result();return Promise.resolve({...r,data:r.data?.[0]??null});},then(resolve:(value:unknown)=>void){return Promise.resolve(result()).then(resolve);}};
    return query;
  }} as unknown as SupabaseClient;
  return {db,updates};
}
Deno.test('highlights retain order, cap at 12, deduplicate and strip unrelated fields',()=>{
  const items=[{kind:'image',id:id(4),secret:'ignored'},{kind:'image',id:id(4)},null,{kind:'bad',id:id(7)},...Array.from({length:14},(_,i)=>({kind:'companion',id:id(i+10)}))];
  const clean=profileHighlights(items);assertEquals(clean.length,12);assertEquals(clean[0],{kind:'image',id:id(4)});assertEquals(profileHighlights({}),[]);
});
Deno.test('saving owned highlights preserves unrelated Life metadata',async()=>{
  const{db,updates}=database();const pins=[{kind:'companion' as const,id:id(2)},{kind:'image' as const,id:id(4)}];
  assertEquals(await saveProfileHighlights(db,'owner',id(1),pins),pins);
  assertEquals(updates[0]?.metadata,{contextVersion:1,keepMe:'unchanged',profileHighlights:pins});
});
Deno.test('another account cannot edit a Life',async()=>{const{db,updates}=database();await assertRejects(()=>saveProfileHighlights(db,'other',id(1),[]),Error,'unavailable');assertEquals(updates.length,0);});
Deno.test('another account or Life cannot supply a highlight',async()=>{
  for(const [foreignLife,target] of [[true,2],[false,3]] as const){const{db,updates}=database({foreignLife});await assertRejects(()=>saveProfileHighlights(db,'owner',id(1),[{kind:'companion',id:id(target)}]),Error,'Choose available');assertEquals(updates.length,0);}
});
Deno.test('hidden, failed and wrong-kind media cannot be pinned',async()=>{
  for(const [badMedia,kind,target] of [[true,'image',4],[false,'video',5],[false,'video',4]] as const){const{db,updates}=database({badMedia});await assertRejects(()=>saveProfileHighlights(db,'owner',id(1),[{kind,id:id(target)}]),Error,'Choose available');assertEquals(updates.length,0);}
});
Deno.test('concurrent metadata changes return a retryable conflict',async()=>{const{db}=database({conflict:true});await assertRejects(()=>saveProfileHighlights(db,'owner',id(1),[]),Error,'another session');});
