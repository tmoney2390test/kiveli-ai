import { describe, expect, it } from 'vitest';
import type { GeneratedMedia } from '../types';
import { isTransientMediaFetchFailure, mediaReconciliationComplete, mergeReconciledMedia, missingMediaIds } from './mediaReconciliation';

function media(overrides: Partial<GeneratedMedia> = {}): GeneratedMedia {
  return {
    id: 'media-1',
    character_instance_id: 'becka',
    media_type: 'image',
    content_level: 'standard',
    status: 'generating',
    created_at: '2026-08-22T12:00:00.000Z',
    ...overrides,
  };
}

describe('generated media reconciliation', () => {
  it('does not treat a ready image without a signed URL as displayable', () => {
    expect(mediaReconciliationComplete(media({ status: 'ready', storage_path: 'user/photo.webp', signed_url: null }))).toBe(false);
    expect(mediaReconciliationComplete(media({ status: 'ready', signed_url: 'https://example.test/photo.webp' }))).toBe(true);
    expect(mediaReconciliationComplete(media({ status: 'failed' }))).toBe(true);
  });

  it('preserves the last usable URL when a transient refresh omits it', () => {
    const current = media({ status: 'ready', signed_url: 'https://example.test/old-signed-url' });
    const incoming = media({ status: 'ready', storage_path: 'user/photo.webp', signed_url: null });
    expect(mergeReconciledMedia(current, incoming).signed_url).toBe(current.signed_url);
  });

  it('uses a newly refreshed signed URL when one is returned', () => {
    const current = media({ status: 'ready', signed_url: 'https://example.test/old' });
    const incoming = media({ status: 'ready', signed_url: 'https://example.test/new' });
    expect(mergeReconciledMedia(current, incoming).signed_url).toBe(incoming.signed_url);
  });

  it('recognizes browser and retryable API failures as transient', () => {
    expect(isTransientMediaFetchFailure(new TypeError('Failed to fetch'))).toBe(true);
    expect(isTransientMediaFetchFailure({ retryable: true })).toBe(true);
    expect(isTransientMediaFetchFailure(new Error('That photo offer is unavailable.'))).toBe(false);
  });

  it('identifies media omitted by an authoritative batch response', () => {
    expect(missingMediaIds(['safe','restricted','deleted'],[{id:'safe'},{id:'restricted'}])).toEqual(['deleted']);
    expect(missingMediaIds(['restricted'],[])).toEqual(['restricted']);
  });
});
