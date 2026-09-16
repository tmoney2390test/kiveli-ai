import {describe,expect,it} from 'vitest';
import {filterSupportQueue,parseSupportDraft,supportStatusLabel} from './supportRecovery';
describe('support recovery',()=>{
  const rows=[
    {id:'a',ticket_number:12,subject:'Purchase missing',user_id:'owner',status:'open',category:'billing',assigned_to:'staff',updated_at:'2026-09-15'},
    {id:'b',ticket_number:13,subject:'Photo ready',user_id:'other',status:'resolved',category:'bug',assigned_to:null,updated_at:'2026-09-14'},
    {id:'c',ticket_number:14,subject:'Photo stuck',user_id:'owner',status:'waiting',category:'bug',assigned_to:'staff',updated_at:'2026-09-16'},
  ];
  it('combines category, ownership, status and search without mutating source',()=>{
    expect(filterSupportQueue(rows,' PURCHASE ','active','billing',true,'staff',true).map(r=>r.id)).toEqual(['a']);
    expect(filterSupportQueue(rows,'','active','all',false,null,false).map(r=>r.id)).toEqual(['c','a']);
    expect(rows.map(r=>r.id)).toEqual(['a','b','c']);
  });
  it('does not show unassigned cases as mine when no actor is available',()=>expect(filterSupportQueue(rows,'','all','all',true,null,true)).toEqual([]));
  it('finds numeric references and closed cases when explicitly requested',()=>expect(filterSupportQueue(rows,'13','all','all',false,null,true).map(r=>r.id)).toEqual(['b']));
  it('does not restore corrupt or unexpected draft fields',()=>{
    const initial={message:'',includeDiagnostics:true};
    expect(parseSupportDraft('{"message":{"secret":1},"includeDiagnostics":false,"userId":"other"}',initial)).toEqual({message:'',includeDiagnostics:false});
    expect(parseSupportDraft('broken',initial)).toEqual(initial);
    expect(parseSupportDraft('[]',initial)).toEqual(initial);
    expect(parseSupportDraft('{"message":"Keep my draft"}',initial)).toEqual({message:'Keep my draft',includeDiagnostics:true});
  });
  it('explains which side needs to respond',()=>{
    expect(supportStatusLabel('open')).toBe('Awaiting support');
    expect(supportStatusLabel('waiting')).toBe('Awaiting your reply');
  });
});
