import type { SupabaseClient } from '@supabase/supabase-js';
import { contentModeAllows, providerCapabilities } from './kivelle-intelligence.ts';

type Row = Record<string, any>;
const stageOrder = ['stranger','acquaintance','friend','flirting','dating','exclusive','long_term'];

export function rankEventTemplates(input: { templates: Row[]; relationship: Row; recentEvents: Row[]; now: Date; seed: string; contentMode?: string; locationId?: string | null }): Row[] {
  const recentIds = new Set(input.recentEvents.map((event) => String(event.event_template_id)));
  const categories = input.recentEvents.map((event) => String(event.metadata?.category ?? event.event_type));
  return input.templates.flatMap((template) => {
    const eligibility = contentEligible(template, input.relationship, input.now, input.contentMode ?? 'standard');
    if (!eligibility.eligible) return [];
    const repetition = recentIds.has(String(template.id)) ? .75 : 0;
    const categoryPenalty = categories.filter((category) => category === String(template.category ?? template.event_type)).length * .14;
    const locationBonus = input.locationId && String(template.default_location_id) === String(input.locationId) ? .16 : 0;
    const base = scaleScore(String(template.scale ?? 'normal'));
    const noise = stableUnit(`${input.seed}:${input.now.toISOString().slice(0, 10)}:${template.id}`) * .1;
    return [{ ...template, _content_score: Math.max(0, base + locationBonus + noise - repetition - categoryPenalty), _content_reasons: eligibility.reasons }];
  }).sort((a, b) => Number(b._content_score) - Number(a._content_score) || String(a.id).localeCompare(String(b.id)));
}

export async function progressStoryArcs(input: { db: SupabaseClient; userId: string; instance: Row; relationship: Row; now: Date; seed: string }): Promise<Row[]> {
  const { db, userId, instance, relationship, now, seed } = input;
  const [activeResult, templatesResult] = await Promise.all([
    db.from('together_story_arc_instances').select('*,together_story_arc_templates(*)').eq('user_id', userId).eq('character_instance_id', instance.id).eq('status', 'active').order('started_at'),
    db.from('together_story_arc_templates').select('*').eq('active', true).contains('eligible_template_ids', [instance.character_template_id]),
  ]);
  const active = activeResult.data ?? [];
  const output: Row[] = [];
  for (const arc of active) {
    if (arc.next_eligible_at && new Date(arc.next_eligible_at) > now) continue;
    const template = arc.together_story_arc_templates as Row;
    const chapters = Array.isArray(template?.chapters) ? template.chapters as Row[] : [];
    const index = chapters.findIndex((chapter) => String(chapter.id) === String(arc.current_chapter_id));
    if (index < 0) continue;
    const chapter = chapters[index]!;
    const next = chapters[index + 1];
    const minimumHours = Number(chapter.minimumHoursBeforeNext ?? 24);
    const nextEligibleAt = new Date(now.getTime() + minimumHours * 3600000).toISOString();
    const event = await materializeArcChapter(db, userId, instance, arc, chapter, now, `${arc.id}:${chapter.id}`);
    if (event) output.push(event);
    await db.from('together_story_arc_instances').update(next ? { current_chapter_id: next.id, next_eligible_at: nextEligibleAt, updated_at: now.toISOString() } : { status: 'completed', completed_at: now.toISOString(), updated_at: now.toISOString() }).eq('id', arc.id).eq('user_id', userId);
  }
  const activeMajor = active.some((arc) => arc.priority === 'major');
  const activeMinor = active.filter((arc) => arc.priority === 'minor').length;
  if (activeMajor || activeMinor >= 2) return output;
  const eligible = (templatesResult.data ?? []).filter((template) => arcEligible(template, relationship));
  const selected = eligible.sort((a, b) => stableUnit(`${seed}:${now.toISOString().slice(0, 10)}:${a.slug}`) - stableUnit(`${seed}:${now.toISOString().slice(0, 10)}:${b.slug}`)).find((template) => stableUnit(`${seed}:arc:${template.slug}:${now.toISOString().slice(0, 10)}`) < (template.priority === 'major' ? .015 : .035));
  if (!selected) return output;
  const chapters = Array.isArray(selected.chapters) ? selected.chapters as Row[] : [];
  const first = chapters[0];
  if (!first) return output;
  const { data: created } = await db.from('together_story_arc_instances').upsert({ user_id: userId, character_instance_id: instance.id, template_slug: selected.slug, current_chapter_id: first.id, priority: selected.priority, next_eligible_at: new Date(now.getTime() + Number(first.minimumHoursBeforeNext ?? 24) * 3600000).toISOString() }, { onConflict: 'user_id,character_instance_id,template_slug', ignoreDuplicates: true }).select('*').maybeSingle();
  if (!created) return output;
  const event = await materializeArcChapter(db, userId, instance, created, first, now, `${created.id}:${first.id}`);
  if (event) output.push(event);
  return output;
}

async function materializeArcChapter(db: SupabaseClient, userId: string, instance: Row, arc: Row, chapter: Row, now: Date, key: string): Promise<Row | null> {
  const { data } = await db.from('together_life_events').upsert({ user_id: userId, character_instance_id: instance.id, story_arc_instance_id: arc.id, simulation_key: `arc:${key}`, event_type: 'story_arc', title: chapter.title, narrative_summary: chapter.narrativeSeed, participant_instance_ids: [instance.id], location_id: instance.current_location_id, significance: chapter.mayCreateMoment ? .84 : .68, starts_at: now.toISOString(), ends_at: new Date(now.getTime() + 60 * 60000).toISOString(), resulting_state_changes: {}, user_should_know: chapter.userVisibility !== 'hidden', proactive_message_appropriate: Boolean(chapter.mayTriggerProactiveMessage), metadata: { source: 'story_arc', arc_slug: arc.template_slug, chapter_id: chapter.id, category: 'story_arc' } }, { onConflict: 'character_instance_id,simulation_key', ignoreDuplicates: true }).select('*').maybeSingle();
  return data ?? null;
}

function contentEligible(template: Row, relationship: Row, now: Date, contentMode: string): { eligible: boolean; reasons: string[] } {
  const conditions = template.conditions && typeof template.conditions === 'object' ? template.conditions as Row : {};
  if (!contentModeAllows(String(template.content_level ?? 'standard') as any, contentMode as any, providerCapabilities.openai)) return { eligible: false, reasons: ['Content mode is not eligible.'] };
  if (conditions.minRelationshipStage && stageIndex(String(relationship.relationship_stage ?? 'stranger')) < stageIndex(String(conditions.minRelationshipStage))) return { eligible: false, reasons: ['Relationship stage is too early.'] };
  if (conditions.maxConflict !== undefined && Number(relationship.conflict ?? 0) > Number(conditions.maxConflict)) return { eligible: false, reasons: ['Conflict is too high.'] };
  if (Array.isArray(conditions.daysOfWeek) && !conditions.daysOfWeek.includes(now.getDay())) return { eligible: false, reasons: ['Not scheduled for today.'] };
  if (conditions.minMetrics && typeof conditions.minMetrics === 'object') for (const [metric, value] of Object.entries(conditions.minMetrics)) if (Number(relationship[metric] ?? 0) < Number(value)) return { eligible: false, reasons: [`${metric} threshold is unmet.`] };
  return { eligible: true, reasons: ['Eligible.'] };
}

function arcEligible(template: Row, relationship: Row): boolean { return !template.min_relationship_stage || stageIndex(String(relationship.relationship_stage ?? 'stranger')) >= stageIndex(String(template.min_relationship_stage)); }
function stageIndex(value: string): number { return Math.max(0, stageOrder.indexOf(value)); }
function scaleScore(scale: string): number { return scale === 'major' ? .9 : scale === 'meaningful' ? .7 : scale === 'normal' ? .42 : .2; }
function stableUnit(value: string): number { let hash = 2166136261; for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0) / 4294967295; }
