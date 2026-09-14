import { createMediaOffer } from './together-media-offers.ts';
import { acceptMediaOffer } from './together-media-offer-acceptance.ts';
import { AppError } from './types.ts';

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
