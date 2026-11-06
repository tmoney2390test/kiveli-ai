import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GroupDetail } from '../../types';
import { loadGroupDetail } from '../../lib/api/groups';
import {
  cacheCompleteGroupDetail,
  clearGroupDetailCache,
  readCachedGroupDetail,
} from '../../lib/groupDetailCache';
import { loadGroupConversation } from './loadGroupConversation';

vi.mock('../../lib/api/groups', () => ({ loadGroupDetail: vi.fn() }));
vi.mock('../../lib/api/transport', () => ({
  ApiError: class extends Error {
    constructor(message: string, public code: string, public retryable: boolean) {
      super(message);
    }
  },
}));
const detail = {
  conversation: { id: 'group' },
  participants: [],
  messages: [],
  reactions: [],
  generatedMedia: [],
  mediaOffers: [],
  sharedPlans: [],
  conversationActions: [],
  conversationEvents: [],
  settings: {},
} as unknown as GroupDetail;
const input = () => ({
  cacheScope: 'user:life',
  conversationId: 'group',
  signal: new AbortController().signal,
});
beforeEach(() => {
  vi.mocked(loadGroupDetail).mockReset().mockResolvedValue(detail);
});
afterEach(() => {
  clearGroupDetailCache();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('reuses a fresh complete timeline but explicitly refreshes on resume', async () => {
  cacheCompleteGroupDetail('user:life', detail);
  expect(await loadGroupConversation(input())).toBe(detail);
  expect(loadGroupDetail).not.toHaveBeenCalled();
  await loadGroupConversation({ ...input(), fresh: true });
  expect(loadGroupDetail).toHaveBeenCalledTimes(1);
  expect(loadGroupDetail).toHaveBeenCalledWith(
    'group',
    expect.objectContaining({ messageLimit: 30, timeoutMs: 20_000 }),
  );
});

it('coalesces simultaneous opens without mixing another Life into the cached shell', async () => {
  await Promise.all([loadGroupConversation(input()), loadGroupConversation(input())]);
  expect(loadGroupDetail).toHaveBeenCalledTimes(1);
  await loadGroupConversation({ ...input(), cacheScope: 'user:other-life' });
  expect(loadGroupDetail).toHaveBeenCalledTimes(2);
});

it('recovers a warmup aborted by a previous mount when this caller is still active', async () => {
  vi.useFakeTimers();
  vi.mocked(loadGroupDetail).mockRejectedValueOnce(
    Object.assign(new Error('Previous mount closed'), { name: 'AbortError' }),
  );
  const pending = loadGroupConversation(input());
  await vi.runAllTimersAsync();
  expect(await pending).toBe(detail);
  expect(loadGroupDetail).toHaveBeenCalledTimes(2);
});

it('stops a hidden-page load immediately when navigation cancels it', async () => {
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: true }));
  vi.stubGlobal('window', new EventTarget());
  const controller = new AbortController();
  const pending = loadGroupConversation({ ...input(), signal: controller.signal });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(loadGroupDetail).not.toHaveBeenCalled();
});

it('does not cache a late cancelled read even when the transport ignores abort', async () => {
  let complete!: (value: GroupDetail) => void;
  vi.mocked(loadGroupDetail).mockImplementationOnce(() =>
    new Promise((resolve) => {
      complete = resolve;
    })
  );
  const controller = new AbortController();
  const pending = loadGroupConversation({ ...input(), signal: controller.signal });
  await vi.waitFor(() => expect(loadGroupDetail).toHaveBeenCalledTimes(1));
  controller.abort();
  complete(detail);
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(readCachedGroupDetail('user:life', 'group')).toBeUndefined();
});

it('rejects mismatched conversation identities before they enter the cache', async () => {
  vi.mocked(loadGroupDetail).mockResolvedValueOnce({
    ...detail,
    conversation: { ...detail.conversation, id: 'other-group' },
  });
  await expect(loadGroupConversation(input())).rejects.toThrow('This group could not be loaded');
  expect(readCachedGroupDetail('user:life', 'group')).toBeUndefined();
});
