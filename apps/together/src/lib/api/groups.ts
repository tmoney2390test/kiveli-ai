import { type ReplyDelta } from '../replyStreaming';
import { supabase, supabasePublishableKey, supabaseUrl } from '../supabase';
import {
  MESSAGE_CHARACTER_LIMIT,
  messageCharacterLimitError,
} from '@together/domain/src/message-limits';
import type { GroupDetail, MediaOffer, Message, MessageReaction } from '../../types';
import { clearSessionForApiFailure } from '../authSession';
import { ensureWebAdultSession } from '../webAdultSession';
import { drainJsonSseEvents } from '../sse';
import { scheduleForegroundTimeout } from '../webPageLifecycle';
import { ApiError, invoke, token } from './transport';
import { queueClientPerformance } from './telemetry';
import { nativePlatformHeaders } from './clientPlatform';
export const manageGroup = async <T = GroupDetail>(input: Record<string, unknown>) => {
  await ensureWebAdultSession(await token()).catch(() => undefined);
  return invoke<T>('together-group', input);
};
export async function loadGroupDetail(conversationId: string, options: {
  messageLimit?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
} = {}): Promise<GroupDetail> {
  const controller = new AbortController(), timeoutMs = options.timeoutMs ?? 12000;
  let timedOut = false;
  const abort = () => controller.abort();
  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener('abort', abort, { once: true });
  }
  const cancelTimeout = scheduleForegroundTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    await ensureWebAdultSession(await token()).catch(() => undefined);
    return await invoke<GroupDetail>(
      'together-group',
      { action: 'detail', conversationId, messageLimit: options.messageLimit ?? 30 },
      'POST',
      { signal: controller.signal },
    );
  } catch (caught) {
    if (timedOut) {
      throw new ApiError(
        'This group is taking longer than expected. Try opening it again.',
        'REQUEST_TIMEOUT',
        true,
      );
    }
    throw caught;
  } finally {
    cancelTimeout();
    options.signal?.removeEventListener('abort', abort);
  }
}
export type GroupDialogueEvent = ReplyDelta | {
  type: 'primary_completed';
  turnId: string;
  clientRequestId: string;
  message: Message;
} | {
  type: 'turn_completed';
  turnId: string;
} | {
  type: 'turn_started';
  turnId: string;
  sourceMessage?: Message;
  actions?: number;
  replayed?: boolean;
} | {
  type: 'speaker_typing';
  characterInstanceId: string;
  speakerName: string;
} | {
  type: 'message_started';
  characterInstanceId: string;
  speakerName: string;
} | {
  type: 'message_completed';
  message: Message;
} | {
  type: 'media_offer_created';
  offer: MediaOffer;
} | {
  type: 'reaction_added';
  reaction: MessageReaction;
} | {
  type: 'turn_yielded';
  turnId: string;
  replyCount?: number;
  reactionCount?: number;
  replayed?: boolean;
} | {
  type: 'turn_cancelled';
  turnId: string;
} | {
  type: 'heartbeat';
};
export async function sendGroupDialogue(
  input: {
    contextQuoteId?: string;
    contextCostAuthorization?: string;
    contextPreference?: 'included';
    conversationId: string;
    message: string;
    attachmentIds?: string[];
    clientRequestId: string;
    mentionedCharacterInstanceIds?: string[];
    photoSubjectCharacterInstanceIds?: string[];
    replyToMessageId?: string;
    manualSpeakerInstanceId?: string;
    broadGroupRequest?: boolean;
    letThemTalk?: boolean;
    messageAction?: 'respond_to_declined_photo';
    anchorMessageId?: string;
  },
  onEvent: (event: GroupDialogueEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (input.message.length > MESSAGE_CHARACTER_LIMIT) {
    throw new ApiError(messageCharacterLimitError(), 'VALIDATION_FAILED');
  }
  const started = Date.now();
  let firstTextRecorded = false, firstActivityRecorded = false, statusCode: number | undefined;
  try {
    const accessToken = await token();
    // A website-session outage must fail closed to the server's SFW projection,
    // not prevent an otherwise safe group conversation from loading or replying.
    await ensureWebAdultSession(accessToken).catch(() => undefined);
    const response = await fetch(`${supabaseUrl}/functions/v1/together-group-dialogue`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabasePublishableKey,
        'Content-Type': 'application/json',
        'x-correlation-id': input.clientRequestId,
        ...nativePlatformHeaders(),
      },
      body: JSON.stringify({ ...input, streamProtocol: 2 }),
      signal,
    });
    statusCode = response.status;
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as {
        error?: {
          message?: string;
          code?: string;
          retryable?: boolean;
        };
      };
      await clearSessionForApiFailure(supabase.auth, response.status, payload.error?.code);
      throw new ApiError(
        payload.error?.message ?? 'The group could not reply.',
        payload.error?.code,
        payload.error?.retryable,
      );
    }
    if (!response.body) {
      throw new ApiError('The group response ended early.', 'STREAM_INTERRUPTED', true);
    }
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = '', persistedReply = false;
    type GroupStreamEvent = GroupDialogueEvent | {
      type: 'error';
      error?: {
        message?: string;
        code?: string;
        retryable?: boolean;
      };
    };
    const process = (event: GroupStreamEvent) => {
      if (signal?.aborted) {
        return;
      }
      if (
        !firstTextRecorded &&
        ((event.type === 'message_delta' && event.text.trim()) ||
          (event.type === 'message_completed' && event.message.content.trim()))
      ) {
        firstTextRecorded = true;
        queueClientPerformance({
          surface: 'together-group-dialogue',
          operation: 'first_text',
          durationMs: Date.now() - started,
          success: true,
          metadata: { correlationId: input.clientRequestId },
        });
      }
      if (event.type === 'primary_completed') {
        queueClientPerformance({
          surface: 'together-group-dialogue',
          operation: 'primary_complete',
          durationMs: Date.now() - started,
          success: true,
          metadata: { correlationId: input.clientRequestId },
        });
      }
      if (event.type === 'error') {
        throw new ApiError(
          event.error?.message ?? 'The group could not finish replying.',
          event.error?.code ?? 'STREAM_INTERRUPTED',
          Boolean(event.error?.retryable),
        );
      }
      if (event.type === 'message_completed' || event.type === 'primary_completed') {
        persistedReply = true;
      }
      if (
        !firstActivityRecorded &&
        (event.type === 'speaker_typing' || event.type === 'message_started' ||
          event.type === 'message_completed')
      ) {
        firstActivityRecorded = true;
        queueClientPerformance({
          surface: 'together-group-dialogue',
          operation: 'first_activity',
          durationMs: Date.now() - started,
          success: true,
          metadata: { event: event.type, correlationId: input.clientRequestId },
        });
      }
      onEvent(event);
    };
    const drain = (flush = false) => {
      const drained = drainJsonSseEvents<GroupStreamEvent>(buffer, flush);
      buffer = drained.remainder;
      for (const event of drained.events) {
        process(event);
      }
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
    if (!persistedReply && !signal?.aborted) {
      throw new ApiError(
        'The connection dropped before the group replied. We’ll retry automatically.',
        'STREAM_INTERRUPTED',
        true,
      );
    }
    queueClientPerformance({
      surface: 'together-group-dialogue',
      operation: 'stream_complete',
      durationMs: Date.now() - started,
      success: true,
      metadata: {
        firstActivity: firstActivityRecorded,
        firstText: firstTextRecorded,
        correlationId: input.clientRequestId,
      },
    });
  } catch (caught) {
    queueClientPerformance({
      surface: 'together-group-dialogue',
      operation: 'stream_complete',
      durationMs: Date.now() - started,
      success: false,
      ...(statusCode ? { statusCode } : {}),
      metadata: {
        firstActivity: firstActivityRecorded,
        firstText: firstTextRecorded,
        correlationId: input.clientRequestId,
      },
    });
    throw caught;
  }
}
