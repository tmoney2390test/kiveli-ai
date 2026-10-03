import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GroupDetail } from '../../types';
import { createChatRequestScope } from './requestScope';
import { loadGroupConversation } from './loadGroupConversation';
import { useGroupConversationLoad } from './useGroupConversationLoad';

const harness = vi.hoisted(() => ({
  cleanups: [] as (() => void)[],
  resumes: [] as (() => void)[],
}));
vi.mock('react', () => ({
  useRef: (current: unknown) => ({ current }),
  useCallback: (callback: unknown) => callback,
  useLayoutEffect: (effect: () => void) => effect(),
  useEffect: (effect: () => (() => void) | undefined) => {
    const cleanup = effect();
    if (cleanup) harness.cleanups.push(cleanup);
  },
}));
vi.mock('./loadGroupConversation', () => ({ loadGroupConversation: vi.fn() }));
vi.mock('../../lib/webPageLifecycle', () => ({
  subscribeToWebPageResume: (callback: () => void) => {
    harness.resumes.push(callback);
    return () => {
      harness.resumes = harness.resumes.filter((value) => value !== callback);
    };
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
function mount(ready = true) {
  const scope = createChatRequestScope();
  const setDetail = vi.fn(),
    setLoading = vi.fn(),
    setError = vi.fn(),
    retry = vi.fn(),
    prepareScroll = vi.fn();
  const loadedConversation = { current: null as string | null };
  useGroupConversationLoad({
    scope,
    cacheScope: 'user:life',
    conversationId: 'group',
    ready,
    attempt: 0,
    connectionPhase: 'online',
    loadedConversation,
    setDetail,
    setLoading,
    setError,
    retry,
    prepareScroll,
  });
  return { scope, setDetail, setLoading, setError, loadedConversation, retry, prepareScroll };
}
beforeEach(() => {
  vi.mocked(loadGroupConversation).mockReset().mockResolvedValue(detail);
});
afterEach(() => {
  harness.cleanups.splice(0).forEach((cleanup) => cleanup());
  harness.resumes = [];
  vi.useRealTimers();
});

it('does not request or show a missing-group error before the active Life is ready', async () => {
  const state = mount(false);
  await Promise.resolve();
  expect(loadGroupConversation).not.toHaveBeenCalled();
  expect(state.setError).not.toHaveBeenCalled();
  expect(state.setLoading).not.toHaveBeenCalled();
});

it('settles the initial loading state with the matching conversation', async () => {
  const state = mount();
  await vi.waitFor(() => expect(state.setLoading).toHaveBeenLastCalledWith(false));
  expect(state.loadedConversation.current).toBe('group');
  expect(state.prepareScroll).toHaveBeenCalledOnce();
  expect(state.setDetail.mock.calls[0]?.[0](null)).toBe(detail);
});

it('ignores a late success after unmount, even if the loader ignores its abort signal', async () => {
  let finish!: (value: GroupDetail) => void;
  vi.mocked(loadGroupConversation).mockImplementationOnce(() =>
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  const state = mount();
  const signal = vi.mocked(loadGroupConversation).mock.calls[0]![0].signal;
  harness.cleanups.splice(0).forEach((cleanup) => cleanup());
  expect(signal.aborted).toBe(true);
  finish(detail);
  await Promise.resolve();
  await Promise.resolve();
  expect(state.setDetail).not.toHaveBeenCalled();
  expect(state.loadedConversation.current).toBeNull();
  expect(state.setLoading).toHaveBeenCalledTimes(1);
});

it('debounces resume events and never starts a second read while one is active', async () => {
  vi.useFakeTimers();
  const state = mount();
  await vi.advanceTimersByTimeAsync(0);
  let finish!: (value: GroupDetail) => void;
  vi.mocked(loadGroupConversation).mockImplementationOnce(() =>
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  harness.resumes[0]!();
  harness.resumes[0]!();
  await vi.advanceTimersByTimeAsync(180);
  expect(loadGroupConversation).toHaveBeenCalledTimes(2);
  expect(vi.mocked(loadGroupConversation).mock.calls[1]![0].fresh).toBe(true);
  harness.resumes[0]!();
  await vi.advanceTimersByTimeAsync(180);
  expect(loadGroupConversation).toHaveBeenCalledTimes(2);
  expect(state.prepareScroll).toHaveBeenCalledTimes(1);
  finish(detail);
  await vi.advanceTimersByTimeAsync(0);
  expect(state.setLoading).toHaveBeenLastCalledWith(false);
});

it('leaves the timeline visible after a failed resume and allows the next resume to retry', async () => {
  vi.useFakeTimers();
  const state = mount();
  await vi.advanceTimersByTimeAsync(0);
  state.setError.mockClear();
  state.setDetail.mockClear();
  vi.mocked(loadGroupConversation).mockRejectedValueOnce(new TypeError('Network request failed'));
  harness.resumes[0]!();
  await vi.advanceTimersByTimeAsync(180);
  expect(state.setError).not.toHaveBeenCalled();
  expect(state.setDetail).not.toHaveBeenCalled();
  harness.resumes[0]!();
  await vi.advanceTimersByTimeAsync(180);
  expect(loadGroupConversation).toHaveBeenCalledTimes(3);
  expect(state.setDetail).toHaveBeenCalledOnce();
});

it('makes an unsuccessful initial load retryable when the tab wakes', async () => {
  vi.useFakeTimers();
  vi.mocked(loadGroupConversation).mockRejectedValueOnce(new Error('Radio unavailable'));
  const state = mount();
  await vi.advanceTimersByTimeAsync(0);
  expect(state.setError).toHaveBeenLastCalledWith('Radio unavailable');
  expect(state.setLoading).toHaveBeenLastCalledWith(false);
  harness.resumes[0]!();
  await vi.advanceTimersByTimeAsync(180);
  expect(state.retry).toHaveBeenCalledOnce();
  expect(state.loadedConversation.current).toBeNull();
});
