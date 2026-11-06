import { assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert';
import {
  supportAttachmentAction,
  supportJpegDimensions,
  supportTicketAttachments,
} from './support-attachments.ts';
import { transactionalEmail } from './transactional-email.ts';
import { retryPendingPushDeliveries, supportReplyPushPayload } from './kivelle-push.ts';
const uuid = '9e0cc390-fef9-4f65-b1c8-aa6414a3fb17';
Deno.test('quiet-hours deferral does not consume support push retries', async () => {
  const updates: Array<Record<string, unknown>> = [];
  const hour = new Date().getUTCHours(),
    time = (h: number) => String(h % 24).padStart(2, '0') + ':00';
  const db = {
    rpc: () => Promise.resolve({ data: [{ id: uuid }] }),
    from: (table: string) => {
      const data = table === 'together_push_deliveries'
        ? {
          id: uuid,
          user_id: 'owner',
          push_token_id: 'device',
          attempt_count: 2,
          metadata: {
            kind: 'support_reply',
            ticketId: 'ticket',
            replyAt: new Date().toISOString(),
          },
        }
        : table === 'together_push_tokens'
        ? { active: true, expo_push_token: 'not-a-real-token' }
        : table === 'together_notification_preferences'
        ? {
          push_enabled: true,
          quiet_hours_start: time(hour),
          quiet_hours_end: time(hour + 1),
          timezone: 'UTC',
        }
        : table === 'together_support_tickets'
        ? { customer_read_at: null }
        : null;
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        lte: () => chain,
        update: (value: Record<string, unknown>) => {
          updates.push(value);
          return chain;
        },
        maybeSingle: () => Promise.resolve({ data, error: null }),
      };
      return chain;
    },
  };
  assertEquals(await retryPendingPushDeliveries(db as never), { claimed: 1, sent: 0 });
  const deferral = updates.find((update) => update.status === 'retry');
  assertEquals(deferral?.attempt_count, 1);
  assertEquals(deferral?.lease_owner, null);
});
Deno.test('storage outage leaves ticket text and replies available', async () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () =>
      Promise.resolve({
        data: [{
          id: uuid,
          status: 'ready',
          storage_path: 'owner/image.jpg',
          width: 100,
          height: 100,
          reply_id: null,
        }],
        error: null,
      }),
  };
  const db = {
    from: () => chain,
    storage: {
      from: () => ({
        createSignedUrl: () => Promise.resolve({ data: null, error: { message: 'unavailable' } }),
      }),
    },
  };
  assertEquals(await supportTicketAttachments(db as never, uuid), [{
    id: uuid,
    status: 'ready',
    width: 100,
    height: 100,
    url: null,
    replyId: null,
  }]);
});
Deno.test('screenshot dimensions reject non-JPEG, truncation, oversized pixels and oversized files', () => {
  const jpeg = new Uint8Array([255, 216, 255, 192, 0, 8, 8, 4, 0, 3, 0, 1, 255, 217]);
  assertEquals(supportJpegDimensions(jpeg), { width: 768, height: 1024 });
  assertThrows(() =>
    supportJpegDimensions(new TextEncoder().encode('<svg onload="alert(1)"></svg>'))
  );
  assertThrows(() => supportJpegDimensions(jpeg.slice(0, -2)));
  const huge = jpeg.slice();
  huge[7] = 9;
  assertThrows(() => supportJpegDimensions(huge));
  assertThrows(() => supportJpegDimensions(new Uint8Array(5242881)));
  const malformed = jpeg.slice();
  malformed[4] = 255;
  assertThrows(() => supportJpegDimensions(malformed));
});
Deno.test('unowned screenshot cannot be confirmed or signed for upload', async () => {
  const scopes: unknown[] = [];
  const db = {
    from: () => {
      const chain = {
        select: () => chain,
        eq: (field: string, value: string) => {
          scopes.push([field, value]);
          return chain;
        },
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      };
      return chain;
    },
    storage: {
      from: () => {
        throw new Error('Storage must not be reached');
      },
    },
  };
  await assertRejects(
    () => supportAttachmentAction(db as never, 'other', { operation: 'confirm', id: uuid }),
    Error,
    'unavailable',
  );
  assertEquals(scopes, [['id', uuid], ['user_id', 'other']]);
});
Deno.test('support notifications use exact ticket links and reveal no request content', () => {
  const body = transactionalEmail('support_reply', {
    ticketId: uuid,
    ticketNumber: 42,
    subject: 'private subject',
    message: 'private message',
  });
  assertEquals(body.text.includes(`https://kivelli.app/support?ticket=${uuid}`), true);
  assertEquals(body.text.includes('private'), false);
  assertEquals(
    transactionalEmail('support_received', {
      ticketId: 'https://bad.invalid/?x=1',
      ticketNumber: 42,
    }).text.includes('bad.invalid'),
    false,
  );
  const push = supportReplyPushPayload('ExpoPushToken[device]', uuid);
  assertEquals(push.data.route, `/support?ticket=${uuid}`);
  assertEquals(push.body, 'You have a new reply to your support request.');
  assertEquals('proactiveMessageId' in push.data, false);
});
