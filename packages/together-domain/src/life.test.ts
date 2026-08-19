import { describe, expect, it } from 'vitest';
import { lifeTriggerForConversationTurn, shouldPersistLifeStateForConversationTurn } from './life';

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
