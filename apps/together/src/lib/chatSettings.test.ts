import { describe, expect, it } from 'vitest';
import { chatMessageTypography, chatPreferencesFromConversation, isSubscribedTier, resolveChatContentMode, resolveChatDynamism, resolveChatLanguage, resolveChatResponseStyle, resolveChatSpiceLevel, resolveChatTextSize, resolveChatVoicePreset, resolveReasoningPreference, withLocalChatSettings } from './chatSettings';

describe('chat settings', () => {
  it('reads valid per-chat preferences and ignores malformed metadata', () => {
    const conversation = { metadata: { chatPreferences: { responseStyle: 'paragraph', textSize: 'large', spiceLevel: 3, voicePreset: 'warm', contentMode: 'explicit', chatLanguage: 'fr', extra: true } } };
    expect(chatPreferencesFromConversation(conversation as never)).toEqual({ responseStyle: 'paragraph', textSize: 'large', spiceLevel: 3, voicePreset: 'warm', contentMode: 'explicit', chatLanguage: 'fr',chatDynamism:50,reasoningPreference:'auto' });
    expect(chatPreferencesFromConversation({ metadata: { chatPreferences: 'large' } })).toEqual({chatDynamism:50,reasoningPreference:'auto'});
  });

  it('normalizes and persists chat generation controls without disturbing other preferences',()=>{
    const conversation={id:'chat-1',title:null,metadata:{chatPreferences:{chatDynamism:100,reasoningPreference:'medium',voicePreset:'bright',customFutureValue:true}}} as never;
    expect(resolveChatDynamism(conversation)).toBe(100);
    expect(resolveReasoningPreference(conversation)).toBe('medium');
    const updated=withLocalChatSettings(conversation,{title:'A chat',responseStyle:'paragraph',textSize:'large',chatDynamism:25,reasoningPreference:'low'});
    expect(chatPreferencesFromConversation(updated)).toMatchObject({chatDynamism:25,reasoningPreference:'low',voicePreset:'bright'});
    expect((updated.metadata?.chatPreferences as Record<string,unknown>).customFutureValue).toBe(true);
    expect(resolveChatDynamism({metadata:{chatPreferences:{chatDynamism:999}}} as never)).toBe(50);
    expect(resolveReasoningPreference({metadata:{chatPreferences:{reasoningPreference:'maximum'}}} as never)).toBe('auto');
  });

  it.each([0,25,50,75,100] as const)('reads valid dynamism %s from direct or group conversation metadata',(chatDynamism)=>{
    expect(chatPreferencesFromConversation({metadata:{chatPreferences:{chatDynamism}}} as never).chatDynamism).toBe(chatDynamism);
  });

  it.each(['auto','none','low','medium','high'] as const)('reads valid reasoning preference %s',(reasoningPreference)=>{
    expect(chatPreferencesFromConversation({metadata:{chatPreferences:{reasoningPreference}}} as never).reasoningPreference).toBe(reasoningPreference);
  });

  it('keeps direct and group generation preferences conversation-scoped',()=>{
    const direct={metadata:{chatPreferences:{chatDynamism:25,reasoningPreference:'low'}}} as never;
    const group={metadata:{chatPreferences:{chatDynamism:100,reasoningPreference:'high'},groupSettings:{energy:'lively'}}} as never;
    expect(chatPreferencesFromConversation(direct)).toMatchObject({chatDynamism:25,reasoningPreference:'low'});
    expect(chatPreferencesFromConversation(group)).toMatchObject({chatDynamism:100,reasoningPreference:'high'});
  });

  it('reconciles a stored reasoning choice to the current subscription tier',()=>{
    const downgraded={metadata:{chatPreferences:{reasoningPreference:'high'}}} as never;
    expect(resolveReasoningPreference(downgraded,'kivelle_plus')).toBe('medium');
    expect(resolveReasoningPreference(downgraded,'free')).toBe('low');
    expect(resolveReasoningPreference(downgraded,'kivelle_max')).toBe('high');
    expect(resolveReasoningPreference({metadata:{chatPreferences:{reasoningPreference:'auto'}}} as never,'free')).toBe('auto');
  });

  it('falls back to existing account and character defaults', () => {
    expect(resolveChatResponseStyle(null, { conversation_preferences: { responseStyle: 'paragraph' } } as never)).toBe('paragraph');
    expect(resolveChatTextSize(null)).toBe('medium');
    expect(resolveChatSpiceLevel(null, 1)).toBe(1);
  });

  it('maps text sizes to real message typography', () => {
    expect(chatMessageTypography({ metadata: { chatPreferences: { textSize: 'small' } } })).toEqual({ fontSize: 13, lineHeight: 19 });
    expect(chatMessageTypography({ metadata: { chatPreferences: { textSize: 'large' } } })).toEqual({ fontSize: 18, lineHeight: 26 });
    expect(chatMessageTypography({ metadata: { chatPreferences: { textSize: 'medium' } } }, { desktop: true })).toEqual({ fontSize: 17, lineHeight: 25 });
  });

  it('recognizes current and legacy paid tiers', () => {
    expect(isSubscribedTier('free')).toBe(false);
    expect(isSubscribedTier('kivelle_plus')).toBe(true);
    expect(isSubscribedTier('unlimited')).toBe(true);
  });

  it('reads, sets, and clears a per-chat voice preset', () => {
    const conversation = { id: 'chat-1', title: null, metadata: { chatPreferences: { voicePreset: 'bright' } } } as never;
    expect(resolveChatVoicePreset(conversation)).toBe('bright');
    const updated = withLocalChatSettings(conversation, { title: null, responseStyle: 'texting', textSize: 'medium', voicePreset: 'warm' });
    expect(resolveChatVoicePreset(updated)).toBe('warm');
    expect(resolveChatVoicePreset(withLocalChatSettings(updated, { title: null, responseStyle: 'texting', textSize: 'medium', voicePreset: null }))).toBeNull();
  });

  it('uses the per-chat content choice and adult account default', () => {
    const conversation = { id: 'chat-1', title: null, metadata: {} } as never;
    const profile = { content_preferences: { contentMode: 'mature' }, age_verified_at: '2026-08-01T00:00:00Z' } as never;
    expect(resolveChatContentMode(conversation, profile)).toBe('mature');
    const updated = withLocalChatSettings(conversation, { title: null, responseStyle: 'texting', textSize: 'medium', contentMode: 'explicit' });
    expect(resolveChatContentMode(updated, profile)).toBe('explicit');
    expect(chatPreferencesFromConversation(updated).contentMode).toBe('explicit');
    expect(chatPreferencesFromConversation(updated).spiceLevel).toBeUndefined();
    expect(resolveChatContentMode(null, { content_preferences: { romanceEnabled: false } } as never)).toBe('romance');
    expect(resolveChatContentMode(null, { age_verified_at: '2026-08-01T00:00:00Z',content_preferences:{} } as never)).toBe('explicit');
    expect(resolveChatContentMode({ metadata: { chatPreferences: { contentMode: 'standard' } } } as never, null)).toBe('standard');
  });

  it('resolves and saves a provider-compatible per-chat language', () => {
    const conversation = { id: 'chat-1', title: null, metadata: {} } as never;
    expect(resolveChatLanguage(conversation)).toBe('en');
    const updated = withLocalChatSettings(conversation, { title: null, responseStyle: 'texting', textSize: 'medium', chatLanguage: 'es-MX' });
    expect(resolveChatLanguage(updated)).toBe('es-MX');
    expect(chatPreferencesFromConversation({ metadata: { chatPreferences: { chatLanguage: 'unsupported' } } } as never).chatLanguage).toBe('en');
  });
});
