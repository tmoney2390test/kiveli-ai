import { describe, expect, it } from 'vitest';
import type { CompanionVoiceProfile } from './multimodal.ts';
import { isBuiltInXaiVoice, resolveXaiVoiceId } from './voice-provider-mapping.ts';

const voice = (overrides: Partial<CompanionVoiceProfile> = {}): CompanionVoiceProfile => ({
  characterTemplateId: 'character-1',
  voiceKey: 'character-1-default',
  characteristics: { warmth: .6, energy: .55, pace: .5, expressiveness: .55, softness: .45 },
  ...overrides,
});

describe('xAI voice mapping', () => {
  it('normalizes built-ins and preserves custom provider voice IDs', () => {
    expect(resolveXaiVoiceId(voice({ providerMappings: { xai: 'EVE' } }))).toBe('eve');
    expect(resolveXaiVoiceId(voice({ providerMappings: { xai: 'custom-voice-42' } }))).toBe('custom-voice-42');
  });

  it('resolves missing and retired mappings deterministically', () => {
    const missing = voice();
    const retired = voice({ providerMappings: { xai: 'luna' } });
    expect(resolveXaiVoiceId(missing)).toBe(resolveXaiVoiceId(missing));
    expect(resolveXaiVoiceId(retired)).toBe(resolveXaiVoiceId(retired));
    expect(isBuiltInXaiVoice(resolveXaiVoiceId(retired))).toBe(true);
  });

  it('keeps default built-in voices aligned with authored character gender',()=>{
    const maerra=voice({voiceKey:'vharadren-queen-maerra-vaelorian',characteristics:{gender:'woman',warmth:.58,energy:.62},providerMappings:{xai:'sal'}});
    const lucien=voice({voiceKey:'vharadren-prince-lucien-vaelorian',characteristics:{gender:'man',warmth:.58,energy:.62},providerMappings:{xai:'eve'}});
    expect(['eve','ara']).toContain(resolveXaiVoiceId(maerra));
    expect(['leo','rex']).toContain(resolveXaiVoiceId(lucien));
  });

  it('preserves custom provider voices while giving neutral characters the neutral default',()=>{
    expect(resolveXaiVoiceId(voice({characteristics:{gender:'woman'},providerMappings:{xai:'custom-voice-42'}}))).toBe('custom-voice-42');
    expect(resolveXaiVoiceId(voice({characteristics:{pronouns:'they/them'},providerMappings:{xai:'eve'}}))).toBe('sal');
  });
});
