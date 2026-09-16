import assert from 'node:assert/strict';
import { loadCharacterBlueprint } from './character-blueprint.ts';
import { CHARACTER_BLUEPRINT_TEST_USER } from '../../../packages/together-domain/src/character-blueprint.ts';
Deno.test('blueprint denies every other user before querying authored private data',async()=>{
 let touched=false;await assert.rejects(loadCharacterBlueprint({from(){touched=true;}},'another-user','life','instance'),{status:403});assert.equal(touched,false);
});
function database(found=true,custom=false){
 const seen:Array<{table:string;filters:Record<string,unknown>}>=[];
 return {seen,from(table:string){const filters:Record<string,unknown>={};seen.push({table,filters});const q:any={select(){return q;},eq(k:string,v:unknown){filters[k]=v;return q;},is(k:string,v:unknown){filters[k]=v;return q;},or(){return q;},order(){return q;},maybeSingle(){return q;},then(resolve:any){const data=table==='together_character_instances'?(found?{character_template_id:'template',character_version_id:'version'}:null):table==='together_character_templates'?(custom?null:{name:'Test companion'}):table==='together_character_versions'?{version:3,character_bible:'Authored instructions'}:[];return Promise.resolve({data,error:null}).then(resolve);}};return q;}};
}
Deno.test('blueprint rejects an unowned instance and binds lookup to account and Life',async()=>{
 const db=database(false);await assert.rejects(loadCharacterBlueprint(db,CHARACTER_BLUEPRINT_TEST_USER,'life','other-instance'),{status:404});assert.deepEqual(db.seen[0].filters,{id:'other-instance',user_id:CHARACTER_BLUEPRINT_TEST_USER,continuity_id:'life'});assert.equal(db.seen.length,1);
});
Deno.test('blueprint excludes custom characters',async()=>{const db=database(true,true);await assert.rejects(loadCharacterBlueprint(db,CHARACTER_BLUEPRINT_TEST_USER,'life','instance'),{status:404});assert.equal(db.seen[1].filters.creator_id,null);});
Deno.test('blueprint uses pinned version and never loads player memories or messages',async()=>{
 const db=database();const result=await loadCharacterBlueprint(db,CHARACTER_BLUEPRINT_TEST_USER,'life','instance');assert.equal(result.version,3);assert.equal(result.sections.length,9);assert.deepEqual(db.seen.find(q=>q.table==='together_character_versions')?.filters,{id:'version',character_template_id:'template'});assert.ok(db.seen.every(q=>!['together_memories','together_messages','auth.users'].includes(q.table)));
});
