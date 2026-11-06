import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  refs: [] as Array<{ current: unknown }>,
  cursor: 0,
  user: 'owner',
  effects: [] as Array<() => void | (() => void)>,
  storage: new Map<string, string>(),
}));
vi.mock('react', () => ({
  useRef: (value: unknown) => {
    const i = mock.cursor++;
    return mock.refs[i] ?? (mock.refs[i] = { current: value });
  },
  useEffect: (effect: () => void | (() => void)) => mock.effects.push(effect),
}));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ session: { user: { id: mock.user } } }) }));
vi.mock(
  'expo-crypto',
  () => ({
    CryptoDigestAlgorithm: { SHA256: 'sha256' },
    digestStringAsync: (_: string, value: string) => Promise.resolve(value),
  }),
);
vi.mock(
  '@react-native-async-storage/async-storage',
  () => ({
    default: {
      getItem: (key: string) => Promise.resolve(mock.storage.get(key) ?? null),
      setItem: (key: string, value: string) => {
        mock.storage.set(key, value);
        return Promise.resolve();
      },
      removeItem: (key: string) => {
        mock.storage.delete(key);
        return Promise.resolve();
      },
    },
  }),
);
import { useSupportRequest } from './useSupportRequest';
const render = () => {
  mock.cursor = 0;
  return useSupportRequest();
};
beforeEach(() => {
  mock.refs = [];
  mock.cursor = 0;
  mock.user = 'owner';
  mock.effects = [];
  mock.storage.clear();
});
describe('support request recovery', () => {
  it('reuses the persisted request ID after an interrupted response and a remount', async () => {
    const first = vi.fn(() => Promise.reject(new Error('offline')));
    await expect(render()({ message: 'Need help' }, first)).rejects.toThrow('offline');
    const id = (first.mock.calls[0] as unknown as [{ requestId: string }])[0].requestId;
    mock.refs = [];
    const next = vi.fn((payload: object) => Promise.resolve(payload));
    await render()({ message: 'Need help' }, next);
    expect(next).toHaveBeenCalledWith({
      message: 'Need help',
      requestId: id,
      expectedUserId: 'owner',
    });
    expect(mock.storage.size).toBe(0);
  });
  it('does not clear another account draft or reuse its request key when the account changes', async () => {
    let finish!: (value: string) => void;
    const pending = render()({ message: 'Need help' }, () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }));
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    mock.user = 'new-owner';
    render();
    finish('saved');
    await expect(pending).rejects.toThrow('account changed');
    expect([...mock.storage.keys()]).toEqual(['kivelli:support-request:owner:new']);
  });
  it('rejects a second tap while the first submission is pending', async () => {
    const send = render();
    let finish!: (value: string) => void;
    const pending = send({ message: 'Need help' }, () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }));
    await expect(send({ message: 'Need help' }, () => Promise.resolve(''))).rejects.toThrow('already sending');
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    finish('saved');
    await pending;
  });
});
