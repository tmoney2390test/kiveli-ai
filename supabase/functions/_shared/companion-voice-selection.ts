import type { SupabaseClient } from '@supabase/supabase-js';
import {
  companionVoiceGenderFromSignals,
  companionVoicePresetAllowed,
  normalizeCompanionVoicePreset,
  type CompanionVoicePreset,
} from '../../../packages/together-domain/src/voice-presets.ts';
import type { CompanionVoiceProfile } from '../../../packages/together-domain/src/multimodal.ts';
import { AppError } from './types.ts';

// Product-level presets stay provider-neutral in conversation metadata. This
// is the single provider mapping seam for xAI today and future TTS fallbacks.
const providerMappings: Record<CompanionVoicePreset, Record<string, string>> = {
  warm: { xai: 'ara' },
  bright: { xai: 'eve' },
  clear: { xai: 'rex' },
  strong: { xai: 'leo' },
  balanced: { xai: 'sal' },
};

export function chatVoicePreset(metadata: unknown): CompanionVoicePreset | null {
  const root = record(metadata);
  const preferences = record(root.chatPreferences);
  return normalizeCompanionVoicePreset(preferences.voicePreset);
}

export function applyCompanionVoicePreset(
  voice: CompanionVoiceProfile,
  preset: CompanionVoicePreset | null | undefined,
): CompanionVoiceProfile {
  if (!preset) return voice;
  return {
    ...voice,
    providerMappings: { ...(voice.providerMappings ?? {}), ...providerMappings[preset] },
  };
}

export async function validateCompanionVoicePreset(
  db: SupabaseClient,
  characterInstanceId: string,
  value: unknown,
): Promise<CompanionVoicePreset | null> {
  if (value == null) return null;
  const preset = normalizeCompanionVoicePreset(value);
  if (!preset) throw new AppError('VALIDATION_ERROR', 'Choose an available companion voice.', 400);
  const { data: instance, error } = await db.from('together_character_instances').select(
    'together_character_templates(discovery_metadata,biography),together_character_versions(pronouns,appearance_config,visual_identity)',
  ).eq('id', characterInstanceId).maybeSingle();
  if (error || !instance) throw new AppError('NOT_FOUND', 'That companion is unavailable.', 404);
  const template = relation(instance.together_character_templates);
  const version = relation(instance.together_character_versions);
  const gender = companionVoiceGenderFromSignals(
    record(template?.discovery_metadata).gender,
    version?.pronouns,
    record(version?.visual_identity).gender,
    version?.appearance_config,
    version?.visual_identity,
    template?.biography,
  );
  if (!companionVoicePresetAllowed(preset, gender)) {
    throw new AppError('VALIDATION_ERROR', 'That voice does not match this companion’s voice profile.', 400);
  }
  return preset;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function relation(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : null;
}
