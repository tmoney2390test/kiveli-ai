import { assertEquals } from 'jsr:@std/assert';
import { filterMemoriesForPreferences, manualMemoryText, memorySourceContext, projectSnapshotMemories, resolveMemoryProductAccess } from './kivelle-memory-access.ts';

Deno.test('memory product access preserves free continuity while gating the inspector', () => {
  assertEquals(resolveMemoryProductAccess('free', ['memory_core']), { inspector: false, manualControl: false, maxInsights: false });
  assertEquals(resolveMemoryProductAccess('kivelle_plus', ['memory_inspector', 'memory_manual_control']), { inspector: true, manualControl: true, maxInsights: false });
  assertEquals(resolveMemoryProductAccess('kivelle_max', ['memory_inspector', 'memory_manual_control']), { inspector: true, manualControl: true, maxInsights: true });
});

Deno.test('memory source copy distinguishes direct, inferred, and place-grounded memories', () => {
  assertEquals(memorySourceContext({ source_type: 'message', learned_via: 'direct_user' }, 'Glassline Gallery'), 'You shared this during your conversation at Glassline Gallery.');
  assertEquals(memorySourceContext({ learned_via: 'inferred_pattern' }), 'Learned gradually from a pattern across your conversations.');
  assertEquals(memorySourceContext({ source_type: 'manual' }), 'You explicitly asked your companion to remember this.');
  assertEquals(memorySourceContext({ source_type: 'manual', metadata: { sharedPlanId: 'plan' } }, 'Glassline Gallery'), 'Shared during your time together at Glassline Gallery.');
});

Deno.test('manual memory text stays speaker-attributed and canonical', () => {
  assertEquals(manualMemoryText({ role: 'user', content: '  I love rainy mornings. ', characterName: 'Brooke' }), { memoryType: 'semantic', canonicalText: 'User asked Brooke to remember: “I love rainy mornings.”' });
  assertEquals(manualMemoryText({ role: 'assistant', content: 'Meet me by the river.', characterName: 'Brooke' }), { memoryType: 'relationship', canonicalText: 'Brooke said: “Meet me by the river.”' });
});

Deno.test('free snapshots expose counts but never the memory collection', () => {
  const rows = [
    { id: 'memory-a', character_instance_id: 'brooke' },
    { id: 'memory-b', character_instance_id: 'brooke' },
    { id: 'memory-c', character_instance_id: 'chloe' },
  ];
  assertEquals(projectSnapshotMemories(rows, ['memory_core']), {
    memories: [],
    memoryCounts: { brooke: 2, chloe: 1 },
  });
  assertEquals(projectSnapshotMemories(rows, ['memory_inspector']).memories, rows);
});

Deno.test('disabled memory categories cannot enter companion recall', () => {
  const rows = [
    { id: 'about', memory_type: 'semantic' },
    { id: 'likes', memory_type: 'preference' },
    { id: 'shared', memory_type: 'episodic' },
  ];
  assertEquals(filterMemoriesForPreferences(rows, { preference: false }).map((row) => row.id), ['about', 'shared']);
});
