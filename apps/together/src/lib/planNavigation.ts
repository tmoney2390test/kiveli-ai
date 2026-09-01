export type ActivePlanChatTarget = {
  planId: string;
  characterHandle: string;
  groupConversationId?: string | null;
};

/** Returns the ordinary conversation that owns an active plan. */
export function activePlanChatHref(target: ActivePlanChatTarget): string | null {
  const groupConversationId = target.groupConversationId?.trim();
  if (groupConversationId) {
    return `/group-chat?${new URLSearchParams({ id: groupConversationId }).toString()}`;
  }

  const characterHandle = target.characterHandle.trim();
  if (!characterHandle) return null;

  const params = new URLSearchParams({ character: characterHandle });
  const planId = target.planId.trim();
  if (planId) params.set('planId', planId);
  return `/chat?${params.toString()}`;
}
