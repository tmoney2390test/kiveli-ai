type VoiceNoteMediaMutationInput = {
  id: string;
  userId: string;
  continuityId: string;
  characterInstanceId: string;
  conversationId: string;
  messageId: string;
  requestKey: string;
  provider: string;
  canonicalText: string;
  attemptNumber: number;
  metadata: Record<string, unknown>;
  updatedAt?: string;
};

/**
 * Builds the canonical media row for a companion voice note.
 *
 * Generated media shares a subject-roster invariant with group photos. A
 * voice note has one canonical subject: the companion whose message is being
 * spoken. Keeping that invariant here prevents TTS requests from failing the
 * database subject-count constraint before synthesis begins.
 */
export function buildVoiceNoteMediaMutation(
  input: VoiceNoteMediaMutationInput,
) {
  return {
    id: input.id,
    user_id: input.userId,
    continuity_id: input.continuityId,
    character_instance_id: input.characterInstanceId,
    subject_character_instance_ids: [input.characterInstanceId],
    conversation_id: input.conversationId,
    message_id: input.messageId,
    media_type: "voice_note",
    status: "generating",
    request_key: input.requestKey,
    provider: input.provider,
    canonical_text: input.canonicalText,
    failure_code: null,
    failure_reason_safe: null,
    attempt_count: input.attemptNumber,
    metadata: input.metadata,
    updated_at: input.updatedAt ?? new Date().toISOString(),
  };
}
