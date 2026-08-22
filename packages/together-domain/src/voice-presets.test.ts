import { describe, expect, it } from 'vitest';
import { companionVoiceGenderFromSignals, companionVoicePresetAllowed, companionVoicePresetsForGender, normalizeCompanionVoicePreset } from './voice-presets';

describe('companion voice presets', () => {
  it('scopes presets to authored character gender', () => {
    expect(companionVoicePresetsForGender('female').map((option) => option.value)).toEqual(['warm', 'bright']);
    expect(companionVoicePresetsForGender('male').map((option) => option.value)).toEqual(['clear', 'strong']);
    expect(companionVoicePresetsForGender('neutral').map((option) => option.value)).toEqual(['balanced']);
  });

  it('derives gender from explicit metadata before descriptive signals', () => {
    expect(companionVoiceGenderFromSignals('female', 'he/him')).toBe('female');
    expect(companionVoiceGenderFromSignals(undefined, 'he/him')).toBe('male');
    expect(companionVoiceGenderFromSignals(undefined, 'they/them')).toBe('neutral');
  });

  it('rejects malformed and cross-gender overrides', () => {
    expect(normalizeCompanionVoicePreset('warm')).toBe('warm');
    expect(normalizeCompanionVoicePreset('unknown')).toBeNull();
    expect(companionVoicePresetAllowed('warm', 'female')).toBe(true);
    expect(companionVoicePresetAllowed('strong', 'female')).toBe(false);
  });
});
