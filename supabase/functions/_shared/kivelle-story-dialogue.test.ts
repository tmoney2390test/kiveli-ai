import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { initialStoryCampaign, type StoryActionResult } from '../../../packages/together-domain/src/stories.ts';
import { LAST_NIGHT_IN_VESPORMOOR } from './kivelle-stories-content.ts';
import { ensureCanonicalDepartureClosure, validateStoryDialogue } from './kivelle-story-dialogue.ts';

function unchangedResult(): StoryActionResult {
  const state = initialStoryCampaign(LAST_NIGHT_IN_VESPORMOOR);
  return { state, timeAdvanced: 0, evidenceDiscovered: [], deductionsCompleted: [], eventsWitnessed: [], presenceTransitions: [] };
}

Deno.test('story dialogue rejects hidden canonical facts before discovery', () => {
  const result = unchangedResult();
  assertEquals(validateStoryDialogue(LAST_NIGHT_IN_VESPORMOOR, result.state, result, 'Gabriel Sayer is the temporal echo beneath the lake.'), { valid: false, reason: 'hidden_fact' });
});

Deno.test('story dialogue cannot move the speaker or player', () => {
  const result = unchangedResult();
  assertEquals(validateStoryDialogue(LAST_NIGHT_IN_VESPORMOOR, result.state, result, 'We walk toward the Observatory together.'), { valid: false, reason: 'movement_claim' });
});

Deno.test('story dialogue accepts concise in-character uncertainty', () => {
  const result = unchangedResult();
  assertEquals(validateStoryDialogue(LAST_NIGHT_IN_VESPORMOOR, result.state, result, 'I do not know yet. Tell me exactly what you witnessed.'), { valid: true });
});

Deno.test('story dialogue permits and guarantees only a validated speaker departure', () => {
  const result = unchangedResult();
  result.presenceTransitions = [{
    type: 'departed', characterId: 'elara-vale', originLocationId: 'bell-tower', destinationLocationId: 'black-lantern',
    storyMinute: 1260, activity: 'Watching Celeste’s contacts', witnessed: true, reason: 'schedule',
  }];
  const closed = ensureCanonicalDepartureClosure(LAST_NIGHT_IN_VESPORMOOR, result, 'elara-vale', 'That is all I can tell you here.');
  assertEquals(closed.includes('Find me at The Black Lantern'), true);
  assertEquals(validateStoryDialogue(LAST_NIGHT_IN_VESPORMOOR, result.state, result, closed, undefined, 'elara-vale'), { valid: true });
  assertEquals(validateStoryDialogue(LAST_NIGHT_IN_VESPORMOOR, result.state, result, 'I am going to the University Observatory.', undefined, 'elara-vale'), { valid: false, reason: 'movement_claim' });
});
