import {describe,expect,it} from 'vitest';
import {customEngagementRange,engagementRange,engagementSurface,percentage,periodChange,csvCell} from './engagement';
describe('owner engagement reporting',()=>{
 it('uses UTC calendar presets across month boundaries',()=>{expect(engagementRange(7,new Date('2026-03-02T04:30:00Z'))).toEqual({from:'2026-02-24T00:00:00.000Z',to:'2026-03-02T04:30:00.000Z'});});
 it('includes the custom end date, clips today, and rejects impossible dates and oversized ranges',()=>{
  const now=new Date('2026-09-10T13:00:00Z');expect(customEngagementRange('2026-09-01','2026-09-02',now).to).toBe('2026-09-03T00:00:00.000Z');expect(customEngagementRange('2026-09-10','2026-09-10',now).to).toBe(now.toISOString());
  for(const [from,to] of [['2026-02-30','2026-03-02'],['2026-01-01','2026-09-10'],['2026-09-11','2026-09-12'],['2026-09-03','2026-09-02']])expect(()=>customEngagementRange(from!,to!,now)).toThrow();
 });
 it('does not report infinite growth or rates with no denominator',()=>{expect(periodChange(5,0)).toBe('New activity');expect(periodChange(0,0)).toBe('No change');expect(periodChange(5,10)).toBe('-50.0% vs previous period');expect(percentage(0,0)).toBe('—');expect(percentage(1,3)).toBe('33.3%');});
 it('escapes spreadsheet formulas, quotes, and multiline fields',()=>{expect(csvCell(' =SUM(A1)')).toBe('"\' =SUM(A1)"');expect(csvCell('hello "world"\nnext')).toBe('"hello ""world""\nnext"');});
 it('never records route identifiers, auth or admin surfaces',()=>{expect(engagementSurface('/chat?conversationId=secret')).toBe('chat');expect(engagementSurface('/create/companion/private-id')).toBe('creator');expect(engagementSurface('/ops')).toBeNull();expect(engagementSurface('/auth/callback?token=secret')).toBeNull();expect(engagementSurface('/location/private-place')).toBe('world');});
});
