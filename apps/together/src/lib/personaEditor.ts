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
    interests: value.interests.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 12).join(', '),
  };
}
