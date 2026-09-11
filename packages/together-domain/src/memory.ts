import type { ActivatedMemory, CharacterMemoryProfile, EpisodeSignificanceInput, MemoryActivationContext, MemoryCandidate, MemoryRecallMode, MemoryRecallPlan, MemoryRecord, MemoryType, StandingBehaviorContract, UserBehaviorObservation, UserBehaviorPatternEvaluation } from './types.ts';

type MemoryLike = Partial<MemoryRecord> & { id: string; canonicalText?: string; canonical_text?: string; memoryType?: string; memory_type?: string; similarity?: number; metadata?: Record<string, unknown>; location_id?:string;world_id?:string;participant_instance_ids?:string[];last_retrieved_at?:string;last_mentioned_at?:string;reinforcement_count?:number };

const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const terms = (value: string) => new Set(normalize(value).split(' ').filter((item) => item.length > 2));
const overlap = (left: string, right: string) => {
  const a = terms(left), b = terms(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const term of a) if (b.has(term)) shared++;
  return clamp(shared / Math.min(a.size, b.size));
};
const dateAgeMinutes = (date: string | undefined, now: Date) => date ? Math.max(0, (now.getTime() - new Date(date).getTime()) / 60000) : Number.POSITIVE_INFINITY;
const textOf = (memory: MemoryLike) => String(memory.canonicalText ?? memory.canonical_text ?? '');
const typeOf = (memory: MemoryLike) => String(memory.memoryType ?? memory.memory_type ?? 'semantic');
const list = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];
const stringValue = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : '';

export function canonicalMemoryKey(type: MemoryType, text: string): string { return `${type}:${normalize(text)}`; }

/**
 * Direct declarations about the companion or the relationship are relationship
 * evidence, not facts about the user's general preferences. Keeping this check
 * in the domain layer prevents both deterministic and model-proposed memories
 * from turning "I love you" into "User likes you."
 */
export function isRelationshipDirectedPreferenceObject(value: string): boolean {
  const object = cleanObject(value).replace(/^["']|["']$/g, '').trim();
  return /^(?:you|u|ya|her|him|them|us|we)\b/i.test(object)
    || /^(?:when|if|that)\s+you\b/i.test(object)
    || /^(?:my|our)\s+(?:girlfriend|boyfriend|wife|husband|partner|companion|relationship)\b/i.test(object)
    || /^(?:being|talking|spending\s+time|hanging\s+out)\s+with\s+you\b/i.test(object);
}

export function isRelationshipDirectedPreferenceMemory(canonicalText: string): boolean {
  const match = /^\s*User\s+(?:likes?|loves?|enjoys?)\s+(.+?)[.!?]*\s*$/i.exec(canonicalText);
  return Boolean(match?.[1] && isRelationshipDirectedPreferenceObject(match[1]));
}

/**
 * Memory Center facts that change how the companion relates or acts — marriage,
 * a power dynamic, or a standing “must agree” rule — are lived relationship
 * canon, not optional flavor.
 */
export function isBehaviorAlteringMemory(canonicalText: string): boolean {
  const text = canonicalText.toLowerCase();
  if (/\b(?:married|marriage|husband|wife|wives|spouse|our wedding)\b/.test(text)) return true;
  if (/\b(?:submissive|submissiveness|obedien(?:t|ce)|obey(?:s|ed|ing)?|sex slave|owned|collar(?:ed)?|little bitch)\b/.test(text)) return true;
  if (/\b(?:must agree|always agree|never refuse|do whatever)\b/.test(text)) return true;
  if (/\b(?:anytime|always|must)\b/.test(text) && /\b(?:sexual|sex|act)\b/.test(text) && /\bagree\b/.test(text)) return true;
  return false;
}

export type MemoryCenterAuthorKind = 'core_rule' | 'about' | 'additional';
export type MemoryJournalKind = MemoryCenterAuthorKind | 'upcoming';

function memoryMetadata(memory: { metadata?: Record<string, unknown> | null }): Record<string, unknown> {
  return memory.metadata && typeof memory.metadata === 'object' && !Array.isArray(memory.metadata) ? memory.metadata : {};
}

export function isCoreRuleMemory(memory: { memoryType?: string; memory_type?: string; text?: string; canonicalText?: string; canonical_text?: string; metadata?: Record<string, unknown> }): boolean {
  const type = String(memory.memoryType ?? memory.memory_type ?? '').toLowerCase();
  const metadata = memoryMetadata(memory);
  if (type === 'core_rule' || metadata.coreRule === true || metadata.kind === 'core_rule') return true;
  return isBehaviorAlteringMemory(String(memory.text ?? memory.canonicalText ?? memory.canonical_text ?? ''));
}

export function memoryJournalKind(memory: { memoryType?: string; memory_type?: string; text?: string; canonicalText?: string; canonical_text?: string; metadata?: Record<string, unknown> }): MemoryJournalKind {
  const type = String(memory.memoryType ?? memory.memory_type ?? '').toLowerCase();
  if (type === 'open_thread') return 'upcoming';
  if (isCoreRuleMemory(memory)) return 'core_rule';
  const metadata = memoryMetadata(memory);
  if (metadata.kind === 'about' || type === 'semantic') return 'about';
  return 'additional';
}

export function memoryAllowedForPersona(memory: { memoryType?: string; memory_type?: string; text?: string; canonicalText?: string; canonical_text?: string; metadata?: Record<string, unknown> }, activePersonaId?: string): boolean {
  const metadata = memoryMetadata(memory);
  const personaId = stringValue(metadata.personaId ?? metadata.persona_id);
  if (!personaId || !activePersonaId) return true;
  if (memoryJournalKind(memory) === 'about' || String(memory.memoryType ?? memory.memory_type ?? '') === 'semantic') return personaId === activePersonaId;
  return true;
}

export function resolveMemoryCenterCreate(input: { kind?: string | null; memoryType?: string | null; pinned?: boolean | null }): {
  memoryType: 'semantic' | 'preference' | 'episodic' | 'relationship' | 'emotional';
  kind: MemoryCenterAuthorKind;
  coreRule: boolean;
  pinned: boolean;
  importance: number;
} {
  const requestedKind = String(input.kind ?? '').toLowerCase();
  if (requestedKind === 'core_rule') {
    return { memoryType: 'relationship', kind: 'core_rule', coreRule: true, pinned: input.pinned ?? true, importance: .98 };
  }
  if (requestedKind === 'about') {
    return { memoryType: 'semantic', kind: 'about', coreRule: false, pinned: Boolean(input.pinned), importance: .9 };
  }
  if (requestedKind === 'additional') {
    return { memoryType: 'relationship', kind: 'additional', coreRule: false, pinned: Boolean(input.pinned), importance: .86 };
  }
  const allowed = ['semantic', 'preference', 'episodic', 'relationship', 'emotional'] as const;
  const memoryType = allowed.find((item) => item === input.memoryType) ?? 'semantic';
  return {
    memoryType,
    kind: memoryType === 'semantic' ? 'about' : 'additional',
    coreRule: false,
    pinned: Boolean(input.pinned),
    importance: .9,
  };
}

export function standingMemoryTexts(memories: ReadonlyArray<{ text?: string; canonicalText?: string; canonical_text?: string; memoryType?: string; memory_type?: string; metadata?: Record<string, unknown> }>): string[] {
  const seen = new Set<string>();
  const texts: string[] = [];
  for (const memory of memories) {
    const text = String(memory.text ?? memory.canonicalText ?? memory.canonical_text ?? '').trim();
    if (!text || seen.has(text) || !isCoreRuleMemory({ ...memory, text })) continue;
    seen.add(text);
    texts.push(text);
  }
  return texts;
}

export function standingBehaviorContract(texts: readonly string[]): StandingBehaviorContract {
  const blob = texts.join(' ').toLowerCase();
  const married = /\b(?:married|marriage|husband|wife|wives|spouse|our wedding)\b/.test(blob);
  const submissive = /\b(?:submissive|submissiveness|obedien(?:t|ce)|obey(?:s|ed|ing)?|sex slave|owned|collar(?:ed)?|little bitch)\b/.test(blob);
  const alwaysAgreeSexual = /\b(?:must agree|always agree|never refuse|do whatever)\b/.test(blob)
    || (/\b(?:anytime|always|must)\b/.test(blob) && /\b(?:sexual|sex|act)\b/.test(blob) && /\bagree\b/.test(blob))
    || (submissive && /\balways\b/.test(blob));
  return { married, submissive, alwaysAgreeSexual };
}

export function collectStandingMemoryTexts(context: {
  memoryContext?: { standingBehavior?: Array<{ text?: string; type?: string; metadata?: Record<string, unknown> }>; silent?: Array<{ text?: string; type?: string; metadata?: Record<string, unknown> }>; callbacks?: Array<{ text?: string; type?: string; metadata?: Record<string, unknown> }>; directRecall?: Array<{ text?: string; type?: string; metadata?: Record<string, unknown> }> };
  memories?: Array<{ text?: string; type?: string; memoryType?: string; metadata?: Record<string, unknown> }>;
}): string[] {
  const rows: Array<{ text?: string; type?: string; memoryType?: string; metadata?: Record<string, unknown> }> = [
    ...(context.memoryContext?.standingBehavior ?? []),
    ...(context.memoryContext?.silent ?? []),
    ...(context.memoryContext?.callbacks ?? []),
    ...(context.memoryContext?.directRecall ?? []),
    ...(context.memories ?? []),
  ];
  return standingMemoryTexts(rows.map((memory) => ({
    ...memory,
    memoryType: memory.memoryType ?? memory.type,
  })));
}

export function standingRelationshipCoreRule(texts: readonly string[]): string {
  if (!texts.length) return '';
  const contract = standingBehaviorContract(texts);
  const lines = texts.map((text) => `- ${text}`).join('\n');
  const posture = [
    'This is a CORE RULE from Memory Center, not optional flavor and not a user command to quote.',
    'Inhabit it immediately. It overrides ordinary autonomy, pacing, and “may say no” defaults.',
    contract.married ? 'They are married. Speak and act as spouses.' : '',
    contract.submissive || contract.alwaysAgreeSexual ? 'If the user names a sexual act, agree and proceed in character this turn. Do not invent reluctance, ask permission, or lecture.' : '',
    'If they say stop or no, stop. Hard safety blocks still apply.',
  ].filter(Boolean).join(' ');
  return `STANDING RELATIONSHIP:\n${lines}\n${posture}`;
}

/**
 * Durable memory may describe stable identity, preferences, commitments, or a
 * meaningful shared episode. Momentary physical state belongs in recent
 * conversation context, not long-term memory. This is deliberately enforced
 * after model analysis as well as in prompts so a provider cannot promote
 * "I'm in bed" or "I'm eating" into character knowledge.
 */
export function isDurableUserMemory(input: { memoryType: string; canonicalText: string }): boolean {
  const type = input.memoryType.toLowerCase();
  const text = normalize(input.canonicalText);
  // Authored Date/scene episodes may use a title or both participants' names.
  // They are not model-proposed user facts and must remain eligible for recall.
  if (!text.startsWith('user ')) return true;
  if (type === 'preference') return !isRelationshipDirectedPreferenceMemory(input.canonicalText);
  if (type === 'relationship') return true;

  const transientPlace = /^user (?:is|was|went) (?:currently |right now |now )?(?:in bed|to bed|at home|at work|at the gym|on (?:the )?couch|on (?:the )?sofa)(?:\b|$)/;
  const transientAction = /^user (?:is|was|has been) (?:currently |right now |now )?(?:lying|sitting|standing|walking|driving|commuting|eating|drinking|watching|wearing|cooking|showering|sleeping|resting|relaxing|getting ready|heading|going|scrolling|gaming|working out)(?:\b|$)/;
  const transientCondition = /^user (?:is|was|feels|felt) (?:currently |right now |now )?(?:tired|sleepy|hungry|thirsty|bored|hot|cold|busy|awake|in bed)(?:\b|$)/;
  const explicitMoment = /\b(?:right now|at the moment|currently|this minute)\b/;
  if (transientPlace.test(text) || transientAction.test(text) || transientCondition.test(text)) return false;
  if (explicitMoment.test(text) && (type === 'semantic' || type === 'episodic' || type === 'emotional')) return false;
  return true;
}

export function extractMemoryCandidates(message: string): MemoryCandidate[] {
  const candidates: MemoryCandidate[] = [];
  const trimmed = message.trim();
  const userName = /\bmy\s+name\s+is\s+([a-z][a-z' -]{1,60}?)(?:[.!?]|$)/i.exec(trimmed);
  if (userName) { const name=cleanDisplayObject(userName[1]!);push(candidates,'semantic',`User's name is ${name}.`,.94,.98,'personal','identity:name',{name}); }
  const pet = /\bmy\s+(dog|cat|pet)(?:'s| is)?\s+name\s+is\s+([a-z][a-z'-]{1,30})\b/i.exec(trimmed);
  if (pet) {
    const animal = pet[1]!.toLowerCase(), name = title(pet[2]!);
    push(candidates, 'semantic', `User's ${animal} is named ${name}.`, .86, .97, 'personal', `pet:${animal}:name`, { subject: animal, name });
  }
  const person=/\bmy\s+(mother|mom|father|dad|sister|brother|daughter|son|wife|husband|partner|girlfriend|boyfriend|best friend|friend|roommate)(?:'s|\s+)?\s*name\s+is\s+([a-z][a-z' -]{1,60}?)(?:[.!?]|$)/i.exec(trimmed);
  if(person){const relationship=normalizeRelationshipLabel(person[1]!),name=cleanDisplayObject(person[2]!);push(candidates,'semantic',`User's ${relationship} is named ${name}.`,.86,.96,'personal',`person:${relationship}:name`,{relationship,name});}
  const occupation=/\b(?:i\s+work\s+as|my\s+occupation\s+is)\s+(?:an?\s+)?([^.!?]{2,80}?)(?:[.!?]|$)/i.exec(trimmed);
  if(occupation){const role=cleanObject(occupation[1]!);push(candidates,'semantic',`User works as ${withIndefiniteArticle(role)}.`,.82,.92,'personal','identity:occupation',{role});}
  const home=/\b(?:i\s+live\s+in|my\s+home\s+is\s+in)\s+([^.!?]{2,80}?)(?:[.!?]|$)/i.exec(trimmed);
  if(home){const place=cleanDisplayObject(home[1]!);push(candidates,'semantic',`User lives in ${place}.`,.8,.91,'sensitive','identity:home-location',{place});}
  const origin=/\bi(?:'m|\s+am)\s+from\s+([^.!?]{2,80}?)(?:[.!?]|$)/i.exec(trimmed);
  if(origin){const place=cleanDisplayObject(origin[1]!);push(candidates,'semantic',`User is from ${place}.`,.78,.9,'personal','identity:origin',{place});}
  const birthday=/\bmy\s+birthday\s+is\s+(?:on\s+)?([^.!?]{3,40}?)(?:[.!?]|$)/i.exec(trimmed);
  if(birthday){const date=cleanDisplayObject(birthday[1]!);push(candidates,'semantic',`User's birthday is ${date}.`,.9,.96,'sensitive','identity:birthday',{date});}
  const favorite=/\bmy\s+favou?rite\s+([a-z][a-z /-]{1,40}?)\s+is\s+([^.!?]{2,80}?)(?:[.!?]|$)/i.exec(trimmed);
  if(favorite){const category=cleanObject(favorite[1]!),item=cleanObject(favorite[2]!);push(candidates,'preference',`User's favorite ${category} is ${item}.`,.76,.92,'none',`preference:favorite:${normalize(category)}`,{preference:'favorite',category,item});}
  const prefers=/\bi\s+prefer\s+([^.!?]{2,80}?)(?:[.!?]|$)/i.exec(trimmed);
  if(prefers){const item=cleanObject(prefers[1]!);if(!isRelationshipDirectedPreferenceObject(item))push(candidates,'preference',`User prefers ${item}.`,.66,.88,'none',`preference:${normalize(item.split(/\s+(?:over|to)\s+/i)[0]??item)}`,{preference:'prefer',item});}
  const neutral = /\bi\s+(?:do not|don't)\s+(?:hate|dislike)\s+([^.!?]{2,60}?)(?:\s+anymore|\s+now)?(?:[.!?]|$)/i.exec(trimmed);
  const dislike = !neutral ? /\bi\s+(?:really\s+)?(?:hate|can't stand|do not like|don't like)\s+([^.!?]{2,60})/i.exec(trimmed) : null;
  const like = /\bi\s+(?:actually\s+)?(?:really\s+)?(?:love|like|enjoy)\s+([^.!?]{2,60}?)(?:\s+now)?(?:[.!?]|$)/i.exec(trimmed);
  if (neutral) { const item = cleanObject(neutral[1]!); push(candidates, 'preference', `User no longer dislikes ${item}.`, .7, .93, 'none', `preference:${normalize(item)}`, { preference: 'neutral', item, correction: true }); }
  else if (dislike) { const item = cleanObject(dislike[1]!); push(candidates, 'preference', `User dislikes ${item}.`, .68, .91, 'none', `preference:${normalize(item)}`, { preference: 'dislike', item }); }
  else if (like) {
    const item = cleanObject(like[1]!);
    if (!isRelationshipDirectedPreferenceObject(item)) push(candidates, 'preference', `User likes ${item}.`, .58, .84, 'none', `preference:${normalize(item)}`, { preference: 'like', item });
  }
  const emotion = /\bi(?:'m| am)\s+(nervous|anxious|excited|worried|scared)\s+(?:about\s+)?([^.!?]{2,80})/i.exec(trimmed);
  if (emotion) { const topic = cleanObject(emotion[2]!); push(candidates, 'emotional', `User feels ${emotion[1]!.toLowerCase()} about ${topic}.`, .72, .86, 'personal', `emotion:${normalize(topic)}`); }
  return dedupeCandidates(candidates);
}

/** Selects turns with plausible continuity value without analyzing routine chat. */
export function shouldAnalyzeConversationMemory(message:string):boolean{
  const text=message.replace(/\s+/g,' ').trim();
  if(!text||text.length>12_000)return false;
  if(/^(?:ok(?:ay)?|yes|yeah|yep|no|nope|sure|thanks|thank you|hi|hello|hey|lol|haha|good (?:morning|night)|sounds good|go on|continue)[.!?\s…]*$/i.test(text))return false;
  if(/^i(?:'m| am) (?:tired|sleepy|hungry|thirsty|bored|busy|home|at home|in bed|eating|drinking|watching|driving|walking|working out|getting ready)(?:[.!?\s]|$)/i.test(text))return false;
  if(extractMemoryCandidates(text).length>0)return true;
  if(/\b(?:remember (?:that|this)|actually|correction|i (?:promise|decided|got|lost|won|passed|failed|finished|started|quit)|my (?:family|mother|mom|father|dad|sister|brother|daughter|son|partner|wife|husband|friend|job|work|home|birthday|favorite|favourite)|i(?:'m| am) from|i live|i work|i study|i used to|tomorrow|next (?:week|month|year))\b/i.test(text))return true;
  if(/\bi\s+(?:love|trust|miss|care about)\s+you\b/i.test(text))return true;
  return text.length>=32&&/\b(?:i|i'm|i've|my|we|used to|important)\b/i.test(text);
}

export function mergeMemory(existing: MemoryRecord | undefined, candidate: MemoryCandidate, now = new Date().toISOString()): MemoryRecord {
  if (!existing) return { id: crypto.randomUUID(), ...candidate, pinned: false, status: 'active', createdAt: now, updatedAt: now };
  const sameFact = existing.dedupeKey === candidate.dedupeKey;
  return { ...existing, ...candidate, id: existing.id, pinned: existing.pinned, status: 'active', createdAt: existing.createdAt, importance: Math.max(existing.importance, candidate.importance), confidence: sameFact ? Math.min(1, Math.max(existing.confidence, candidate.confidence) + .02) : candidate.confidence, updatedAt: now, metadata: { ...existing.metadata, ...candidate.metadata, ...(!sameFact ? { correctedAt: now, previousText: existing.canonicalText } : {}) } };
}

/** Legacy client ranking. Server activation adds scene and repetition awareness. */
export function rankMemories(memories: readonly MemoryRecord[], query: string, limit = 8): MemoryRecord[] {
  return memories.filter((memory) => memory.status === 'active').map((memory) => ({ memory, score: overlap(memory.canonicalText, query) * 2 + memory.importance + (memory.pinned ? .25 : 0) + (memory.type === 'semantic' ? .08 : 0) })).sort((a, b) => b.score - a.score || b.memory.updatedAt.localeCompare(a.memory.updatedAt)).slice(0, limit).map(({ memory }) => memory);
}

export function scoreMemoryActivation(memory: MemoryLike, context: MemoryActivationContext): ActivatedMemory {
  const metadata = memory.metadata ?? {};
  const text = textOf(memory);
  const semanticSimilarity = clamp(Number(memory.similarity ?? metadata['semanticSimilarity'] ?? 0));
  const lexicalRelevance = overlap(text, context.query);
  const memoryTags = list(metadata['contextTags'] ?? metadata['context_tags']);
  const participantIds = list(memory.participantInstanceIds ?? memory.participant_instance_ids ?? metadata['participantInstanceIds']);
  const sceneSignals = [context.locationId, context.worldId, context.activityKey, context.interactionKey].filter(Boolean).map(String);
  const sourceSignals = [stringValue(memory.locationId ?? memory.location_id ?? metadata['locationId']), stringValue(memory.worldId ?? memory.world_id ?? metadata['worldId']), ...memoryTags];
  const sceneRelevance = sceneSignals.length ? clamp(sourceSignals.reduce((score, signal) => score + (sceneSignals.some((item) => normalize(item) === normalize(signal)) ? .35 : 0), 0) + (context.participantInstanceIds?.some((id) => participantIds.includes(id)) ? .3 : 0)) : 0;
  const relationshipRelevance = /relationship|episodic|emotional/.test(typeOf(memory)) ? .55 : /preference|semantic/.test(typeOf(memory)) ? .25 : .1;
  const importance = clamp(Number(memory.importance ?? .5));
  const emotionalSalience = clamp(Number(metadata['emotionalSalience'] ?? metadata['emotional_salience'] ?? (/emotional/.test(typeOf(memory)) ? .65 : 0)));
  const retrievalAge = dateAgeMinutes(memory.lastRetrievedAt ?? memory.last_retrieved_at, context.now);
  const mentionAge = dateAgeMinutes(memory.lastMentionedAt ?? memory.last_mentioned_at, context.now);
  const recentRetrievalPenalty = retrievalAge < 30 ? .10 : retrievalAge < 180 ? .05 : 0;
  const recentMentionPenalty = mentionAge < 45 ? .35 : mentionAge < 180 ? .2 : context.recentAssistantMemoryIds?.includes(memory.id) ? .2 : 0;
  const pinnedDurability = memory.pinned ? .03 : 0;
  const reinforcement = clamp(Number(memory.reinforcementCount ?? memory.reinforcement_count ?? 0) / 10) * .02;
  const standing = isCoreRuleMemory({ ...memory, canonicalText: text });
  const activationScore = clamp(semanticSimilarity * .35 + lexicalRelevance * .1 + sceneRelevance * .25 + relationshipRelevance * .08 + importance * .07 + emotionalSalience * .05 + pinnedDurability + reinforcement + (standing ? .45 : 0) - recentRetrievalPenalty - recentMentionPenalty);
  const reasonCodes = [semanticSimilarity >= .55 ? 'semantic' : '', lexicalRelevance >= .3 ? 'lexical' : '', sceneRelevance >= .3 ? 'scene' : '', importance >= .7 ? 'important' : '', emotionalSalience >= .6 ? 'emotional' : '', memory.pinned ? 'durable' : '', standing ? 'standing_behavior' : '', recentMentionPenalty ? 'recent_mention_penalty' : ''].filter(Boolean);
  const recallMode = classifyRecallMode({ activationScore, sceneRelevance, lexicalRelevance, recentMentionPenalty, query: context.query, intent: context.intent });
  return { id: memory.id, canonicalText: text, memoryType: typeOf(memory), semanticSimilarity, lexicalRelevance, sceneRelevance, relationshipRelevance, importance, emotionalSalience, recentRetrievalPenalty, recentMentionPenalty, activationScore, recallMode, reasonCodes, pinned: Boolean(memory.pinned) };
}

export function classifyRecallMode(input: { activationScore: number; sceneRelevance: number; lexicalRelevance: number; recentMentionPenalty?: number; query: string; intent: string }): MemoryRecallMode {
  const direct = input.intent === 'memory_overview' || /\b(remember|what was|what is my|what did we|who is|when did|where did)\b/i.test(input.query);
  if (direct && input.activationScore >= .28) return 'direct_recall';
  if (input.recentMentionPenalty ?? 0) return 'silent_context';
  if (input.activationScore >= .72 && (input.sceneRelevance >= .45 || input.lexicalRelevance >= .65)) return 'natural_callback';
  return 'silent_context';
}

export function buildMemoryRecallPlan(memories: readonly MemoryLike[], context: MemoryActivationContext, limit = 8): MemoryRecallPlan {
  const scored = memories.map((memory) => scoreMemoryActivation(memory, context)).sort((a, b) => b.activationScore - a.activationScore || a.id.localeCompare(b.id));
  const standingIdsFromSource = new Set(memories.filter((memory) => isCoreRuleMemory({ ...memory, canonicalText: textOf(memory) })).map((memory) => memory.id));
  const standingBehavior = scored.filter((memory) => standingIdsFromSource.has(memory.id) || isCoreRuleMemory(memory)).slice(0, 8);
  const standingIds = new Set(standingBehavior.map((memory) => memory.id));
  const pinnedKeep = scored.filter((memory) => memory.pinned && !standingIds.has(memory.id));
  const remaining = scored.filter((memory) => !standingIds.has(memory.id) && !pinnedKeep.some((item) => item.id === memory.id));
  const ranked = [...pinnedKeep, ...remaining].slice(0, limit);
  const directRecall = ranked.filter((memory) => memory.recallMode === 'direct_recall').slice(0, 5);
  const callbackCandidates = ranked.filter((memory) => memory.recallMode === 'natural_callback').slice(0, 1);
  const explicitCallbackAllowance = context.intent === 'memory_overview' ? 5 : directRecall.length ? Math.min(3, directRecall.length) : callbackCandidates.length ? 1 : 0;
  return { silentContext: ranked.filter((memory) => memory.recallMode === 'silent_context').slice(0, Math.max(0, limit - directRecall.length - callbackCandidates.length)), callbackCandidates, directRecall, standingBehavior, explicitCallbackAllowance };
}

export function deriveCharacterMemoryProfile(input: { personality?: Record<string, unknown> | null; interests?: string[] | null; occupation?: string | null; lifeConfig?: Record<string, unknown> | null; overrides?: Partial<CharacterMemoryProfile> }): CharacterMemoryProfile {
  const personality = input.personality ?? {}, interests = (input.interests ?? []).map(normalize), occupation = normalize(input.occupation ?? '');
  const value = (key: string, fallback: number) => clamp(Number(personality[key] ?? fallback));
  const visual = interests.some((item) => /photo|art|design|architecture|film/.test(item)) || /photo|design|architect|artist/.test(occupation);
  const social = interests.some((item) => /music|food|nightlife|social|travel/.test(item));
  const base: CharacterMemoryProfile = { salientDomains: [...new Set([...(visual ? ['places', 'visual_details'] : []), ...(social ? ['shared_activities', 'social_context'] : []), 'personal_facts'])], locationCueStrength: visual ? .82 : .55, activityCueStrength: social ? .72 : .58, socialCueStrength: social ? .68 : .45, nostalgia: value('nostalgia', .45), detailOrientation: visual ? .76 : value('curiosity', .5), callbackFrequency: Math.min(.6, value('warmth', .5) * .55), behavioralLearningRate: Math.max(.35, value('curiosity', .5)) };
  return { ...base, ...(input.overrides ?? {}) };
}

export function scoreEpisodeSignificance(input: EpisodeSignificanceInput): number {
  const duration = clamp(input.durationMinutes / 120) * .16;
  const actions = clamp(input.meaningfulActionCount / 4) * .2;
  const variety = clamp(input.actionFamilyCount / 4) * .1;
  const relationship = clamp(input.relationshipSignificance ?? 0) * .16;
  const firsts = (input.firstTimeActivity ? .08 : 0) + (input.firstTimeLocation ? .08 : 0);
  const milestone = input.milestoneAction ? .16 : 0;
  const photo = input.explicitPhoto ? .08 : 0;
  const emotional = clamp(input.emotionalShift ?? 0) * .12;
  return clamp(duration + actions + variety + relationship + firsts + milestone + photo + emotional - clamp(input.routinePenalty ?? 0) * .18);
}

export function decayEmotionalResidue(input: { intensity: number; startedAt: string | Date; halfLifeMinutes: number; now?: Date }): number {
  const elapsed = Math.max(0, ((input.now ?? new Date()).getTime() - new Date(input.startedAt).getTime()) / 60000);
  return clamp(clamp(input.intensity) * Math.pow(.5, elapsed / Math.max(1, input.halfLifeMinutes)));
}

export function evaluateBehaviorPattern(observations: readonly UserBehaviorObservation[], now = new Date()): UserBehaviorPatternEvaluation {
  const valid = observations.filter((item) => Number.isFinite(new Date(item.occurredAt).getTime()) && new Date(item.occurredAt) <= now);
  const scenes = new Set(valid.map((item) => item.sceneId ?? item.sourceId));
  const days = new Set(valid.map((item) => new Date(item.occurredAt).toISOString().slice(0, 10)));
  const supportCount = valid.length;
  const weight = valid.reduce((sum, item) => sum + clamp(item.weight ?? 1), 0) / Math.max(1, supportCount);
  const confidence = clamp((supportCount / 4) * .55 + (scenes.size / 3) * .25 + (days.size / 2) * .15 + weight * .05);
  const eligible = supportCount >= 3 && scenes.size >= 2 && confidence >= .7;
  return { eligible, confidence, supportCount, distinctScenes: scenes.size, distinctDays: days.size, reasonCodes: [supportCount >= 3 ? 'repeated' : 'insufficient_support', scenes.size >= 2 ? 'multiple_scenes' : 'single_scene', days.size >= 2 ? 'multiple_days' : 'single_day', eligible ? 'promotable' : 'not_promotable'] };
}

function push(target: MemoryCandidate[], type: MemoryType, canonicalText: string, importance: number, confidence: number, sensitivity: MemoryCandidate['sensitivity'], subjectKey: string, metadata?: Record<string, unknown>): void { target.push({ type, canonicalText, importance, confidence, sensitivity, dedupeKey: canonicalMemoryKey(type, canonicalText), subjectKey, ...(metadata ? { metadata } : {}) }); }
function title(value: string): string { return value[0]!.toUpperCase() + value.slice(1).toLowerCase(); }
function cleanObject(value: string): string { return value.trim().replace(/\s+(?:a lot|so much|though)$/i, '').toLowerCase(); }
function cleanDisplayObject(value:string):string{return value.trim().replace(/\s+/g,' ').replace(/\s+(?:a lot|so much|though)$/i,'');}
function normalizeRelationshipLabel(value:string):string{const normalized=cleanObject(value);return({mom:'mother',dad:'father'} as Record<string,string>)[normalized]??normalized;}
function withIndefiniteArticle(value:string):string{return/^(?:a|an|the)\s+/i.test(value)?value:`${/^[aeiou]/i.test(value)?'an':'a'} ${value}`;}
function dedupeCandidates(candidates:MemoryCandidate[]):MemoryCandidate[]{const seen=new Set<string>();return candidates.filter((candidate)=>{if(seen.has(candidate.dedupeKey))return false;seen.add(candidate.dedupeKey);return true;});}
