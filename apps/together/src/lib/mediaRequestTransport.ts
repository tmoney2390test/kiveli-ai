import { isTransientRequestFailure } from './requestRetry';
import { scheduleForegroundTimeout } from './webPageLifecycle';

export function isVideoSubmission(input: Record<string, unknown>): boolean {
  return input.action === 'animate' || input.action === 'video_direct_generate';
}

export function mediaRequestTimeoutMs(input: Record<string, unknown>): number {
  // Submission includes validation and an admitted provider quote (up to three
  // 20s attempts). It only reserves a background job; it does not render video.
  return isVideoSubmission(input) ? 90_000 : 15_000;
}

export async function runMediaRequest<T>(
  input: Record<string, unknown>,
  invoke: (signal: AbortSignal) => Promise<T>,
  timeoutError: (message: string) => Error,
): Promise<T> {
  const video = isVideoSubmission(input);
  // The server's reservation RPC deduplicates jobs/charges by this exact ID.
  // Never replay other mutations or a submission missing its idempotency key.
  const attempts = video && typeof input.requestId === 'string' && input.requestId.length >= 8 ? 2 : 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const cancelTimeout = scheduleForegroundTimeout(() => controller.abort(), mediaRequestTimeoutMs(input));
    try {
      return await invoke(controller.signal);
    } catch (caught) {
      const error = controller.signal.aborted
        ? timeoutError(video
          ? 'We could not confirm your video request yet. Retry to check the same request.'
          : 'The media request took too long. Please try again.')
        : caught;
      if (attempt === attempts || !isTransientRequestFailure(error)) throw error;
    } finally {
      cancelTimeout();
    }
  }
  throw new Error('The media request could not be confirmed.');
}

/** Keep ambiguous manual retries on the same job; changed settings are new intent. */
export function createVideoSubmissionIdentity(createId: () => string) {
  let previous: { fingerprint: string; requestId: string } | null = null;
  return {
    requestId(input: Record<string, unknown>): string {
      // Only retained in component memory. Never persist prompts or send them to analytics.
      const fingerprint = JSON.stringify(input);
      if (!previous || previous.fingerprint !== fingerprint) previous = { fingerprint, requestId: createId() };
      return previous.requestId;
    },
    clear() { previous = null; },
  };
}
