import type { SupabaseClient } from '@supabase/supabase-js';
import { schedulePauseFrom } from '../../../packages/together-domain/src/schedule-pause.ts';
import { isPlanReminderProactive } from './kivelle-initiative.ts';

type Row = Record<string, any>;
export type InitiativeSource = {
  draft: string;
  summary: string;
  occurredAt?: string;
  sourceMessageId?: string;
  allowFallback: boolean;
};

export function eligibleInitiativeThreads(threads: Row[], usedKeys: Set<string>, now: Date): Row[] {
  return threads.filter((thread) => !thread.resolved_at && !thread.last_followed_up_at &&
    Number(thread.followup_count ?? 0) === 0 && thread.expected_at &&
    Date.parse(thread.expected_at) <= now.getTime() && !usedKeys.has(`thread:${thread.id}`))
    .sort((a, b) => Number(b.importance) - Number(a.importance) ||
      Date.parse(a.expected_at) - Date.parse(b.expected_at));
}

export function initiativeThreadSubject(thread: Row): string {
  return String(thread.display_subject ?? thread.subject ?? thread.metadata?.subject ??
    String(thread.topic ?? '').match(/user's\s+([^.!?]+)/i)?.[1]?.replace(/\s+went$/, '') ?? '')
    .replace(/\s+/g, ' ').replace(/[.!?]+$/, '').trim();
}

export function threadInitiativeSource(thread: Row): InitiativeSource | null {
  const subject = initiativeThreadSubject(thread);
  if (!subject || /^(?:event|something|follow.?up)$/i.test(subject)) return null;
  return {
    draft: `Any news on ${subject}?`,
    summary: `An unresolved topic the user shared: ${String(thread.topic ?? subject)}. ` +
      'Ask about this specific topic without assuming its outcome or claiming the user requested a reminder.',
    occurredAt: thread.expected_at,
    sourceMessageId: thread.source_message_id,
    allowFallback: true,
  };
}

export function eventInitiativeSource(event: Row): InitiativeSource | null {
  const summary = String(event.narrative_summary ?? '').trim();
  if (!summary) return null;
  // Narrator-authored world events are context, never a raw chat fallback.
  return { draft: summary, summary, occurredAt: event.starts_at, allowFallback: false };
}

export function planInitiativeSource(plan: Row, now: Date, timezone: string, completed: boolean): InitiativeSource | null {
  if (completed) {
    if (plan.status !== 'completed' || !plan.completed_at ||
      now.getTime() - Date.parse(plan.completed_at) > 24 * 3600_000) return null;
    return {
      draft: `I've been thinking about ${plan.title}.`,
      summary: `The shared plan ${plan.title} completed at ${plan.completed_at}. ` +
        'Refer to the shared experience without inventing an outcome, enjoyment, attendance details, or a new invitation.',
      occurredAt: plan.completed_at,
      allowFallback: false,
    };
  }
  if (!['scheduled', 'active'].includes(String(plan.status)) || !plan.ends_at ||
    Date.parse(plan.ends_at) <= now.getTime()) return null;
  const started = Date.parse(plan.starts_at) <= now.getTime();
  const time = new Date(plan.starts_at).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: timezone,
  });
  return {
    draft: started ? `Our plan, ${plan.title}, has started.` : `${plan.title} is at ${time}. See you then.`,
    summary: `Shared plan: ${plan.title}. Status: ${plan.status}. Starts: ${plan.starts_at}. Ends: ${plan.ends_at}. ` +
      'Preserve these details. Do not claim to be wrapping up, travelling, waiting, or already there.',
    occurredAt: plan.starts_at,
    allowFallback: true,
  };
}

export function proactiveSourcePlanId(proactive: Row): string | null {
  return String(proactive.context?.planId ?? proactive.context?.groupPlanId ??
    String(proactive.dedupe_key ?? '').match(/^(?:group-plan:pre|plan:pre|plan:post):(.+)$/)?.[1] ?? '') || null;
}

export function userResumedAfterQueue(proactive: Row, latestUserMessage: Row | null): boolean {
  if (!latestUserMessage?.created_at || isPlanReminderProactive(proactive)) return false;
  const baseline = proactive.context?.lastMessageAt ?? proactive.created_at;
  return Boolean(baseline && Date.parse(latestUserMessage.created_at) > Date.parse(baseline));
}

/** Read the canonical source again just before generation, including old queued rows. */
export async function loadInitiativeSource(
  db: SupabaseClient, userId: string, proactive: Row, now: Date, timezone: string,
): Promise<InitiativeSource | null> {
  if (proactive.open_thread_id) {
    const { data: profile, error: profileError } = await db.from('together_profiles').select('memory_categories')
      .eq('user_id', userId).maybeSingle();
    if (profileError) throw new Error('INITIATIVE_MEMORY_PREFERENCE_READ_FAILED');
    if (profile?.memory_categories?.open_thread === false) return null;
    const { data: thread, error } = await db.from('together_open_threads').select('*')
      .eq('id', proactive.open_thread_id).eq('user_id', userId)
      .eq('character_instance_id', proactive.character_instance_id)
      .eq('visibility_scope', 'all').in('content_rating', ['safe', 'suggestive']).maybeSingle();
    if (error) throw new Error('INITIATIVE_THREAD_READ_FAILED');
    if (!thread || !eligibleInitiativeThreads([thread], new Set(), now).length) return null;
    return threadInitiativeSource(thread);
  }
  const planId = proactiveSourcePlanId(proactive);
  if (planId) {
    const { data: plan, error } = await db.from('together_shared_plans').select('*')
      .eq('id', planId).eq('user_id', userId)
      .contains('participant_instance_ids', [proactive.character_instance_id]).maybeSingle();
    if (error) throw new Error('INITIATIVE_PLAN_READ_FAILED');
    return plan ? planInitiativeSource(plan, now, timezone, String(proactive.dedupe_key).startsWith('plan:post:')) : null;
  }
  if (proactive.context?.scheduleEventId) {
    const {data:instance,error:instanceError}=await db.from('together_character_instances').select('schedule_pause').eq('id',proactive.character_instance_id).eq('user_id',userId).maybeSingle();
    if(instanceError)throw new Error('INITIATIVE_SCHEDULE_PAUSE_READ_FAILED');
    if(schedulePauseFrom(instance?.schedule_pause))return null;
    const { data: schedule, error } = await db.from('together_character_schedule_events').select('*')
      .eq('id', proactive.context.scheduleEventId).eq('user_id', userId)
      .eq('character_instance_id', proactive.character_instance_id).maybeSingle();
    if (error) throw new Error('INITIATIVE_SCHEDULE_READ_FAILED');
    if (!schedule || Date.parse(schedule.starts_at) > now.getTime() || Date.parse(schedule.ends_at) <= now.getTime()) return null;
    const summary = String(schedule.metadata?.activityLabel ?? schedule.title ?? '').trim();
    return summary ? { draft: summary, summary: `Current scheduled activity: ${summary}. Do not invent an incident or outcome.`, occurredAt: schedule.starts_at, allowFallback: false } : null;
  }
  if (proactive.life_event_id) {
    const {data:instance,error:instanceError}=await db.from('together_character_instances').select('schedule_pause').eq('id',proactive.character_instance_id).eq('user_id',userId).maybeSingle();
    if(instanceError)throw new Error('INITIATIVE_SCHEDULE_PAUSE_READ_FAILED');
    if(schedulePauseFrom(instance?.schedule_pause))return null;
    const { data: event, error } = await db.from('together_life_events').select('*')
      .eq('id', proactive.life_event_id).eq('user_id', userId)
      .eq('character_instance_id', proactive.character_instance_id).maybeSingle();
    if (error) throw new Error('INITIATIVE_EVENT_READ_FAILED');
    if (!event || !event.user_should_know || event.metadata?.planStatus === 'cancelled' ||
      Date.parse(event.starts_at) > now.getTime() || now.getTime() - Date.parse(event.starts_at) > 48 * 3600_000) return null;
    return eventInitiativeSource(event);
  }
  // Unknown legacy drafts cannot establish that a reason to reach out is still valid.
  return null;
}

export async function markInitiativeThreadDelivered(
  db: SupabaseClient, userId: string, proactive: Row, now: Date,
): Promise<void> {
  if (!proactive.open_thread_id) return;
  const { error } = await db.from('together_open_threads').update({
    last_followed_up_at: now.toISOString(), followup_count: 1, updated_at: now.toISOString(),
  }).eq('id', proactive.open_thread_id).eq('user_id', userId)
    .eq('character_instance_id', proactive.character_instance_id).is('resolved_at', null)
    .is('last_followed_up_at', null).lt('followup_count', 1);
  if (error) throw new Error('INITIATIVE_THREAD_DELIVERY_WRITE_FAILED');
}
