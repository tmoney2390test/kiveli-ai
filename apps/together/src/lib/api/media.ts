import { rememberVideoCatalog } from '../videoCatalog';
import { Platform } from 'react-native';
import type {
  ConversationAttachment,
  GeneratedMedia,
  MediaOffer,
  VideoDiagnostics,
  VideoResolution,
  VideoRouteOption,
} from '../../types';
import { normalizeVideoGenerationOptions, videoOptionsForPlatform } from '../videoGeneration';
import { runMediaRequest } from '../mediaRequestTransport';
import { ApiError, invoke } from './transport';
export const manageMedia = async <T>(input: Record<string, unknown>) => {
  // WebAdultSessionBridge establishes the website cookie at session start and
  // explicit dialogue refreshes it before creating an adult offer. Media
  // actions go directly to the authoritative endpoint so Accept/Decline never
  // wait on a redundant session-status round trip.
  return runMediaRequest(
    input,
    (signal) => invoke<T>('together-media', input, 'POST', { signal }),
    (message) => new ApiError(message, 'REQUEST_TIMEOUT', true),
  );
};
export const loadMediaLibrary = (options: {
  ids?: string[];
  characterInstanceId?: string;
  before?: string;
  limit?: number;
} = {}) =>
  manageMedia<{
    media: GeneratedMedia[];
    hasMore: boolean;
    nextBefore: string | null;
  }>({ action: 'list_library', ...options });
export const loadConversationMediaGallery = (conversationId: string, limit = 120) =>
  manageMedia<{
    media: GeneratedMedia[];
    attachments: ConversationAttachment[];
    hasMore: boolean;
  }>({ action: 'list_conversation_gallery', conversationId, limit });
export const loadPhotoOfferStatus = (offerId: string) =>
  manageMedia<{
    offer: MediaOffer;
    media: GeneratedMedia | null;
  }>({ action: 'offer_status', offerId });
export const rateGeneratedMedia = (mediaId: string, feedback: 'positive' | 'negative') =>
  manageMedia<{
    mediaId: string;
    userFeedback: 'positive' | 'negative';
    userFeedbackAt: string;
  }>({ action: 'feedback', mediaId, feedback });
export const getVideoGenerationOptions = async (sourceMediaId: string) =>
  rememberVideoCatalog(
    videoOptionsForPlatform(
      normalizeVideoGenerationOptions(
        await manageMedia<unknown>({ action: 'video_options', sourceMediaId }),
      ),
      Platform.OS,
    ),
  );
export const getDirectVideoGenerationOptions = async (characterInstanceId: string) =>
  rememberVideoCatalog(
    videoOptionsForPlatform(
      normalizeVideoGenerationOptions(
        await manageMedia<unknown>({ action: 'video_direct_options', characterInstanceId }),
      ),
      Platform.OS,
    ),
  );
export const trackVideoSelectorEvent = (
  sourceMediaId: string,
  event: 'option_sheet_opened' | 'model_selected',
  videoRouteId?: string,
) =>
  manageMedia<{
    recorded: boolean;
  }>({ action: 'video_event', sourceMediaId, event, videoRouteId });
export type VideoRequestSettings = {
  model: string;
  sound: boolean;
  resolution: VideoResolution;
  duration: number;
  expectedCredits?: number;
};
export const animateMedia = (
  sourceMediaId: string,
  settings: VideoRequestSettings,
  prompt: string,
  requestId: string,
) =>
  manageMedia<{
    media: GeneratedMedia;
    creditCost: number;
    creditBalance: number;
    route: VideoRouteOption;
  }>({ action: 'animate', sourceMediaId, settings, prompt, requestId });
export const createDirectVideo = (input: {
  characterInstanceId: string;
  conversationId?: string;
  settings: VideoRequestSettings;
  aspectRatio: '9:16' | '16:9';
  locationSource: 'current' | 'home' | 'place';
  locationId?: string;
  requestText: string;
  requestId: string;
}) =>
  manageMedia<{
    media: GeneratedMedia;
    creditCost: number;
    creditBalance: number;
    route: VideoRouteOption;
  }>({ action: 'video_direct_generate', ...input });
export type VideoPromptEnhancementRequest = {
  sourceMode: 'existing_photo' | 'generated_first_frame';
  sourceMediaId?: string;
  characterInstanceId?: string;
  conversationId?: string;
  routeId: string;
  settings: VideoRequestSettings;
  aspectRatio: '9:16' | '16:9';
  locationSource: 'current' | 'home' | 'place';
  locationId?: string;
  prompt: string;
  requestId: string;
};
export const enhanceVideoPrompt = (input: VideoPromptEnhancementRequest) =>
  manageMedia<{
    prompt: string;
    version: string;
    originalLength: number;
    enhancedLength: number;
  }>({ action: 'enhance_video_prompt', ...input });
export const submitVideoFeedback = (
  mediaId: string,
  verdict: 'looks_good' | 'needs_work',
  reasonCodes: string[] = [],
  otherText?: string,
) =>
  manageMedia<{
    feedback: Record<string, unknown>;
  }>({ action: 'video_feedback', mediaId, verdict, reasonCodes, otherText });
export const recordVideoPlayback = (mediaId: string) =>
  manageMedia<{
    recorded: boolean;
  }>({ action: 'video_playback', mediaId });
export const getVideoDiagnostics = (mediaId: string) =>
  manageMedia<{
    diagnostics: VideoDiagnostics;
  }>({ action: 'video_diagnostics', mediaId });
export const editGeneratedMedia = (mediaId: string, requestId: string, instruction: string) =>
  manageMedia<{
    media: GeneratedMedia;
    creditCost: number;
    creditBalance?: {
      permanentBalance: number;
      subscriptionBalance: number;
      total: number;
    };
  }>({ action: 'edit', mediaId, requestId, instruction });
