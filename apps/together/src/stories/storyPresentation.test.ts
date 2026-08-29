import { describe, expect, it } from 'vitest';
import { initialStoryConversationId, resolveStoryConversationPerson, storyPersonIsPresent, storyRelationshipLabel, usesSplitStoryLayout, visibleStoryMessages } from './storyPresentation';
import type { StoryCampaign, StoryMessage, StoryPerson } from './types';

const opening: StoryMessage = {
  id: 'opening',
  role: 'system',
  character_slug: null,
  content: 'The bell rings thirteen times.',
  loop_number: 0,
  story_minute: 1240,
  location_slug: 'bell-tower',
  metadata: { kind: 'opening' },
  created_at: '2026-08-28T00:00:00Z',
};

describe('story presentation', () => {
  it('only uses the split scene and conversation layout at 1100px and above', () => {
    expect(usesSplitStoryLayout(1099)).toBe(false);
    expect(usesSplitStoryLayout(1100)).toBe(true);
    expect(usesSplitStoryLayout(2560)).toBe(true);
  });

  it('never manufactures character dialogue in the client presentation layer', () => {
    const visible = visibleStoryMessages(
      { messages: [opening], currentLocation: { id: 'bell-tower' } } as never,
      'elara-vale',
    );
    expect(visible).toEqual([opening]);
  });

  it('preserves every attributed speaker in a shared location scene', () => {
    const user = { ...opening, id: 'user', role: 'user' as const, content: 'What happened?' };
    const elara = { ...opening, id: 'elara', role: 'character' as const, character_slug: 'elara-vale' };
    const owen = { ...opening, id: 'owen', role: 'character' as const, character_slug: 'owen-kearney' };
    expect(
      visibleStoryMessages(
        { messages: [opening, user, elara, owen], currentLocation: { id: 'bell-tower' } } as never,
        'owen-kearney',
      ).map((message) => message.id),
    ).toEqual(['opening', 'user', 'elara', 'owen']);
  });

  it('describes relationship state without exposing numeric meters', () => {
    expect(storyRelationshipLabel({ trust: 75, suspicion: 10, emotionalState: 'convinced' })).toContain('believes');
    expect(storyRelationshipLabel({ trust: 10, suspicion: 80, emotionalState: 'hostile' })).toContain('wary');
    expect(storyRelationshipLabel({ trust: 20, suspicion: 20, relationshipCue: 'seems less guarded' })).toBe('seems less guarded');
  });

  it('retains the selected conversation when that person leaves', () => {
    const elara = { id: 'elara-vale', name: 'Elara Vale', currentLocationId: 'black-lantern' } as StoryPerson;
    const seraphine = { id: 'seraphine-orison', name: 'Seraphine Orison' } as StoryPerson;
    const campaign = { presentCharacters: [seraphine], othersNearby: [], dossiers: [elara, seraphine] } as unknown as StoryCampaign;
    expect(resolveStoryConversationPerson(campaign, 'elara-vale')).toBe(elara);
    expect(storyPersonIsPresent(campaign, 'elara-vale')).toBe(false);
    expect(resolveStoryConversationPerson(campaign, '')).toBe(seraphine);
  });

  it('restores the last addressed conversation after a reload instead of switching to someone present', () => {
    const elara = { id: 'elara-vale', name: 'Elara Vale', currentLocationId: 'black-lantern' } as StoryPerson;
    const seraphine = { id: 'seraphine-orison', name: 'Seraphine Orison' } as StoryPerson;
    const addressed = { ...opening, id: 'question', role: 'user' as const, metadata: { targetCharacterId: 'elara-vale' } };
    const campaign = { messages: [opening, addressed], presentCharacters: [seraphine], othersNearby: [], dossiers: [elara, seraphine] } as unknown as StoryCampaign;
    expect(initialStoryConversationId(campaign)).toBe('elara-vale');
  });

  it('keeps the selected character movement marker but suppresses unrelated remote movement', () => {
    const selectedMove = { ...opening, id: 'elara-left', location_slug: 'black-lantern', character_slug: 'elara-vale', metadata: { kind: 'presence_transition', characterId: 'elara-vale' } };
    const unrelatedMove = { ...opening, id: 'owen-left', location_slug: 'stillwater-house', character_slug: 'owen-kearney', metadata: { kind: 'presence_transition', characterId: 'owen-kearney' } };
    const ambientSummary = { ...opening, id: 'ambient', location_slug: 'stillwater-house', metadata: { kind: 'presence_transition_summary' } };
    expect(visibleStoryMessages({ messages: [opening, selectedMove, unrelatedMove, ambientSummary], currentLocation: { id: 'bell-tower' } } as never, 'elara-vale').map((item) => item.id)).toEqual(['opening', 'elara-left']);
  });
});
