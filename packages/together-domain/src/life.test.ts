import { describe, expect, it } from 'vitest';
import { effectiveInitiativeLevel, initiativePolicy, lifeTriggerForConversationTurn, normalizeInitiativeLevel, shouldInitiateMessage, shouldPersistLifeStateForConversationTurn } from './life';
import type{LifeEventTemplate}from'./types';

describe('life trigger for a conversation turn',()=>{
  it('observes current presence without materializing a narrative event for a photo request',()=>{
    expect(lifeTriggerForConversationTurn({photoRequested:true})).toBe('home_opened');
    expect(shouldPersistLifeStateForConversationTurn({photoRequested:true})).toBe(false);
  });

  it('retains normal conversation progression for an ordinary message',()=>{
    expect(lifeTriggerForConversationTurn({photoRequested:false})).toBe('conversation_continued');
    expect(shouldPersistLifeStateForConversationTurn({photoRequested:false})).toBe(true);
  });
});

describe('companion initiative pacing',()=>{
  const event:LifeEventTemplate={id:'event',title:'Event',type:'ordinary',significance:.7,location:'somewhere',participants:[],summary:'A meaningful day.',proactiveEligible:true};

  it('normalizes stored levels and fails closed without the paid entitlement',()=>{
    expect(normalizeInitiativeLevel('frequent')).toBe('frequent');
    expect(normalizeInitiativeLevel('unknown')).toBe('natural');
    expect(effectiveInitiativeLevel({entitled:false,globalLevel:'frequent',characterOverride:'frequent'})).toBe('off');
    expect(effectiveInitiativeLevel({entitled:true,globalLevel:'occasional',characterOverride:'frequent'})).toBe('frequent');
    expect(effectiveInitiativeLevel({entitled:true,globalLevel:'off',characterOverride:'frequent'})).toBe('frequent');
    expect(effectiveInitiativeLevel({entitled:true,globalLevel:'off'})).toBe('off');
    expect(effectiveInitiativeLevel({entitled:true,globalLevel:'natural',legacyEnabled:false})).toBe('natural');
    expect(effectiveInitiativeLevel({entitled:true,globalLevel:undefined,legacyEnabled:false})).toBe('off');
  });

  it('uses distinct cooldowns for occasional, natural, and frequent initiative',()=>{
    expect(initiativePolicy('occasional')).toMatchObject({minimumConversationHours:12,minimumProactiveHours:36});
    expect(initiativePolicy('natural')).toMatchObject({minimumConversationHours:5,minimumProactiveHours:18});
    expect(initiativePolicy('frequent')).toMatchObject({minimumConversationHours:3,minimumProactiveHours:8});
  });

  it('never emits ambient initiative when off and respects level cooldowns',()=>{
    const base={event,hoursSinceConversation:10,hoursSinceProactive:10,quietHours:false,relationshipStage:'friend',seed:'initiative'};
    expect(shouldInitiateMessage({...base,initiativeLevel:'off'})).toBe(false);
    expect(shouldInitiateMessage({...base,initiativeLevel:'occasional'})).toBe(false);
    expect(shouldInitiateMessage({...base,initiativeLevel:'natural'})).toBe(false);
  });
});
