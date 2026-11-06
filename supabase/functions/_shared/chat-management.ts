import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';
import {
  activeConversationLimitError,
  isActiveConversationLimitDatabaseError,
  resolveSubscriptionAccess,
} from './kivelle-subscription.ts';

export type ChatManagementInput =
  | {
    action: 'management';
    category: 'active' | 'archived' | 'branches';
    offset: number;
    limit: number;
  }
  | { action: 'archive_many'; conversationIds: string[] }
  | { action: 'resume_saved'; conversationId: string };

export async function manageAccountChats(
  db: SupabaseClient,
  userId: string,
  input: ChatManagementInput,
) {
  if (input.action === 'management') {
    const [access, result] = await Promise.all([
      resolveSubscriptionAccess(db, userId),
      db.rpc('kivelle_manage_chat_list', {
        p_user_id: userId,
        p_category: input.category,
        p_offset: input.offset,
        p_limit: input.limit,
      }),
    ]);
    if (result.error || !result.data) {
      throw new AppError('INTERNAL_ERROR', 'Your chats could not be loaded.', 500, true);
    }
    return { ...result.data, planName: access.capabilities.displayName };
  }
  const { data, error } = input.action === 'archive_many'
    ? await db.rpc('kivelle_save_chats_to_history', {
      p_user_id: userId,
      p_conversation_ids: input.conversationIds,
    })
    : await db.rpc('kivelle_resume_saved_chat', {
      p_user_id: userId,
      p_conversation_id: input.conversationId,
    });
  if (error || !data) {
    if (isActiveConversationLimitDatabaseError(error)) {
      throw activeConversationLimitError(
        (await resolveSubscriptionAccess(db, userId)).capabilities,
      );
    }
    if (error?.message?.includes('CHAT_REPLY_IN_PROGRESS')) {
      throw new AppError('CONFLICT', 'Let the current reply finish, then try again.', 409, true);
    }
    if (error?.message?.includes('CHAT_SELECTION_UNAVAILABLE')) {
      throw new AppError(
        'CONFLICT',
        'One of these chats changed. Refresh the list and try again.',
        409,
        true,
      );
    }
    throw new AppError(
      'INTERNAL_ERROR',
      'Your chats could not be updated. Please try again.',
      500,
      true,
    );
  }
  return data;
}
