import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  telemetry: vi.fn(),
  clearSession: vi.fn(),
  adultSession: vi.fn(),
}));
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('../supabase', () => ({
  supabase: { auth: {} },
  supabaseUrl: 'https://test.example',
  supabasePublishableKey: 'test-key',
}));
vi.mock('../authSession', () => ({ clearSessionForApiFailure: mocks.clearSession }));
vi.mock('../webAdultSession', () => ({ ensureWebAdultSession: mocks.adultSession }));
vi.mock('./telemetry', () => ({ queueClientPerformance: mocks.telemetry }));
vi.mock('./transport', () => ({
  token: () => Promise.resolve('test-token'),
  invoke: vi.fn(),
  ApiError: class extends Error {
    constructor(message: string, readonly code: string, readonly retryable = false) {
      super(message);
    }
  },
}));

import { sendDialogue } from './dialogue';
import { type GroupDialogueEvent, sendGroupDialogue } from './groups';

const fetchMock = vi.fn<typeof fetch>();
const reply = {
  id: 'reply',
  role: 'assistant',
  content: 'Hello 🪴',
  created_at: '2026-10-03T12:00:00Z',
};
const direct = {
  conversationId: 'conversation',
  characterInstanceId: 'character',
  clientRequestId: 'request',
  message: 'Hello there',
};

function eventStream(events: unknown[], chunkSize = 7) {
  // Small byte chunks deliberately split both SSE framing and UTF-8 characters.
  const bytes = new TextEncoder().encode(
    events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join(''),
  );
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
          controller.enqueue(bytes.slice(offset, offset + chunkSize));
        }
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  mocks.adultSession.mockResolvedValue({ authorized: true });
});
afterEach(() => vi.unstubAllGlobals());

describe('direct reply transport', () => {
  it('delivers split UTF-8 text and the final persisted reply without changing the request identity', async () => {
    const tokens: string[] = [];
    fetchMock.mockResolvedValue(
      eventStream([{ type: 'token', token: reply.content }, { type: 'done', message: reply }]),
    );
    await expect(sendDialogue(direct, (text) => tokens.push(text))).resolves.toMatchObject({
      message: reply,
    });
    expect(tokens.join('')).toBe(reply.content);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({
      ...direct,
      streamProtocol: 2,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('preserves an already committed primary reply if an additional speaker fails', async () => {
    const primary = vi.fn();
    fetchMock.mockResolvedValue(eventStream([
      { type: 'primary_completed', message: reply, hasAdditional: true },
      { type: 'error', error: { code: 'UPSTREAM_FAILED', retryable: true } },
    ]));
    await expect(sendDialogue(direct, () => undefined, { onPrimary: primary }))
      .resolves.toMatchObject({ message: reply });
    expect(primary).toHaveBeenCalledWith(reply, true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('treats token-only truncation as recoverable failure, without dispatching a duplicate turn', async () => {
    fetchMock.mockResolvedValue(eventStream([{ type: 'token', token: 'Partial text' }]));
    await expect(sendDialogue(direct, () => undefined)).rejects.toMatchObject({
      code: 'STREAM_INTERRUPTED',
      retryable: true,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('group reply transport', () => {
  it('preserves ordered speaker replies and the everyone request through split stream frames', async () => {
    const events: GroupDialogueEvent[] = [];
    const second = { ...reply, id: 'second', content: 'And hello from me.' };
    const input = { ...direct, broadGroupRequest: true };
    fetchMock.mockResolvedValue(eventStream([
      { type: 'turn_started', turnId: 'turn' },
      { type: 'message_completed', message: reply },
      { type: 'message_completed', message: second },
      { type: 'turn_completed', turnId: 'turn' },
    ]));
    await sendGroupDialogue(input, (event) => events.push(event));
    expect(
      events.filter((event) => event.type === 'message_completed').map((event) => event.message.id),
    ).toEqual(['reply', 'second']);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({
      ...input,
      streamProtocol: 2,
    });
  });

  it('does not mistake typing or turn completion for a persisted reply', async () => {
    fetchMock.mockResolvedValue(eventStream([
      { type: 'speaker_typing', characterInstanceId: 'character', speakerName: 'Resident' },
      { type: 'turn_completed', turnId: 'turn' },
    ]));
    await expect(sendGroupDialogue(direct, () => undefined)).rejects.toMatchObject({
      code: 'STREAM_INTERRUPTED',
      retryable: true,
    });
  });

  it('allows a normal group reply when website session preparation is unavailable', async () => {
    mocks.adultSession.mockRejectedValue(new Error('temporary session outage'));
    fetchMock.mockResolvedValue(eventStream([{ type: 'message_completed', message: reply }]));
    await expect(sendGroupDialogue(direct, () => undefined)).resolves.toBeUndefined();
  });
});
