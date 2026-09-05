import { characterTemplateVisibleToViewer, projectPublicCharacterConnections } from './together-character-profile.ts';

function assert(condition: unknown, message: string) { if (!condition) throw new Error(message); }

const official = (id: string, name: string) => ({
  id, name, slug: name.toLowerCase(), age: 30, occupation: 'Envoy', spice_level: 1, creator_id: null,
  current_published_version: 1, published: true, can_be_selected: true, visibility: 'public', lifecycle_status: 'published',
  together_character_versions: [{ id: `${id}-v1`, version: 1, portrait_asset_key: id, appearance_config: {} }],
});

Deno.test('profile connections deduplicate reciprocal public edges and expose only projected fields', () => {
  const result = projectPublicCharacterConnections({
    sourceTemplateId: 'source', worldId: 'world', viewerUserId: 'viewer', targets: [official('target', 'Target')],
    edges: [
      { world_id: 'world', source_template_id: 'source', target_template_id: 'target', relationship_type: 'trusted ally', affinity: 80, trust: 75, history: 'They survived the same siege.', metadata: { privateTension: 'must never escape' } },
      { world_id: 'world', source_template_id: 'target', target_template_id: 'source', relationship_type: 'old friend', affinity: 78, trust: 72, history: 'Public history.' },
    ],
  });
  assert(result.length === 1 && result[0]?.direction === 'mutual', 'reciprocal edges should become one mutual connection');
  assert(result[0]?.relationshipLabel === 'trusted ally', 'the profiled character outgoing label should win');
  const serialized = JSON.stringify(result);
  assert(!serialized.includes('privateTension') && !serialized.includes('"affinity":') && !serialized.includes('"trust":') && !serialized.includes('creator_id') && !serialized.includes('user_id') && !serialized.includes('metadata'), 'internal edge and ownership data must not reach the client');
});

Deno.test('profile connections never reveal another users private character', () => {
  const privateTarget = { ...official('private', 'Private'), creator_id: 'other-user', published: false, can_be_selected: false, visibility: 'private', lifecycle_status: 'ready' };
  const edges = [{ world_id: 'world', source_template_id: 'source', target_template_id: 'private', relationship_type: 'friend', history: 'Hidden.' }];
  const result = projectPublicCharacterConnections({ sourceTemplateId: 'source', worldId: 'world', viewerUserId: 'viewer', targets: [privateTarget], edges });
  assert(result.length === 0, 'a private character owned by someone else must be omitted');
  assert(!characterTemplateVisibleToViewer(privateTarget, 'viewer'), 'a different authenticated user cannot view the private character');
  assert(characterTemplateVisibleToViewer(privateTarget, 'other-user'), 'the owning user may view their own ready character');
});

Deno.test('incoming-only relationships keep their direction explicit', () => {
  const result = projectPublicCharacterConnections({
    sourceTemplateId: 'source', worldId: 'world', viewerUserId: 'viewer', targets: [official('target', 'Target')],
    edges: [{ world_id: 'world', source_template_id: 'target', target_template_id: 'source', relationship_type: 'protected heir', history: 'Target protects Source.' }],
  });
  assert(result[0]?.direction === 'incoming', 'an incoming relationship must not be presented as an outgoing claim');
});
