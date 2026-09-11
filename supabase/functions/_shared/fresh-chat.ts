import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';

export type FreshChatInput = {
  characterInstanceId: string;
  expectedConversationId?: string;
  requestId?: string;
  confirmation?: string;
};

export async function startConfirmedFreshChat(db: SupabaseClient, userId: string, input: FreshChatInput) {
  if (input.confirmation !== 'start_fresh_chat' || !input.expectedConversationId || !input.requestId) {
    throw new AppError('CONFLICT', 'To start a fresh chat, open the chat menu and confirm it first. Your current chat has not changed.', 409);
  }
  const { data, error } = await db.rpc('kivelle_start_fresh_conversation', {
    p_user_id: userId, p_character_instance_id: input.characterInstanceId,
    p_expected_conversation_id: input.expectedConversationId, p_request_id: input.requestId,
    p_confirmation: input.confirmation,
  });
  if (error) {
    if (/FRESH_CHAT_BUSY/.test(error.message)) throw new AppError('CONFLICT', 'Wait for the current reply to finish before starting a fresh chat.', 409);
    if (/FRESH_CHAT_(STALE|REQUEST_CONFLICT|CONFIRMATION_REQUIRED)/.test(error.message)) {
      throw new AppError('CONFLICT', 'Your active chat changed. Open it and confirm again before starting a fresh chat.', 409);
    }
    throw new AppError('INTERNAL_ERROR', 'The fresh chat could not be confirmed. Retry this confirmation; do not start another request.', 500, true);
  }
  if (!data?.conversation?.id) throw new AppError('INTERNAL_ERROR', 'The fresh chat could not be confirmed. Please retry.', 500, true);
  return data as { conversation: Record<string, unknown>; replayed: boolean };
}
