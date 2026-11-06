import { initialBranchShortcutMetadata } from './chat-branch-shortcuts.ts';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test('a branch inherits the current selection, including an empty selection', () => {
  const source = { chatQuickActions: ['voice', 'location', 'memory'], chatQuickActionsVersion: 3 };
  const inherited = initialBranchShortcutMetadata({ branchId: 'branch-1' }, source);
  assert(JSON.stringify(inherited?.chatQuickActions) === JSON.stringify(['voice', 'location', 'memory']), 'source shortcuts should be copied');
  const unsynced = initialBranchShortcutMetadata({}, source, []);
  assert(Array.isArray(unsynced?.chatQuickActions) && unsynced.chatQuickActions.length === 0, 'an explicit empty selection should remain empty');
  assert(unsynced?.chatQuickActionsVersion === 3, 'current shortcut format should be preserved');
});

Deno.test('retrying branch creation does not overwrite branch-specific changes', () => {
  const branch = { chatQuickActions: ['photo'], chatQuickActionsVersion: 2 };
  assert(initialBranchShortcutMetadata(branch, { chatQuickActions: ['voice'] }, ['voice', 'memory']) === null, 'existing branch shortcuts should win');
});
