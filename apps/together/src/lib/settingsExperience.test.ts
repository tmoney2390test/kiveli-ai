import { describe, expect, it } from 'vitest';
import { normalizeProfileDraft, profileDraftChanged, settingsSearchMatches, settingsSectionFromParam } from './settingsExperience';

describe('settings experience', () => {
  it('accepts only known settings section links', () => {
    expect(settingsSectionFromParam('experience')).toBe('experience');
    expect(settingsSectionFromParam(['privacy'])).toBe('privacy');
    expect(settingsSectionFromParam('billing')).toBeNull();
  });

  it('finds sections using every search term', () => {
    expect(settingsSearchMatches('video calls', 'Chat & media', 'Photos, video, voice notes, and calls')).toBe(true);
    expect(settingsSearchMatches('delete data', 'Privacy & safety', 'Export your data or delete your account')).toBe(true);
    expect(settingsSearchMatches('password photo', 'Account & billing', 'Email and password')).toBe(false);
  });

  it('tracks meaningful profile changes without whitespace-only noise', () => {
    const saved = { name: 'Tim', about: 'Hello', interests: 'Music, Travel', goals: 'Friendship' };
    expect(profileDraftChanged(saved, { ...saved, name: ' Tim ' })).toBe(false);
    expect(profileDraftChanged(saved, { ...saved, about: 'Something new' })).toBe(true);
    expect(normalizeProfileDraft({ ...saved, interests: ' Music,  Travel, ' }).interests).toBe('Music, Travel');
  });
});
