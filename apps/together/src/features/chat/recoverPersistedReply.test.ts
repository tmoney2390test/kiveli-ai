import { expect, it, vi } from 'vitest';
import type { Message } from '../../types';
import { createChatRequestScope } from './requestScope';
import { recoverPersistedReply } from './recoverPersistedReply';

const user = {
  id: 'user',
  role: 'user',
  content: 'hello',
  conversation_id: 'chat',
  client_request_id: 'original-request',
  created_at: '2026-10-03T12:00:00Z',
} as Message;
const reply = {
  ...user,
  id: 'reply',
  role: 'assistant',
  content: 'hi',
  client_request_id: undefined,
} as Message;
const settings = {
  requestId: 'original-request',
  isCurrent: () => true,
  messages: (page: Message[]) => page,
  waitUntilVisible: async () => {},
  wait: async () => {},
  delays: [1, 2, 3],
};

it('recovers a persisted reply with the original request identity after a transient read error', async () => {
  const load = vi.fn().mockRejectedValueOnce(new TypeError('radio waking')).mockResolvedValueOnce([
    user,
  ]).mockResolvedValueOnce([user, reply]);
  const result = await recoverPersistedReply({ ...settings, load });
  expect(result).toEqual({ status: 'recovered', latest: [user, reply] });
  expect(load).toHaveBeenCalledTimes(3);
});

it('retains the durable unanswered turn when its server lease has ended', async () => {
  const load = vi.fn(() => Promise.resolve([user]));
  const result = await recoverPersistedReply({ ...settings, load, shouldContinue: () => false });
  expect(result).toEqual({ status: 'unresolved', latest: [user] });
  expect(load).toHaveBeenCalledTimes(1);
});

it('waits for the matching photo confirmation as well as a message', async () => {
  const acceptResponse = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const result = await recoverPersistedReply({
    ...settings,
    load: () => Promise.resolve([user, reply]),
    acceptResponse,
  });
  expect(result.status).toBe('recovered');
  expect(acceptResponse).toHaveBeenCalledTimes(2);
});

it('does not expose a late old-Life result or continue polling after navigation', async () => {
  const scope = createChatRequestScope();
  let resolve!: (page: Message[]) => void;
  const load = vi.fn(() =>
    new Promise<Message[]>((finish) => {
      resolve = finish;
    })
  );
  const acceptResponse = vi.fn();
  const result = recoverPersistedReply({
    ...settings,
    isCurrent: scope.capture(),
    load,
    acceptResponse,
  });
  await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  scope.dispose();
  scope.activate();
  resolve([user, reply]);
  expect(await result).toEqual({ status: 'cancelled', latest: null });
  expect(acceptResponse).not.toHaveBeenCalled();
  expect(load).toHaveBeenCalledTimes(1);
});

it('does not fetch when the user leaves while a background tab is waking', async () => {
  const scope = createChatRequestScope(), load = vi.fn();
  const result = await recoverPersistedReply({
    ...settings,
    isCurrent: scope.capture(),
    load,
    waitUntilVisible: () => {
      scope.dispose();
      return Promise.resolve();
    },
  });
  expect(result.status).toBe('cancelled');
  expect(load).not.toHaveBeenCalled();
});
