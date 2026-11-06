import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => { storage.set(key, value); return Promise.resolve(); }),
  },
}));

import { loadChatQuickActionState, loadChatQuickActions, markChatQuickActionsSynced, migrateLegacyChatQuickActions, migrateV2ChatQuickActions, normalizeChatQuickActions, saveChatQuickActions, toggleChatQuickAction } from './chatQuickActions';

describe('per-chat quick actions', () => {
  beforeEach(() => storage.clear());

  it('caps and deduplicates shortcuts without allowing Report', () => {
    expect(normalizeChatQuickActions(['voice', 'photo', 'branch', 'photo', 'report', 'continue', 'memory', 'favorite', 'copy'])).toEqual(['voice', 'photo', 'branch', 'continue', 'memory', 'favorite']);
    expect(toggleChatQuickAction(['voice', 'photo', 'branch', 'continue', 'memory', 'favorite'], 'copy')).toEqual(['voice', 'photo', 'branch', 'continue', 'memory', 'favorite']);
    expect(toggleChatQuickAction(['photo', 'branch'], 'branch')).toEqual(['photo']);
    expect(toggleChatQuickAction(['voice', 'photo'], 'voice')).toEqual(['photo']);
    expect(migrateLegacyChatQuickActions(['photo', 'branch'])).toEqual(['voice', 'photo', 'branch']);
  });

  it('keeps choices separate by account, conversation, and chat type, including an empty selection', async () => {
    await saveChatQuickActions('alice', 'chat-a', 'direct', ['photo', 'favorite']);
    await saveChatQuickActions('alice', 'chat-a', 'group', ['continue']);
    expect(await loadChatQuickActions('alice', 'chat-a', 'direct')).toEqual(['photo', 'favorite']);
    expect(await loadChatQuickActions('alice', 'chat-a', 'group')).toEqual(['continue']);
    expect(await loadChatQuickActions('alice', 'chat-b', 'direct')).toEqual(['voice', 'location']);
    expect(await loadChatQuickActions('bob', 'chat-a', 'direct')).toEqual(['voice', 'location']);
    await saveChatQuickActions('alice', 'chat-a', 'direct', []);
    expect(await loadChatQuickActions('alice', 'chat-a', 'direct')).toEqual([]);
  });

  it('migrates old preferences with Voice on and preserves an explicit Voice removal', async () => {
    storage.set('kivelle:chat-quick-actions:v1:alice:direct:chat-a', JSON.stringify({ selected: ['memory'], pendingSync: false }));
    expect(await loadChatQuickActions('alice', 'chat-a', 'direct')).toEqual(['voice', 'memory', 'location']);
    await saveChatQuickActions('alice', 'chat-a', 'direct', ['memory']);
    expect(await loadChatQuickActions('alice', 'chat-a', 'direct')).toEqual(['memory']);
  });

  it('adds Location once to earlier direct-chat selections while preserving full sets and explicit removal', async () => {
    storage.set('kivelle:chat-quick-actions:v2:alice:direct:chat-a', JSON.stringify({ selected: ['voice', 'photo'], pendingSync: false }));
    expect(await loadChatQuickActions('alice', 'chat-a', 'direct')).toEqual(['voice', 'photo', 'location']);
    await saveChatQuickActions('alice', 'chat-a', 'direct', ['voice', 'photo']);
    expect(await loadChatQuickActions('alice', 'chat-a', 'direct')).toEqual(['voice', 'photo']);
    expect(migrateV2ChatQuickActions(['voice', 'branch', 'continue', 'memory', 'favorite', 'photo'], 'direct')).toEqual(['voice', 'branch', 'continue', 'memory', 'favorite', 'photo']);
    expect(migrateV2ChatQuickActions([], 'direct')).toEqual([]);
    expect(migrateV2ChatQuickActions(['voice', 'photo'], 'group')).toEqual(['voice', 'photo']);
  });

  it('keeps an unsynced edit until the matching server write succeeds', async () => {
    await saveChatQuickActions('alice', 'chat-a', 'direct', ['branch'], true);
    await saveChatQuickActions('alice', 'chat-a', 'direct', ['branch', 'photo'], true);
    await markChatQuickActionsSynced('alice', 'chat-a', 'direct', ['branch']);
    expect(await loadChatQuickActionState('alice', 'chat-a', 'direct')).toEqual({ selected: ['branch', 'photo'], pendingSync: true });
    await markChatQuickActionsSynced('alice', 'chat-a', 'direct', ['branch', 'photo']);
    expect(await loadChatQuickActionState('alice', 'chat-a', 'direct')).toEqual({ selected: ['branch', 'photo'], pendingSync: false });
  });
});
