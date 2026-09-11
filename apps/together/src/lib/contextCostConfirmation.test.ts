import { beforeEach, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));
beforeEach(() => { vi.resetModules(); vi.resetAllMocks(); });
it('remembers confirmation after module reload, scoped to user, conversation and activation', async () => {
  const values = new Map<string, string>();
  storage.setItem.mockImplementation((key: string, value: string) => { values.set(key, value); return Promise.resolve(); });
  storage.getItem.mockImplementation((key: string) => Promise.resolve(values.get(key) ?? null));
  let subject = await import('./contextCostConfirmation');
  await subject.confirmContextCost('owner', 'chat', 'activation-1');
  vi.resetModules(); subject = await import('./contextCostConfirmation');
  expect(await subject.contextCostConfirmed('owner', 'chat', 'activation-1')).toBe(true);
  expect(await subject.contextCostConfirmed('other', 'chat', 'activation-1')).toBe(false);
  expect(await subject.contextCostConfirmed('owner', 'other', 'activation-1')).toBe(false);
  expect(await subject.contextCostConfirmed('owner', 'chat', 'activation-2')).toBe(false);
});
it('fails closed on read failure, while keeping a confirmed choice for the session if writing fails', async () => {
  storage.getItem.mockRejectedValue(new Error('Unavailable')); storage.setItem.mockRejectedValue(new Error('Full'));
  const subject = await import('./contextCostConfirmation');
  expect(await subject.contextCostConfirmed('owner', 'chat', 'activation')).toBe(false);
  await subject.confirmContextCost('owner', 'chat', 'activation');
  expect(await subject.contextCostConfirmed('owner', 'chat', 'activation')).toBe(true);
  expect(await subject.contextCostConfirmed('', 'chat', 'activation')).toBe(false);
});
