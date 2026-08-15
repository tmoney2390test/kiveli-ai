type EdgeRuntimeApi = { waitUntil(promise: Promise<unknown>): void };

export function waitUntil(promise: Promise<unknown>): void {
  const runtime = (globalThis as typeof globalThis & { EdgeRuntime?: EdgeRuntimeApi }).EdgeRuntime;
  if (runtime) runtime.waitUntil(promise);
  else void promise.catch((error) => console.warn('Background task failed', error instanceof Error ? error.message : 'unknown_error'));
}
