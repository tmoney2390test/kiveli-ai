export type IdempotentRetryOptions = {
  attempts?: number;
  delayMs?: number;
  onRetry?: (error: unknown, attempt: number) => void;
};

export function isTransientRequestFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { retryable?: unknown; message?: unknown; name?: unknown };
  if (candidate.retryable === true) return true;
  const message = String(candidate.message ?? '').toLowerCase();
  return candidate.name === 'TypeError' || /failed to fetch|networkerror|network request failed|load failed|connection.*lost|timed? out/.test(message);
}

export async function withIdempotentRetry<T>(operation: () => Promise<T>, options: IdempotentRetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 2);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts || !isTransientRequestFailure(error)) throw error;
      options.onRetry?.(error, attempt);
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, options.delayMs ?? 180) * attempt));
    }
  }
  throw new Error('The request could not be completed.');
}
