import { describe, expect, it } from 'vitest';
import { personaAgeError, personaAvatarStoragePath, personaDraftChanged, personaInterestsError, personaSnapshotPatch, personaChatDestination, type PersonaEditorDraft } from './personaEditor';
import type { Snapshot, UserPersona } from '../types';

const draft: PersonaEditorDraft = {
  name: 'Jordan', pronouns: 'they/them', age: '31', occupation: 'Musician', about: 'Loves a good story.', interests: 'Jazz, travel', avatarPath: null,
  responseLength: 'balanced', questionFrequency: 'natural', tone: 'natural',
};

describe('Persona editor safeguards', () => {
  it('resumes only the selected Life companion and otherwise opens their profile', () => {
    const snapshot={characters:[{id:'alternate-character',together_character_templates:{slug:'freya'}}],conversations:[{id:'alternate-chat',character_instance_id:'alternate-character',kind:'direct'}]} as unknown as Snapshot;
    expect(personaChatDestination(snapshot,'freya')).toBe('/chat?character=freya&conversationId=alternate-chat');
    expect(personaChatDestination(snapshot,'gin')).toBe('/character/gin');
  });
  it('validates interests without silently throwing away edits', () => {
    expect(personaInterestsError('Jazz, travel')).toBeNull();
    expect(personaInterestsError('x'.repeat(41))).toMatch(/40/);
    expect(personaInterestsError(Array(13).fill('Jazz').join(','))).toMatch(/12/);
    expect(personaDraftChanged({...draft,interests:Array(12).fill('Jazz').join(',')}, {...draft,interests:[...Array(12).fill('Jazz'),'Travel'].join(',')})).toBe(true);
  });

  it('updates the active identity and Life card together without changing histories', () => {
    const saved={id:'persona',display_name:'New name'} as UserPersona;
    const snapshot={personas:[{id:'persona'}],activePersona:{id:'persona'},activeContinuity:{id:'life',persona_id:'persona'},continuities:[{id:'life',persona_id:'persona'}]} as Snapshot;
    const patch=personaSnapshotPatch(snapshot,saved);
    expect(patch.activePersona).toBe(saved);
    expect(patch.activeContinuity?.together_user_personas).toBe(saved);
    expect(patch.continuities?.[0]?.together_user_personas).toBe(saved);
    expect(patch).not.toHaveProperty('conversations');
  });
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
