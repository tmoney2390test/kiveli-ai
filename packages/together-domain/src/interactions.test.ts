import { describe, expect, it } from 'vitest';
import { applyInteractionSceneState, deriveCharacterInteractionProfile, deriveInteractionRelationshipEvidence, inferInteractionPacks, interactionPacks, matchInteractionIntent, normalizeActivityTag, resolveCharacterInitiative, resolveCharacterInteractionDecision, resolveInteractions, resolveMovementDestinations, resolveSceneTransition } from './interactions.ts';

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

  it('resolves arena-specific actions from canonical sports content', () => {
    const location = { id: 'arena', name: 'Any arena', category: 'arena', locationType: 'venue', possibleActivities: ['basketball game', 'hockey game'], metadata: { interactionPacks: ['sports'] } };
    expect(inferInteractionPacks(location)).toContain('sports');
    const candidates = resolveInteractions({ character: creativeCharacter, relationship, location, life: { availability: 'open' }, seed: 'arena-night' });
    expect(candidates.some((item) => item.interactionKey === 'sports.pick_a_side')).toBe(true);
    expect(candidates.some((item) => item.interactionKey === 'sports.take_a_concourse_photo')).toBe(true);
  });

  it('strongly prefers the planned activity while the plan is fresh', () => {
    const location = { id: 'lucky-note', name: 'Any karaoke', category: 'karaoke', locationType: 'venue', possibleActivities: ['karaoke', 'drinks'] };
    const candidates = resolveInteractions({ character: creativeCharacter, relationship, location, life: { availability: 'open' }, activePlan: { id: 'plan', activityKey: 'karaoke', locationId: 'lucky-note', title: 'Karaoke at Lucky Note', startsAt: '2026-08-14T18:00:00Z', endsAt: '2026-08-14T20:00:00Z' }, seed: 'plan-karaoke' });
    expect(candidates.slice(0, 3).some((item) => item.interactionKey.startsWith('karaoke.'))).toBe(true);
    expect(candidates.some((item) => item.reasonCodes.includes('active_plan_activity'))).toBe(true);
  });

  it('mutates lightweight karaoke state deterministically', () => {
    const location = { id: 'lucky-note', name: 'Any karaoke', category: 'karaoke', locationType: 'venue', possibleActivities: ['karaoke'] };
    const pick = resolveInteractions({ character: creativeCharacter, relationship, location, life: { availability: 'open' }, activePlan: { id: 'plan', activityKey: 'karaoke', locationId: 'lucky-note', title: 'Karaoke', startsAt: '2026-08-14T18:00:00Z', endsAt: '2026-08-14T20:00:00Z' }, seed: 'plan-state' }).find((item) => item.interactionKey === 'karaoke.let_them_pick_your_song')!;
    const state = applyInteractionSceneState({ activity: { type: 'karaoke', songsCompleted: 0 } }, pick);
    expect(state.activity?.['currentSong']).toEqual({ pickedBy: 'character' });
    expect(state.activity?.['actions']).toContain('karaoke.let_them_pick_your_song');
  });

  it('keeps the selected cinema activity distinct from a stale companion suggestion', () => {
    const location = { id: 'cinema', name: 'Rooftop Cinema', category: 'cinema', locationType: 'venue', possibleActivities: ['movie'] };
    const candidates = resolveInteractions({ character: creativeCharacter, relationship, location, life: { availability: 'open' }, seed: 'cinema-choice', limit: 10 });
    const selected = candidates.find((item) => item.interactionKey === 'cinema.pick_a_movie')!;
    const state = applyInteractionSceneState({ pendingProposalId: 'stay-for-credits', activity: { type: 'cinema', phase: 'before_movie', stayedForCredits: true } }, selected);
    expect(state.activityLabel).toBe('Pick a movie');
    expect(state.selectedBy).toBe('user');
    expect(state.activity).toMatchObject({ type: 'cinema', phase: 'choosing_movie', moviePickedBy: 'user', stayedForCredits: false });
    expect(state.recentActionKeys).toEqual(['cinema.pick_a_movie']);
  });

  it('lets shared history influence scene options without replacing current place rules', () => {
    const location = { id: 'lucky-note', name: 'Any karaoke', category: 'karaoke', locationType: 'venue', possibleActivities: ['karaoke'] };
    const candidates = resolveInteractions({ character: creativeCharacter, relationship, location, life: { availability: 'open' }, memoryCues: [{ memoryId:'episode', type:'shared_activity', activityTags:['karaoke'], locationId:'lucky-note', strength:.9, valence:.8 }], seed:'memory-karaoke' });
    expect(candidates.find((item) => item.interactionKey === 'karaoke.let_them_pick_your_song')?.label).toContain('again');
    expect(candidates.find((item)=>item.interactionKey==='karaoke.let_them_pick_your_song')?.presentation?.subtitle).toBe('A familiar choice');
  });

  it('lets an autonomous companion propose a valid scene action without inventing one',()=>{
    const candidates=resolveInteractions({character:{...creativeCharacter,personality:{initiative:.95,spontaneity:.9}},relationship,location:{id:'gallery',name:'Gallery',category:'gallery',locationType:'venue',possibleActivities:['art']},life:{availability:'open'},seed:'initiative-options'});
    const profile=deriveCharacterInteractionProfile({...creativeCharacter,personality:{initiative:.95,spontaneity:.9}});
    const initiative=resolveCharacterInitiative({candidates,profile,life:{availability:'open'},scene:{recentActionKeys:[]},now:new Date('2026-08-18T18:00:00Z'),seed:'certain-initiative'});
    expect(initiative.kind).toBe('proposal');
    if(initiative.kind==='proposal')expect(candidates.some((candidate)=>candidate.interactionKey===initiative.interactionKey)).toBe(true);
    expect(resolveCharacterInitiative({candidates,profile,life:{availability:'busy'},scene:{recentActionKeys:[]},seed:'busy'})).toMatchObject({kind:'none',reasonCodes:['not_interruptible']});
  });

  it('permits refusal and counteroffers without mutating canonical scene state first',()=>{
    const candidates=resolveInteractions({character:creativeCharacter,relationship,location:{id:'trail',name:'Trail',category:'outdoor',locationType:'outdoor',possibleActivities:['hiking']},life:{availability:'open',energy:'low'},seed:'tired-hike'});
    const requested=candidates.find((candidate)=>candidate.interactionKey==='hiking.keep_walking')??candidates[0]!;
    const decision=resolveCharacterInteractionDecision({candidate:requested,candidates,profile:deriveCharacterInteractionProfile(creativeCharacter),relationship,life:{availability:'open',energy:'exhausted'},scene:{recentActionKeys:[]},seed:'tired-decision'});
    expect(['countered','declined']).toContain(decision.decision);
    expect(decision.resolvedInteractionKey).toBeUndefined();
  });

  it('writes dimensional evidence with diminishing returns and respects friendship-only mode',()=>{
    const candidate={interactionKey:'trivia.celebrate_a_good_round',family:'activity' as const,effects:{relationshipEvidenceType:'shared_experience'}};
    const first=deriveInteractionRelationshipEvidence(candidate,{...relationship,romanceEnabled:false},0)!;
    const repeated=deriveInteractionRelationshipEvidence(candidate,{...relationship,romanceEnabled:false},4)!;
    expect(first.metricDelta.affinity).toBeGreaterThan(0);
    expect(first.metricDelta.attraction??0).toBe(0);
    expect(repeated.quality).toBe(0);
    expect(Object.values(repeated.metricDelta).every((value)=>value===0)).toBe(true);
  });

  it('turns approaching obligations into a graceful departure transition',()=>{
    const candidate={interactionKey:'cafe.stay_a_little_longer',durationMinutes:20,effects:{mayExtendScene:true}};
    expect(resolveSceneTransition({candidate,life:{now:new Date('2026-08-18T18:00:00Z'),expectedEndAt:'2026-08-18T18:04:00Z'}})).toEqual({kind:'character_departure',reason:'schedule'});
  });

  it('does not rank an explicitly disliked activity as a positive callback', () => {
    const candidates = resolveInteractions({ character: creativeCharacter, relationship, location: { id:'bar', name:'Any bar', category:'bar', locationType:'venue', possibleActivities:['drinks'] }, life:{availability:'open'}, memoryCues:[{memoryId:'crowds',type:'negative_preference',activityTags:['drinks'],strength:1}],seed:'negative-memory' });
    expect(candidates.find((item)=>item.interactionKey==='bar.grab_a_drink')?.reasonCodes).toContain('negative_preference');
  });

  it('queues media only for an explicit photo action', () => {
    const photo = interactionPacks['live_music']?.find((item) => item.key === 'live_music.take_a_photo_together');
    const duet = interactionPacks['karaoke']?.find((item) => item.key === 'karaoke.sing_together');
    expect(photo?.effects?.mediaPolicy).toBe('explicit');
    expect(duet?.effects?.mediaPolicy).toBe('offer');
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
