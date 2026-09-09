import { describe, expect, it } from 'vitest';
import type { MediaOffer } from '../types';
import { createOptimisticPhotoRequest, matchingServerPhotoOffer, photoOfferStatusSettled, queueOptimisticPhotoOfferAcceptance, queueServerPhotoOfferAcceptance, waitForMatchingServerPhotoOffer, waitForPhotoOfferStatus } from './photoOfferOptimism';

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
  it('does not claim a server offer was accepted before the API confirms it', () => {
    const pending=serverOffer({status:'pending'});
    const queued=queueServerPhotoOfferAcceptance(pending,'2026-09-05T20:00:00.000Z');
    expect(queued.status).toBe('pending');
    expect(queued.preview_metadata).toMatchObject({acceptQueued:true,acceptQueuedAt:'2026-09-05T20:00:00.000Z'});
    expect(pending.preview_metadata.acceptQueued).toBeUndefined();
  });

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

  it('actively resolves an offer that appears after an early acceptance tap', async () => {
    const request = createOptimisticPhotoRequest({
      requestId: 'request-race',
      conversationId: 'conversation-1',
      characterInstanceId: 'character-1',
      characterName: 'Elena Marquez',
    });
    const current = serverOffer({
      id: 'current',
      preview_metadata: { clientRequestId: request.requestId },
    });
    let attempt = 0;
    const result = await waitForMatchingServerPhotoOffer({
      request,
      loadOffers: () => Promise.resolve(++attempt === 1 ? [] : [current]),
      delays: [0, 1],
      wait: () => Promise.resolve(),
    });
    expect(attempt).toBe(2);
    expect(result.offer?.id).toBe('current');
  });

  it('does not settle an early tap against another photo request', async () => {
    const request = createOptimisticPhotoRequest({
      requestId: 'request-current',
      conversationId: 'conversation-1',
      characterInstanceId: 'character-1',
      characterName: 'Elena Marquez',
    });
    const unrelated = serverOffer({
      id: 'unrelated',
      preview_metadata: { clientRequestId: 'request-other' },
    });
    const result = await waitForMatchingServerPhotoOffer({
      request,
      loadOffers: () => Promise.resolve([unrelated]),
      delays: [0],
    });
    expect(result.offer).toBeUndefined();
  });

  it('recovers when the first pending-offer read fails transiently', async () => {
    const request = createOptimisticPhotoRequest({
      requestId: 'request-after-network-error',
      conversationId: 'conversation-1',
      characterInstanceId: 'character-1',
      characterName: 'Elena Marquez',
    });
    const current = serverOffer({
      id: 'current-after-error',
      preview_metadata: { clientRequestId: request.requestId },
    });
    let attempt = 0;
    const result = await waitForMatchingServerPhotoOffer({
      request,
      loadOffers: () => {
        if (++attempt === 1) throw new Error('temporary network failure');
        return Promise.resolve([current]);
      },
      delays: [0, 1],
      wait: () => Promise.resolve(),
    });
    expect(result.offer?.id).toBe('current-after-error');
  });

  it('does not treat an accepted offer as settled until its media link is readable', () => {
    const accepted=serverOffer({status:'accepted'});
    expect(photoOfferStatusSettled({offer:accepted,media:null})).toBe(false);
    expect(photoOfferStatusSettled({offer:accepted,media:{id:'media-1'} as never})).toBe(true);
    expect(photoOfferStatusSettled({offer:serverOffer({status:'failed'}),media:null})).toBe(true);
  });

  it('recovers an accepted photo after an interrupted acceptance response', async () => {
    const pending={offer:serverOffer({status:'pending'}),media:null};
    const accepted={offer:serverOffer({status:'accepted',generated_media_id:'media-1'}),media:{id:'media-1'} as never};
    let attempt=0;
    const result=await waitForPhotoOfferStatus({
      loadStatus:()=>Promise.resolve(++attempt===1?pending:accepted),
      delays:[0,1],
      wait:()=>Promise.resolve(),
    });
    expect(attempt).toBe(2);
    expect(result).toBe(accepted);
  });
});
