import { afterEach, describe, expect, it } from 'vitest';
import type { MediaOffer } from '../types';
import { clearOptimisticPhotoDecline, clearPhotoDecline, photoDeclineHandoffKey, readOptimisticPhotoDecline, readPhotoDecline, rememberOptimisticPhotoDecline, rememberPhotoDecline, settlePhotoDecline, startPhotoDeclineReply } from './photoDeclineHandoff';

const pending = { id: 'offer-a', source: 'user_request', status: 'pending', message_id: 'photo-a' } as MediaOffer;
const dismissed = { ...pending, status: 'declined' } as MediaOffer;
const keyA = photoDeclineHandoffKey('user-a', 'life-a', 'chat-a')!;

describe('declined photo handoff across chat switches', () => {
  afterEach(() => { clearPhotoDecline(keyA, pending.id); clearOptimisticPhotoDecline(keyA, 'request-a'); });

  it('keeps a declined offer in its account, Life, and conversation', () => {
    const now = Date.now();
    rememberPhotoDecline(keyA, pending, now);
    settlePhotoDecline(keyA, dismissed);
    expect(readPhotoDecline(keyA, now + 100)?.dismissed?.status).toBe('declined');
    expect(readPhotoDecline(photoDeclineHandoffKey('user-a', 'life-a', 'chat-b'), now + 100)).toBeNull();
    expect(readPhotoDecline(photoDeclineHandoffKey('user-b', 'life-a', 'chat-a'), now + 100)).toBeNull();
    expect(readPhotoDecline(photoDeclineHandoffKey('user-a', 'life-b', 'chat-a'), now + 100)).toBeNull();
  });

  it('holds the handoff through a quick switch and clears only the matching offer', () => {
    const now = Date.now();
    rememberPhotoDecline(keyA, pending, now);
    startPhotoDeclineReply(keyA, pending.id, now + 100);
    expect(readPhotoDecline(keyA, now + 200)?.startedAt).toBe(now + 100);
    clearPhotoDecline(keyA, 'another-offer');
    expect(readPhotoDecline(keyA, now + 200)).not.toBeNull();
    clearPhotoDecline(keyA, pending.id);
    expect(readPhotoDecline(keyA, now + 200)).toBeNull();
  });

  it('expires an abandoned handoff and refuses a mismatched dismissal', () => {
    rememberPhotoDecline(keyA, pending, 100);
    expect(settlePhotoDecline(keyA, { ...dismissed, id: 'another-offer' })).toBeNull();
    expect(readPhotoDecline(keyA, 120_101)).toBeNull();
  });

  it('keeps an early decline tap attached to the photo request while its server offer appears', () => {
    const now = Date.now();
    rememberOptimisticPhotoDecline(keyA, { requestId: 'request-a', startedAt: new Date(now).toISOString(), offer: pending }, now);
    expect(readOptimisticPhotoDecline(keyA, now + 100)?.requestId).toBe('request-a');
    clearOptimisticPhotoDecline(keyA, 'different-request');
    expect(readOptimisticPhotoDecline(keyA, now + 100)).not.toBeNull();
    clearOptimisticPhotoDecline(keyA, 'request-a');
    expect(readOptimisticPhotoDecline(keyA, now + 100)).toBeNull();
  });
});
