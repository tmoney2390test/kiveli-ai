import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../types';
import { homeCompanionRecommendations } from './homeCompanionRecommendations';
import { featuredCompanionGender } from './featuredCompanions';

const now = Date.parse('2026-09-15T12:00:00Z');
const person = (id: string, gender: string, world = 'home') => ({ id, name: id, slug: id, age: 30, biography: '', occupation: '', discovery_metadata: { gender }, first_meeting: { world_id: world }, together_character_versions: { id: `${id}-v`, interests: [], personality_config: {}, pronouns: gender === 'female' ? 'she/her' : 'he/him' } });
function fixture(women = 199, men = 1): Snapshot {
  const people = [...Array.from({ length: 8 }, (_, i) => person(`A-man-${i}`, 'male')), ...Array.from({ length: 8 }, (_, i) => person(`Z-woman-${i}`, 'female'))];
  return { discoverableCharacters: people, worlds: [{ id: 'home', slug: 'home' }], characterWorldPresence: [],
    characters: [people[0]!, people[8]!].map(p => ({ id: p.id, character_template_id: p.id, together_character_templates: p, together_character_versions: p.together_character_versions })),
    relationships: [{ character_instance_id: people[0]!.id, genuine_back_and_forth_turns: men }, { character_instance_id: people[8]!.id, genuine_back_and_forth_turns: women }],
    conversations: [people[0]!, people[8]!].map(p => ({ id: `chat-${p.id}`, character_instance_id: p.id, kind: 'direct', last_message_at: new Date(now).toISOString() })),
  } as unknown as Snapshot;
}
const genders = (s: Snapshot) => homeCompanionRecommendations(s, 'home', undefined, now).slice(0, 6).map(featuredCompanionGender);
describe('Home companion recommendations', () => {
  it('favors women from engagement despite alphabetical men and leaves one discovery slot', () => {
    expect(genders(fixture())).toEqual(['female', 'female', 'female', 'female', 'female', 'male']);
  });
  it('works symmetrically for a preference for men', () => {
    expect(genders(fixture(1, 199))).toEqual(['male', 'male', 'male', 'male', 'male', 'female']);
  });
  it('balances cold-start and mixed accounts without inferring a preference from a greeting', () => {
    expect(genders(fixture(0, 0))).toEqual(['male', 'female', 'male', 'female', 'male', 'female']);
    expect(genders(fixture(20, 20))).toEqual(genders(fixture(0, 0)));
  });
  it('keeps snapshot state isolated and deduplicates instances', () => {
    const s = fixture();
    s.characters.push(...Array.from({ length: 30 }, () => ({ ...s.characters[0]! })));
    expect(genders(s)).toEqual(genders(fixture()));
    expect(genders(fixture(0, 0))).not.toEqual(genders(s));
  });
  it('ignores archived history and lets recent engagement outweigh stale history', () => {
    const archived = fixture();
    archived.conversations[1]!.user_archived_at = new Date(now).toISOString();
    expect(genders(archived)[0]).toBe('male');
    const stale = fixture(199, 20);
    stale.conversations[1]!.last_message_at = '2025-01-01T00:00:00Z';
    expect(genders(stale)[0]).toBe('male');
  });
  it('preserves world and active-companion exclusions, fills scarce buckets without duplicates', () => {
    const s = fixture();
    s.discoverableCharacters = [person('only-woman', 'female'), person('local-man', 'male'), person('outsider', 'female', 'other')] as unknown as Snapshot['discoverableCharacters'];
    expect(homeCompanionRecommendations(s, 'home', 'local-man', now).map(x => x.id)).toEqual(['only-woman']);
    const result = homeCompanionRecommendations(s, 'home', undefined, now);
    expect(result.map(x => x.id)).toEqual(['only-woman', 'local-man']);
    expect(new Set(result.map(x => x.id)).size).toBe(result.length);
  });
});
