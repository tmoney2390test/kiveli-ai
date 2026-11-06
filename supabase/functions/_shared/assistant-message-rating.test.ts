import { assertEquals } from 'jsr:@std/assert@1';
import type { DialogueRoutingDecision, NormalizedModerationResult } from '../../../packages/together-domain/src/index.ts';
import { assistantMessageRating } from './assistant-message-rating.ts';

const carryover = { explicit: true, reason: 'adult_context_carryover', resolvedMode: 'explicit' } as DialogueRoutingDecision;
const sexualRoute = { ...carryover, reason: 'adult_explicit' } as DialogueRoutingDecision;
const clear = { allowed: true, flagged: false, categories: [], categoryScores: {} } satisfies NormalizedModerationResult;

Deno.test('ordinary text from an adult-context route is visible on iOS', () => {
  assertEquals(assistantMessageRating(carryover, 'The pool is closed, so I went home and made tea.', clear), 'safe');
  assertEquals(assistantMessageRating(carryover, 'I love you. See you tomorrow.', clear), 'suggestive');
});

Deno.test('sexual and uncertain adult replies remain restricted', () => {
  assertEquals(assistantMessageRating(carryover, 'I want to have sex with you.', clear), 'explicit');
  assertEquals(assistantMessageRating(carryover, 'I went home and made tea.', { ...clear, categories: ['sexual'] }), 'explicit');
  assertEquals(assistantMessageRating(carryover, 'I went home and made tea.'), 'explicit');
  assertEquals(assistantMessageRating(sexualRoute, 'I went home and made tea.', clear), 'explicit');
});
