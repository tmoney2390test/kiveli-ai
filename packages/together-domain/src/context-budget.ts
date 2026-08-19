export type ContextIntelligenceProfile = 'core' | 'deep' | 'director';
export type ContextIntent = 'general' | 'schedule' | 'plan' | 'date' | 'story' | 'memory_overview' | 'social' | 'location' | 'history';
export type ContextRecordCategory = 'memory' | 'history' | 'place' | 'social' | 'plan' | 'episode' | 'pattern' | 'thread' | 'life_event' | 'media';

export type ContextSectionVariant = {
  label: 'full' | 'compact' | 'minimal';
  content: string;
  recordIds?: string[];
};

export type ContextSectionInput = {
  key: string;
  order: number;
  required?: boolean;
  protected?: boolean;
  priority: number;
  relevance: number;
  freshnessAt?: string | null;
  reasonCodes?: string[];
  allRecordIds?: string[];
  variants: ContextSectionVariant[];
};

export type ContextSectionDiagnostic = {
  key: string;
  included: boolean;
  required: boolean;
  selectedVariant: ContextSectionVariant['label'] | 'dropped';
  estimatedTokens: number;
  relevance: number;
  freshness: number;
  recordIds: string[];
  droppedRecordIds: string[];
  reasonCodes: string[];
  decision: 'required' | 'intent_match' | 'relevant' | 'dropped_budget' | 'dropped_low_relevance' | 'empty';
};

export type ContextBudgetResult = {
  prompt: string;
  ceilingTokens: number;
  estimatedTokens: number;
  utilization: number;
  sections: ContextSectionDiagnostic[];
};

export type RankedContextRecord<T> = { record: T; score: number; reasonCodes: string[] };

const ceilings: Record<ContextIntelligenceProfile, number> = {
  core: 9_000,
  deep: 14_000,
  director: 20_000,
};

const intentAffinity: Record<ContextRecordCategory, Partial<Record<ContextIntent, number>>> = {
  memory: { memory_overview: 1, history: .9, general: .55, social: .5, story: .5 },
  history: { history: 1, memory_overview: .9, story: .72, date: .6, general: .28 },
  place: { location: 1, plan: .76, date: .76, schedule: .62, story: .48, general: .38 },
  social: { social: 1, history: .58, story: .56, general: .34 },
  plan: { plan: 1, schedule: .95, date: .82, location: .58, general: .3 },
  episode: { history: 1, memory_overview: .9, story: .76, location: .58, general: .34 },
  pattern: { plan: .72, date: .68, social: .58, general: .48 },
  thread: { schedule: .76, plan: .7, memory_overview: .64, general: .5 },
  life_event: { schedule: .86, story: .82, location: .68, history: .62, general: .4 },
  media: { location: .7, history: .62, memory_overview: .58, general: .26 },
};

const stopWords = new Set(['about', 'after', 'again', 'are', 'been', 'could', 'from', 'have', 'here', 'just', 'more', 'that', 'the', 'their', 'there', 'they', 'this', 'what', 'when', 'where', 'which', 'with', 'would', 'you', 'your']);

export function contextInputTokenCeiling(profile: unknown): number {
  return ceilings[profile === 'deep' || profile === 'director' ? profile : 'core'];
}

/** Conservative tokenizer-independent estimate used to enforce a predictable preflight ceiling. */
export function estimateContextTokens(value: string): number {
  if (!value) return 0;
  return Math.max(1, Math.ceil(value.length / 3.6));
}

export function budgetContextSections(sections: readonly ContextSectionInput[], input: { ceilingTokens: number; now?: Date }): ContextBudgetResult {
  const now = input.now ?? new Date();
  const ceilingTokens = Math.max(1_000, Math.floor(input.ceilingTokens));
  const prepared = sections.map((section) => prepareSection(section, now));
  const workingCeiling = Math.max(900, ceilingTokens - prepared.length);
  const selected = new Map<string, { variant: ContextSectionVariant; tokens: number }>();

  for (const section of prepared.filter((item) => item.required)) {
    const minimal = section.variants.at(-1);
    if (minimal) selected.set(section.key, { variant: minimal, tokens: estimateContextTokens(minimal.content) });
  }

  let total = selectedTokens(selected);
  if (total > workingCeiling) {
    const shrinkable = prepared.filter((section) => section.required && !section.protected).sort((left, right) => (selected.get(right.key)?.tokens ?? 0) - (selected.get(left.key)?.tokens ?? 0));
    for (const section of shrinkable) {
      if (total <= workingCeiling) break;
      const current = selected.get(section.key);
      if (!current) continue;
      const target = Math.max(24, current.tokens - (total - workingCeiling));
      const content = truncateTaggedSection(current.variant.content, target);
      const tokens = estimateContextTokens(content);
      selected.set(section.key, { variant: { ...current.variant, label: 'minimal', content }, tokens });
      total = selectedTokens(selected);
    }
  }

  const candidates = [...prepared].sort((left, right) => sectionScore(right) - sectionScore(left) || left.order - right.order);
  for (const section of candidates) {
    if (!section.required && section.relevance < .16) continue;
    const current = selected.get(section.key);
    for (const variant of section.variants) {
      const tokens = estimateContextTokens(variant.content);
      const delta = tokens - (current?.tokens ?? 0);
      if (delta <= 0) break;
      if (total + delta <= workingCeiling) {
        selected.set(section.key, { variant, tokens });
        total += delta;
        break;
      }
    }
  }

  const ordered = [...prepared].sort((left, right) => left.order - right.order);
  const prompt = ordered.map((section) => selected.get(section.key)?.variant.content ?? '').filter(Boolean).join('\n');
  const diagnostics = ordered.map((section): ContextSectionDiagnostic => {
    const choice = selected.get(section.key);
    const allRecordIds = unique(section.allRecordIds?.length ? section.allRecordIds : section.variants.flatMap((variant) => variant.recordIds ?? []));
    const recordIds = unique(choice?.variant.recordIds ?? []);
    const droppedRecordIds = allRecordIds.filter((id) => !recordIds.includes(id));
    const intentMatch = section.reasonCodes.includes('intent_match');
    const decision: ContextSectionDiagnostic['decision'] = choice
      ? section.required ? 'required' : intentMatch ? 'intent_match' : 'relevant'
      : !section.variants.length ? 'empty' : section.relevance < .16 ? 'dropped_low_relevance' : 'dropped_budget';
    return { key: section.key, included: Boolean(choice), required: section.required, selectedVariant: choice?.variant.label ?? 'dropped', estimatedTokens: choice?.tokens ?? 0, relevance: round(section.relevance), freshness: round(section.freshness), recordIds, droppedRecordIds, reasonCodes: unique([...section.reasonCodes, decision]), decision };
  });
  return { prompt, ceilingTokens, estimatedTokens: estimateContextTokens(prompt), utilization: round(estimateContextTokens(prompt) / ceilingTokens), sections: diagnostics };
}

export function rankContextRecords<T>(records: readonly T[], input: {
  category: ContextRecordCategory;
  intent: ContextIntent;
  query: string;
  now?: Date;
  limit?: number;
  text: (record: T) => string;
  id?: (record: T) => string;
  occurredAt?: (record: T) => string | null | undefined;
  importance?: (record: T) => number | null | undefined;
  active?: (record: T) => boolean;
}): RankedContextRecord<T>[] {
  const now = input.now ?? new Date();
  const queryTerms = terms(input.query);
  const affinity = intentAffinity[input.category][input.intent] ?? .2;
  return records.map((record, index) => {
    const recordTerms = terms(input.text(record));
    const overlap = lexicalOverlap(queryTerms, recordTerms);
    const freshness = freshnessScore(input.occurredAt?.(record), now);
    const importance = clamp(input.importance?.(record) ?? .5);
    const active = input.active?.(record) === true;
    const score = clamp(affinity * .46 + overlap * .3 + freshness * .12 + importance * .08 + (active ? .16 : 0) - index * .002);
    const reasonCodes = [affinity >= .7 ? 'intent_match' : 'category_background', overlap >= .2 ? 'lexical_match' : '', freshness >= .8 ? 'recent' : '', importance >= .75 ? 'important' : '', active ? 'active' : ''].filter(Boolean);
    return { record, score, reasonCodes };
  }).sort((left, right) => right.score - left.score || String(input.id?.(left.record) ?? '').localeCompare(String(input.id?.(right.record) ?? ''))).slice(0, input.limit ?? records.length);
}

function prepareSection(section: ContextSectionInput, now: Date) {
  const variants = uniqueVariants(section.variants.filter((variant) => variant.content.trim().length > 0)).sort((left, right) => estimateContextTokens(right.content) - estimateContextTokens(left.content));
  return { ...section, required: section.required === true, protected: section.protected === true, relevance: clamp(section.relevance), freshness: freshnessScore(section.freshnessAt, now), reasonCodes: section.reasonCodes ?? [], variants };
}

function sectionScore(section: ReturnType<typeof prepareSection>): number {
  return (section.required ? 1_000 : 0) + section.priority * 10 + section.relevance * 100 + section.freshness * 12;
}

function freshnessScore(value: string | null | undefined, now: Date): number {
  if (!value) return .5;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return .35;
  const days = Math.max(0, now.getTime() - time) / 86_400_000;
  if (days <= 1) return 1;
  if (days <= 7) return .82;
  if (days <= 30) return .56;
  return .28;
}

function truncateTaggedSection(content: string, targetTokens: number): string {
  if (estimateContextTokens(content) <= targetTokens) return content;
  const firstClose = content.indexOf('>');
  const lastOpen = content.lastIndexOf('</');
  const opening = firstClose >= 0 ? content.slice(0, firstClose + 1) : '';
  const closing = lastOpen > firstClose ? content.slice(lastOpen) : '';
  const budgetChars = Math.max(40, Math.floor(targetTokens * 3.6) - opening.length - closing.length - 2);
  const bodyStart = firstClose >= 0 ? firstClose + 1 : 0;
  const bodyEnd = lastOpen > bodyStart ? lastOpen : content.length;
  const body = content.slice(bodyStart, bodyEnd).trim();
  return `${opening}${body.slice(0, budgetChars).trimEnd()}…${closing}`;
}

function selectedTokens(selected: Map<string, { tokens: number }>): number {
  let total = 0;
  selected.forEach((item) => { total += item.tokens; });
  return total;
}

function terms(value: string): Set<string> {
  return new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((term) => term.length > 2 && !stopWords.has(term)));
}

function lexicalOverlap(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let matches = 0;
  left.forEach((term) => { if (right.has(term)) matches += 1; });
  return matches / Math.max(1, Math.min(left.size, right.size));
}

function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))]; }
function uniqueVariants(values: ContextSectionVariant[]): ContextSectionVariant[] { const seen = new Set<string>(); return values.filter((value) => { if (seen.has(value.content)) return false; seen.add(value.content); return true; }); }
function clamp(value: number): number { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); }
function round(value: number): number { return Math.round(value * 1_000) / 1_000; }
