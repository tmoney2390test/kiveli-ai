import { ADULT_ROUTING_CARRYOVER_TURNS } from '../../../packages/together-domain/src/dialogue-routing-continuity.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';

/** Called only with an already-owned conversation. Recheck both identifiers
 * in the query; never read another chat, another Life, or assistant output.
 * A retry uses the original sequence so it cannot consume/renew the window. */
export async function loadAdultRoutingHistory(db: SupabaseClient, userId: string, conversationId: string, beforeSequence?: number): Promise<unknown[]> {
  let query = db.from('together_messages').select('provider_metadata')
    .eq('user_id', userId).eq('conversation_id', conversationId).eq('role', 'user');
  if (beforeSequence !== undefined) query = query.lt('conversation_sequence', beforeSequence);
  const { data, error } = await query.order('conversation_sequence', { ascending: false }).limit(ADULT_ROUTING_CARRYOVER_TURNS);
  if (error) throw new AppError('INTERNAL_ERROR', 'Chat routing could not be prepared. Please retry.', 503, true);
  return (data ?? []).reverse().map(row => row.provider_metadata?.adultRouting ?? null);
}
