import { describe, expect, it } from 'vitest';
import { conversationResponseLength, conversationResponseTokenBudget, conversationStyleGuidance, resolveConversationStyle } from './conversation-style.ts';

describe('conversation style', () => {
  it('resolves missing and invalid values to texting', () => {
    expect(resolveConversationStyle(undefined)).toBe('texting');
    expect(resolveConversationStyle({})).toBe('texting');
    expect(resolveConversationStyle({ responseStyle: 'verbose' })).toBe('texting');
    expect(resolveConversationStyle({ responseStyle: 'texting' })).toBe('texting');
    expect(resolveConversationStyle({ responseStyle: 'paragraph' })).toBe('paragraph');
  });

  it('biases texting toward compact replies without crushing important moments', () => {
    expect(conversationResponseLength({ style:'texting', intent:'casual', interactionQuality:'trivial', message:'lol' })).toBe('micro');
    expect(conversationResponseLength({ style:'texting', intent:'casual', interactionQuality:'normal', message:'Where should we go tonight?' })).toBe('short');
    expect(conversationResponseLength({ style:'texting', intent:'supportive', interactionQuality:'meaningful', message:'Today was awful. I think I am going to quit my job.' })).toBe('medium');
    expect(conversationResponseLength({ style:'texting', intent:'casual', interactionQuality:'normal', message:"I don't think this relationship is working anymore." })).toBe('medium');
    expect(conversationResponseLength({ style:'texting', intent:'conflicted', interactionQuality:'major_relationship_event', message:"I don't think this relationship is working anymore." })).toBe('medium');
    expect(conversationResponseLength({ style:'texting', intent:'storytelling', interactionQuality:'normal', message:'Tell me what happened.' })).toBe('medium');
  });

  it('allows fuller paragraph responses while keeping trivial reactions small', () => {
    expect(conversationResponseLength({ style:'paragraph', intent:'casual', interactionQuality:'trivial', message:'lol' })).toBe('micro');
    expect(conversationResponseLength({ style:'paragraph', intent:'casual', interactionQuality:'normal', message:'Where should we go tonight?' })).toBe('short');
    expect(conversationResponseLength({ style:'paragraph', intent:'vulnerable', interactionQuality:'meaningful', message:'I need to tell you something personal.' })).toBe('medium');
    expect(conversationResponseLength({ style:'paragraph', intent:'storytelling', interactionQuality:'normal', message:'Tell me the whole story.' })).toBe('long');
  });

  it('uses lower normal-case generation budgets for texting', () => {
    expect(conversationResponseTokenBudget({ style:'texting', length:'short' })).toBeLessThan(conversationResponseTokenBudget({ style:'paragraph', length:'short' }));
    expect(conversationResponseTokenBudget({ style:'texting', length:'medium' })).toBeLessThan(conversationResponseTokenBudget({ style:'paragraph', length:'medium' }));
    expect(conversationResponseTokenBudget({ style:'texting', length:'long' })).toBe(380);
  });

  it('preserves the established visible reply budgets independently from reasoning reserves',()=>{
    expect((['micro','short','medium','long'] as const).map((length)=>conversationResponseTokenBudget({style:'texting',length}))).toEqual([80,160,300,380]);
    expect((['micro','short','medium','long'] as const).map((length)=>conversationResponseTokenBudget({style:'paragraph',length}))).toEqual([100,220,380,520]);
  });

  it('keeps cadence guidance separate from character personality', () => {
    expect(conversationStyleGuidance('texting')).toContain('Do not force slang');
    expect(conversationStyleGuidance('paragraph')).toContain('Do not become essay-like');
  });
});
