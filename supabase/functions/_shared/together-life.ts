import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';
import { resolveLifeState, TOGETHER_IDS, track } from './together.ts';

type LifeRunInput = { db: SupabaseClient; userId: string; characterInstanceId?: string; now?: Date; evaluateProactive?: boolean; trigger: 'conversation_continued' | 'home_opened' | 'scheduled_dispatch' };
type EventRow = Record<string, any>;

export async function runLifeSimulation({ db, userId, characterInstanceId, now = new Date(), evaluateProactive = true, trigger }: LifeRunInput): Promise<Record<string, unknown>> {
  // Routine state resolution is cheap; meaningful events are materialized only
  // by a continued conversation or the protected background dispatcher.
  const simulateEvents = trigger === 'conversation_continued' || trigger === 'scheduled_dispatch';
  const instanceQuery = db.from('together_character_instances').select('*,together_character_templates(name,slug)').eq('user_id', userId);
  const { data: instance } = await (characterInstanceId ? instanceQuery.eq('id', characterInstanceId) : instanceQuery.eq('character_template_id', TOGETHER_IDS.maya)).maybeSingle();
  if (!instance) throw new AppError('NOT_FOUND', 'That character is unavailable.', 404);

  const last = new Date(instance.last_simulated_at);
  const simulationStart = Number.isNaN(last.getTime()) || last > now ? now : last;
  const lastEventSimulation = new Date(instance.last_event_simulated_at ?? instance.created_at ?? now.toISOString());
  const eventSimulationStart = Number.isNaN(lastEventSimulation.getTime()) || lastEventSimulation > now ? now : lastEventSimulation;
  const recentCutoff = new Date(now.getTime() - 72 * 3600000).toISOString();
  const [schedules, templates, relationship, latestConversation, preferences, recentEvents, recentProactive, memories, allInstances] = await Promise.all([
    db.from('together_schedule_templates').select('*,together_locations(name)').eq('character_version_id', instance.character_version_id),
    db.from('together_event_templates').select('*').eq('active', true).contains('participant_template_ids', [instance.character_template_id]),
    db.from('together_relationship_states').select('*').eq('character_instance_id', instance.id).single(),
    db.from('together_conversations').select('id,last_message_at').eq('character_instance_id', instance.id).eq('user_id', userId).order('last_message_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    db.from('together_notification_preferences').select('*').eq('user_id', userId).maybeSingle(),
    db.from('together_life_events').select('*').eq('user_id', userId).eq('character_instance_id', instance.id).gte('starts_at', recentCutoff).order('starts_at', { ascending: false }).limit(20),
    db.from('together_proactive_messages').select('*').eq('user_id', userId).eq('character_instance_id', instance.id).order('created_at', { ascending: false }).limit(10),
    db.from('together_memories').select('canonical_text,memory_type,pinned,importance,sensitivity_category').eq('user_id', userId).eq('character_instance_id', instance.id).eq('status', 'active').neq('sensitivity_category', 'sensitive').order('pinned', { ascending: false }).order('importance', { ascending: false }).limit(8),
    db.from('together_character_instances').select('id,character_template_id').eq('user_id', userId),
  ]);
  if (relationship.error) throw new AppError('INTERNAL_ERROR', 'Relationship state is unavailable.', 500, true);

  const scheduleState = resolveLifeState((schedules.data ?? []) as Array<Record<string, unknown>>, now);
  const eventCandidates = simulateEvents ? selectEventCandidates(eventSimulationStart, now, templates.data ?? [], String(instance.simulation_seed), recentEvents.data ?? [], schedules.data ?? []) : [];
  const instanceByTemplate = new Map((allInstances.data ?? []).map((item) => [String(item.character_template_id), String(item.id)]));
  const created: EventRow[] = [];
  for (const candidate of eventCandidates) {
    const template = candidate.template;
    const participantIds = (template.participant_template_ids ?? []).map((id: string) => instanceByTemplate.get(String(id))).filter(Boolean);
    const { data, error } = await db.from('together_life_events').upsert({
      user_id: userId,
      character_instance_id: instance.id,
      event_template_id: template.id,
      simulation_key: candidate.simulationKey,
      event_type: template.event_type,
      title: template.name,
      narrative_summary: template.narrative_summary,
      participant_instance_ids: participantIds.length ? participantIds : [instance.id],
      location_id: template.default_location_id,
      significance: template.significance,
      starts_at: candidate.occurredAt,
      ends_at: new Date(new Date(candidate.occurredAt).getTime() + Number(template.duration_minutes) * 60000).toISOString(),
      resulting_state_changes: template.state_effects,
      user_should_know: template.user_visibility !== 'hidden',
      proactive_message_appropriate: template.proactive_eligible,
      metadata: { source: trigger, probability: template.probability },
    }, { onConflict: 'character_instance_id,simulation_key', ignoreDuplicates: true }).select('*').maybeSingle();
    if (!error && data) created.push(data);
  }

  const influential = [...created, ...(recentEvents.data ?? [])].filter((event) => now.getTime() - new Date(event.starts_at).getTime() <= 6 * 3600000).sort((a, b) => Number(b.significance) - Number(a.significance))[0];
  const life = applyEventInfluence(scheduleState, influential);
  await db.from('together_character_instances').update({ current_location_id: life.locationId, current_activity: life.activity, current_mood: life.mood, current_energy: life.energy, last_simulated_at: now.toISOString(), ...(simulateEvents ? { last_event_simulated_at: now.toISOString() } : {}), updated_at: now.toISOString() }).eq('id', instance.id).eq('user_id', userId);

  const { data: dueThreads } = await db.from('together_open_threads').update({ follow_up_eligible: true, updated_at: now.toISOString() }).eq('user_id', userId).eq('character_instance_id', instance.id).is('resolved_at', null).lte('expected_at', now.toISOString()).select('*');
  const prefs = preferences.data ?? { character_initiated_messages: true, push_enabled: false, quiet_hours_start: '23:00', quiet_hours_end: '08:00', timezone: 'UTC' };
  let proactive: EventRow | null = null;
  if (prefs.character_initiated_messages === false) {
    await db.from('together_proactive_messages').update({ status: 'cancelled', updated_at: now.toISOString() }).eq('user_id', userId).eq('character_instance_id', instance.id).eq('status', 'queued');
  } else if (evaluateProactive) {
    proactive = await deliverDueMessage(db, userId, instance, latestConversation.data, prefs, now);
    if (!proactive) {
      proactive = await createProactiveCandidate({ db, userId, instance, relationship: relationship.data, conversation: latestConversation.data, prefs, now, dueThreads: dueThreads ?? [], events: [...created, ...(recentEvents.data ?? [])], recentProactive: recentProactive.data ?? [], memory: memories.data?.[0]?.canonical_text });
    }
  }

  return { state: life, events: created, proactiveMessage: proactive, eligibleThreads: dueThreads ?? [], elapsedDays: Math.max(0, Math.floor((now.getTime() - eventSimulationStart.getTime()) / 86400000)), eventsSimulated: simulateEvents };
}

async function createProactiveCandidate(input: { db: SupabaseClient; userId: string; instance: EventRow; relationship: EventRow; conversation: EventRow | null; prefs: EventRow; now: Date; dueThreads: EventRow[]; events: EventRow[]; recentProactive: EventRow[]; memory?: string }): Promise<EventRow | null> {
  const { db, userId, instance, relationship, conversation, prefs, now } = input;
  if (!instance.contact_added_at && !instance.introduced_at) return null;
  if (relationship?.active_major_conflict || Number(relationship?.conflict ?? 0) > 60) return null;
  const hoursSinceConversation = conversation?.last_message_at ? (now.getTime() - new Date(conversation.last_message_at).getTime()) / 3600000 : 48;
  const lastProactive = input.recentProactive.find((item) => item.status !== 'cancelled' && item.status !== 'failed');
  const hoursSinceProactive = lastProactive ? (now.getTime() - new Date(lastProactive.created_at).getTime()) / 3600000 : Infinity;
  if (hoursSinceProactive < 18) return null;

  const dueThread = input.dueThreads.sort((a, b) => Number(b.importance) - Number(a.importance))[0];
  let source: EventRow | null = null;
  let dedupeKey = '';
  let content = '';
  let reason = '';
  let lifeEventId: string | null = null;
  let openThreadId: string | null = null;
  if (dueThread && hoursSinceConversation >= 4) {
    const subject = String(dueThread.metadata?.subject ?? String(dueThread.topic).match(/user's\s+([a-z]+)/i)?.[1] ?? 'event');
    dedupeKey = `thread:${dueThread.id}`;
    content = composeProactiveMessage({ threadSubject: subject });
    reason = `Follow-up: ${subject}`;
    openThreadId = String(dueThread.id);
  } else {
    source = input.events.filter((event) => event.proactive_message_appropriate && Number(event.significance) >= .55 && now.getTime() - new Date(event.starts_at).getTime() <= 48 * 3600000).sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())[0] ?? null;
    if (!source || hoursSinceConversation < 5 || !shouldInitiateEventMessage(source, String(instance.relationship_stage), hoursSinceConversation, String(instance.simulation_seed))) return null;
    dedupeKey = `event:${source.id}`;
    content = composeProactiveMessage({ eventTitle: String(source.title), eventSummary: String(source.narrative_summary), memory: input.memory });
    reason = `Life event: ${source.title}`;
    lifeEventId = String(source.id);
  }
  const existing = await db.from('together_proactive_messages').select('id').eq('user_id', userId).eq('character_instance_id', instance.id).eq('dedupe_key', dedupeKey).maybeSingle();
  if (existing.data) return null;

  const quiet = isQuietHours(now, String(prefs.quiet_hours_start ?? '23:00'), String(prefs.quiet_hours_end ?? '08:00'), String(prefs.timezone ?? 'UTC'));
  const eligibleAt = quiet ? nextDeliveryTime(now, String(prefs.quiet_hours_start ?? '23:00'), String(prefs.quiet_hours_end ?? '08:00'), String(prefs.timezone ?? 'UTC')) : now;
  const { data, error } = await db.from('together_proactive_messages').insert({ user_id: userId, character_instance_id: instance.id, life_event_id: lifeEventId, open_thread_id: openThreadId, dedupe_key: dedupeKey, content, reason, eligible_at: eligibleAt.toISOString(), expires_at: new Date(eligibleAt.getTime() + 30 * 3600000).toISOString(), conversation_id: conversation?.id ?? null, context: { relationship_stage: instance.relationship_stage, quiet_hours_deferred: quiet } }).select('*').single();
  if (error || !data) return null;
  await track(db, userId, 'proactive_message_created', { proactiveMessageId: data.id, source: openThreadId ? 'open_thread' : 'life_event', deferred: quiet });
  if (quiet) return data;
  return deliverMessage(db, userId, instance, conversation, prefs, data, now);
}

async function deliverDueMessage(db: SupabaseClient, userId: string, instance: EventRow, conversation: EventRow | null, prefs: EventRow, now: Date): Promise<EventRow | null> {
  if (isQuietHours(now, String(prefs.quiet_hours_start ?? '23:00'), String(prefs.quiet_hours_end ?? '08:00'), String(prefs.timezone ?? 'UTC'))) return null;
  await db.from('together_proactive_messages').update({ status: 'cancelled', updated_at: now.toISOString() }).eq('user_id', userId).eq('character_instance_id', instance.id).eq('status', 'queued').lt('expires_at', now.toISOString());
  const { data } = await db.from('together_proactive_messages').select('*').eq('user_id', userId).eq('character_instance_id', instance.id).eq('status', 'queued').lte('eligible_at', now.toISOString()).or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`).order('eligible_at').limit(1).maybeSingle();
  return data ? deliverMessage(db, userId, instance, conversation, prefs, data, now) : null;
}

async function deliverMessage(db: SupabaseClient, userId: string, instance: EventRow, conversation: EventRow | null, prefs: EventRow, proactive: EventRow, now: Date): Promise<EventRow> {
  let sentMessageId: string | null = proactive.sent_message_id ?? null;
  if (conversation?.id && !sentMessageId) {
    const { data: message } = await db.from('together_messages').insert({ conversation_id: conversation.id, user_id: userId, character_instance_id: instance.id, role: 'assistant', content: proactive.content, delivery_status: 'complete', provider_metadata: { provider: 'life-engine', proactive: true, proactive_message_id: proactive.id } }).select('id,created_at').single();
    if (message) {
      sentMessageId = message.id;
      await db.from('together_conversations').update({ last_message_at: message.created_at, updated_at: message.created_at }).eq('id', conversation.id).eq('user_id', userId);
    }
  }
  const { data: delivered } = await db.from('together_proactive_messages').update({ status: 'sent', sent_message_id: sentMessageId, updated_at: now.toISOString() }).eq('id', proactive.id).eq('user_id', userId).eq('status', 'queued').select('*').maybeSingle();
  if (delivered && prefs.push_enabled) await sendPushNotifications(db, userId, String((instance.together_character_templates as EventRow | undefined)?.name ?? 'Maya'), delivered);
  return delivered ?? proactive;
}

async function sendPushNotifications(db: SupabaseClient, userId: string, characterName: string, proactive: EventRow): Promise<void> {
  const { data: tokens } = await db.from('together_push_tokens').select('id,expo_push_token').eq('user_id', userId).eq('active', true).limit(5);
  if (!tokens?.length) return;
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(tokens.map((item) => ({ to: item.expo_push_token, title: characterName, body: proactive.content, sound: 'default', data: { route: '/chat', proactiveMessageId: proactive.id } }))) });
    if (!response.ok) console.warn('Together push delivery failed', response.status);
  } catch (error) { console.warn('Together push delivery unavailable', error instanceof Error ? error.message : 'unknown_error'); }
}

function selectEventCandidates(last: Date, now: Date, templates: EventRow[], seed: string, recent: EventRow[], schedules: EventRow[]): Array<{ template: EventRow; occurredAt: string; simulationKey: string }> {
  if (!templates.length || now <= last) return [];
  const output: Array<{ template: EventRow; occurredAt: string; simulationKey: string }> = [];
  const recentTemplateDates = new Map(recent.map((item) => [String(item.event_template_id), new Date(item.starts_at).getTime()]));
  const cursor = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate()));
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let inspected = 0;
  while (cursor <= lastDay && inspected++ < 31) {
    const day = cursor.toISOString().slice(0, 10);
    if (cursor <= now) {
      const ranked = [...templates].sort((a, b) => stableHash(`${seed}:${day}:${a.id}`) - stableHash(`${seed}:${day}:${b.id}`));
      const selected = ranked.find((template) => {
        const repeatedRecently = recentTemplateDates.has(String(template.id)) && occurred.getTime() - Number(recentTemplateDates.get(String(template.id))) < 72 * 3600000;
        const roll = (stableHash(`${seed}:chance:${day}:${template.id}`) % 10000) / 10000;
        return !repeatedRecently && Number(template.significance) >= .45 && roll < Number(template.probability ?? 0);
      });
      if (selected) {
        const occurred = scheduledOccurrence(cursor, selected, schedules, seed);
        if (occurred > last && occurred <= now) output.push({ template: selected, occurredAt: occurred.toISOString(), simulationKey: `${day}:${selected.id}` });
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return output.sort((a, b) => Number(b.template.significance) - Number(a.template.significance)).slice(0, 2).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

function scheduledOccurrence(day: Date, template: EventRow, schedules: EventRow[], seed: string): Date {
  const matching = schedules.filter((entry) => Number(entry.day_of_week) === day.getUTCDay() && String(entry.location_id) === String(template.default_location_id) && Number(entry.end_minute) - Number(entry.start_minute) >= 20);
  const entry = matching[stableHash(`${seed}:${day.toISOString().slice(0, 10)}:${template.id}:schedule`) % matching.length];
  const result = new Date(day);
  if (entry) {
    const span = Math.max(1, Number(entry.end_minute) - Number(entry.start_minute) - 15);
    const minute = Number(entry.start_minute) + stableHash(`${seed}:${template.id}:${day.toISOString().slice(0, 10)}`) % span;
    result.setUTCHours(Math.floor(minute / 60), minute % 60, 0, 0);
  } else result.setUTCHours(12 + stableHash(`${seed}:hour:${template.id}:${day.toISOString().slice(0, 10)}`) % 7, 0, 0, 0);
  return result;
}

function applyEventInfluence(life: Record<string, any>, event?: EventRow): Record<string, any> {
  if (!event) return life;
  const effects = event.resulting_state_changes ?? {};
  const mood = effects.mood && typeof effects.mood === 'object' ? Object.entries(effects.mood).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] : null;
  const levels = ['low', 'medium', 'high'];
  const energyIndex = Math.max(0, Math.min(2, levels.indexOf(String(life.energy)) + Number(effects.energy ?? 0)));
  return { ...life, mood: mood ?? life.mood, energy: levels[energyIndex], activity: event.event_type === 'work' ? String(event.narrative_summary).replace(/^Maya\s+/i, '').replace(/[.]$/, '') : life.activity };
}

function shouldInitiateEventMessage(event: EventRow, stage: string, hoursSinceConversation: number, seed: string): boolean {
  const stageWeight = ['friend','flirting','dating','exclusive','long_term'].includes(stage) ? 42 : 18;
  const threshold = Math.min(78, stageWeight + Math.floor(hoursSinceConversation));
  return event.proactive_message_appropriate && Number(event.significance) >= .55 && stableHash(`${seed}:proactive:${event.id}`) % 100 < threshold;
}

function composeProactiveMessage(input: { eventTitle?: string; eventSummary?: string; threadSubject?: string; memory?: string }): string {
  if (input.threadSubject) return `Hey—how did your ${input.threadSubject} go? You mentioned it was important.`;
  const title = input.eventTitle ?? '';
  if (/coffee with chloe/i.test(title)) return 'Chloe just tried to talk me into rooftop trivia. Her confidence is wildly outpacing our actual chances.';
  if (/client cancels/i.test(title)) return 'My client canceled at the last minute, so I suddenly have an afternoon I did not plan for. Weirdly freeing.';
  if (/stressful client/i.test(title)) return 'I survived a client who used the phrase “make it pop” six times. I deserve a very specific kind of coffee now.';
  if (/successful photo/i.test(title)) return 'I just wrapped a shoot I’m actually proud of. There’s one frame I keep going back to.';
  if (/old camera/i.test(title)) return 'I found an old camera while reorganizing, and now I have a mildly irresponsible weekend idea.';
  if (/trivia/i.test(title)) return 'Alex is trying to recruit us for Northside trivia. I have concerns about how confident he is.';
  if (/reminder of the user/i.test(title) && input.memory) return `Something on my photo walk reminded me of ${memoryCallback(input.memory)}. Not a dramatic story—just a nice little callback.`;
  return input.eventSummary?.trim() || 'Something happened in the city today that I think you would appreciate.';
}

function isQuietHours(now: Date, start: string, end: string, timezone: string): boolean {
  const minute = localMinute(now, timezone), startMinute = parseMinute(start), endMinute = parseMinute(end);
  return startMinute > endMinute ? minute >= startMinute || minute < endMinute : minute >= startMinute && minute < endMinute;
}

function nextDeliveryTime(now: Date, start: string, end: string, timezone: string): Date {
  const candidate = new Date(now);
  for (let step = 0; step < 100; step++) { candidate.setUTCMinutes(candidate.getUTCMinutes() + 15); if (!isQuietHours(candidate, start, end, timezone)) return candidate; }
  return new Date(now.getTime() + 8 * 3600000);
}

function parseMinute(value: string): number { const [hour = '0', minute = '0'] = value.split(':'); return Number(hour) * 60 + Number(minute); }
function localMinute(now: Date, timezone: string): number { try { const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now); return Number(parts.find((part) => part.type === 'hour')?.value ?? 0) * 60 + Number(parts.find((part) => part.type === 'minute')?.value ?? 0); } catch { return now.getUTCHours() * 60 + now.getUTCMinutes(); } }
function memoryCallback(memory: string): string { return memory.replace(/^User's\s+/i, 'your ').replace(/^User\s+(?:likes|dislikes|feels|has|is)\s+/i, '').replace(/[.!]$/, '').slice(0, 80); }
function stableHash(value: string): number { let hash = 2166136261; for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
