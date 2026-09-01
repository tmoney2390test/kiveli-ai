import { describe, expect, it } from 'vitest';
import { personaAgeError, personaAvatarStoragePath, personaDraftChanged, type PersonaEditorDraft } from './personaEditor';

const draft: PersonaEditorDraft = {
  name: 'Jordan', pronouns: 'they/them', age: '31', occupation: 'Musician', about: 'Loves a good story.', interests: 'Jazz, travel', avatarPath: null,
  responseLength: 'balanced', questionFrequency: 'natural', tone: 'natural',
};

describe('Persona editor safeguards', () => {
  it('enforces the same adult age range as the API', () => {
    expect(personaAgeError('')).toBeNull();
    expect(personaAgeError('18')).toBeNull();
    expect(personaAgeError('120')).toBeNull();
    expect(personaAgeError('17')).toMatch(/18/);
    expect(personaAgeError('121')).toMatch(/120/);
    expect(personaAgeError('22.5')).toMatch(/whole-number/);
  });

  it('detects meaningful edits without treating harmless spacing as a change', () => {
    expect(personaDraftChanged(draft, { ...draft, name: ' Jordan ', interests: 'Jazz,   travel' })).toBe(false);
    expect(personaDraftChanged(draft, { ...draft, tone: 'direct' })).toBe(true);
    expect(personaDraftChanged(draft, { ...draft, avatarPath: 'user/persona.jpg' })).toBe(true);
  });

  it('creates isolated randomized Persona avatar paths', () => {
    expect(personaAvatarStoragePath('user-1', 'draft-1', 'upload-1')).toBe('user-1/persona-avatars/draft-1/avatar-upload-1.jpg');
    expect(() => personaAvatarStoragePath('user-1', '../other', 'upload-1')).toThrow(/secure photo path/);
  });
});
