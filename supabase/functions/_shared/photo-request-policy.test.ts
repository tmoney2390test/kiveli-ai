import { createMediaOffer } from './together-media-offers.ts';
import { acceptMediaOffer } from './together-media-offer-acceptance.ts';
import { AppError } from './types.ts';
import { classifyPhotoRequest } from './together-media-base.ts';
import { restrictedPhotoTextCanContinueAsChat } from '../../../packages/together-domain/src/photo-request-policy.ts';
import { declinedPhotoConversationMessage, declinedPhotoSourceMessageId, mediaOfferVisibleForSession } from './together-media-offers.ts';

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

Deno.test('only a declined user photo can resume its original chat message', async () => {
  const originalId='11111111-1111-4111-8111-111111111111',placeholderId='22222222-2222-4222-8222-222222222222';
  const offer={id:'33333333-3333-4333-8333-333333333333',source:'user_request',status:'declined',offer_key:`user_request:${originalId}`,continuity_id:'life',conversation_id:'chat',message_id:placeholderId,generated_media_id:null};
  if(declinedPhotoSourceMessageId(offer)!==originalId)throw new Error('The original user message was not identified');
  if(declinedPhotoSourceMessageId({...offer,offer_key:`group_request:${originalId}:44444444-4444-4444-8444-444444444444`})!==originalId)throw new Error('The original group message was not identified');
  if(declinedPhotoSourceMessageId({...offer,source:'story'})!==null)throw new Error('A story offer was treated as a user message');
  let writes=0;
  const db={from(table:string){
    if(table==='together_media_offers')return{select(){return this;},eq(){return this;},maybeSingle:async()=>({data:offer,error:null})};
    if(table==='together_messages')return{select(){return this;},eq(){return this;},in(){return this;},then(resolve:(value:unknown)=>unknown){return resolve({data:[{id:originalId,role:'user',content:'How do you feel about sending a picture?'},{id:placeholderId,role:'assistant',provider_metadata:{mediaOnly:true}}],error:null});}};
    writes++;throw new Error('Resuming a declined photo must not create another user message');
  }};
  const original=await declinedPhotoConversationMessage(db as never,{userId:'user',continuityId:'life',conversationId:'chat',offerId:offer.id});
  if(original.id!==originalId||writes!==0)throw new Error('The original user turn was not reused');
  offer.status='pending';
  try{await declinedPhotoConversationMessage(db as never,{userId:'user',continuityId:'life',conversationId:'chat',offerId:offer.id});throw new Error('Pending photo was allowed to resume');}
  catch(error){if(!(error instanceof AppError)||error.code!=='CONFLICT')throw error;}
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
