import { describe, expect, it } from 'vitest';
import { applyInteractionSceneState, deriveCharacterInteractionProfile, inferInteractionPacks, interactionPacks, matchInteractionIntent, normalizeActivityTag, resolveInteractions, resolveMovementDestinations } from './interactions.ts';

const relationship = { stage: 'friend' as const, trust: 42, comfort: 44, affinity: 46, romanceEnabled: true };
const creativeCharacter = { role: 'primary_companion', interests: ['photography', 'live music', 'food'], personality: { creativity: .9, spontaneity: .7, socialEnergy: .65 } };
const socialCharacter = { role: 'social_character', interests: ['books'], personality: { warmth: .5 } };

describe('Interaction domain', () => {
  it('normalizes natural activity phrases through one alias registry', () => {
    expect(normalizeActivityTag('photo walk')).toBe('photography');
    expect(normalizeActivityTag('arcade games')).toBe('arcade');
    expect(normalizeActivityTag('garden walk')).toBe('walking');
  });

  it('infers composable packs from generic location data', () => {
    const packs = inferInteractionPacks({ id: 'venue', name: 'Any venue', category: 'nightlife', locationType: 'venue', possibleActivities: ['karaoke', 'cocktails', 'live music'] });
    expect(packs).toEqual(expect.arrayContaining(['karaoke', 'bar', 'live_music']));
  });

  it('makes a creative companion prefer compatible interactions without name checks', () => {
    const candidates = resolveInteractions({ character: creativeCharacter, relationship, location: { id: 'park', name: 'Public park', category: 'outdoor', locationType: 'outdoor', possibleActivities: ['photo walk', 'walk'] }, life: { availability: 'open', mood: 'playful', energy: 'high' }, seed: 'creative-park' });
    expect(candidates.some((item) => item.interactionKey.startsWith('photography.'))).toBe(true);
    expect(candidates.some((item) => item.interactionKey.startsWith('park.'))).toBe(true);
  });

  it('does not expose relationship-only interactions to social characters', () => {
    const candidates = resolveInteractions({ character: socialCharacter, relationship, location: { id: 'bar', name: 'A bar', category: 'bar', locationType: 'venue', possibleActivities: ['drinks'] }, life: { availability: 'open' }, seed: 'social-bar' });
    expect(candidates.some((item) => item.family === 'relationship')).toBe(false);
  });

  it('removes actions that do not fit remaining availability', () => {
    const candidates = resolveInteractions({ character: creativeCharacter, relationship, location: { id: 'hike', name: 'A trail', category: 'outdoor', locationType: 'outdoor', possibleActivities: ['hiking'] }, life: { availability: 'limited', expectedEndAt: new Date(Date.now() + 8 * 60_000).toISOString(), now: new Date() }, seed: 'schedule-pressure' });
    expect(candidates.some((item) => item.interactionKey === 'hiking.keep_walking')).toBe(false);
    expect(candidates.some((item) => item.interactionKey === 'hiking.take_a_break')).toBe(false);
  });

  it('uses scene actions to move beyond the immediate previous action', () => {
    const location = { id: 'karaoke', name: 'Any karaoke', category: 'karaoke', locationType: 'venue', possibleActivities: ['karaoke', 'drinks'] };
    const initial = resolveInteractions({ character: creativeCharacter, relationship, location, life: { availability: 'open' }, seed: 'karaoke' });
    const pick = initial.find((item) => item.interactionKey === 'karaoke.pick_a_song')!;
    const state = applyInteractionSceneState({}, pick);
    expect(state.activityLabel).toBe(pick.label);
    const after = resolveInteractions({ character: creativeCharacter, relationship, location, scene: state, life: { availability: 'open' }, seed: 'karaoke' });
    expect(after.find((item) => item.interactionKey === 'karaoke.pick_a_song')?.score ?? 0).toBeLessThan(pick.score);
    expect(after.some((item) => item.interactionKey === 'karaoke.sing_together')).toBe(true);
  });

  it('ranks movement only from supplied nearby locations', () => {
    const destinations = resolveMovementDestinations({ character: creativeCharacter, relationship, location: { id: 'current', name: 'Current', category: 'bar', locationType: 'venue', possibleActivities: ['drinks'] }, nearbyLocations: [{ id: 'nearby', name: 'Nearby riverwalk', category: 'outdoor', locationType: 'outdoor', possibleActivities: ['walk', 'photography'] }], seed: 'movement' });
    expect(destinations).toHaveLength(1);
    expect(destinations[0]?.effects['destinationLocationId']).toBe('nearby');
  });

  it('derives character preferences from authored fields, not display names', () => {
    const profile = deriveCharacterInteractionProfile(creativeCharacter);
    expect(profile.creativeInterest).toBeGreaterThan(.7);
    expect(profile.preferredActivityTags).toEqual(expect.arrayContaining(['photography', 'live_music']));
  });

  it('only matches an affirmative free-text request against currently valid actions', () => {
    const candidates = resolveInteractions({ character: creativeCharacter, relationship, location: { id: 'karaoke', name: 'Any karaoke', category: 'karaoke', locationType: 'venue', possibleActivities: ['karaoke'] }, life: { availability: 'open' }, seed: 'intent' });
    expect(matchInteractionIntent("Let's sing with you", candidates)?.interactionKey).toBe('karaoke.sing_together');
    expect(matchInteractionIntent('Should we sing together?', candidates)).toBeNull();
    expect(matchInteractionIntent("Let's go skydiving", candidates)).toBeNull();
  });

  it('keeps every reusable interaction pack viable across distinct companion profiles', () => {
    const characters = [
      creativeCharacter,
      { role: 'primary_companion', interests: ['books', 'film', 'art'], personality: { curiosity: .9, socialEnergy: .35 } },
      { role: 'primary_companion', interests: ['gaming', 'cooking', 'movies'], personality: { competitiveness: .9, spontaneity: .55 } },
      { role: 'primary_companion', interests: ['hiking', 'camping', 'photography'], personality: { physicalActivity: .85, creativity: .7 } },
    ];
    for (const [packName] of Object.entries(interactionPacks)) {
      const location = { id: `location-${packName}`, name: `Location ${packName}`, category: packName, locationType: packName === 'home' ? 'residence' : packName === 'transit' ? 'transit' : packName === 'district' ? 'district' : 'venue', possibleActivities: [packName] };
      for (const character of characters) {
        const candidates = resolveInteractions({ character, relationship, location, life: { availability: 'open', mood: 'content', energy: 'medium' }, seed: `${packName}:${character.interests.join('-')}` });
        expect(candidates.length, `${packName} should resolve an action`).toBeGreaterThan(0);
        expect(candidates.some((candidate) => candidate.interactionKey.startsWith(`${packName}.`)), `${packName} should surface its primary activity`).toBe(true);
      }
    }
  });
});
