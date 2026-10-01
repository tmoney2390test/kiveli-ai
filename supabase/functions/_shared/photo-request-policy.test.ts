import { createMediaOffer } from './together-media-offers.ts';
import { acceptMediaOffer } from './together-media-offer-acceptance.ts';
import { AppError } from './types.ts';
import { classifyPhotoRequest } from './together-media-base.ts';
import { restrictedPhotoTextCanContinueAsChat } from '../../../packages/together-domain/src/photo-request-policy.ts';
import { mediaOfferVisibleForSession } from './together-media-offers.ts';

Deno.test('relationship language does not become a server photo request', () => {
  if (classifyPhotoRequest('Sora you don’t want to see me you said it yourself').requested) throw new Error('A relationship message was routed to PhotoGen');
  if (classifyPhotoRequest('Don’t send me a photo.').requested) throw new Error('A negated photo request was routed to PhotoGen');
  if (classifyPhotoRequest('Do you me to send you something from my body like a snap').requested) throw new Error('A user media offer was routed to companion PhotoGen');
  if (!classifyPhotoRequest('You don’t want to see me. Send me a selfie.').requested) throw new Error('A separate photo request was lost');
});

Deno.test('restricted native photo-like wording can continue as chat without rerouting safe photos', () => {
  if (!restrictedPhotoTextCanContinueAsChat('Send me a nude pic')) throw new Error('Restricted pic was not eligible for chat');
  if (!restrictedPhotoTextCanContinueAsChat('Can I see a nude photo?')) throw new Error('Restricted photo was not eligible for chat');
  if (restrictedPhotoTextCanContinueAsChat('Send me a photo in your blue dress')) throw new Error('Safe photo diverted from PhotoGen');
  if (restrictedPhotoTextCanContinueAsChat('I liked the pic you sent yesterday')) throw new Error('Ordinary chat was classified as a photo request');
});

Deno.test('underwear photo offers retain their adult classification across surfaces', () => {
  const intent = classifyPhotoRequest('Maybe send me a pic of you in your underwear');
  if (!intent.requested || intent.requestedContentLevel !== 'suggestive') {
    throw new Error('Underwear photo was mislabeled as standard');
  }
});

Deno.test('an older mislabeled adult offer is hidden from native sessions', () => {
  const offer={content_level:'standard',preview_metadata:{requestText:'Send me a pic of you in your underwear'}};
  if(mediaOfferVisibleForSession(offer,false))throw new Error('Mislabeled adult offer leaked to native');
  if(!mediaOfferVisibleForSession(offer,true))throw new Error('Authorized web offer was hidden');
});

Deno.test('a disallowed photo creates no offer or allowance reservation', async () => {
  let databaseCalls = 0;
  const db = { from() { databaseCalls++; throw new Error('Unexpected database access'); } };
  try {
    await createMediaOffer(db as never, { userId: 'test-user', characterInstanceId: 'test-character', source: 'user_request', previewMetadata: { requestText: 'Send a nude photo' }, adultPipelineAuthorized: false });
    throw new Error('Expected a block');
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== 'PHOTO_CONTENT_BLOCKED' || error.retryable) throw error;
  }
  if (databaseCalls !== 0) throw new Error('Blocked request touched the database');
});

Deno.test('an explicit offer is blocked before credits or included-photo claims', async () => {
  let reads = 0;
  const query = { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: { id: 'offer', content_level: 'explicit', preview_metadata: {} } }; } };
  const db = { from(table: string) { reads++; if (table !== 'together_media_offers') throw new Error('Unexpected side effect'); return query; }, rpc() { throw new Error('Must not charge or reserve an allowance'); } };
  for (const paymentMethod of ['credits', 'daily_included'] as const) {
    try {
      await acceptMediaOffer(db as never, { userId: 'test-user', offerId: 'offer', requestId: 'test-request', paymentMethod, adultPipelineAuthorized: false });
      throw new Error('Expected a block');
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== 'PHOTO_CONTENT_BLOCKED' || error.retryable) throw error;
    }
  }
  if (reads !== 2) throw new Error('Only offer reads should occur');
});
