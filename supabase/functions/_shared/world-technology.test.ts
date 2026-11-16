import { worldTechnologyGuidance } from './kivelle-closed-world.ts';
import { compileCompanionPrompt } from './kivelle-intelligence.ts';
import { buildKivelleRealtimeInstructions } from './kivelle-realtime-voice.ts';

const world = { id: '10000000-0000-4000-8000-000000000014', slug: 'gilded-coast', name: 'The Gilded Coast', description: 'An age-of-sail coast.', visualContext: { setting: 'No modern technology.' } };
const place = { world, location: { id: 'quay', name: 'Admiralty Quay', description: 'A working harbor.', lore: {}, visualContext: {} }, clock: { weekday: 'Monday', localTime: '19:00' }, ancestry: [], nearby: [], path: 'The Gilded Coast → Admiralty Quay' };
const character = { name: 'Mara', age: 35, occupation: 'Captain', character_bible: {} };

Deno.test('age-of-sail guidance is resolved from canonical world identity, not the user message', () => {
  for (const context of [{ place }, { currentWorld: world }, { worldState: { worldId: world.id } }, { currentWorld: { worldSlug: world.slug } }]) {
    const rules = worldTechnologyGuidance(context);
    assert(rules.includes('pre-industrial age-of-sail'));
    assert(rules.includes('Residents do not own or use phones'));
    assert(rules.includes('handwritten letters, couriers'));
    assert(rules.includes('not a new world fact'));
    assert(rules.includes('do not require archaic English'));
  }
  assert(worldTechnologyGuidance({ userMessage: 'The Gilded Coast', character }) === '');
});

Deno.test('historical device rules do not leak into other worlds or a visitor’s current modern setting', () => {
  for (const slug of ['juniper-city', 'eos-meridian', 'neon-kyo', 'port-vervelle', 'northvale']) {
    assert(worldTechnologyGuidance({ place: { world: { slug } }, currentWorld: world }) === '');
  }
});

for (const conversationStyle of ['texting', 'paragraph']) {
  for (const grouped of [false, true]) {
    Deno.test(`Gilded Coast ${conversationStyle} ${grouped ? 'group' : 'direct'} guidance survives prompt budgeting`, () => {
      const compiled = compileCompanionPrompt({
        character, place, userMessage: 'How did you hear from the harbormaster?', conversationStyle, contentMode: 'standard',
        contextInputCeiling: 8_000, subscription: { intelligenceProfile: 'core' },
        relationship: { relationship_stage: 'friend' }, currentScene: { interactionMode: 'remote', location: 'Admiralty Quay', activity: 'checking the sailing board' },
        recent: Array.from({ length: 50 }, (_, index) => ({ role: index % 2 ? 'user' : 'assistant', content: 'A previous conversation about the harbor. '.repeat(30) })),
        ...(grouped ? { groupContext: { participants: [{ name: 'Mara', characterInstanceId: 'captain' }], action: { intent: 'respond_to_user' } } } : {}),
      });
      assert(compiled.prompt.includes('Residents do not own or use phones'));
      assert(compiled.prompt.includes('Off-screen contact uses a note, messenger'));
      assert(!compiled.prompt.includes('may make a routine call'));
      assert(!compiled.prompt.includes('Write like this character is texting'));
      const section = compiled.sections.find((item) => item.key === 'WORLD_KNOWLEDGE');
      assert(section?.required && section.included);
      assert(compiled.estimatedTokens <= compiled.ceilingTokens);
    });
  }
}

Deno.test('voice calls preserve the historical setting without inventing a device or magical substitute', () => {
  const instructions = buildKivelleRealtimeInstructions({ place, character, relationship: {}, contentMode: 'standard' });
  assert(instructions.includes('voice connection, photos, and scheduling interface do not establish physical devices'));
  assert(instructions.includes('Do not invent magical or disguised equivalents'));
  assert(instructions.includes('Output only the words the companion says aloud'));
});

function assert(value: unknown): asserts value { if (!value) throw new Error('Assertion failed'); }
