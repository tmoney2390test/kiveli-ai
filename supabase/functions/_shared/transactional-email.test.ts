import { assert, assertEquals } from 'jsr:@std/assert@1';
import { transactionalEmail, retryableEmailStatus } from './transactional-email.ts';
Deno.test('support notifications do not expose submitted content or promise email ingestion', () => {
  for (const kind of ['support_received', 'support_reply', 'support_followup'] as const) {
    const message = transactionalEmail(kind, { ticketNumber: 42, message: 'private content', note: 'internal note' });
    assert(message.subject.includes('Support-00042'));
    assert(!message.text.includes('private content'));
    assert(!message.text.includes('internal note'));
  }
});
Deno.test('welcome identifies plan and correct store management', () => {
  const apple = transactionalEmail('membership_welcome', { tier: 'kivelle_max', interval: 'annual', store: 'APP_STORE', trial: true });
  assert(apple.subject.includes('Max'));
  assert(apple.text.includes('Annual'));
  assert(apple.text.includes('trial'));
  assert(apple.text.includes('https://apps.apple.com/account/subscriptions'));
  assert(transactionalEmail('membership_welcome', { store: 'PLAY_STORE' }).text.includes('https://play.google.com/store/account/subscriptions'));
});
Deno.test('only transient provider failures retry', () => {
  assertEquals(retryableEmailStatus(429), true);
  assertEquals(retryableEmailStatus(503), true);
  assertEquals(retryableEmailStatus(422), false);
});
