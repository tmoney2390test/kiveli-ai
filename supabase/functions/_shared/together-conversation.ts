import type { SupabaseClient } from '@supabase/supabase-js';

export async function getActiveConversation(db: SupabaseClient, userId: string, characterInstanceId: string, createIfMissing = false): Promise<Record<string, unknown> | null> {
  const { data, error } = await db.from('together_conversations').select('*').eq('user_id', userId).eq('character_instance_id', characterInstanceId).is('archived_at', null).in('kind', ['direct', 'first_meeting']).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (data || !createIfMissing) return data;
  const { data: created, error: createError } = await db.rpc('kivelle_start_conversation', { p_user_id: userId, p_character_instance_id: characterInstanceId });
  if (createError) {
    const retry = await db.from('together_conversations').select('*').eq('user_id', userId).eq('character_instance_id', characterInstanceId).is('archived_at', null).in('kind', ['direct', 'first_meeting']).limit(1).maybeSingle();
    if (retry.error) throw retry.error;
    return retry.data;
  }
  return created;
}

export function shouldDeleteMediaAfterMessageRemoval(media: Record<string, unknown>): boolean {
  return Boolean(media.message_id) && !media.moment_id && !media.date_session_id && !media.life_event_id;
}
