import { buildVoiceNoteMediaMutation } from "./voice-note-media.ts";

Deno.test("voice notes persist the speaking companion as their single media subject", () => {
  const row = buildVoiceNoteMediaMutation({
    id: "media-1",
    userId: "user-1",
    continuityId: "life-1",
    characterInstanceId: "avery-1",
    conversationId: "conversation-1",
    messageId: "message-1",
    requestKey: "voice-note:message-1",
    provider: "xai",
    canonicalText: "Morning. The mountain is behaving so far.",
    attemptNumber: 1,
    metadata: { voiceKey: "northvale-avery-callahan" },
    updatedAt: "2026-08-26T14:00:00.000Z",
  });

  assert(row.media_type === "voice_note");
  assert(row.character_instance_id === "avery-1");
  assert(row.subject_character_instance_ids.length === 1);
  assert(row.subject_character_instance_ids[0] === "avery-1");
});

function assert(value: unknown): asserts value {
  if (!value) throw new Error("assertion_failed");
}
