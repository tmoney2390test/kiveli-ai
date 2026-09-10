import { describe, expect, it } from 'vitest';
import { videoCreateDisabledReason, videoPromptIdeas } from './videoCreator';

describe('video creator guidance', () => {
  it('offers a toast for a bartender without adding unseen props to existing photos', () => {
    const character = { name: 'Virginia “Gin” Maddox', occupation: 'Saloon bartender' };
    const ideas = videoPromptIdeas(character);
    expect(ideas.find(i => i.label === 'Raise a glass')?.prompt).toContain(character.name);
    expect(videoPromptIdeas(character, 'Saloon', true).some(i => i.label === 'Raise a glass')).toBe(false);
    expect(videoPromptIdeas({ name: 'Artist', occupation: 'Painter' })[1]?.label).toBe('Pause and look up');
  });
  it('explains account blockers before asking for a prompt, and enables only ready requests', () => {
    const ready = { submitting: false, loading: false, available: true, activeVideo: false, insufficient: false, prompt: 'Smile softly', validSettings: true };
    expect(videoCreateDisabledReason(ready)).toBeNull();
    expect(videoCreateDisabledReason({ ...ready, prompt: ' ' })).toBe('Describe a moment or choose an idea.');
    expect(videoCreateDisabledReason({ ...ready, prompt: '', loading: true })).toContain('Checking');
    expect(videoCreateDisabledReason({ ...ready, insufficient: true })).toContain('credits');
    expect(videoCreateDisabledReason({ ...ready, activeVideo: true })).toContain('active video');
    expect(videoCreateDisabledReason({ ...ready, locationReady: false })).toContain('location');
    expect(videoCreateDisabledReason({ ...ready, validSettings: false })).toContain('supported');
  });
});
