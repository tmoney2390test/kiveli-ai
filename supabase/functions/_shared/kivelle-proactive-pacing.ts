import type { SupabaseClient } from '@supabase/supabase-js';
import { effectiveInitiativeLevel, initiativePolicy } from '../../../packages/together-domain/src/life.ts';
import { isPlanReminderProactive } from './kivelle-initiative.ts';
type Row = Record<string, any>;
export function initiativeBackoffHours(base: number, unanswered: number): number {
  return unanswered >= 3 ? Infinity : base * 2 ** Math.max(0, unanswered);
}
/** Re-read delivered messages, not the queue, including messages persisted before a worker crashed. */
export async function initiativePacingAllows(db: SupabaseClient, userId: string, proactive: Row, now: Date): Promise<boolean> {
  if (isPlanReminderProactive(proactive)) return true;
  const [preferences, history, latestUser] = await Promise.all([
    db.from('together_notification_preferences').select('*').eq('user_id', userId).maybeSingle(),
    db.from('together_messages').select('created_at,provider_metadata').eq('user_id', userId)
      .eq('conversation_id', proactive.conversation_id).eq('role', 'assistant').eq('provider_metadata->>proactive', 'true')
      .order('created_at', { ascending: false }).limit(100),
    db.from('together_messages').select('created_at').eq('user_id', userId).eq('conversation_id', proactive.conversation_id)
      .eq('role', 'user').neq('delivery_status', 'failed').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (preferences.error || history.error || latestUser.error) throw new Error('INITIATIVE_PACING_READ_FAILED');
  const prefs = preferences.data;
  const level = effectiveInitiativeLevel({ entitled: true, globalLevel: prefs?.initiative_level,
    legacyEnabled: prefs?.character_initiated_messages, characterOverride: prefs?.companion_initiative_levels?.[proactive.character_instance_id] });
  if (level === 'off' || !latestUser.data) return false;
  const rows = (history.data ?? []).filter((row) => row.provider_metadata?.messageKind !== 'plan_reminder' && !row.provider_metadata?.group_plan_id);
  const userAt = Date.parse(latestUser.data.created_at);
  const unanswered = rows.filter((row) => Date.parse(row.created_at) >= userAt).length;
  const policy = initiativePolicy(level), last = rows[0];
  return now.getTime() - userAt >= policy.minimumConversationHours * 3600000 &&
    unanswered < 3 && (!last || now.getTime() - Date.parse(last.created_at) >= initiativeBackoffHours(policy.minimumProactiveHours, unanswered) * 3600000);
}
