import {describe,expect,it} from 'vitest';
import {buildPlanSlots,recommendPlanOptions} from './plans';

describe('shared plan suggestions',()=>{
  it('uses current character context instead of returning a fixed order',()=>{
    const options=recommendPlanOptions({activity:'Editing photos at the studio',mood:'Creative',locationId:null,interests:['Photography'],relationshipStage:'friend',hour:14});
    expect(options[0]?.id).toBe('photo_walk');
    expect(options).toHaveLength(4);
  });

  it('only offers future save slots',()=>{
    const now=new Date('2026-08-14T20:30:00-04:00');
    const slots=buildPlanSlots(now);
    expect(slots.length).toBeGreaterThanOrEqual(2);
    expect(slots.every((slot)=>new Date(slot.value)>now)).toBe(true);
  });
});
