import { assertEquals } from 'jsr:@std/assert@1';
import { recoverRejectedGroupReply } from './group-reply-stream.ts';
import type { DialogueGenerationResult } from './together-ai.ts';

const reply = (text: string) => ({ text, metadata: {} }) as DialogueGenerationResult;

Deno.test('a rejected second group reply can continue after a fully approved new draft', async () => {
  const original = reply('rejected draft');
  let approvals = 0;
  const result = await recoverRejectedGroupReply({
    reply: original,
    approved: false,
    canRetry: true,
    generate: async () => reply('In-character continuation'),
    approve: async (text) => { approvals++; return text === 'In-character continuation'; },
  });
  assertEquals(result.reply.text, 'In-character continuation');
  assertEquals(result.approved, true);
  assertEquals(result.attempted, true);
  assertEquals(approvals, 1);
});

Deno.test('a rejected replacement cannot reach the client or replace the safe fallback', async () => {
  const original = reply('rejected draft');
  const result = await recoverRejectedGroupReply({
    reply: original,
    approved: false,
    canRetry: true,
    generate: async () => reply('another rejected draft'),
    approve: async () => false,
  });
  assertEquals(result.reply, original);
  assertEquals(result.approved, false);
  assertEquals(result.attempted, true);
});

Deno.test('approved replies and exhausted budgets never launch a repair', async () => {
  let attempts = 0;
  const original = reply('approved draft');
  const generate = async () => { attempts++; return reply('replacement'); };
  const approve = async () => true;
  const approved = await recoverRejectedGroupReply({ reply: original, approved: true, canRetry: true, generate, approve });
  const exhausted = await recoverRejectedGroupReply({ reply: original, approved: false, canRetry: false, generate, approve });
  assertEquals(approved.approved, true);
  assertEquals(exhausted.approved, false);
  assertEquals(attempts, 0);
});
