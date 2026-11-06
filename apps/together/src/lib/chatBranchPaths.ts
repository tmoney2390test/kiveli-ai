import type { Conversation, KivelleContinuity } from '../types';

export type ChatBranchPath = {
  continuityId: string;
  conversationId: string;
  title: string;
  preview: string;
  lastUsedAt: string | null;
  current: boolean;
  original: boolean;
};

export type ChatBranchSummary = {
  conversationId: string;
  title: string;
  preview: string;
  lastUsedAt: string | null;
};

type Input = {
  continuities: KivelleContinuity[];
  activeContinuityId: string;
  conversation: Conversation;
  companionName: string;
  summaries?: ChatBranchSummary[];
};

/** Branches are separate Lives. Only show the paths rooted in this conversation. */
export function chatBranchPaths({ continuities, activeContinuityId, conversation, companionName, summaries = [] }: Input): ChatBranchPath[] {
  const sourceConversationId = typeof conversation.metadata?.branchSourceConversationId === 'string'
    ? conversation.metadata.branchSourceConversationId
    : conversation.id;
  const sourceContinuityId = typeof conversation.metadata?.branchSourceContinuityId === 'string'
    ? conversation.metadata.branchSourceContinuityId
    : activeContinuityId;
  const source = continuities.find((life) => life.id === sourceContinuityId);
  const summariesByConversation = new Map(summaries.map((summary) => [summary.conversationId, summary]));
  const originalSummary = summariesByConversation.get(sourceConversationId);
  const currentPreview = conversation.last_message_preview?.trim() || '';
  const original: ChatBranchPath = {
    continuityId: sourceContinuityId,
    conversationId: sourceConversationId,
    title: 'Main conversation',
    preview: activeContinuityId === sourceContinuityId && currentPreview ? currentPreview : originalSummary?.preview || `Your original chat with ${companionName}`,
    lastUsedAt: activeContinuityId === sourceContinuityId ? conversation.last_message_at ?? originalSummary?.lastUsedAt ?? source?.updated_at ?? null : originalSummary?.lastUsedAt ?? source?.updated_at ?? null,
    current: activeContinuityId === sourceContinuityId,
    original: true,
  };
  const branches = continuities
    .filter((life) => life.kind === 'branch' && life.metadata?.sourceConversationId === sourceConversationId)
    .filter((life) => typeof life.metadata?.branchConversationId === 'string')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((life, index): ChatBranchPath => {
      const current = life.id === activeContinuityId;
      const summary = summariesByConversation.get(String(life.metadata.branchConversationId));
      const genericTitle = `${companionName} · Alternate path`;
      const storedTitle = summary?.title?.trim() || life.title?.trim() || '';
      const title = storedTitle && storedTitle !== genericTitle
        ? storedTitle
        : `Alternate path ${index + 1}`;
      return {
        continuityId: life.id,
        conversationId: String(life.metadata.branchConversationId),
        title,
        preview: current && currentPreview ? currentPreview : summary?.preview || 'Your progress is saved on this path.',
        lastUsedAt: current ? conversation.last_message_at ?? summary?.lastUsedAt ?? life.updated_at : summary?.lastUsedAt ?? life.updated_at,
        current,
        original: false,
      };
    });
  return [original, ...branches];
}
