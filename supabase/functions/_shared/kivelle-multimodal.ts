import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deriveCompanionVoiceProfile,
  resolveExperienceCapabilities,
  type CapabilityStatus,
  type CompanionVoiceProfile,
  type KivelleExperienceCapabilities,
  type KivelleProviderCapability,
  type MultimodalPreferences,
} from '../../../packages/together-domain/src/multimodal.ts';
import { configuredImageProvider } from './together-media-base.ts';
import { configuredMediaRegistry } from './together-media-providers.ts';
// Keep provider adapters in the remote Edge bundle. The Supabase deploy graph
// does not currently retain these transitive sibling imports when capabilities
// are reached through together-media-providers alone.
import './wavespeed.ts';
import './venice.ts';

export type VisionInput = {
  bytes: Uint8Array;
  contentType: string;
  userCaption?: string;
};
export type VisionResult = {
  shortDescription: string;
  notableDetails: string[];
  visibleText?: string;
  safetyCategories: string[];
  confidence: number;
};
export interface VisionProvider {
  readonly id: string;
  analyze(input: VisionInput): Promise<VisionResult>;
}

export type SpeechInput = {
  text: string;
  voice: CompanionVoiceProfile;
  outputFormat?: 'wav' | 'mp3';
};
export type SpeechResult = {
  bytes: Uint8Array;
  contentType: string;
  durationMs: number;
  model: string;
  providerRequestId?: string;
};
export interface TextToSpeechProvider {
  readonly id: string;
  synthesize(input: SpeechInput): Promise<SpeechResult>;
}

export type RealtimeVoiceInput = {
  callSessionId: string;
  voice: CompanionVoiceProfile;
  context: Record<string, unknown>;
};
export type RealtimeVoiceSession = {
  providerSessionId: string;
  clientSecret: string;
  expiresAt: string;
  providerMetadata?: Record<string, unknown>;
};
export interface RealtimeVoiceProvider {
  readonly id: string;
  createSession(input: RealtimeVoiceInput): Promise<RealtimeVoiceSession>;
  endSession(providerSessionId: string): Promise<void>;
}

class DeterministicVisionProvider implements VisionProvider {
  readonly id = 'deterministic_test';
  async analyze(input: VisionInput): Promise<VisionResult> {
    return {
      shortDescription: input.userCaption
        ? `An image shared with the caption: ${input.userCaption.slice(0, 120)}`
        : 'A user-shared image.',
      notableDetails: [],
      safetyCategories: [],
      confidence: .75,
    };
  }
}

class DeterministicTextToSpeechProvider implements TextToSpeechProvider {
  readonly id = 'deterministic_test';
  async synthesize(input: SpeechInput): Promise<SpeechResult> {
    const durationMs = Math.max(500, Math.min(12_000, Math.round(input.text.split(/\s+/).length * 360)));
    return { bytes: silentWav(durationMs), contentType: 'audio/wav', durationMs, model: 'deterministic-silence-v1' };
  }
}

class DeterministicRealtimeVoiceProvider implements RealtimeVoiceProvider {
  readonly id = 'deterministic_test';
  async createSession(input: RealtimeVoiceInput): Promise<RealtimeVoiceSession> {
    return {
      providerSessionId: `test-${input.callSessionId}`,
      clientSecret: `test-only-${input.callSessionId}`,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      providerMetadata: { deterministic: true },
    };
  }
  async endSession(): Promise<void> {}
}

function explicitProvider(name: string): string {
  return (Deno.env.get(name) ?? '').trim().toLowerCase();
}

function testProvidersEnabled(): boolean {
  return Deno.env.get('KIVELLE_ENABLE_TEST_PROVIDERS') === 'true';
}

export function configuredVisionProvider(): VisionProvider | null {
  const selected = explicitProvider('KIVELLE_VISION_PROVIDER');
  if (selected === 'deterministic_test' && testProvidersEnabled()) return new DeterministicVisionProvider();
  return null;
}

export function configuredTextToSpeechProvider(): TextToSpeechProvider | null {
  const selected = explicitProvider('KIVELLE_TTS_PROVIDER');
  if (selected === 'deterministic_test' && testProvidersEnabled()) return new DeterministicTextToSpeechProvider();
  return null;
}

export function configuredRealtimeVoiceProvider(): RealtimeVoiceProvider | null {
  const selected = explicitProvider('KIVELLE_REALTIME_VOICE_PROVIDER');
  if (selected === 'deterministic_test' && testProvidersEnabled()) return new DeterministicRealtimeVoiceProvider();
  return null;
}

export function providerCapabilityStatuses(): Record<KivelleProviderCapability, CapabilityStatus> {
  const mediaRoutes=configuredMediaRegistry();
  return {
    vision: configuredVisionProvider() ? 'available' : 'not_configured',
    text_to_speech: configuredTextToSpeechProvider() ? 'available' : 'not_configured',
    speech_to_text: 'not_configured',
    realtime_voice: configuredRealtimeVoiceProvider() ? 'available' : 'not_configured',
    image_generation: mediaRoutes.some((route)=>route.enabled&&route.mediaTypes.includes('image')) ? 'available' : 'not_configured',
    image_editing: mediaRoutes.some((route)=>route.enabled&&route.mediaTypes.includes('image')&&route.supportsImageEditing) ? 'available' : 'not_configured',
    video_generation: mediaRoutes.some((route)=>route.enabled&&route.mediaTypes.includes('video')) ? 'available' : 'not_configured',
  };
}

export function resolveServerExperienceCapabilities(preferences?: Partial<MultimodalPreferences>,entitlementKeys?:string[]): {
  experience: KivelleExperienceCapabilities;
  providers: Record<KivelleProviderCapability, CapabilityStatus>;
} {
  const providers = providerCapabilityStatuses();
  const entitlements=new Set(entitlementKeys??[]),enforceEntitlements=Array.isArray(entitlementKeys);
  const entitled=(...keys:string[])=>!enforceEntitlements||keys.some((key)=>entitlements.has(key));
  return { providers, experience: resolveExperienceCapabilities({ providerStatuses: providers, preferences,product:{
    userImageUploads:true,
    visionUnderstanding:true,
    voiceNotes:entitled('voice_notes'),
    liveVoiceCalls:entitled('voice_priority'),
    // Contextual photos already use the centralized Credits ledger for access;
    // the legacy contextual_images key must not become a second paywall.
    contextualSelfies:true,
    contextualVideos:true,
    multiCharacterScenes:entitled('group_interactions','social_scenes_enhanced'),
  } }) };
}

export async function resolveCompanionVoiceProfile(
  db: SupabaseClient,
  characterInstanceId: string,
): Promise<CompanionVoiceProfile> {
  const { data: instance } = await db.from('together_character_instances').select('character_template_id,character_version_id').eq('id', characterInstanceId).single();
  const templateId = String(instance?.character_template_id ?? '');
  const { data: profile } = await db.from('together_character_voice_profiles').select('*').eq('character_template_id', templateId).eq('active', true).maybeSingle();
  if (profile) {
    return {
      characterTemplateId: templateId,
      voiceKey: String(profile.voice_key),
      characteristics: (profile.characteristics ?? {}) as CompanionVoiceProfile['characteristics'],
      providerMappings: (profile.provider_mappings ?? {}) as Record<string, string>,
    };
  }
  const { data: version } = await db.from('together_character_versions').select('personality_config,communication_style').eq('id', String(instance?.character_version_id ?? '')).maybeSingle();
  return deriveCompanionVoiceProfile({ characterTemplateId: templateId, personality: (version?.personality_config ?? {}) as Record<string, unknown>, communicationStyle: (version?.communication_style ?? {}) as Record<string, unknown> });
}

export function normalizeMultimodalPreferences(value: unknown): MultimodalPreferences {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    userPhotoUploads: raw.userPhotoUploads !== false,
    generatedPhotos: raw.generatedPhotos !== false,
    companionVoiceNotes: raw.companionVoiceNotes !== false,
    autoplayVoiceNotes: raw.autoplayVoiceNotes === true,
    liveVoiceCalls: raw.liveVoiceCalls !== false,
    generatedVideos: raw.generatedVideos !== false,
  };
}

function silentWav(durationMs: number): Uint8Array {
  const sampleRate = 8_000;
  const sampleCount = Math.max(1, Math.round(sampleRate * durationMs / 1000));
  const byteLength = 44 + sampleCount * 2;
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, byteLength - 8, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, sampleCount * 2, true);
  return new Uint8Array(buffer);
}
