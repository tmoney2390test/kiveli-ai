import{describe,expect,it}from'vitest';
import{adultPipelineAuthorized,isAtLeast18,type AdultAccessProperties}from'./adult-access.ts';

const eligible:AdultAccessProperties={premium_access:true,adult_eligible:true,adult_mode_enabled:true,client_surface:'web'};
describe('website adult access matrix',()=>{
  it('authorizes only a paid, eligible, server-issued website session',()=>expect(adultPipelineAuthorized({...eligible,global_enabled:true})).toBe(true));
  it.each([
    ['native surface',{...eligible,client_surface:'native_or_unknown' as const}],
    ['expired subscription',{...eligible,premium_access:false}],
    ['ineligible account',{...eligible,adult_eligible:false}],
    ['missing website session',{...eligible,adult_mode_enabled:false}],
  ])('fails closed for %s',(_label,properties)=>expect(adultPipelineAuthorized({...properties,global_enabled:true})).toBe(false));
  it('honors the global kill switch',()=>expect(adultPipelineAuthorized({...eligible,global_enabled:false})).toBe(false));
  it('handles the exact eighteenth birthday and rejects invalid or underage dates',()=>{const now=new Date('2026-09-01T12:00:00Z');expect(isAtLeast18('2008-09-01',now)).toBe(true);expect(isAtLeast18('2008-09-02',now)).toBe(false);expect(isAtLeast18('2008-02-31',now)).toBe(false);});
});
