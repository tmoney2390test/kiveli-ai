import{describe,expect,it}from'vitest';
import{classifyMissExplanation,deriveCommitmentTemporalState,manualCommitmentEndEligibility,missedCommitmentImpact,missedCommitmentRepairImpact,planStartSatisfiesLeadTime,resolveElapsedCommitmentEnd,resolveQuickPlanTiming,selectGroupPlanReminder,shouldSendPlanWaitingCheckIn}from'./commitments';

describe('commitments',()=>{
  const now=new Date('2026-08-15T20:00:00Z');
  it('resolves quick plan choices from authoritative request time',()=>{
    expect(resolveQuickPlanTiming('now',undefined,now)).toBe('2026-08-15T20:00:00.000Z');
    expect(resolveQuickPlanTiming('in_one_hour',undefined,now)).toBe('2026-08-15T21:00:00.000Z');
    expect(resolveQuickPlanTiming('custom','2026-08-16T18:30:00.000Z',now)).toBe('2026-08-16T18:30:00.000Z');
  });
  it('allows an immediate plan without weakening scheduled-plan lead time',()=>{
    expect(planStartSatisfiesLeadTime(now,true,now)).toBe(true);
    expect(planStartSatisfiesLeadTime(new Date(now.getTime()-90_000),true,now)).toBe(true);
    expect(planStartSatisfiesLeadTime(new Date(now.getTime()-3*60_000),true,now)).toBe(false);
    expect(planStartSatisfiesLeadTime(new Date(now.getTime()+9*60_000),false,now)).toBe(false);
    expect(planStartSatisfiesLeadTime(new Date(now.getTime()+10*60_000),false,now)).toBe(true);
  });
  it('derives imminent, grace and active from attendance',()=>{
    expect(deriveCommitmentTemporalState({status:'scheduled',startsAt:'2026-08-15T21:00:00Z',endsAt:'2026-08-15T23:00:00Z',timezone:'UTC'},now)).toBe('imminent');
    expect(deriveCommitmentTemporalState({status:'active',startsAt:'2026-08-15T19:50:00Z',endsAt:'2026-08-15T22:00:00Z',graceEndsAt:'2026-08-15T20:20:00Z',participationMode:'live'},now)).toBe('grace');
    expect(deriveCommitmentTemporalState({status:'active',startsAt:'2026-08-15T19:50:00Z',endsAt:'2026-08-15T22:00:00Z',graceEndsAt:'2026-08-15T20:20:00Z',participationMode:'live',userJoinedAt:'2026-08-15T19:55:00Z'},now)).toBe('active');
  });
  it('only sends a waiting check-in while the companion is present and the user has not arrived',()=>{
    const waiting={status:'active',startsAt:'2026-08-15T19:50:00Z',endsAt:'2026-08-15T22:00:00Z',graceEndsAt:'2026-08-15T20:20:00Z',participationMode:'live',characterJoinedAt:'2026-08-15T19:50:00Z',companionState:'expected'};
    expect(shouldSendPlanWaitingCheckIn(waiting,now)).toBe(true);
    expect(shouldSendPlanWaitingCheckIn({...waiting,userJoinedAt:'2026-08-15T19:55:00Z'},now)).toBe(false);
    expect(shouldSendPlanWaitingCheckIn({...waiting,characterJoinedAt:null},now)).toBe(false);
    expect(shouldSendPlanWaitingCheckIn({...waiting,companionState:'late'},now)).toBe(false);
    expect(shouldSendPlanWaitingCheckIn(waiting,new Date('2026-08-15T20:21:00Z'))).toBe(false);
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
  it('selects one upcoming group reminder from its anchor companion only',()=>{
    const plans=[
      {id:'later',status:'scheduled',starts_at:'2026-08-15T21:20:00Z',source_conversation_id:'group',character_instance_id:'anchor',metadata:{groupPlan:true}},
      {id:'soon',status:'scheduled',starts_at:'2026-08-15T20:45:00Z',source_conversation_id:'group',character_instance_id:'anchor',metadata:{groupPlan:true}},
      {id:'other-speaker',status:'scheduled',starts_at:'2026-08-15T20:40:00Z',source_conversation_id:'group',character_instance_id:'other',metadata:{groupPlan:true}},
      {id:'direct-plan',status:'scheduled',starts_at:'2026-08-15T20:35:00Z',source_conversation_id:'direct',character_instance_id:'anchor',metadata:{}},
    ];
    expect(selectGroupPlanReminder({plans,characterInstanceId:'anchor',remindersEnabled:true,now})?.id).toBe('soon');
    expect(selectGroupPlanReminder({plans,characterInstanceId:'other',remindersEnabled:false,now})).toBeNull();
    expect(selectGroupPlanReminder({plans,characterInstanceId:'missing',remindersEnabled:true,now})).toBeNull();
  });
});
