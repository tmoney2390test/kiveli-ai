import type { SupabaseClient } from '@supabase/supabase-js';
import { createClientRequestId } from './requestId';

/** Each effect owns its channel, even while the previous async unsubscribe is pending. */
export function createRealtimeChannel(client: Pick<SupabaseClient, 'channel'>, topic: string) {
  return client.channel(topic + ':' + createClientRequestId());
}
