import type { GeneratedMedia } from '../types';

export function mergeReconciledMedia(current: GeneratedMedia | undefined, incoming: GeneratedMedia): GeneratedMedia {
  if (current?.id !== incoming.id || incoming.signed_url || !current.signed_url) return incoming;
  return { ...incoming, signed_url: current.signed_url };
}

export function mediaReconciliationComplete(media: GeneratedMedia): boolean {
  if (media.status === 'failed') return true;
  return media.status === 'ready' && Boolean(media.signed_url);
}

export function pendingMediaIds(media:GeneratedMedia[]|undefined,limit=20):string[]{
  return(media??[]).filter((item)=>item.status==='queued'||item.status==='generating').slice(0,limit).map((item)=>item.id);
}

/**
 * A successful batch response is authoritative for the requested IDs. Missing
 * rows were deleted or are no longer visible to this session (for example,
 * after a web-adult entitlement expires), so retaining their old signed URLs
 * in client state would be both misleading and unsafe.
 */
export function missingMediaIds(requestedIds: readonly string[], returned: readonly Pick<GeneratedMedia, 'id'>[]): string[] {
  const returnedIds=new Set(returned.map((media)=>media.id));
  return requestedIds.filter((id)=>!returnedIds.has(id));
}

export function isTransientMediaFetchFailure(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'retryable' in error && error.retryable === true) return true;
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /(?:failed to fetch|network request failed|load failed|connection|timed?\s*out|temporarily unavailable|could not be opened yet)/i.test(message);
}
