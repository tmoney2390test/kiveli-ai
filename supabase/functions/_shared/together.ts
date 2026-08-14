import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';

export const TOGETHER_IDS = {
  world: '10000000-0000-4000-8000-000000000001',
  juniper: '11000000-0000-4000-8000-000000000001',
  apartment: '11000000-0000-4000-8000-000000000002',
  rooftop: '11000000-0000-4000-8000-000000000003',
  northside: '11000000-0000-4000-8000-000000000004',
  riverwalk: '11000000-0000-4000-8000-000000000005',
  studio: '11000000-0000-4000-8000-000000000006',
  maya: '12000000-0000-4000-8000-000000000001',
  chloe: '12000000-0000-4000-8000-000000000002',
  alex: '12000000-0000-4000-8000-000000000003',
  mayaVersion: '13000000-0000-4000-8000-000000000001',
  chloeVersion: '13000000-0000-4000-8000-000000000002',
  alexVersion: '13000000-0000-4000-8000-000000000003',
  dinner: '15000000-0000-4000-8000-000000000001',
} as const;

export const relationshipMetrics = ['trust','comfort','attraction','affinity','familiarity','respect','conflict','romantic_interest','commitment'] as const;
const phaseOrder = ['arrival','ordering','early_conversation','personal_conversation','unexpected_moment','dessert','after_date','resolution'] as const;

export function clampRelationship(current: Record<string, unknown>, proposal: Record<string, unknown>, limit = 2): Record<string, number> {
  return Object.fromEntries(relationshipMetrics.map((metric) => {
    const before = Number(current[metric] ?? 0);
    const asked = Number(proposal[metric] ?? 0);
    const delta = Math.max(-limit, Math.min(limit, Number.isFinite(asked) ? asked : 0));
    return [metric, Math.max(0, Math.min(100, Math.round(before + delta)))];
  }));
}

export function firstDateEligible(state: Record<string, unknown>): boolean {
  return Number(state.familiarity) >= 28 && Number(state.trust) >= 24 && Number(state.attraction) >= 22 &&
    Number(state.conversation_count) >= 5 && !state.active_major_conflict && Number(state.conflict) <= 45 &&
    ['friend','flirting'].includes(String(state.relationship_stage ?? state.stage));
}

export type RelationshipMilestone = { kind: 'keep_in_touch'|'friendship_deepened'|'romantic_spark'|'first_date_invitation'|'repair'; fromStage: string; toStage?: string; title: string; body: string; prompt: string; choices: Array<{ id: string; label: string; tone: 'primary'|'secondary' }> };

export function nextRelationshipMilestone(state: Record<string, unknown>): RelationshipMilestone | null {
  const stage = String(state.relationship_stage ?? state.stage ?? 'stranger');
  const conversations = Number(state.conversation_count ?? state.conversationCount ?? 0);
  if (Boolean(state.active_major_conflict ?? state.activeMajorConflict) || Number(state.conflict ?? 0) > 45) return { kind: 'repair', fromStage: stage, title: 'Something feels unresolved', body: 'Maya would rather address the tension honestly than pretend it is not there.', prompt: 'How do you want to handle it?', choices: [{ id: 'talk_it_out', label: 'Talk it out', tone: 'primary' }, { id: 'give_space', label: 'Give her some space', tone: 'secondary' }] };
  if (stage === 'stranger' && conversations >= 1) return { kind: 'keep_in_touch', fromStage: stage, toStage: 'acquaintance', title: 'Keep in touch?', body: 'Maya pauses before leaving, then offers a small smile. “I’d like to keep talking, if you would.”', prompt: 'What do you say?', choices: [{ id: 'accept', label: 'I’d like that', tone: 'primary' }, { id: 'defer', label: 'Let’s take it slowly', tone: 'secondary' }] };
  if (stage === 'acquaintance' && conversations >= 5 && Number(state.familiarity) >= 15 && Number(state.trust) >= 14) return { kind: 'friendship_deepened', fromStage: stage, toStage: 'friend', title: 'This is becoming real', body: 'The conversation has started to feel less like chance meetings and more like an actual friendship.', prompt: 'How do you meet the moment?', choices: [{ id: 'accept', label: 'I feel it too', tone: 'primary' }, { id: 'defer', label: 'Keep getting to know each other', tone: 'secondary' }] };
  if (stage === 'friend' && conversations >= 8 && Number(state.attraction) >= 18 && Number(state.comfort) >= 18) return { kind: 'romantic_spark', fromStage: stage, toStage: 'flirting', title: 'There’s a spark here', body: 'Maya lets a teasing moment linger, giving you room to decide whether this stays friendship or becomes something more.', prompt: 'Where do you want this to go?', choices: [{ id: 'accept', label: 'Lean into the spark', tone: 'primary' }, { id: 'stay_friends', label: 'Keep this as friendship', tone: 'secondary' }, { id: 'defer', label: 'Not yet', tone: 'secondary' }] };
  if (firstDateEligible({ ...state, relationship_stage: stage })) return { kind: 'first_date_invitation', fromStage: stage, title: 'Dinner at Juniper?', body: 'Maya grins. “You’ve mentioned that place enough times. Are you actually going to take me?”', prompt: 'What do you say?', choices: [{ id: 'accept', label: 'Yes—let’s do it', tone: 'primary' }, { id: 'defer', label: 'Ask me again later', tone: 'secondary' }] };
  return null;
}

export function describeRelationshipCue(state: Record<string, unknown>): { label: string; detail: string; tone: 'warm'|'spark'|'tense'|'steady' } {
  const stage = String(state.relationship_stage ?? state.stage ?? 'stranger');
  if (Boolean(state.active_major_conflict ?? state.activeMajorConflict) || Number(state.conflict ?? 0) > 45) return { label: 'A little distance', detail: 'Something feels unresolved. An honest conversation could help.', tone: 'tense' };
  if (stage === 'long_term') return { label: 'Deeply connected', detail: 'You have built a steady shared history together.', tone: 'warm' };
  if (stage === 'exclusive') return { label: 'Choosing each other', detail: 'This relationship feels intentional and secure.', tone: 'warm' };
  if (stage === 'dating') return { label: 'Growing closer', detail: 'Shared experiences are turning into something meaningful.', tone: 'warm' };
  if (stage === 'flirting') return { label: 'There’s a spark', detail: 'The warmth between you has a playful romantic edge.', tone: 'spark' };
  if (stage === 'friend') return { label: 'Easy closeness', detail: 'Trust is growing and Maya is opening up naturally.', tone: 'warm' };
  if (stage === 'acquaintance') return { label: 'Getting acquainted', detail: 'You are beginning to understand each other.', tone: 'steady' };
  return { label: 'A first impression', detail: 'Your shared story is just beginning.', tone: 'steady' };
}

export function nextDatePhase(current: string): { phase: string; index: number; completed: boolean } {
  const index = phaseOrder.indexOf(current as typeof phaseOrder[number]);
  if (index < 0) throw new AppError('VALIDATION_FAILED', 'This date is in an invalid phase.', 400);
  if (index === phaseOrder.length - 1) return { phase: 'resolution', index, completed: true };
  return { phase: phaseOrder[index + 1]!, index: index + 1, completed: index + 1 === phaseOrder.length - 1 };
}

export function resolveLifeState(rows: Array<Record<string, unknown>>, now = new Date()): { locationId: string; location: string; activity: string; availability: string; mood: string; energy: string } {
  const minute = now.getHours() * 60 + now.getMinutes();
  const row = rows.find((entry) => Number(entry.day_of_week) === now.getDay() && minute >= Number(entry.start_minute) && minute < Number(entry.end_minute));
  if (!row) return { locationId: TOGETHER_IDS.apartment, location: "Maya's Apartment", activity: now.getHours() < 8 ? 'sleeping' : 'taking care of a few things', availability: now.getHours() < 8 ? 'busy' : 'available', mood: 'content', energy: now.getHours() > 21 ? 'low' : 'medium' };
  const location = (row.together_locations as Record<string, unknown> | null)?.name ?? 'City Life';
  return { locationId: String(row.location_id ?? TOGETHER_IDS.apartment), location: String(location), activity: String(row.activity), availability: String(row.availability), mood: String(row.mood_influence ?? 'content'), energy: Number(row.energy_delta) > 0 ? 'high' : Number(row.energy_delta) < 0 ? 'low' : 'medium' };
}

export type MemoryCandidate = { memory_type: string; canonical_text: string; dedupe_key: string; subject_key: string; importance: number; confidence: number; sensitivity_category: string; metadata: Record<string, unknown> };

export type OpenThreadCandidate = { topic: string; dedupe_key: string; expected_at: string | null; importance: number; metadata: Record<string, unknown> };

export function normalizeContinuityKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function extractMemories(text: string): MemoryCandidate[] {
  const candidates: MemoryCandidate[] = [];
  const add = (memory_type: string, canonical_text: string, subject_key: string, importance: number, confidence: number, metadata: Record<string, unknown> = {}, sensitivity_category = 'none') => candidates.push({ memory_type, canonical_text, dedupe_key: `${memory_type}:${normalizeContinuityKey(canonical_text)}`, subject_key, importance, confidence, sensitivity_category, metadata });
  const pet = /\bmy\s+(dog|cat|pet)(?:'s| is)?\s+name\s+is\s+([a-z][a-z'-]{1,30})\b/i.exec(text);
  if (pet) {
    const animal = pet[1]!.toLowerCase();
    const name = `${pet[2]![0]!.toUpperCase()}${pet[2]!.slice(1).toLowerCase()}`;
    add('semantic', `User's ${animal} is named ${name}.`, `pet:${animal}:name`, .86, .97, { subject: animal, name }, 'personal');
  }
  const neutral = /\bi\s+(?:do not|don't)\s+(?:hate|dislike)\s+([^.!?]{2,60}?)(?:\s+anymore|\s+now)?(?:[.!?]|$)/i.exec(text);
  const dislike = !neutral ? /\bi\s+(?:really\s+)?(?:hate|can't stand|do not like|don't like)\s+([^.!?]{2,60})/i.exec(text) : null;
  const like = /\bi\s+(?:actually\s+)?(?:really\s+)?(?:love|like|enjoy)\s+([^.!?]{2,60}?)(?:\s+now)?(?:[.!?]|$)/i.exec(text);
  if (neutral) {
    const item = cleanContinuityObject(neutral[1]!);
    add('preference', `User no longer dislikes ${item}.`, `preference:${normalizeContinuityKey(item)}`, .7, .93, { preference: 'neutral', item, correction: true });
  } else if (dislike) {
    const item = cleanContinuityObject(dislike[1]!);
    add('preference', `User dislikes ${item}.`, `preference:${normalizeContinuityKey(item)}`, .7, .91, { preference: 'dislike', item });
  } else if (like) {
    const item = cleanContinuityObject(like[1]!);
    add('preference', `User likes ${item}.`, `preference:${normalizeContinuityKey(item)}`, .6, .84, { preference: 'like', item });
  }
  const emotion = /\bi(?:'m| am)\s+(nervous|anxious|excited|worried|scared)\s+(?:about\s+)?([^.!?]{2,80})/i.exec(text);
  if (emotion) {
    const topic = cleanContinuityObject(emotion[2]!);
    add('emotional', `User feels ${emotion[1]!.toLowerCase()} about ${topic}.`, `emotion:${normalizeContinuityKey(topic)}`, .72, .86, {}, 'personal');
  }
  return candidates;
}

export function extractOpenThread(text: string, now = new Date()): OpenThreadCandidate | null {
  const event = /\b(?:i\s+)?(?:have|got|give|giving|am giving|need to do)\s+(?:a\s+)?(?:huge\s+|big\s+|important\s+)?(presentation|interview|appointment|exam|test|meeting|trip|flight|date|game|event)(?:\s+[^.!?]{0,45}?)?\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.exec(text);
  if (!event) return null;
  const topicName = event[1]!.toLowerCase();
  const topic = `Ask how the user's ${topicName} went.`;
  let expected: Date | null = null;
  const dayName = event[2]!.toLowerCase();
  if (dayName === 'today') expected = new Date(now);
  else if (dayName === 'tomorrow') expected = new Date(now.getTime() + 86400000);
  else if (dayName) {
    const target = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(dayName);
    const delta = (target - now.getDay() + 7) % 7 || 7;
    expected = new Date(now.getTime() + delta * 86400000);
  }
  if (expected) expected.setHours(12, 0, 0, 0);
  const expectedAt = expected?.toISOString() ?? null;
  return { topic, dedupe_key: `event:${topicName}:${expectedAt?.slice(0, 10) ?? 'unscheduled'}`, expected_at: expectedAt, importance: .84, metadata: { source: 'conversation', subject: topicName } };
}

export function threadAnswered(thread: Record<string, unknown>, text: string): boolean {
  if (!thread.follow_up_eligible || thread.resolved_at) return false;
  const subject = String((thread.metadata as Record<string, unknown> | null)?.subject ?? String(thread.topic).match(/user's\s+([a-z]+)/i)?.[1] ?? '');
  const outcome = /\b(went|was|did|finished|done|nailed|passed|failed|great|well|bad|okay|ok|terrible|over)\b/i.test(text);
  const refersToSubject = Boolean(subject && new RegExp(`\\b${subject.replace(/[^a-z0-9]/gi, '')}\\b`, 'i').test(text)) || /\b(it|that)\b/i.test(text);
  return outcome && refersToSubject;
}

export function summarizeConversation(turns: Array<{ role: string; content: string }>, limit = 900): string {
  const clean = turns.map((turn) => ({ role: turn.role, content: turn.content.replace(/\s+/g, ' ').trim().slice(0, 280) })).filter((turn) => turn.content).slice(-24);
  const userDetails = clean.filter((turn) => turn.role === 'user').map((turn) => turn.content).slice(-4);
  const characterDetails = clean.filter((turn) => turn.role === 'assistant').map((turn) => turn.content).slice(-3);
  const summary = [userDetails.length ? `User shared: ${userDetails.join(' | ')}` : '', characterDetails.length ? `Character responded: ${characterDetails.join(' | ')}` : ''].filter(Boolean).join('\n');
  return summary.length <= limit ? summary : `${summary.slice(0, limit - 1).trimEnd()}…`;
}

function cleanContinuityObject(value: string): string {
  return value.trim().replace(/\s+(?:a lot|so much|though)$/i, '').toLowerCase();
}

export async function track(db: SupabaseClient, userId: string, eventName: string, properties: Record<string, unknown> = {}): Promise<void> {
  const { error } = await db.from('together_analytics_events').insert({ user_id: userId, event_name: eventName, properties });
  if (error) console.warn('Together analytics failed', eventName, error.message);
}

export async function buildSnapshot(db: SupabaseClient, userId: string): Promise<Record<string, unknown>> {
  const [profile, worlds, locations, instances, schedules, relationships, milestones, dates, moments, memories, threads, conversations, events, proactive, entitlements, preferences] = await Promise.all([
    db.from('together_profiles').select('*').eq('user_id', userId).maybeSingle(),
    db.from('together_worlds').select('*').eq('published', true),
    db.from('together_locations').select('*'),
    db.from('together_character_instances').select('*, together_character_templates(*), together_character_versions(*)').eq('user_id', userId),
    db.from('together_schedule_templates').select('*'),
    db.from('together_relationship_states').select('*').eq('user_id', userId),
    db.from('together_relationship_milestones').select('*').eq('user_id', userId).eq('status', 'pending').order('created_at', { ascending: true }),
    db.from('together_date_sessions').select('*, together_date_templates(*)').eq('user_id', userId),
    db.from('together_moments').select('*').eq('user_id', userId).order('occurred_at', { ascending: false }).limit(30),
    db.from('together_memories').select('*').eq('user_id', userId).eq('status', 'active').order('pinned', { ascending: false }).order('importance', { ascending: false }).limit(100),
    db.from('together_open_threads').select('*').eq('user_id', userId).is('resolved_at', null),
    db.from('together_conversations').select('*').eq('user_id', userId).order('last_message_at', { ascending: false, nullsFirst: false }),
    db.from('together_life_events').select('*').eq('user_id', userId).order('starts_at', { ascending: false }).limit(20),
    db.from('together_proactive_messages').select('*').eq('user_id', userId).in('status', ['queued','sent']).lte('eligible_at', new Date().toISOString()).order('eligible_at', { ascending: false }).limit(10),
    db.from('together_entitlements').select('*').eq('user_id', userId).maybeSingle(),
    db.from('together_notification_preferences').select('*').eq('user_id', userId).maybeSingle(),
  ]);
  const failed = [profile, worlds, locations, instances, schedules, relationships, milestones, dates, moments, memories, threads, conversations, events, proactive, entitlements, preferences].find((result) => result.error);
  if (failed?.error) throw new AppError('INTERNAL_ERROR', 'Together could not load your world.', 500, true);
  const stageByInstance = new Map((instances.data ?? []).map((instance) => [instance.id, instance.relationship_stage]));
  const relationshipCues = Object.fromEntries((relationships.data ?? []).map((relationship) => [relationship.character_instance_id, describeRelationshipCue({ ...relationship, relationship_stage: stageByInstance.get(relationship.character_instance_id) })]));
  return { profile: profile.data, worlds: worlds.data ?? [], locations: locations.data ?? [], characters: instances.data ?? [], schedules: schedules.data ?? [], relationships: relationships.data ?? [], relationshipMilestones: milestones.data ?? [], relationshipCues, dates: dates.data ?? [], moments: moments.data ?? [], memories: memories.data ?? [], openThreads: threads.data ?? [], conversations: conversations.data ?? [], lifeEvents: events.data ?? [], proactiveMessages: proactive.data ?? [], entitlements: entitlements.data, notificationPreferences: preferences.data };
}
