import { describe, expect, it, vi } from 'vitest';
// Legacy plan helpers still share a module with mutations. Keep network and
// native initialization outside these timeline behavior tests.
vi.mock('../../lib/api', () => ({ invoke: vi.fn() }));
import type { ConversationAction, ConversationEvent, Message } from '../../types';
import { mergeChatTimeline } from './timeline';

const at = (minute: number) => `2026-10-03T12:${String(minute).padStart(2, '0')}:00Z`;
const message = (id: string, minute: number, extra: Partial<Message> = {}): Message => ({
  id,
  conversation_id: 'conversation',
  role: 'assistant',
  content: id,
  delivery_status: 'delivered',
  created_at: at(minute),
  ...extra,
});
const event = (
  id: string,
  minute: number,
  extra: Partial<ConversationEvent>,
): ConversationEvent => ({
  id,
  character_instance_id: 'character',
  conversation_id: 'conversation',
  event_type: 'plan_proposed',
  entity_type: 'conversation_action',
  entity_id: 'proposal',
  metadata: {},
  created_at: at(minute),
  ...extra,
});

describe('conversation timeline', () => {
  it('sorts messages and places one unread marker before unread history, excluding already observed replies', () => {
    const rows = mergeChatTimeline(
      [message('new-live', 9), message('unread', 4), message('old', 1), message('seen', 3)],
      [],
      [],
      at(2),
      at(5),
      new Set(['seen']),
    );
    expect(rows.filter((row) => row.kind === 'message').map((row) => row.value.id))
      .toEqual(['old', 'seen', 'unread', 'new-live']);
    const markers = rows.filter((row) => row.kind === 'separator' && row.label === 'NEW');
    expect(markers).toHaveLength(1);
    expect(rows[rows.indexOf(markers[0]!) + 1]).toMatchObject({
      kind: 'message',
      value: { id: 'unread' },
    });
  });

  it('groups a call transcript into one row, preserving recorded duration without duplicating its messages', () => {
    const metadata = { callSessionId: 'call' };
    const rows = mergeChatTimeline(
      [
        message('call-2', 4, { provider_metadata: metadata }),
        message('text', 5),
        message('call-1', 3, { role: 'user', provider_metadata: metadata }),
      ],
      [],
      [event('call-ended', 4, {
        event_type: 'voice_call',
        entity_type: 'voice_call_session',
        entity_id: 'call',
        metadata: { durationMs: 90_000 },
      })],
    );
    const calls = rows.filter((row) => row.kind === 'voice_call');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.value.durationMs).toBe(90_000);
    expect(calls[0]!.value.messages.map((item) => item.id)).toEqual(['call-1', 'call-2']);
    expect(rows.filter((row) => row.kind === 'message').map((row) => row.value.id)).toEqual([
      'text',
    ]);
    expect(rows.some((row) => row.kind === 'event' && row.value.event_type === 'voice_call')).toBe(
      false,
    );
  });

  it('removes resolved proposal cards and keeps pending proposals immediately after their anchor reply', () => {
    const action = (id: string): ConversationAction => ({
      id,
      character_instance_id: 'character',
      conversation_id: 'conversation',
      assistant_message_id: 'anchor',
      candidate_type: 'plan',
      status: 'pending',
      payload: {},
      confidence: 1,
      created_at: at(8),
    });
    const rows = mergeChatTimeline([message('anchor', 2), message('later', 4)], [
      action('resolved'),
      action('pending'),
    ], [
      event('decision', 3, { entity_id: 'resolved', metadata: { resolution: 'accepted' } }),
    ]);
    expect(rows.filter((row) => row.kind === 'action').map((row) => row.value.id)).toEqual([
      'pending',
    ]);
    const anchor = rows.findIndex((row) => row.kind === 'message' && row.value.id === 'anchor');
    expect(rows[anchor + 1]).toMatchObject({ kind: 'action', value: { id: 'pending' } });
  });
});
