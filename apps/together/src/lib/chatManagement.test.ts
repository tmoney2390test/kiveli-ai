import { describe, expect, it } from 'vitest';
import {
  type ManagedChat,
  managedChatHref,
  managedChatName,
  mergeManagedChats,
  selectableChatIds,
} from './chatManagement';
const chat = (overrides: Partial<ManagedChat> = {}): ManagedChat => ({
  id: 'chat-1',
  continuity_id: 'life',
  character_instance_id: 'person',
  kind: 'direct',
  title: null,
  archived_at: null,
  last_message_at: null,
  created_at: '2026-10-26',
  life_title: 'Main Life',
  is_branch: false,
  companion_name: 'Hana',
  ...overrides,
});
describe('chat management', () => {
  it('only selects active normal chats for bulk archiving', () =>
    expect(
      selectableChatIds([
        chat(),
        chat({ id: 'branch', is_branch: true }),
        chat({ id: 'old', archived_at: '2026-10-25' }),
      ]),
    ).toEqual(['chat-1']));
  it('keeps pagination deduplicated and uses refreshed row state', () =>
    expect(
      mergeManagedChats([chat()], [chat({ title: 'Updated' }), chat({ id: 'second' })]).map(
        (row) => [row.id, row.title],
      ),
    ).toEqual([['chat-1', 'Updated'], ['second', null]]));
  it('opens saved transcripts read-only and resumes the exact direct/group thread', () => {
    expect(managedChatHref(chat({ archived_at: 'yesterday' }))).toBe('/conversation/chat-1');
    expect(managedChatHref(chat({ archived_at: 'yesterday' }), true)).toBe(
      '/chat?character=person&conversationId=chat-1',
    );
    expect(managedChatHref(chat({ kind: 'group' }))).toBe('/group-chat?id=chat-1');
    expect(managedChatName(chat({ kind: 'group', title: 'Friends' }))).toBe('Friends');
  });
});
