import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';

export function firstMeetingOpening(meeting: Record<string, unknown>): string | null {
  for (const value of [meeting.opening_line, meeting.openingLine]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

const freshOpening = "I'm here. What's on your mind?";
const fallbackOpening = "It's good to meet you. What brings you here?";

export async function ensureConversationOpener(input: {
  db: SupabaseClient;
  userId: string;
  conversation: Record<string, unknown>;
  characterInstanceId: string;
  meeting?: Record<string, unknown>;
}): Promise<boolean> {
  const { db, userId, conversation, characterInstanceId } = input;
  const metadata = conversation.metadata as Record<string, unknown> | null;
  if (metadata?.branchId) return false;
  const conversationId = String(conversation.id);
  const existing = await db.from('together_messages').select('id').eq('conversation_id', conversationId).eq('user_id', userId).limit(1);
  if (existing.error) throw new AppError('INTERNAL_ERROR', 'This conversation could not be opened. Please try again.', 500, true);
  if (existing.data?.length) return false;

  const isFresh = Boolean(metadata?.freshChatRequestId);
  let meeting = input.meeting;
  if (!isFresh && !meeting) {
    const instance = await db.from('together_character_instances')
      .select('character_template_id').eq('id', characterInstanceId).eq('user_id', userId).maybeSingle();
    if (instance.error || !instance.data) throw new AppError('INTERNAL_ERROR', 'This companion could not be loaded. Please try again.', 500, true);
    const template = await db.from('together_character_templates')
      .select('first_meeting').eq('id', instance.data.character_template_id).maybeSingle();
    if (template.error || !template.data) throw new AppError('INTERNAL_ERROR', 'This companion could not be loaded. Please try again.', 500, true);
    meeting = (template.data.first_meeting ?? {}) as Record<string, unknown>;
  }
  const content = isFresh ? freshOpening : firstMeetingOpening(meeting ?? {}) ?? fallbackOpening;
  const inserted = await db.from('together_messages').insert({
    conversation_id: conversationId, user_id: userId, character_instance_id: characterInstanceId,
    role: 'assistant', content, delivery_status: 'complete',
  });
  if (inserted.error) throw new AppError('INTERNAL_ERROR', 'The companion’s opening message could not be sent. Please try again.', 500, true);
  return true;
}
