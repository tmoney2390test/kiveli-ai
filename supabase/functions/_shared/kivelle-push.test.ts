import { assert, assertEquals } from 'jsr:@std/assert';
import { neutralCompanionPushPayload } from './kivelle-push.ts';

Deno.test('push previews contain only neutral activity text', () => {
  const sensitiveDialogue='private dialogue that must never reach a lock screen';
  const payload=neutralCompanionPushPayload({to:'ExponentPushToken[test]',characterName:'Naomi',route:'/group-chat?id=group-1',proactiveMessageId:'message-1'});
  assertEquals(payload.body,'You have a new message from Naomi.');
  assert(!JSON.stringify(payload).includes(sensitiveDialogue));
  assertEquals(Object.keys(payload.data).sort(),['proactiveMessageId','route']);
});
