import{describe,expect,it}from'vitest';
import{classifyMissExplanation,deriveCommitmentTemporalState,manualCommitmentEndEligibility,missedCommitmentImpact,missedCommitmentRepairImpact,resolveElapsedCommitmentEnd}from'./commitments';

describe('commitments',()=>{
  const now=new Date('2026-08-15T20:00:00Z');
  it('derives imminent, grace and active from attendance',()=>{
    expect(deriveCommitmentTemporalState({status:'scheduled',startsAt:'2026-08-15T21:00:00Z',endsAt:'2026-08-15T23:00:00Z',timezone:'UTC'},now)).toBe('imminent');
    expect(deriveCommitmentTemporalState({status:'active',startsAt:'2026-08-15T19:50:00Z',endsAt:'2026-08-15T22:00:00Z',graceEndsAt:'2026-08-15T20:20:00Z',participationMode:'live'},now)).toBe('grace');
    expect(deriveCommitmentTemporalState({status:'active',startsAt:'2026-08-15T19:50:00Z',endsAt:'2026-08-15T22:00:00Z',graceEndsAt:'2026-08-15T20:20:00Z',participationMode:'live',userJoinedAt:'2026-08-15T19:55:00Z'},now)).toBe('active');
  });
  it('does not punish technical or companion-caused misses',()=>{
    expect(missedCommitmentImpact({reason:'system_failure',significance:.9,relationshipStage:'exclusive',priorMisses:2})).toEqual({trust:0,respect:0,conflict:0,affinity:0});
    expect(missedCommitmentImpact({reason:'character_absent',significance:.9,relationshipStage:'exclusive',priorMisses:2})).toEqual({trust:0,respect:0,conflict:0,affinity:0});
  });
  it('scales repeated unexplained no-shows and supports repair',()=>{
    const impact=missedCommitmentImpact({reason:'user_absent',significance:.9,relationshipStage:'dating',priorMisses:2});
    expect(impact.trust).toBeLessThanOrEqual(-4);expect(impact.conflict).toBeGreaterThanOrEqual(4);
    const signals=classifyMissExplanation("I'm really sorry. My daughter got sick. Can we reschedule?");
    expect(signals).toMatchObject({apology:true,credibleReason:true,attemptedRepair:true,dismissive:false});
    const repair=missedCommitmentRepairImpact({impact,...signals});
    expect(repair.trust).toBeGreaterThan(0);expect(repair.conflict).toBeLessThan(0);
  });
  it('only allows an attended live scene to be ended manually',()=>{
    const base={status:'active',source:'chat',startsAt:'2026-08-15T19:00:00Z',endsAt:'2026-08-15T21:00:00Z',userPresent:true,companionPresent:true,activeScene:true};
    expect(manualCommitmentEndEligibility(base,now)).toEqual({allowed:true,blocker:null});
    expect(manualCommitmentEndEligibility({...base,userPresent:false},now).blocker).toBe('user_not_present');
    expect(manualCommitmentEndEligibility({...base,activeScene:false},now).blocker).toBe('scene_not_active');
    expect(manualCommitmentEndEligibility({...base,source:'date'},now).blocker).toBe('date_owned');
  });
  it('uses the scheduled boundary when elapsed completion is reconciled later',()=>{
    expect(resolveElapsedCommitmentEnd({status:'active',source:'chat',endsAt:'2026-08-15T19:30:00Z'},now)).toEqual({shouldFinalize:true,completedAt:'2026-08-15T19:30:00.000Z',reason:'elapsed'});
    expect(resolveElapsedCommitmentEnd({status:'active',source:'date',endsAt:'2026-08-15T19:30:00Z'},now).shouldFinalize).toBe(false);
    expect(resolveElapsedCommitmentEnd({status:'completed',source:'chat',endsAt:'2026-08-15T19:30:00Z'},now).shouldFinalize).toBe(false);
  });
});
