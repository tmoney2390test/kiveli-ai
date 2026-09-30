import { describe, expect, it, vi } from 'vitest';
import type { GeneratedMedia, MediaOffer } from '../types';
import { checkExistingMediaRequest } from './mediaStatusRecovery';
import { mediaProgressPresentation, mediaFailurePresentation, newestMedia } from './mediaProgressPresentation';
import { supportRequestReferences } from './mediaSupportReference';

const now = Date.parse('2026-09-29T12:05:00Z');
const media = (fields: Partial<GeneratedMedia> = {}): GeneratedMedia => ({ id: 'photo', character_instance_id: 'character', media_type: 'image', status: 'generating', content_level: 'standard', created_at: '2026-09-29T12:00:00Z', ...fields });

describe('media recovery', () => {
  it('checks the existing offer/job without accepting or retrying a paid request', async () => {
    const invoke = vi.fn().mockResolvedValue({ media: media() });
    await checkExistingMediaRequest({ offerId: 'offer', mediaId: 'photo' }, invoke);
    await checkExistingMediaRequest({ mediaId: 'photo' }, invoke);
    expect(invoke.mock.calls).toEqual([[{ action: 'offer_status', offerId: 'offer' }], [{ action: 'status', mediaId: 'photo' }]]);
    await expect(checkExistingMediaRequest({ offerId: 'local-photo-offer-abc' }, invoke)).rejects.toThrow('still being confirmed');
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('keeps a delayed request in its real stage instead of inventing completion', () => {
    expect(mediaProgressPresentation(media({ progress_stage: 'queued' }), undefined, now)).toMatchObject({ title: 'Your photo is queued', delayed: true });
    expect(mediaProgressPresentation(media({ progress_stage: 'finalizing' }), undefined, now).title).toBe('Finishing your photo…');
    expect(mediaProgressPresentation(media({ status: 'ready', signed_url: null }), undefined, now).title).toBe('Opening your photo…');
    expect(mediaProgressPresentation(media({ created_at: 'invalid' }), undefined, now).delayed).toBe(false);
  });

  it('only reports refunds backed by stored state and labels a paid retry', () => {
    const failed = media({ status: 'failed', metadata: { creditRefunded: true, creditTransactionId: 'txn', creditCost: 10 } });
    expect(mediaFailurePresentation(failed)).toMatchObject({ refund: 'Credits returned.', retryLabel: 'Retry · 10 credits', retryable: true });
    expect(mediaFailurePresentation(media({ status: 'failed' })).refund).toBe('');
    expect(mediaFailurePresentation(media({ status: 'failed', metadata: { creditTransactionId: 'txn' } })).retryLabel).toBe('Retry photo');
  });

  it('does not offer blind retries for blocked or exhausted jobs or repeat raw provider errors', () => {
    for (const fields of [{ failure_code: 'PHOTO_CONTENT_BLOCKED' }, { attempt_count: 3 }]) {
      expect(mediaFailurePresentation(media({ status: 'failed', failure_reason_safe: 'SQLSTATE secret provider details', ...fields })).retryable).toBe(false);
    }
    expect(mediaFailurePresentation(media({ status: 'failed', failure_reason_safe: 'SQLSTATE secret provider details' })).message).not.toContain('SQLSTATE');
    expect(mediaFailurePresentation(undefined, { failure_code: 'consent_required' } as MediaOffer).retryable).toBe(false);
  });

  it('does not let an older poll erase a result recovered by a status check', () => {
    const pending = media({ updated_at: '2026-09-29T12:01:00Z' });
    const ready = media({ updated_at: '2026-09-29T12:04:00Z', status: 'ready', signed_url: 'signed' });
    expect(newestMedia(pending, ready)).toBe(ready);
    expect(newestMedia(ready, pending)).toBe(ready);
    const retried = media({ updated_at: '2026-09-29T12:05:00Z', status: 'queued' });
    expect(newestMedia(retried, ready)).toBe(retried);
  });

  it('prefills support with valid references only', () => {
    const id = '8d997dd3-44dc-4fed-a0e1-c8ad8daa8a70';
    expect(supportRequestReferences({ mediaId: id, conversationId: 'private prompt' })).toEqual({ mediaId: id });
    expect(supportRequestReferences({ mediaId: ['invalid'], conversationId: '<script>' })).toEqual({});
  });
});
