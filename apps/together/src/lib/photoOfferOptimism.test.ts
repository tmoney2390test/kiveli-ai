import { describe, expect, it } from 'vitest';
import type { MediaOffer } from '../types';
import { createOptimisticPhotoRequest, matchingServerPhotoOffer, queueOptimisticPhotoOfferAcceptance } from './photoOfferOptimism';

function serverOffer(overrides: Partial<MediaOffer> = {}): MediaOffer {
  return {
    ...createOptimisticPhotoRequest({
      requestId: 'server-shape',
      conversationId: 'conversation-1',
      characterInstanceId: 'character-1',
      characterName: 'Elena Marquez',
      subscriptionTier: 'kivelle_max',
    }).offer,
    id: 'offer-1',
    ...overrides,
  };
}

describe('photo offer optimism', () => {
  it('creates an immediately actionable local confirmation using shared economics', () => {
    const request = createOptimisticPhotoRequest({
      requestId: 'request-1',
      conversationId: 'conversation-1',
      characterInstanceId: 'character-1',
      characterName: 'Elena Marquez',
      subscriptionTier: 'kivelle_max',
      lastKnownDailyRemaining: 2,
    });
    expect(request.offer.status).toBe('pending');
    expect(request.offer.credit_cost).toBe(10);
    expect(request.offer.companion_message).toContain('Elena');
    expect(request.offer.preview_metadata.dailyPhotoAllowanceRemaining).toBe(2);
  });

  it('does not let an older pending offer satisfy a new request', () => {
    const request = createOptimisticPhotoRequest({
      requestId: 'request-2',
      conversationId: 'conversation-1',
      characterInstanceId: 'character-1',
      characterName: 'Elena Marquez',
    });
    const old = serverOffer({ id: 'old', created_at: new Date(Date.now() - 60_000).toISOString() });
    const current = serverOffer({ id: 'current', created_at: new Date(Date.now() + 100).toISOString() });
    expect(matchingServerPhotoOffer([old], request)).toBeUndefined();
    expect(matchingServerPhotoOffer([old, current], request)?.id).toBe('current');
  });

  it('keeps a queued acceptance cancelable until the server starts generation', () => {
    const request = createOptimisticPhotoRequest({
      requestId: 'request-starting',
      conversationId: 'conversation-1',
      characterInstanceId: 'character-1',
      characterName: 'Kira-3',
    });
    const starting = queueOptimisticPhotoOfferAcceptance(request);
    expect(starting.offer.status).toBe('pending');
    expect(starting.offer.preview_metadata.acceptQueued).toBe(true);
  });
});
