import { normalizeSpeechText, type CompanionVoiceProfile } from '../../../packages/together-domain/src/multimodal.ts';

export const MAX_COMPANION_VOICE_NOTE_CHARACTERS = 3_500;

export type CompanionSpeechPerformance = {
  spokenText: string;
  speed: number;
  characterCount: number;
};

/**
 * Converts canonical chat copy into spoken delivery without changing what the
 * companion said. This layer may remove visual markup and translate an
 * explicitly authored performance cue, but it must never invent dialogue or
 * canonical actions.
 */
export function prepareCompanionSpeech(input: {
  canonicalText: string;
  voiceProfile: CompanionVoiceProfile;
  mood?: string | null;
  scene?: Record<string, unknown> | null;
}): CompanionSpeechPerformance {
  const canonical = input.canonicalText.trim();
  if (!canonical) return { spokenText: '', speed: 1, characterCount: 0 };
  if (canonical.length > MAX_COMPANION_VOICE_NOTE_CHARACTERS) {
    throw new Error('VOICE_NOTE_TOO_LONG');
  }

  const spokenText = normalizeSpeechText(
    canonical
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^(?:#{1,6}|>|[-+])\s+/gm, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/(?:\*|_)(laughs?|chuckles?|giggles?|sighs?|inhales?|exhales?|breathes?)(?:\*|_)/gi, (_match, cue: string) => performanceTag(cue))
      .replace(/(?:\*|_)[^*_\n]{1,100}(?:\*|_)/g, ' ')
      .replace(/\s+([,.;!?])/g, '$1'),
  );

  const pace = finiteUnit(input.voiceProfile.characteristics.pace, .5);
  const energy = finiteUnit(input.voiceProfile.characteristics.energy, .55);
  const mood = String(input.mood ?? '').toLowerCase();
  const moodDelta = /tired|sleepy|tender|calm|sad/.test(mood) ? -.035 : /excited|playful|energized/.test(mood) ? .025 : 0;
  const speed = clamp(.82 + pace * .28 + energy * .06 + moodDelta, .78, 1.18);
  void input.scene;
  return { spokenText, speed: Math.round(speed * 100) / 100, characterCount: spokenText.length };
}

function performanceTag(value: string): string {
  const cue = value.toLowerCase();
  if (cue.startsWith('laugh')) return '[laugh]';
  if (cue.startsWith('chuckle')) return '[chuckle]';
  if (cue.startsWith('giggle')) return '[giggle]';
  if (cue.startsWith('sigh')) return '[sigh]';
  if (cue.startsWith('inhale')) return '[inhale]';
  if (cue.startsWith('exhale')) return '[exhale]';
  return '[breath]';
}

function finiteUnit(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(number, 0, 1) : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
