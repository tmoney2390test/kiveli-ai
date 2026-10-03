import { describe, expect, it, vi } from 'vitest';
import type { MediaOffer, Message } from '../types';
import { declinedPhotoReplyAnchor, declinedPhotoReplayText, withPhotoRequestTimeout, createOptimisticPhotoRequest, matchingServerPhotoOffer, photoOfferStatusSettled, queueOptimisticPhotoOfferAcceptance, queueServerPhotoOfferAcceptance, waitForMatchingServerPhotoOffer, waitForPhotoOfferStatus } from './photoOfferOptimism';

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
  it('replies in text only to a newly declined latest user photo request', () => {
    const pending = serverOffer({ status: 'pending', message_id: 'photo-placeholder',preview_metadata:{clientRequestId:'photo-request'} });
    const declined = serverOffer({ status: 'declined', message_id: 'photo-placeholder' });
    const user = { id: 'user-message', role: 'user', conversation_id: 'conversation-1',client_request_id:'photo-request' } as Message;
    const placeholder = { id: 'photo-placeholder', role: 'assistant', conversation_id: 'conversation-1' } as Message;
    expect(declinedPhotoReplyAnchor(pending, declined, [user, placeholder])).toBe('photo-placeholder');
    expect(declinedPhotoReplyAnchor(pending, declined, [user, placeholder, { ...user, id: 'newer-message' }])).toBeNull();
    expect(declinedPhotoReplyAnchor(pending, declined, [user, { ...placeholder, conversation_id: 'another-chat' }])).toBeNull();
    expect(declinedPhotoReplyAnchor(pending, serverOffer({ status: 'failed' }), [user, placeholder])).toBeNull();
    expect(declinedPhotoReplyAnchor(serverOffer({ ...pending, source: 'story' }), declined, [user, placeholder])).toBeNull();
    expect(declinedPhotoReplyAnchor(pending,declined,[{...user,provider_metadata:{uiHidden:true}},placeholder])).toBeNull();
  });
  it('uses the same pending-offer guard for a group photo decline', () => {
    const pending=serverOffer({status:'pending',conversation_id:'group-1',message_id:'group-photo',preview_metadata:{clientRequestId:'group-request',requestText:'Can I see a picture?'}});
    const declined=serverOffer({...pending,status:'declined'});
    const user={id:'group-user',role:'user',conversation_id:'group-1',client_request_id:'group-request'} as Message;
    const photo={id:'group-photo',role:'assistant',conversation_id:'group-1',content:'[Photo]',delivery_status:'complete',created_at:'2026-10-03T00:00:00Z',provider_metadata:{mediaOnly:true}} as Message;
    expect(declinedPhotoReplyAnchor(pending,declined,[user,photo])).toBe('group-photo');
    expect(declinedPhotoReplyAnchor(pending,declined,[user,photo,{...photo,id:'newer'}])).toBeNull();
  });
  it('quotes a declined-photo retry using only its original visible message in the same chat', () => {
    const control={id:'control',role:'user',conversation_id:'chat-1',content:'[Photo declined]',delivery_status:'complete',created_at:'2026-10-03T00:00:00Z',provider_metadata:{uiHidden:true,messageAction:'respond_to_declined_photo',photoDeclineSourceMessageId:'source'}} as Message;
    const original={id:'source',role:'user',conversation_id:'chat-1',content:'Please tell me in words.'} as Message;
    expect(declinedPhotoReplayText(control,[original])).toBe(original.content);
    expect(declinedPhotoReplayText(control,[{...original,conversation_id:'another-chat'}])).toBe(control.content);
    expect(declinedPhotoReplayText(control,[{...original,provider_metadata:{uiHidden:true}}])).toBe(control.content);
  });
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


describe('bounded photo status recovery', () => {
  it('settles a hung operation and clears its timeout', async () => {
    vi.useFakeTimers();
    try {
      const result = withPhotoRequestTimeout(new Promise<never>(() => {}), 100);
      const check = expect(result).rejects.toThrow('Check the existing request');
      await vi.advanceTimersByTimeAsync(100);
      await check;
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it('clears the timeout when authoritative status arrives first', async () => {
    vi.useFakeTimers();
    try {
      await expect(withPhotoRequestTimeout(Promise.resolve('accepted'))).resolves.toBe('accepted');
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it('returns from reconciliation even when every status read hangs', async () => {
    vi.useFakeTimers();
    try {
      const result = waitForPhotoOfferStatus({loadStatus:()=>new Promise(()=>{}),delays:[0,0]});
      await vi.advanceTimersByTimeAsync(10_000);
      await expect(result).resolves.toBeNull();
    } finally { vi.useRealTimers(); }
  });
});
