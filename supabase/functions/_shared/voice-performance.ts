import { normalizeSpeechText, type CompanionVoiceProfile } from '../../../packages/together-domain/src/multimodal.ts';
import { VOICE_NOTE_FULL_SYNTHESIS_CHARACTER_LIMIT } from '../../../packages/together-domain/src/entitlements.ts';

export type CompanionSpeechPerformance = {
  spokenText: string;
  speed: number;
  characterCount: number;
  sourceCharacterCount: number;
  shortened: boolean;
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
  if (!canonical) return { spokenText: '', speed: 1, characterCount: 0, sourceCharacterCount: 0, shortened: false };

  const normalized = normalizeSpeechText(
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
  const shouldShorten = canonical.length > VOICE_NOTE_FULL_SYNTHESIS_CHARACTER_LIMIT;
  const spokenText = shouldShorten ? faithfulExtract(normalized, VOICE_NOTE_FULL_SYNTHESIS_CHARACTER_LIMIT) : normalized;

  const pace = finiteUnit(input.voiceProfile.characteristics.pace, .5);
  const energy = finiteUnit(input.voiceProfile.characteristics.energy, .55);
  const mood = String(input.mood ?? '').toLowerCase();
  const moodDelta = /tired|sleepy|tender|calm|sad/.test(mood) ? -.035 : /excited|playful|energized/.test(mood) ? .025 : 0;
  const speed = clamp(.82 + pace * .28 + energy * .06 + moodDelta, .78, 1.18);
  void input.scene;
  return { spokenText, speed: Math.round(speed * 100) / 100, characterCount: spokenText.length, sourceCharacterCount: canonical.length, shortened: shouldShorten && spokenText.length < normalized.length };
}

function faithfulExtract(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const sentences = text.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((item) => item.trim()).filter(Boolean) ?? [];
  const tail = sentences.length > 1 ? sentences.at(-1)! : wordBoundedTail(text, Math.min(320, Math.floor(limit * .2)));
  const headLimit = Math.max(1, limit - tail.length - 3);
  let head = '';
  for (const sentence of sentences.slice(0, -1)) {
    const next = head ? `${head} ${sentence}` : sentence;
    if (next.length > headLimit) break;
    head = next;
  }
  if (!head) head = wordBoundedHead(text, headLimit);
  const result = `${head.trim()} … ${tail.trim()}`;
  return result.length <= limit ? result : wordBoundedHead(result, limit);
}

function wordBoundedHead(text: string, limit: number): string {
  const slice = text.slice(0, Math.max(1, limit)).trimEnd();
  const boundary = slice.lastIndexOf(' ');
  return boundary > Math.floor(limit * .65) ? slice.slice(0, boundary) : slice;
}

function wordBoundedTail(text: string, limit: number): string {
  const slice = text.slice(-Math.max(1, limit)).trimStart();
  const boundary = slice.indexOf(' ');
  return boundary >= 0 && boundary < Math.floor(limit * .35) ? slice.slice(boundary + 1) : slice;
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
