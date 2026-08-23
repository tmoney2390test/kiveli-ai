import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertChatRequestId,
  chatRequestFingerprint,
  claimChatUserMessage,
  directResponseKey,
  findExistingChatRequest,
  normalizeChatMessage,
} from "./chat-message-hardening.ts";

const requestId = "34c78ae8-8712-4bd5-91c8-5ef8393b93e8";

Deno.test("chat messages normalize line endings without rewriting prose", () => {
  assertEquals(normalizeChatMessage("  café\r\nsecond line  "), "café\nsecond line");
  assertThrows(() => normalizeChatMessage("hello\u0000there"));
});

Deno.test("chat request ids and direct response keys are deterministic", () => {
  assertEquals(assertChatRequestId(requestId.toUpperCase()), requestId);
  assertEquals(directResponseKey(requestId), `direct:${requestId}:primary`);
  assertThrows(() => assertChatRequestId("guessable-request"));
});

Deno.test("request fingerprints are stable across object key order", async () => {
  assertEquals(
    await chatRequestFingerprint({ b: ["two", "one"], a: "value" }),
    await chatRequestFingerprint({ a: "value", b: ["two", "one"] }),
  );
});

Deno.test("an idempotency key cannot be reused with a different payload", async () => {
  const db = {
    from: () => ({
      select: () => ({
        eq: function () { return this; },
        maybeSingle: async () => ({
          data: {
            id: "message-1",
            role: "user",
            content: "hello",
            character_instance_id: "character-1",
            provider_metadata: { requestFingerprint: "original" },
          },
          error: null,
        }),
      }),
    }),
  } as unknown as SupabaseClient;
  await assertRejects(() => findExistingChatRequest(db, {
    userId: "user-1",
    conversationId: "conversation-1",
    requestId,
    fingerprint: "different",
    expectedContent: "hello",
    characterInstanceId: "character-1",
  }));
});

Deno.test("message claim uses the atomic server RPC and reloads only the owned row", async () => {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const chain = {
    select() { return this; },
    eq() { return this; },
    single: async () => ({ data: { id: "message-1", content: "hello" }, error: null }),
  };
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { data: [{ message_id: "message-1", created: true }], error: null };
    },
    from: () => chain,
  } as unknown as SupabaseClient;
  const result = await claimChatUserMessage(db, {
    userId: "user-1",
    continuityId: "life-1",
    conversationId: "conversation-1",
    characterInstanceId: "character-1",
    content: "hello",
    requestId,
    providerMetadata: { requestFingerprint: "fingerprint" },
    attachmentIds: ["attachment-1"],
  });
  assertEquals(result.created, true);
  assertEquals(result.message.id, "message-1");
  assertEquals(calls[0]?.name, "kivelle_claim_chat_user_message");
  assertEquals(calls[0]?.args?.p_attachment_ids, ["attachment-1"]);
});
