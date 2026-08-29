import type { CompanionVoiceProfile } from './multimodal.ts';

export const XAI_BUILT_IN_VOICES = ['eve', 'ara', 'sal', 'leo', 'rex'] as const;

const retiredSeedVoices = new Set([
  'carina',
  'luna',
  'iris',
  'celeste',
  'aurora',
  'liora',
  'sirius',
  'lumen',
  'ursa',
]);

/**
 * Resolves a stable xAI voice without provider or database access.
 *
 * Explicit built-ins and custom provider IDs are preserved. Only retired
 * pre-release IDs fall back to the deterministic characteristic-based map.
 * Keeping this pure allows production catalog audits to prove that repeated
 * resolutions cannot silently change a companion's voice.
 */
export function resolveXaiVoiceId(voice: CompanionVoiceProfile): string {
  const explicit = voice.providerMappings?.['xai']?.trim();
  if (explicit) {
    const normalized = explicit.toLowerCase();
    if ((XAI_BUILT_IN_VOICES as readonly string[]).includes(normalized)) return normalized;
    if (!retiredSeedVoices.has(normalized)) return explicit;
  }
  const warmth = unit(voice.characteristics.warmth, .6);
  const energy = unit(voice.characteristics.energy, .55);
  const softness = unit(voice.characteristics.softness, .45);
  const expressiveness = unit(voice.characteristics.expressiveness, .55);
  const preferred = softness >= .72 || warmth >= .82
    ? ['eve', 'ara', 'sal']
    : energy >= .72 || expressiveness >= .72
    ? ['ara', 'eve', 'sal']
    : ['sal', 'eve', 'ara'];
  return preferred[stableHash(voice.voiceKey) % preferred.length] ??
    XAI_BUILT_IN_VOICES[stableHash(voice.characterTemplateId) % XAI_BUILT_IN_VOICES.length] ??
    'eve';
}

export function isBuiltInXaiVoice(value: string): boolean {
  return (XAI_BUILT_IN_VOICES as readonly string[]).includes(value.trim().toLowerCase());
}

function unit(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
