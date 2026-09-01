import {describe,expect,it} from 'vitest';
import {proposalHeading,sceneActionDividerLabel,sceneActionTimelineEntryFromAction,sceneActionTimelineEntryFromMessage} from './interactionPresentation';

describe('interaction autonomy presentation',()=>{
  it('turns completed scene events into compact, natural transcript dividers',()=>{
    expect(sceneActionDividerLabel({id:'one',label:'Share food',resolvedLabel:'Share food',decision:'accepted'},'Bianca De Luca')).toBe('Shared food with Bianca');
    expect(sceneActionDividerLabel({id:'two',label:'Sing together',resolvedLabel:'Sing together',decision:'accepted'},'Maya')).toBe('Sang with Maya');
    expect(sceneActionDividerLabel({id:'three',label:'Ask what they are working on',resolvedLabel:'Ask what they are working on',decision:'accepted'},'Maya')).toBe('Asked what Maya is working on');
    expect(sceneActionDividerLabel({id:'four',label:'Let them choose',resolvedLabel:'Let them choose',decision:'accepted'},'Maya')).toBe('Let Maya choose');
  });

  it('does not claim a declined or countered event occurred',()=>{
    const declined=sceneActionTimelineEntryFromAction({id:'one',decision_status:'declined',payload:{candidate:{label:'Keep walking'}},result:{label:'Keep walking'}} as never,'Keep walking');
    expect(sceneActionDividerLabel(declined,'Maya')).toBe('Maya passed on Keep walking');
    const countered=sceneActionTimelineEntryFromAction({id:'two',decision_status:'countered',payload:{candidate:{label:'Keep walking'}},result:{label:'Keep walking',counterCandidate:{label:'Sit by the water'}}} as never,'Keep walking');
    expect(sceneActionDividerLabel(countered,'Maya')).toBe('Maya suggested Sit by the water instead');
  });

  it('restores a scene divider from the companion reply metadata after refresh',()=>{
    const entry=sceneActionTimelineEntryFromMessage({id:'message',conversation_id:'conversation',role:'assistant',content:'Try this bite.',delivery_status:'complete',created_at:'2026-09-01T12:00:00Z',provider_metadata:{source:'scene_action',sceneActionId:'action',sceneActionLabel:'Share food',sceneActionResolvedLabel:'Share food',sceneActionDecision:'accepted'}});
    expect(entry).toEqual({id:'action',label:'Share food',resolvedLabel:'Share food',decision:'accepted'});
    expect(sceneActionTimelineEntryFromMessage({id:'message',conversation_id:'conversation',role:'assistant',content:'Hi.',delivery_status:'complete',created_at:'2026-09-01T12:00:00Z'})).toBeNull();
  });

  it('labels autonomous proposals separately from counteroffers',()=>{
    expect(proposalHeading({actionId:'a',interactionKey:'walk',label:'Take a walk',status:'proposed',source:'character'},'Maya')).toBe('MAYA HAS AN IDEA');
    expect(proposalHeading({actionId:'b',interactionKey:'sit',label:'Sit down',status:'countered',source:'counter'},'Maya')).toBe('MAYA HAS ANOTHER IDEA');
  });
});
