import { batchReplyText } from '../replyStreaming';
import type { DialogueContextQuote } from '@together/domain/src/chat-context';
import { supabase, supabasePublishableKey, supabaseUrl } from '../supabase';
import { Platform } from 'react-native';
import { nativePlatformHeaders } from './clientPlatform';
import {
  MESSAGE_CHARACTER_LIMIT,
  messageCharacterLimitError,
} from '@together/domain/src/message-limits';
import {
  classifyPhotoIntent,
  type OneTapSelfieMessagePresentation,
} from '@together/domain/src/media';
import type {
  AutoDialoguePreference,
  AutoDialogueSuggestion,
  GeneratedMedia,
  MediaOffer,
  Message,
  SnapshotDelta,
} from '../../types';
import { withIdempotentRetry } from '../requestRetry';
import { clearSessionForApiFailure } from '../authSession';
import { ensureWebAdultSession } from '../webAdultSession';
import { drainJsonSseEvents } from '../sse';
import { scheduleForegroundTimeout } from '../webPageLifecycle';
import { ApiError, type Envelope, invoke, token } from './transport';
import { queueClientPerformance } from './telemetry';
export async function quoteDialogueContext(
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<DialogueContextQuote> {
  await ensureWebAdultSession(await token()).catch(() => undefined);
  return invoke<DialogueContextQuote>('together-dialogue-quote', input, 'POST', { signal });
}
export async function rewriteDialogueMessage(group: boolean, input: {
  conversationId: string;
  characterInstanceId?: string;
  anchorMessageId: string;
  expectedRevision: number;
  messageAction: 'spice' | 'restore';
  clientRequestId: string;
  contextQuoteId?: string;
  contextCostAuthorization?: string;
  contextPreference?: 'included';
}): Promise<{
  message: Message;
}> {
  await ensureWebAdultSession(await token()).catch(() => undefined);
  return withIdempotentRetry(() =>
    invoke<{
      message: Message;
    }>(group ? 'together-group-dialogue' : 'together-dialogue', input), {
    attempts: 2,
    delayMs: 600,
  });
}
export async function sendDialogue(
  input: {
    contextQuoteId?: string;
    contextCostAuthorization?: string;
    contextPreference?: 'included';
    conversationId: string;
    characterInstanceId: string;
    message: string;
    attachmentIds?: string[];
    clientRequestId: string;
    focusPlanId?: string;
    sceneActionId?: string;
    messageAction?: 'continue' | 'respond_to_declined_photo';
    anchorMessageId?: string;
    messagePresentation?: OneTapSelfieMessagePresentation;
    autoDialogueSuggestionId?: string;
    autoDialogueSuggestionSource?: AutoDialogueSuggestion['source'];
    autoDialogueSuggestionEdited?: boolean;
    autoDialogueSuggestionIntent?: AutoDialogueSuggestion['intent'];
    autoDialogueSuggestionPreference?: AutoDialoguePreference;
    entryContext?: {
      entryReason: 'user_drop_in';
      locationId: string;
      scheduleEventId?: string;
    };
  },
  onToken: (token: string) => void,
  callbacks?: {
    onPrimary?: (message: Message, hasAdditional: boolean) => void;
    onMessage?: (message: Message) => void;
  },
): Promise<{
  message: Message;
  additionalMessages?: Message[];
  generatedMedia?: GeneratedMedia;
  mediaOffer?: MediaOffer;
  photoRequestError?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  delta?: SnapshotDelta;
}> {
  if (input.message.length > MESSAGE_CHARACTER_LIMIT) {
    throw new ApiError(messageCharacterLimitError(), 'VALIDATION_FAILED');
  }
  const tokens = batchReplyText(onToken);
  let primary: Message | undefined;
  const receivedAdditional: Message[] = [];
  const started = Date.now();
  let firstTokenRecorded = false,
    statusCode: number | undefined,
    cancelResponseTimeout: (() => void) | undefined,
    responseTimedOut = false,
    photoRequest = false;
  try {
    const accessToken = await token();
    const photoIntent = classifyPhotoIntent(input.message);
    photoRequest = photoIntent.requested;
    const explicitWebsitePhoto = Platform.OS === 'web' && photoIntent.requested &&
      photoIntent.requestedContentLevel === 'explicit';
    let adultSession;
    try {
      adultSession = await ensureWebAdultSession(accessToken, { force: explicitWebsitePhoto });
    } catch {
      if (explicitWebsitePhoto) {
        throw new ApiError(
          'Your private website session could not be prepared. Tap to retry.',
          'WEBSITE_SESSION_PREPARATION_FAILED',
          true,
        );
      }
    }
    if (explicitWebsitePhoto && adultSession?.authorized !== true) {
      const message = adultSession?.adultEligible === false
        ? 'Confirm your adult birthdate in Account settings before requesting explicit photos.'
        : adultSession?.premiumAccess === false
        ? 'An active Kivelle+ or Max membership is required for explicit photos.'
        : adultSession?.available === false
        ? 'Explicit photo generation is temporarily unavailable.'
        : 'Your private website session could not be verified. Refresh and try again.';
      throw new ApiError(
        message,
        'ADULT_MEDIA_SESSION_REQUIRED',
        adultSession?.available !== false,
      );
    }
    const responseController = new AbortController();
    cancelResponseTimeout = scheduleForegroundTimeout(() => {
      responseTimedOut = true;
      responseController.abort();
    }, photoRequest ? 18000 : 120000);
    const response = await fetch(`${supabaseUrl}/functions/v1/together-dialogue`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabasePublishableKey,
        'Content-Type': 'application/json',
        'x-correlation-id': input.clientRequestId,
        ...nativePlatformHeaders(),
      },
      body: JSON.stringify({ ...input, streamProtocol: 2 }),
      signal: responseController.signal,
    });
    statusCode = response.status;
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      await clearSessionForApiFailure(supabase.auth, response.status, error.error?.code);
      throw new ApiError(
        error.error?.message ?? 'Your companion could not reply.',
        error.error?.code,
        error.error?.retryable,
      );
    }
    if (!response.body) {
      throw new ApiError('The response stream ended early.', 'STREAM_INTERRUPTED', true);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let final: Message | null = null;
    let additionalMessages: Message[] | undefined;
    let generatedMedia: GeneratedMedia | undefined;
    let mediaOffer: MediaOffer | undefined;
    let photoRequestError: {
      code: string;
      message: string;
      retryable: boolean;
    } | undefined;
    let delta: SnapshotDelta | undefined;
    type DialogueStreamEvent = {
      type: string;
      hasAdditional?: boolean;
      token?: string;
      message?: Message;
      additionalMessages?: Message[];
      generatedMedia?: GeneratedMedia;
      mediaOffer?: MediaOffer;
      photoRequestError?: {
        code: string;
        message: string;
        retryable: boolean;
      };
      delta?: SnapshotDelta;
      error?: {
        message?: string;
        code?: string;
        retryable?: boolean;
      };
    };
    const processEvents = (events: DialogueStreamEvent[]) => {
      for (const data of events) {
        if (data.type === 'token' && typeof data.token === 'string') {
          if (!firstTokenRecorded) {
            firstTokenRecorded = true;
            queueClientPerformance({
              surface: 'together-dialogue',
              operation: 'first_token',
              durationMs: Date.now() - started,
              success: true,
              metadata: { stream: true, correlationId: input.clientRequestId },
            });
          }
          tokens.push(data.token);
        }
        if (data.type === 'primary_completed' && data.message && !primary) {
          tokens.flush();
          primary = data.message;
          final = data.message;
          callbacks?.onPrimary?.(data.message, Boolean(data.hasAdditional));
          queueClientPerformance({
            surface: 'together-dialogue',
            operation: 'primary_complete',
            durationMs: Date.now() - started,
            success: true,
            metadata: { correlationId: input.clientRequestId },
          });
        }
        if (
          data.type === 'message_completed' && data.message &&
          !receivedAdditional.some((message) => message.id === data.message!.id)
        ) {
          receivedAdditional.push(data.message);
          callbacks?.onMessage?.(data.message);
        }
        if (data.type === 'done' && data.message) {
          tokens.flush();
          final = data.message;
          additionalMessages = data.additionalMessages;
          generatedMedia = data.generatedMedia;
          mediaOffer = data.mediaOffer;
          photoRequestError = data.photoRequestError;
          delta = data.delta;
        }
        if (data.type === 'error') {
          throw new ApiError(
            data.error?.message ?? 'Your companion could not finish the reply.',
            data.error?.code ?? 'STREAM_INTERRUPTED',
            Boolean(data.error?.retryable),
          );
        }
      }
    };
    const drain = (flush = false) => {
      const drained = drainJsonSseEvents<DialogueStreamEvent>(buffer, flush);
      buffer = drained.remainder;
      processEvents(drained.events);
    };
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      drain();
    }
    buffer += decoder.decode();
    drain(true);
    if (!final) {
      throw new ApiError('The reply was interrupted. Try again.', 'STREAM_INTERRUPTED', true);
    }
    queueClientPerformance({
      surface: 'together-dialogue',
      operation: 'stream_complete',
      durationMs: Date.now() - started,
      success: true,
      metadata: { firstToken: firstTokenRecorded, correlationId: input.clientRequestId },
    });
    return {
      message: final,
      ...(additionalMessages?.length ? { additionalMessages } : {}),
      ...(generatedMedia ? { generatedMedia } : {}),
      ...(mediaOffer ? { mediaOffer } : {}),
      ...(photoRequestError ? { photoRequestError } : {}),
      ...(delta ? { delta } : {}),
    };
  } catch (caught) {
    if (primary) {
      return { message: primary, additionalMessages: receivedAdditional };
    }
    const failure = responseTimedOut
      ? new ApiError(
        photoRequest
          ? 'The photo request took too long to confirm. Recovering it now…'
          : 'The reply took too long. Please try again.',
        'PROVIDER_TIMEOUT',
        true,
      )
      : caught;
    queueClientPerformance({
      surface: 'together-dialogue',
      operation: 'stream_complete',
      durationMs: Date.now() - started,
      success: false,
      ...(statusCode ? { statusCode } : {}),
      metadata: { firstToken: firstTokenRecorded, correlationId: input.clientRequestId },
    });
    throw failure;
  } finally {
    tokens.dispose();
    cancelResponseTimeout?.();
  }
}
export async function suggestDialogue(input: {
  conversationId: string;
  characterInstanceId: string;
  anchorMessageId: string;
  clientRequestId: string;
  preference?: AutoDialoguePreference;
}, signal?: AbortSignal): Promise<AutoDialogueSuggestion> {
  const response = await fetch(`${supabaseUrl}/functions/v1/together-dialogue-suggestion`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await token()}`,
      apikey: supabasePublishableKey,
      'Content-Type': 'application/json',
      ...nativePlatformHeaders(),
    },
    body: JSON.stringify(input),
    signal,
  });
  const payload = await response.json().catch(() => ({})) as Envelope<AutoDialogueSuggestion> & {
    error?: {
      message?: string;
      code?: string;
      retryable?: boolean;
    };
  };
  if (!response.ok) {
    await clearSessionForApiFailure(supabase.auth, response.status, payload.error?.code);
    throw new ApiError(
      payload.error?.message ?? 'A reply suggestion could not be generated.',
      payload.error?.code,
      payload.error?.retryable,
    );
  }
  return payload.data;
}
export async function sendSceneReaction(
  input: {
    conversationId: string;
    characterInstanceId: string;
    sceneActionId: string;
    clientRequestId: string;
  },
  onToken: (token: string) => void,
  onRetry?: () => void,
): Promise<{
  message: Message;
}> {
  return withIdempotentRetry(async () => {
    const response = await fetch(`${supabaseUrl}/functions/v1/together-scene-reaction`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await token()}`,
        apikey: supabasePublishableKey,
        'Content-Type': 'application/json',
        ...nativePlatformHeaders(),
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as {
        error?: {
          message?: string;
          code?: string;
          retryable?: boolean;
        };
      };
      await clearSessionForApiFailure(supabase.auth, response.status, error.error?.code);
      throw new ApiError(
        error.error?.message ?? 'Your companion could not react to that right now.',
        error.error?.code,
        error.error?.retryable ??
          (response.status === 408 || response.status === 429 || response.status >= 500),
      );
    }
    if (!response.body) {
      throw new ApiError('The reaction stream ended early.', 'STREAM_INTERRUPTED', true);
    }
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = '', final: Message | null = null;
    type ReactionStreamEvent = {
      type: string;
      token?: string;
      message?: Message;
      error?: {
        message?: string;
        code?: string;
        retryable?: boolean;
      };
    };
    const process = (events: ReactionStreamEvent[]) => {
      for (const data of events) {
        if (data.type === 'token' && typeof data.token === 'string') {
          onToken(data.token);
        }
        if (data.type === 'done' && data.message) {
          final = data.message;
        }
        if (data.type === 'error') {
          throw new ApiError(
            data.error?.message ?? 'Your companion could not finish that reaction.',
            data.error?.code ?? 'STREAM_INTERRUPTED',
            Boolean(data.error?.retryable),
          );
        }
      }
    };
    const drain = (flush = false) => {
      const drained = drainJsonSseEvents<ReactionStreamEvent>(buffer, flush);
      buffer = drained.remainder;
      process(drained.events);
    };
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      drain();
    }
    buffer += decoder.decode();
    drain(true);
    if (!final) {
      throw new ApiError('The reaction was interrupted. Try again.', 'STREAM_INTERRUPTED', true);
    }
    return { message: final };
  }, { attempts: 2, delayMs: 220, onRetry: () => onRetry?.() });
}
