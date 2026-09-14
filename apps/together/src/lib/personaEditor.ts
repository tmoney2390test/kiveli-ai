import type { Snapshot, UserPersona } from '../types';
import { activeConversationFor } from './conversation';

export function personaChatDestination(snapshot: Snapshot, slug: string): string {
  const character=snapshot.characters.find((item)=>item.together_character_templates.slug===slug);
  if(!character)return `/character/${encodeURIComponent(slug)}`;
  const conversation=activeConversationFor(snapshot.conversations,character.id);
  return `/chat?character=${encodeURIComponent(slug)}${conversation?`&conversationId=${encodeURIComponent(conversation.id)}`:''}`;
}

export function personaSnapshotPatch(snapshot: Snapshot, saved: UserPersona): Partial<Snapshot> {
  const exists = snapshot.personas?.some((persona) => persona.id === saved.id);
  return {
    personas: exists ? snapshot.personas!.map((persona) => persona.id === saved.id ? saved : persona) : [...(snapshot.personas ?? []), saved],
    activePersona: snapshot.activePersona?.id === saved.id ? saved : snapshot.activePersona,
    activeContinuity: snapshot.activeContinuity?.persona_id === saved.id ? {...snapshot.activeContinuity, together_user_personas: saved} : snapshot.activeContinuity,
    continuities: snapshot.continuities?.map((life) => life.persona_id === saved.id ? {...life, together_user_personas: saved} : life),
  };
}

export function personaInterestsError(value: string): string | null {
  const interests = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (interests.length > 12) return 'Choose up to 12 interests.';
  if (interests.some((item) => item.length > 40)) return 'Keep each interest to 40 characters or fewer.';
  return null;
}

export type PersonaEditorDraft = {
  name: string;
  pronouns: string;
  age: string;
  occupation: string;
  about: string;
  interests: string;
  avatarPath: string | null;
  responseLength: 'concise' | 'balanced' | 'detailed';
  questionFrequency: 'low' | 'natural' | 'high';
  tone: 'gentle' | 'natural' | 'direct';
};

export function personaAgeError(value: string): string | null {
  if (!value.trim()) return null;
  const age = Number(value);
  if (!Number.isInteger(age)) return 'Enter a whole-number age.';
  if (age < 18 || age > 120) return 'Age must be between 18 and 120.';
  return null;
}

export function personaDraftChanged(saved: PersonaEditorDraft | null, current: PersonaEditorDraft): boolean {
  if (!saved) return false;
  return JSON.stringify(normalizePersonaDraft(saved)) !== JSON.stringify(normalizePersonaDraft(current));
}

export function personaAvatarStoragePath(userId: string, scopeId: string, uploadId: string): string {
  const safe = /^[a-zA-Z0-9-]+$/;
  if (!safe.test(userId) || !safe.test(scopeId) || !safe.test(uploadId)) throw new Error('A secure photo path could not be created.');
  return `${userId}/persona-avatars/${scopeId}/avatar-${uploadId}.jpg`;
}

function normalizePersonaDraft(value: PersonaEditorDraft): PersonaEditorDraft {
  return {
    ...value,
    name: value.name.trim(),
    pronouns: value.pronouns.trim(),
    age: value.age.trim(),
    occupation: value.occupation.trim(),
    about: value.about.trim(),
    interests: value.interests.split(',').map((item) => item.trim()).filter(Boolean).join(', '),
  };
}
