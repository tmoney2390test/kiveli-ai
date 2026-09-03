import{describe,expect,it}from'vitest';
import{collapseRestrictedRuns,isSafelyVisible,type ContentPolicyRow}from'./content-projection.ts';

type Row=ContentPolicyRow&{id:string;content:string};
const safe=(id:string):Row=>({id,content:id,content_rating:'safe',visibility_scope:'all'}),restricted=(id:string):Row=>({id,content:`secret-${id}`,content_rating:'explicit',visibility_scope:'web_adult'});
describe('safe content projection',()=>{
  it('fails closed for unclassified content',()=>expect(isSafelyVisible({})).toBe(false));
  it('preserves safe messages and collapses each consecutive restricted run',()=>{
    const result=collapseRestrictedRuns([safe('a'),restricted('b'),restricted('c'),safe('d'),restricted('e')],(run)=>safe(`bridge:${run.length}`));
    expect(result.map((row)=>row.id)).toEqual(['a','bridge:2','d','bridge:1']);
    expect(JSON.stringify(result)).not.toContain('secret-');
  });
});
