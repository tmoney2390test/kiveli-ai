import type { GeneratedMedia } from '../types';

export function mergeReconciledMedia(current: GeneratedMedia | undefined, incoming: GeneratedMedia): GeneratedMedia {
  if (current?.id !== incoming.id || incoming.signed_url || !current.signed_url) return incoming;
  return { ...incoming, signed_url: current.signed_url };
}

export function mediaReconciliationComplete(media: GeneratedMedia): boolean {
  if (media.status === 'failed') return true;
  return media.status === 'ready' && Boolean(media.signed_url);
}

export function isTransientMediaFetchFailure(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'retryable' in error && error.retryable === true) return true;
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /(?:failed to fetch|network request failed|load failed|connection|timed?\s*out|temporarily unavailable|could not be opened yet)/i.test(message);
}
