import { afterEach, expect, it } from 'vitest';
import type { MediaOffer } from '../types';
import { cacheConversationOffers, clearConversationOfferWarmup, readCachedConversationOffers } from './conversationOfferWarmup';

const offer = {
  id: 'offer-a', continuity_id: 'life-a', conversation_id: 'chat-a',
  character_instance_id: 'character-a', source: 'user_request', status: 'pending',
  expires_at: '2026-10-07T13:00:00Z',
} as MediaOffer;

afterEach(clearConversationOfferWarmup);

it('warms only the matching account, Life, and conversation', () => {
  const now = Date.parse('2026-10-07T12:00:00Z');
  cacheConversationOffers('user-a','life-a','chat-a',[offer],now);
  expect(readCachedConversationOffers('user-a','life-a','chat-a',now+1)).toEqual([offer]);
  expect(readCachedConversationOffers('user-b','life-a','chat-a',now+1)).toEqual([]);
  expect(readCachedConversationOffers('user-a','life-b','chat-a',now+1)).toEqual([]);
  expect(readCachedConversationOffers('user-a','life-a','chat-b',now+1)).toEqual([]);
});

it('does not revive dismissed, expired, or stale photo requests', () => {
  const now = Date.parse('2026-10-07T12:00:00Z');
  cacheConversationOffers('user-a','life-a','chat-a',[offer],now);
  expect(readCachedConversationOffers('user-a','life-a','chat-a',now+61_000)).toEqual([]);
  cacheConversationOffers('user-a','life-a','chat-a',[offer],now);
  cacheConversationOffers('user-a','life-a','chat-a',[],now+1);
  expect(readCachedConversationOffers('user-a','life-a','chat-a',now+2)).toEqual([]);
  cacheConversationOffers('user-a','life-a','chat-a',[{...offer,expires_at:'2026-10-07T12:00:01Z'}],now);
  expect(readCachedConversationOffers('user-a','life-a','chat-a',now+2_000)).toEqual([]);
});
