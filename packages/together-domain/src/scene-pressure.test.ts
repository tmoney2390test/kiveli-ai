import { describe, expect, it } from 'vitest';
import { assessScenePressure, scenePressureGuidance } from './scene-pressure.ts';
import { compileResponseBrief, compileRelationshipStance } from './prompting.ts';

describe('scene pressure before social intent', () => {
  it.each([
    ['The guards are outside. I am scared.', 'immediate'],
    ['Draw your sword. We need to fight.', 'immediate'],
    ['I am afraid the guards found the ledger.', 'uncertain'],
    ['He is blackmailing me.', 'uncertain'],
    ['We escaped. I am still shaking.', 'aftermath'],
  ] as const)('recognizes the scene in %s', (message, phase) => {
    const pressure = assessScenePressure({ message });
    expect(pressure.phase).toBe(phase);
    const brief = compileResponseBrief({message,pressure,interactionQuality:'meaningful',relationshipStance:compileRelationshipStance({stage:'dating'})});
    expect(brief.handoff.mode).toBe('none');
    expect(brief.callbackCandidate).toBeUndefined();
    expect(brief.mode).toBe(phase==='aftermath'?'vulnerable':'danger');
  });

  it.each([
    'I am scared about my presentation.', 'That is a killer outfit.',
    'We need to fight for a promotion.', 'We are under attack in a video game.',
    'Imagine if the guards were outside.', 'I killed the engine.',
    'The guards are outside for the ceremony.',
  ])('does not manufacture danger from ordinary language: %s', (message) => {
    expect(assessScenePressure({message}).phase).toBe('none');
  });

  it('carries pressure across a short visible continuation, respects resolution, and releases a new topic', () => {
    const recentTurns=[{role:'user',content:'We are under attack.'}];
    expect(assessScenePressure({message:'What now?',recentTurns}).phase).toBe('immediate');
    expect(assessScenePressure({message:'What now?',recentTurns:[...recentTurns,{role:'user',content:'We are safe now.'}]}).phase).toBe('aftermath');
    expect(assessScenePressure({message:'Tell me about your favorite food.',recentTurns}).phase).toBe('none');
    expect(assessScenePressure({message:'What now?',recentTurns:[]}).phase).toBe('none');
  });

  it('does not invent co-presence or convert a reported threat into canonical truth', () => {
    const pressure=assessScenePressure({message:'The guards are outside. I am scared.',interactionMode:'remote'});
    expect(pressure.interactionMode).toBe('remote');
    expect(scenePressureGuidance(pressure)).toContain('without inventing physical arrival');
    expect(scenePressureGuidance(pressure)).toContain('not proof of a completed event');
  });
});
