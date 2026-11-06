type Metadata = Record<string, unknown>;

/** Copy shortcut choices once; a retry must not erase changes made on the branch. */
export function initialBranchShortcutMetadata(
  branch: Metadata,
  source: Metadata,
  selected?: readonly string[],
): Metadata | null {
  if (Object.prototype.hasOwnProperty.call(branch, 'chatQuickActions')) return null;
  const actions = selected ?? source.chatQuickActions;
  if (!Array.isArray(actions)) return null;
  return {
    ...branch,
    chatQuickActions: actions,
    chatQuickActionsVersion: selected ? 3 : source.chatQuickActionsVersion ?? 1,
  };
}
