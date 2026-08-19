import {describe,expect,it} from 'vitest';
import {interactionFeedback,interactionFeedbackCopy,proposalHeading} from './interactionPresentation';

describe('interaction autonomy presentation',()=>{
  it('distinguishes accepted, declined, and countered outcomes without claiming every action happened',()=>{
    expect(interactionFeedbackCopy(interactionFeedback(undefined,'Sing together'),'Maya')).toBe('You chose Sing together.');
    expect(interactionFeedbackCopy(interactionFeedback({decision_status:'declined',result:{}} as never,'Keep walking'),'Maya')).toBe('Maya passed on Keep walking.');
    const counter=interactionFeedback({decision_status:'countered',result:{counterCandidate:{label:'Sit by the water'}}} as never,'Keep walking');
    expect(interactionFeedbackCopy(counter,'Maya')).toBe('Maya suggested Sit by the water instead.');
  });

  it('labels autonomous proposals separately from counteroffers',()=>{
    expect(proposalHeading({actionId:'a',interactionKey:'walk',label:'Take a walk',status:'proposed',source:'character'},'Maya')).toBe('MAYA HAS AN IDEA');
    expect(proposalHeading({actionId:'b',interactionKey:'sit',label:'Sit down',status:'countered',source:'counter'},'Maya')).toBe('MAYA HAS ANOTHER IDEA');
  });
});
