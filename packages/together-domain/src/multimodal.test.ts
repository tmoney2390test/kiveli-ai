import { describe, expect, it } from 'vitest';
import { capabilityStatus, deriveCompanionVoiceProfile, normalizeRealtimeTranscriptEvents, normalizeSpeechText, resolveExperienceCapabilities, selectSceneSpeakers, validateUserImage } from './multimodal.ts';

describe('Kivelle multimodal domain', () => {
  it('separates product availability from provider configuration', () => {
    const result = resolveExperienceCapabilities({ providerStatuses: { vision: 'not_configured', image_generation: 'not_configured' } });
    expect(result.userImageUploads).toBe(true);
    expect(result.visionUnderstanding).toBe(false);
    expect(result.contextualSelfies).toBe(true);
    expect(result.providers.image_generation).toBe('not_configured');
    expect(capabilityStatus({ provider: 'openai', credentialsPresent: false })).toBe('not_configured');
    const gated = resolveExperienceCapabilities({ product: { voiceNotes: false, liveVoiceCalls: false, multiCharacterScenes: false }, providerStatuses: { text_to_speech: 'available' } });
    expect(gated.voiceNotes).toBe(false);
    expect(gated.liveVoiceCalls).toBe(false);
    expect(gated.multiCharacterScenes).toBe(false);
    expect(gated.providers.text_to_speech).toBe('available');
  });

  it('validates private chat image constraints', () => {
    expect(validateUserImage({ mimeType: 'image/jpeg', byteSize: 2000 })).toEqual({ valid: true });
    expect(validateUserImage({ mimeType: 'image/gif', byteSize: 2000 })).toMatchObject({ valid: false, code: 'UNSUPPORTED_MEDIA_TYPE' });
    expect(validateUserImage({ mimeType: 'image/png', byteSize: 11 * 1024 * 1024 })).toMatchObject({ valid: false, code: 'FILE_TOO_LARGE' });
  });

  it('derives stable provider-neutral voice identity and normalizes speech without changing meaning', () => {
    const profile = deriveCompanionVoiceProfile({ characterTemplateId: 'maya-id', slug: 'maya', personality: { playful: .8, empathetic: .9 } });
    expect(profile.voiceKey).toBe('maya-default');
    expect(profile.characteristics.warmth).toBe(.9);
    expect(normalizeSpeechText('Meet me at 7:00 PM.')).toBe('Meet me at 7 pm.');
  });

  it('normalizes realtime transcript output into canonical conversation roles', () => {
    expect(normalizeRealtimeTranscriptEvents([
      { providerEventId: 'user-1', speaker: 'user', text: '  Hi   Maya  ', final: true },
      { providerEventId: 'maya-1', speaker: 'character', text: 'Hey.', occurredAt: '2026-08-17T18:00:00Z' },
      { speaker: 'character', text: '   ' },
    ], '2026-08-17T17:59:00.000Z')).toEqual([
      { sequence: 1, providerEventId: 'user-1', role: 'user', content: 'Hi Maya', occurredAt: '2026-08-17T17:59:00.000Z', final: true },
      { sequence: 2, providerEventId: 'maya-1', role: 'assistant', content: 'Hey.', occurredAt: '2026-08-17T18:00:00.000Z', final: true },
    ]);
  });

  it('selects a directly addressed speaker and permits others to stay silent', () => {
    const candidates = [
      { characterInstanceId: 'maya', name: 'Maya', role: 'primary_companion' as const, topicRelevance: .8 },
      { characterInstanceId: 'zoe', name: 'Zoe', role: 'participant' as const, topicRelevance: .9 },
    ];
    expect(selectSceneSpeakers({ message: 'Maya, what did you think?', candidates }).speakerInstanceIds).toEqual(['maya']);
    const group = selectSceneSpeakers({ message: 'What did you both think?', candidates });
    expect(group.speakerInstanceIds).toContain('maya');
    expect(group.speakerInstanceIds).toContain('zoe');
    expect(selectSceneSpeakers({message:'Maya and Zoe, be honest.',candidates}).speakerInstanceIds).toEqual(expect.arrayContaining(['maya','zoe']));
  });

  it('uses learned social dynamics without turning shared scenes into round robin chat',()=>{
    const candidates=[
      {characterInstanceId:'primary',name:'Maya',role:'primary_companion' as const,topicRelevance:.55,lastSpoke:true},
      {characterInstanceId:'friend',name:'Zoe',role:'participant' as const,topicRelevance:.7,socialAffinity:.9,relationshipType:'close_friends'},
      {characterInstanceId:'quiet',name:'Nora',role:'guest' as const,topicRelevance:.2,socialEnergy:.1,recentlyInterrupted:true},
    ];
    const natural=selectSceneSpeakers({message:'That was actually pretty funny.',candidates});
    expect(natural.speakerInstanceIds).toEqual(['friend']);
    expect(natural.reasonCodes).toContain('silence_allowed');
    expect(selectSceneSpeakers({message:'Maya, tell me what happened.',candidates}).speakerInstanceIds).toEqual(['primary']);
  });
});
