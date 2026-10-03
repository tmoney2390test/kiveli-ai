/** Error works in native runtimes that do not expose DOMException. */
export function requestAbortedError(): Error {
  const error = new Error('The request was cancelled.');
  error.name = 'AbortError';
  return error;
}

export function throwIfRequestAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw requestAbortedError();
}

export function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(requestAbortedError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); resolve(); }, delayMs);
    const abort = () => { cleanup(); reject(requestAbortedError()); };
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}
