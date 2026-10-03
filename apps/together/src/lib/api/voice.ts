import { supabase, supabasePublishableKey, supabaseUrl } from '../supabase';
import type { CompanionVoicePreset } from '@together/domain/src/voice-presets';
import type { ChatLanguagePreference } from '@together/domain/src/chat-language';
import type { GeneratedMedia, VoiceCallSession } from '../../types';
import type { RealtimeVoiceConfiguration } from '../realtimeVoice';
import { clearSessionForApiFailure } from '../authSession';
import { ApiError, deviceTimezone, type Envelope, invoke, token } from './transport';
import { manageMultimodal } from './multimodal';
export type VoiceNoteQuote = {
  creditCost: number;
  creditBalance: number;
  canAfford: boolean;
  generationRequired: boolean;
  characterCount: number;
  shortened: boolean;
};
export const quoteVoiceNote = (messageId: string) =>
  manageMultimodal<VoiceNoteQuote>({ action: 'voice_note_quote', messageId });
export const requestVoiceNote = (messageId: string, requestId: string) =>
  manageMultimodal<{
    status?: string;
    providerStatus?: string;
    message?: string;
    media?: GeneratedMedia;
  }>({ action: 'request_voice_note', messageId, requestId });
export const previewCompanionVoice = (input: {
  conversationId: string;
  voicePreset: CompanionVoicePreset | null;
  chatLanguage: ChatLanguagePreference;
  requestId: string;
}) =>
  manageMultimodal<{
    preview: {
      signedUrl: string;
      durationMs: number;
      contentType: string;
      voicePreset: CompanionVoicePreset | null;
      cached: boolean;
    };
  }>({ action: 'preview_voice', ...input });
export const refreshVoiceNote = (mediaId: string) =>
  manageMultimodal<{
    media: GeneratedMedia;
  }>({ action: 'media_status', mediaId });
export async function transcribeChatAudio(input: {
  conversationId: string;
  characterInstanceId: string;
  uri: string;
  durationMs: number;
  contentType: string;
  fileName: string;
}): Promise<{
  text: string;
  provider: string;
  model: string;
}> {
  const source = await fetch(input.uri);
  if (!source.ok) {
    throw new ApiError('That recording could not be opened.', 'VALIDATION_FAILED');
  }
  const recorded = await source.blob();
  if (!recorded.size) {
    throw new ApiError('Speak for a moment before stopping.', 'VALIDATION_FAILED');
  }
  if (recorded.size > 8 * 1024 * 1024) {
    throw new ApiError('Keep voice-to-text recordings under one minute.', 'VALIDATION_FAILED');
  }
  const audio = recorded.type === input.contentType
    ? recorded
    : new Blob([recorded], { type: input.contentType });
  const form = new FormData();
  form.append('audio', audio, input.fileName);
  form.append('conversationId', input.conversationId);
  form.append('characterInstanceId', input.characterInstanceId);
  form.append('durationMs', String(Math.max(0, Math.min(60000, Math.round(input.durationMs)))));
  const response = await fetch(
    `${supabaseUrl}/functions/v1/together-multimodal?action=transcribe_audio`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await token()}`,
        apikey: supabasePublishableKey,
        'x-kivelle-timezone': deviceTimezone(),
      },
      body: form,
    },
  );
  const payload = await response.json().catch(() => ({})) as
    & Envelope<{
      text: string;
      provider: string;
      model: string;
    }>
    & {
      error?: {
        message?: string;
        code?: string;
        retryable?: boolean;
      };
    };
  if (!response.ok) {
    await clearSessionForApiFailure(supabase.auth, response.status, payload.error?.code);
    throw new ApiError(
      payload.error?.message ?? 'That recording could not be transcribed.',
      payload.error?.code,
      payload.error?.retryable,
    );
  }
  return payload.data;
}
export type VoiceCallBilling = {
  route: 'standard' | 'express';
  creditsPerMinute: number;
  creditBalance: number;
  chargedMinutes: number;
  remainingMinutes: number;
  includedMinutes: number;
  includedMinutesUsed: number;
  includedMinutesRemaining: number;
};
export type VoiceRouteOption = {
  route: 'standard' | 'express';
  displayName: string;
  description: string;
  creditsPerMinute: number;
  includedMinutes: number;
  available: boolean;
  unavailableReason?: string;
  billing: VoiceCallBilling;
};
export type ManageCallResult = {
  call?: VoiceCallSession;
  status?: string;
  providerStatus?: string;
  message?: string;
  clientSecret?: string;
  expiresAt?: string;
  clientConfiguration?: RealtimeVoiceConfiguration;
  billing?: VoiceCallBilling;
  routes?: VoiceRouteOption[];
  reconciliation?: {
    messageCount: number;
    reconciled: boolean;
  };
};
export const manageCall = <T = ManageCallResult>(input: Record<string, unknown>) =>
  invoke<T>('together-call', input);
