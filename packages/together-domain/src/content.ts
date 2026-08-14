import { relationshipStages, type ActiveStoryArc, type ContentConditions, type ContentSelectionContext, type EventScale, type RichLifeEventTemplate, type ScoredContentCandidate, type StoryArcTemplate } from './types';

const stageRank = new Map(relationshipStages.map((stage, index) => [stage, index]));
const scaleWeight: Record<EventScale, number> = { micro: .18, normal: .42, meaningful: .7, major: .9 };

export function contentConditionsPass(conditions: ContentConditions | undefined, context: ContentSelectionContext): { eligible: boolean; reasons: string[] } {
  if (!conditions) return { eligible: true, reasons: ['No special conditions.'] };
  const stage = stageRank.get(context.relationship.stage) ?? 0;
  if (conditions.minRelationshipStage && stage < (stageRank.get(conditions.minRelationshipStage) ?? 0)) return { eligible: false, reasons: ['Relationship stage is too early.'] };
  if (conditions.maxRelationshipStage && stage > (stageRank.get(conditions.maxRelationshipStage) ?? Infinity)) return { eligible: false, reasons: ['Relationship stage is too advanced.'] };
  if (conditions.maxConflict !== undefined && context.relationship.conflict > conditions.maxConflict) return { eligible: false, reasons: ['Current conflict is too high.'] };
  for (const [metric, minimum] of Object.entries(conditions.minMetrics ?? {})) if (Number(context.relationship[metric as keyof typeof context.relationship] ?? 0) < Number(minimum)) return { eligible: false, reasons: [`${metric} is below the required threshold.`] };
  if (conditions.contentMode?.length && !conditions.contentMode.includes(context.contentMode)) return { eligible: false, reasons: ['Account content mode does not allow this situation.'] };
  if (conditions.daysOfWeek?.length && !conditions.daysOfWeek.includes(context.now.getDay())) return { eligible: false, reasons: ['This situation is not scheduled for today.'] };
  if (conditions.requiredLocations?.length && !conditions.requiredLocations.some((tag) => context.locationTags.includes(tag))) return { eligible: false, reasons: ['No suitable current location.'] };
  return { eligible: true, reasons: ['Relationship, availability, and content-mode conditions pass.'] };
}

export function scoreContentCandidates(templates: readonly RichLifeEventTemplate[], context: ContentSelectionContext): ScoredContentCandidate[] {
  return templates.flatMap((template) => {
    const condition = contentConditionsPass(template.conditions, context);
    if (!condition.eligible) return [];
    const repetitionPenalty = context.recentTemplateIds.includes(template.id) ? .72 : 0;
    const categoryPenalty = context.recentCategories.filter((category) => category === template.category).length * .16;
    const locationBonus = template.locationTags?.some((tag) => context.locationTags.includes(tag)) ? .16 : 0;
    const scale = scaleWeight[template.scale];
    const noise = seededUnit(`${context.seed}:${context.now.toISOString().slice(0, 10)}:${template.id}`) * .11;
    const score = Math.max(0, scale + locationBonus + noise - repetitionPenalty - categoryPenalty);
    return [{ template, score, reasons: [...condition.reasons, locationBonus ? 'Location matches.' : 'Location is flexible.', repetitionPenalty ? 'Recently used template penalty.' : 'Not recently used.', categoryPenalty ? 'Recent category variety penalty.' : 'Category remains fresh.'] }];
  }).sort((left, right) => right.score - left.score || left.template.id.localeCompare(right.template.id));
}

export function chooseDailyContent(templates: readonly RichLifeEventTemplate[], context: ContentSelectionContext, maxEvents = 2): ScoredContentCandidate[] {
  const chosen: ScoredContentCandidate[] = [];
  for (const candidate of scoreContentCandidates(templates, context)) {
    if (candidate.template.scale === 'major' && chosen.some((item) => item.template.scale === 'major')) continue;
    if (chosen.some((item) => item.template.category === candidate.template.category)) continue;
    if (candidate.score < (candidate.template.scale === 'micro' ? .12 : .3)) continue;
    chosen.push(candidate);
    if (chosen.length >= maxEvents) break;
  }
  return chosen;
}

export function nextStoryArcChapter(arc: StoryArcTemplate, active: ActiveStoryArc, now: Date): { chapterId?: string; completed: boolean; reason: string } {
  if (active.status !== 'active') return { completed: active.status === 'completed', reason: 'Arc is not active.' };
  if (active.nextEligibleAt && new Date(active.nextEligibleAt) > now) return { completed: false, reason: 'Chapter pacing delay is still active.' };
  const index = arc.chapters.findIndex((chapter) => chapter.id === active.currentChapterId);
  if (index < 0) return { completed: false, reason: 'Active chapter is not present in its template.' };
  const current = arc.chapters[index]!;
  const nextId = current.possibleNextChapterIds?.[0] ?? arc.chapters[index + 1]?.id;
  return nextId ? { chapterId: nextId, completed: false, reason: 'Next authored chapter is eligible.' } : { completed: true, reason: 'Final authored chapter completed.' };
}

export function validateContentPack(input: { events: readonly RichLifeEventTemplate[]; arcs: readonly StoryArcTemplate[] }): string[] {
  const errors: string[] = [];
  const eventIds = new Set<string>();
  for (const event of input.events) {
    if (eventIds.has(event.id)) errors.push(`Duplicate event id: ${event.id}`); eventIds.add(event.id);
    if (!event.title.trim()) errors.push(`Event ${event.id} needs a title.`);
    if (!Number.isFinite(event.significance) || event.significance < 0 || event.significance > 1) errors.push(`Event ${event.id} has an invalid significance.`);
    if (event.contentLevel === 'explicit') errors.push(`Event ${event.id} cannot be bundled as explicit content.`);
  }
  const arcIds = new Set<string>();
  for (const arc of input.arcs) {
    if (arcIds.has(arc.id)) errors.push(`Duplicate story arc id: ${arc.id}`); arcIds.add(arc.id);
    if (!arc.chapters.length) errors.push(`Story arc ${arc.id} has no chapters.`);
    const chapterIds = new Set(arc.chapters.map((chapter) => chapter.id));
    for (const chapter of arc.chapters) for (const next of chapter.possibleNextChapterIds ?? []) if (!chapterIds.has(next)) errors.push(`Story arc ${arc.id} references missing chapter ${next}.`);
  }
  return errors;
}

export function simulateContentMonth(templates: readonly RichLifeEventTemplate[], arcs: readonly StoryArcTemplate[], seed = 'maya-content-pack-1'): { events: Array<{ day: number; id: string }>; arcSteps: string[]; repeatedTemplateRate: number } {
  const events: Array<{ day: number; id: string }> = []; const used: string[] = []; const arcSteps: string[] = [];
  const relationship = { stage: 'dating' as const, conversationCount: 12, trust: 52, comfort: 52, attraction: 48, affinity: 50, familiarity: 50, respect: 55, conflict: 8, romantic_interest: 42, commitment: 18, activeMajorConflict: false };
  for (let day = 0; day < 30; day++) {
    const now = new Date(Date.UTC(2026, 7, 3 + day, 18));
    const candidates = chooseDailyContent(templates, { now, relationship, characterSlug: 'maya', locationTags: ['city', day % 3 ? 'home' : 'cafe'], contentMode: 'romance', recentTemplateIds: used.slice(-8), recentCategories: [], activeArcIds: [], seed: `${seed}:${day}` });
    for (const candidate of candidates) { events.push({ day: day + 1, id: candidate.template.id }); used.push(candidate.template.id); }
    if (day === 3 || day === 10 || day === 18) arcSteps.push(arcs[day === 3 ? 0 : day === 10 ? 1 : 2]?.slug ?? 'none');
  }
  const repeated = used.length - new Set(used).size;
  return { events, arcSteps, repeatedTemplateRate: used.length ? repeated / used.length : 0 };
}

function seededUnit(value: string): number { let hash = 2166136261; for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0) / 4294967295; }
