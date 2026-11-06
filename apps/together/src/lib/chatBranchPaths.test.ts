import { describe, expect, it } from 'vitest';
import type { Conversation, KivelleContinuity } from '../types';
import { chatBranchPaths } from './chatBranchPaths';

const life = (id: string, kind: KivelleContinuity['kind'], metadata: Record<string, unknown>, createdAt: string): KivelleContinuity => ({
  id, kind, metadata, created_at: createdAt, updated_at: createdAt, title: 'Liora · Alternate path',
} as KivelleContinuity);
const main = life('main-life', 'main', {}, '2026-10-01T00:00:00Z');
const first = life('branch-1', 'branch', { sourceConversationId: 'main-chat', branchConversationId: 'chat-1' }, '2026-10-02T00:00:00Z');
const second = life('branch-2', 'branch', { sourceConversationId: 'main-chat', branchConversationId: 'chat-2' }, '2026-10-03T00:00:00Z');
const unrelated = life('unrelated', 'branch', { sourceConversationId: 'someone-else', branchConversationId: 'other-chat' }, '2026-10-04T00:00:00Z');

describe('chat branch switcher paths', () => {
  it('shows the original and every sibling path, but no unrelated Life', () => {
    const paths = chatBranchPaths({
      continuities: [second, unrelated, main, first], activeContinuityId: 'main-life',
      conversation: { id: 'main-chat', metadata: {}, last_message_preview: 'How was your day?' } as unknown as Conversation,
      companionName: 'Liora',
    });
    expect(paths.map((path) => path.conversationId)).toEqual(['main-chat', 'chat-1', 'chat-2']);
    expect(paths.map((path) => path.title)).toEqual(['Main conversation', 'Alternate path 1', 'Alternate path 2']);
    expect(paths.filter((path) => path.current).map((path) => path.continuityId)).toEqual(['main-life']);
  });

  it('keeps the same root and identifies the current path when opened from a branch', () => {
    const paths = chatBranchPaths({
      continuities: [main, first, second], activeContinuityId: 'branch-2',
      conversation: { id: 'chat-2', metadata: { branchSourceConversationId: 'main-chat', branchSourceContinuityId: 'main-life' }, last_message_preview: 'A quiet goodbye' } as unknown as Conversation,
      companionName: 'Liora',
      summaries: [{ conversationId: 'chat-1', title: 'A longer evening', preview: 'You asked to join her walk.', lastUsedAt: '2026-10-04T00:00:00Z' }],
    });
    expect(paths.map((path) => path.conversationId)).toEqual(['main-chat', 'chat-1', 'chat-2']);
    expect(paths[1]).toMatchObject({ title: 'A longer evening', preview: 'You asked to join her walk.' });
    expect(paths[2]).toMatchObject({ current: true, preview: 'A quiet goodbye' });
  });
});
