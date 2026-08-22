export const companionVoicePresets = [
  { value: 'warm', label: 'Warm', detail: 'Friendly and conversational', gender: 'female' },
  { value: 'bright', label: 'Bright', detail: 'Energetic and upbeat', gender: 'female' },
  { value: 'clear', label: 'Clear', detail: 'Confident and articulate', gender: 'male' },
  { value: 'strong', label: 'Strong', detail: 'Authoritative and grounded', gender: 'male' },
  { value: 'balanced', label: 'Balanced', detail: 'Smooth and neutral', gender: 'neutral' },
] as const;

export type CompanionVoicePreset = typeof companionVoicePresets[number]['value'];
export type CompanionVoiceGender = typeof companionVoicePresets[number]['gender'];

export function normalizeCompanionVoicePreset(value: unknown): CompanionVoicePreset | null {
  return companionVoicePresets.some((option) => option.value === value) ? value as CompanionVoicePreset : null;
}

export function companionVoiceGenderFromSignals(...signals: unknown[]): CompanionVoiceGender {
  for (const signal of signals) {
    const explicit = explicitVoiceGender(signal);
    if (explicit) return explicit;
  }
  const context = signals.map((signal) => typeof signal === 'string' ? signal : JSON.stringify(signal ?? '')).join(' ').toLowerCase();
  if (/\b(she|her|woman|women|female|girl)\b/.test(context)) return 'female';
  if (/\b(he|him|his|man|men|male|boy)\b/.test(context)) return 'male';
  return 'neutral';
}

export function companionVoicePresetsForGender(gender: CompanionVoiceGender) {
  return companionVoicePresets.filter((option) => option.gender === gender);
}

export function companionVoicePresetAllowed(preset: unknown, gender: CompanionVoiceGender): preset is CompanionVoicePreset {
  const normalized = normalizeCompanionVoicePreset(preset);
  return Boolean(normalized && companionVoicePresets.some((option) => option.value === normalized && option.gender === gender));
}

function explicitVoiceGender(value: unknown): CompanionVoiceGender | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (/^(female|woman|women|girl|she(?:\s*\/\s*her)?)$/.test(normalized)) return 'female';
  if (/^(male|man|men|boy|he(?:\s*\/\s*him)?)$/.test(normalized)) return 'male';
  if (/^(neutral|nonbinary|non-binary|they(?:\s*\/\s*them)?)$/.test(normalized)) return 'neutral';
  return null;
}
