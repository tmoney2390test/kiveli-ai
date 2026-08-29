import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { LAST_NIGHT_IN_VESPORMOOR } from './kivelle-stories-content.ts';
import { storyActionEventMessageRows, storyPresenceTransitionMessageRows } from './kivelle-stories.ts';

Deno.test('story presence transcript rows are canonical and idempotently keyed', () => {
  const input = {
    definition: LAST_NIGHT_IN_VESPORMOOR,
    campaignId: 'campaign-id',
    userId: 'user-id',
    clientActionId: 'client-action-id',
    loopNumber: 0,
    transitions: [{
      type: 'departed' as const,
      characterId: 'elara-vale',
      originLocationId: 'bell-tower',
      destinationLocationId: 'black-lantern',
      storyMinute: 1260,
      activity: 'Watching Celeste’s contacts',
      witnessed: true,
      reason: 'schedule' as const,
    }],
  };
  const first = storyPresenceTransitionMessageRows(input);
  const retried = storyPresenceTransitionMessageRows(input);
  assertEquals(first, retried);
  assertEquals(first[0]?.client_message_id, 'client-action-id:presence:departed:elara-vale:1260:0');
  assertEquals(first[0]?.content, 'Elara left for The Black Lantern');
  assertEquals(first[0]?.metadata, {
    kind: 'presence_transition',
    canonical: true,
    transitionType: 'departed',
    characterId: 'elara-vale',
    originLocationId: 'bell-tower',
    destinationLocationId: 'black-lantern',
    activity: 'Watching Celeste’s contacts',
    reason: 'schedule',
  });
});

Deno.test('ambient presence churn collapses into one stable transcript marker', () => {
  const ambient = LAST_NIGHT_IN_VESPORMOOR.characters.find((item) => item.storyProfile?.participationTier === 'ambient')!;
  const transitions = [0, 1, 2, 3].map((offset) => ({
    type: 'arrived' as const, characterId: ambient.id, originLocationId: 'black-lantern', destinationLocationId: 'bell-tower',
    storyMinute: 1260 + offset, activity: 'Passing through', witnessed: true, reason: 'schedule' as const,
  }));
  const rows = storyPresenceTransitionMessageRows({ definition: LAST_NIGHT_IN_VESPORMOOR, campaignId: 'campaign', userId: 'user', clientActionId: 'action', loopNumber: 0, transitions });
  assertEquals(rows.length, 1);
  assertEquals(rows[0]?.metadata.kind, 'presence_transition_summary');
  assertEquals(rows[0]?.client_message_id, 'action:presence:summary:1263');
});

Deno.test('follow and absence outcomes use idempotent existing-transcript rows', () => {
  const baseResult = {
    state: { currentMinute: 1260, currentLocationId: 'black-lantern' }, timeAdvanced: 8, evidenceDiscovered: [], deductionsCompleted: [], eventsWitnessed: [], presenceTransitions: [],
    followOutcome: { characterId: 'elara-vale', attemptedLocationId: 'black-lantern', actualLocationId: 'black-lantern', caught: true, rerouted: false, travelMinutes: 8, trace: 'Elara is here.', resumedThread: null },
  } as never;
  const first = storyActionEventMessageRows({ definition: LAST_NIGHT_IN_VESPORMOOR, campaignId: 'campaign', userId: 'user', clientActionId: 'action', loopNumber: 0, result: baseResult });
  const second = storyActionEventMessageRows({ definition: LAST_NIGHT_IN_VESPORMOOR, campaignId: 'campaign', userId: 'user', clientActionId: 'action', loopNumber: 0, result: baseResult });
  assertEquals(first, second);
  assertEquals(first[0]?.client_message_id, 'action:follow-outcome');
});
