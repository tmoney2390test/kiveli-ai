import { beforeEach, expect, it, vi } from 'vitest';
import { useContextQuote } from './useContextQuote';

const mocks = vi.hoisted(() => ({ quote: vi.fn(), confirmed: vi.fn(), confirm: vi.fn() }));
// Minimal lifecycle harness, including dependency cleanup and persistent refs.
const react = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], effects: [] as (() => void)[], cleanups: [] as (() => void)[] }));
vi.mock('react', () => ({
  useRef: (value: unknown) => { const i = react.cursor++; return react.slots[i] ??= { current: value }; },
  useState: (value: unknown) => { const i = react.cursor++; if (!(i in react.slots)) react.slots[i] = value; return [react.slots[i], (next: unknown) => { react.slots[i] = next; }]; },
  useEffect: (effect: () => (() => void) | void, deps: unknown[]) => {
    const i = react.cursor++, next = JSON.stringify(deps);
    if (react.slots[i] === next) return;
    react.slots[i] = next;
    react.effects.push(() => { react.cleanups[i]?.(); react.cleanups[i] = effect() ?? (() => undefined); });
  },
}));
vi.mock('../lib/api', () => ({ quoteDialogueContext: mocks.quote }));
vi.mock('../lib/contextCostConfirmation', () => ({ contextCostConfirmed: mocks.confirmed, confirmContextCost: mocks.confirm }));
const draft = { conversationId: 'chat', message: 'Hello' };
const defaults = { userId: 'owner', preference: 'extended_32k', activationId: 'first', draft, revision: '1' };
function render(options: Partial<Parameters<typeof useContextQuote>[0]> = {}) {
  react.cursor = 0;
  const hook = useContextQuote({ ...defaults, ...options });
  react.effects.splice(0).forEach(effect => effect());
  return hook;
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
beforeEach(() => {
  react.cleanups.forEach(cleanup => cleanup()); react.slots = []; react.cleanups = []; react.effects = [];
  vi.resetAllMocks(); mocks.confirmed.mockResolvedValue(false); mocks.confirm.mockResolvedValue(undefined);
  mocks.quote.mockResolvedValue({ quoteId: 'quote', contextPreference: 'extended_32k', expiresAt: new Date(Date.now() + 60_000).toISOString() });
});
it('does not quote on render or keystrokes, and Included sends without a popup', async () => {
  render(); render({ draft: { ...draft, message: 'Updated' } });
  expect(mocks.quote).not.toHaveBeenCalled();
  const hook = render({ preference: 'included', userId: undefined });
  expect(await hook.authorize(draft)).toEqual({ contextPreference: 'included' });
  expect(mocks.confirmed).not.toHaveBeenCalled();
});
it('asks on Send, proceeds automatically, and does not ask again for the same activation', async () => {
  let hook = render(); const first = hook.authorize(draft); await tick(); hook = render();
  expect(hook.prompt?.kind).toBe('confirm'); expect(mocks.quote).not.toHaveBeenCalled();
  hook.respond('proceed'); expect(await first).toEqual({ contextQuoteId: 'quote' });
  expect(mocks.confirm).toHaveBeenCalledWith('owner', 'chat', 'extended_32k:first');
  mocks.confirmed.mockResolvedValue(true); hook = render();
  expect(await hook.authorize(draft)).toEqual({ contextQuoteId: 'quote' });
  expect(mocks.confirm).toHaveBeenCalledTimes(1);
});
it('cancels without quoting or confirming and prevents duplicate sends', async () => {
  let hook = render(); const first = hook.authorize(draft);
  expect(await hook.authorize(draft)).toBeNull(); await tick(); hook = render(); hook.respond('cancel');
  expect(await first).toBeNull(); expect(mocks.quote).not.toHaveBeenCalled(); expect(mocks.confirm).not.toHaveBeenCalled();
});
it('checks a new activation when paid memory is re-enabled', async () => {
  render({ preference: 'included', activationId: undefined });
  let hook = render({ activationId: 'second' }); const pending = hook.authorize(draft); await tick();
  hook = render({ activationId: 'second' }); expect(hook.prompt?.kind).toBe('confirm');
  expect(mocks.confirmed).toHaveBeenCalledWith('owner', 'chat', 'extended_32k:second');
  hook.respond('cancel'); await pending;
});
it.each(['account', 'draft', 'settings', 'unmount'])('cancels an open confirmation on %s change', async kind => {
  const hook = render(); const pending = hook.authorize(draft); await tick();
  if (kind === 'unmount') react.cleanups.forEach(cleanup => cleanup());
  else render(kind === 'account' ? { userId: 'other' } : kind === 'draft' ? { draft: { ...draft, message: 'Changed' } } : { activationId: 'new' });
  hook.respond('proceed'); expect(await pending).toBeNull(); expect(mocks.quote).not.toHaveBeenCalled();
});
it('discards a quote that completes after the account changes', async () => {
  mocks.confirmed.mockResolvedValue(true);
  let finish!: (value: unknown) => void;
  mocks.quote.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const hook = render(); const pending = hook.authorize(draft); await tick();
  const signal = mocks.quote.mock.calls[0]![1] as AbortSignal;
  render({ userId: 'other' }); expect(signal.aborted).toBe(true);
  finish({ quoteId: 'stale' }); expect(await pending).toBeNull();
});
it('requires an explicit choice on quote failure and can retry without another cost notice', async () => {
  mocks.confirmed.mockResolvedValue(true); mocks.quote.mockRejectedValueOnce(new Error('Offline'));
  let hook = render(); const pending = hook.authorize(draft); await tick(); hook = render();
  expect(hook.prompt).toEqual({ kind: 'error', message: 'Offline' }); hook.respond('retry');
  expect(await pending).toEqual({ contextQuoteId: 'quote' }); expect(mocks.quote).toHaveBeenCalledTimes(2);
});
it('offers Included only explicitly for a pending photo, retaining the paid preference', async () => {
  let hook = render({ hasPendingPhoto: true }); const pending = hook.authorize(draft);
  hook = render({ hasPendingPhoto: true }); expect(hook.prompt?.kind).toBe('photo'); hook.respond('included');
  expect(await pending).toEqual({ contextPreference: 'included' }); expect(hook.selected).toBe('extended_32k');
  expect(mocks.quote).not.toHaveBeenCalled(); expect(mocks.confirm).not.toHaveBeenCalled();
});
it.each(['expired', 'different'])('does not submit an %s quote', async kind => {
  mocks.confirmed.mockResolvedValue(true);
  mocks.quote.mockResolvedValue({ quoteId: 'bad', contextPreference: kind === 'different' ? 'included' : 'extended_32k', expiresAt: kind === 'expired' ? '2020-01-01' : new Date(Date.now() + 60_000).toISOString() });
  let hook = render(); const pending = hook.authorize(draft); await tick(); hook = render();
  expect(hook.prompt?.kind).toBe('error'); hook.respond('cancel'); expect(await pending).toBeNull();
});
