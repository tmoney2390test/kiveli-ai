/** A proposal decision is independent of dialogue generation. Scope to one chat. */
export function createProposalDecisionGuard() {
  let pendingId: string | null = null;
  const completed = new Set<string>();

  return {
    begin(actionId: string) {
      if (pendingId || completed.has(actionId)) return false;
      pendingId = actionId;
      return true;
    },
    finish(actionId: string, saved: boolean) {
      if (pendingId !== actionId) return;
      if (saved) {
        completed.add(actionId);
        // Only recent proposals can be replayed by an in-flight scene refresh.
        if (completed.size > 64) completed.delete(completed.values().next().value!);
      }
      pendingId = null;
    },
    isHidden(actionId: string) {
      return pendingId === actionId || completed.has(actionId);
    },
  };
}

/** Read live state after saving; a reply may have started during the request. */
export async function reactToSavedProposal(isReplyPending: () => boolean, react: () => Promise<void>) {
  if (!isReplyPending()) await react();
}
