import { expect, it, vi } from 'vitest';
import { authorizeReply } from './authorizeReply';
import { createChatRequestScope } from './requestScope';

it('blocks concurrent sends while awaiting cost confirmation and preserves authorization', async () => {
  const scope = createChatRequestScope();
  let confirm!: (value: { contextQuoteId: string }) => void;
  const authorize = vi.fn(() =>
    new Promise<{ contextQuoteId: string }>((resolve) => {
      confirm = resolve;
    })
  );
  const first = authorizeReply(scope, authorize);
  expect(await authorizeReply(scope, authorize)).toBeNull();
  expect(authorize).toHaveBeenCalledTimes(1);
  confirm({ contextQuoteId: 'approved-quote' });
  const result = await first;
  expect(result?.authorization.contextQuoteId).toBe('approved-quote');
  expect(await authorizeReply(scope, authorize)).toBeNull();
  result?.request.release();
  const next = await authorizeReply(
    scope,
    () => Promise.resolve({ contextPreference: 'included' }),
  );
  expect(next?.authorization.contextPreference).toBe('included');
});

it('never dispatches an authorization that returns after a Life change', async () => {
  const scope = createChatRequestScope();
  let confirm!: (value: object) => void;
  const pending = authorizeReply(scope, () =>
    new Promise<object>((resolve) => {
      confirm = resolve;
    }));
  scope.dispose();
  scope.activate();
  confirm({ contextQuoteId: 'old-Life' });
  expect(await pending).toBeNull();
});

it('releases the send lock after cancellation or failure without retrying the quote', async () => {
  const scope = createChatRequestScope();
  expect(await authorizeReply(scope, () => Promise.resolve(null))).toBeNull();
  const failure = vi.fn(() => Promise.reject(new Error('offline')));
  await expect(authorizeReply(scope, failure)).rejects.toThrow('offline');
  expect(failure).toHaveBeenCalledTimes(1);
  expect(await authorizeReply(scope, () => Promise.resolve({ contextPreference: 'included' }))).not
    .toBeNull();
});
