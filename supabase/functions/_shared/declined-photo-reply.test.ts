import { assertEquals } from 'jsr:@std/assert@1';
import { declinedGroupPhotoSourceMessageId, declinedPhotoSourceMessageId } from './declined-photo-reply.ts';

const anchor = '11111111-1111-4111-8111-111111111111';
const userMessage = '22222222-2222-4222-8222-222222222222';
const offer = {
  status: 'declined',
  source: 'user_request',
  message_id: anchor,
  offer_key: `user_request:${userMessage}`,
};

Deno.test('declined photo reply resolves only the original user message', () => {
  assertEquals(declinedPhotoSourceMessageId(offer, anchor), userMessage);
  for (const invalid of [
    { ...offer, status: 'pending' },
    { ...offer, status: 'accepted' },
    { ...offer, source: 'story' },
    { ...offer, message_id: userMessage },
    { ...offer, offer_key: 'user_request:not-a-uuid' },
  ]) assertEquals(declinedPhotoSourceMessageId(invalid, anchor), null);
  assertEquals(declinedPhotoSourceMessageId(offer, userMessage), null);
  assertEquals(declinedPhotoSourceMessageId(null, anchor), null);
});

Deno.test('declined group photo reply resolves only its original group request', () => {
  const groupOffer = { ...offer, offer_key: `group_request:${userMessage}:${anchor}` };
  assertEquals(declinedGroupPhotoSourceMessageId(groupOffer, anchor), userMessage);
  assertEquals(declinedGroupPhotoSourceMessageId({ ...groupOffer, status: 'pending' }, anchor), null);
  assertEquals(declinedGroupPhotoSourceMessageId({ ...groupOffer, offer_key: `user_request:${userMessage}` }, anchor), null);
  assertEquals(declinedGroupPhotoSourceMessageId({ ...groupOffer, message_id: userMessage }, anchor), null);
});
