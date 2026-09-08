type ReadFailure = { code?: string; retryable?: boolean; status?: number; retryAfterMs?: number };

/** Limits automatic reads; it never retries a request or replays a mutation. */
export class ReadRequestBackoff {
  private failures = 0;
  private blockedUntil = 0;
  private terminal = false;
  error: unknown;

  canRequest(manual = false, now = Date.now()): boolean {
    return now >= this.blockedUntil && (manual || !this.terminal);
  }

  succeeded(): void {
    this.failures = 0;
    this.blockedUntil = 0;
    this.terminal = false;
    this.error = undefined;
  }

  failed(error: unknown, now = Date.now()): void {
    this.error = error;
    const failure = (error && typeof error === 'object' ? error : {}) as ReadFailure;
    const rateLimited = failure.status === 429 || failure.code === 'RATE_LIMITED';
    this.terminal = !rateLimited && failure.retryable === false;
    this.failures += 1;
    const delay = Math.min(60_000, 2_000 * 2 ** Math.min(this.failures - 1, 5));
    this.blockedUntil = now + (rateLimited ? Math.max(60_000, failure.retryAfterMs ?? 0) : this.terminal ? 0 : delay);
  }
}

export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value?.trim()) return undefined;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.max(0, delay) : undefined;
}
