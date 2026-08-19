import { classifyConversationQuery } from './conversation.ts';
import { summarizeConversation } from './continuity.ts';

export type RollingConversationTurn = { id?: string; role: string; content: string; createdAt?: string; created_at?: string };

export type RollingConversationState = {
  version: 2;
  currentTopic: string | null;
  userIntent: string | null;
  companionStance: string | null;
  emotionalArc: { user: string[]; companion: string[]; trajectory: string | null };
  decisions: string[];
  unresolvedPoints: string[];
  importantWording: Array<{ speaker: 'user' | 'companion'; text: string }>;
  recentContext: string;
  sharedJokesOrReferences: string[];
  storyReferences: string[];
  updatedThroughMessageId: string | undefined;
  updatedAt: string | undefined;
};

type LegacyConversationState = {
  version?: 1;
  topics?: string[];
  recentContext?: string;
  emotionalContext?: string;
  unresolvedConversationPoints?: string[];
  sharedJokesOrReferences?: string[];
  storyReferences?: string[];
  updatedThroughMessageId?: string;
};

const emotionGroups: Array<[string, RegExp]> = [
  ['stressed', /\b(stressed|overwhelmed|exhausted|drained|rough|awful)\b/i],
  ['worried', /\b(worried|nervous|anxious|afraid|scared)\b/i],
  ['hurt', /\b(hurt|betrayed|rejected|heartbroken|upset)\b/i],
  ['angry', /\b(angry|furious|annoyed|frustrated)\b/i],
  ['sad', /\b(sad|down|lonely|miserable)\b/i],
  ['hopeful', /\b(hopeful|optimistic|better|relieved)\b/i],
  ['happy', /\b(happy|glad|great|wonderful|proud)\b/i],
  ['excited', /\b(excited|thrilled|can't wait|looking forward)\b/i],
  ['affectionate', /\b(love you|miss you|care about you|close to you)\b/i],
  ['playful', /\b(lol|haha|teasing|kidding|funny)\b/i],
];

export function mergeRollingConversationState(previousValue: string, turns: readonly RollingConversationTurn[], now = new Date()): string {
  const previous = parseRollingConversationState(previousValue);
  const meaningful = turns.map(normalizeTurn).filter((turn) => turn.content.length > 0);
  if (!meaningful.length) return JSON.stringify(previous);
  const userTurns = meaningful.filter((turn) => turn.role === 'user');
  const assistantTurns = meaningful.filter((turn) => turn.role === 'assistant');
  const latestUser = userTurns.at(-1)?.content ?? '';
  const latestAssistant = assistantTurns.at(-1)?.content ?? '';
  const userEmotions = unique([...previous.emotionalArc.user, ...detectEmotions(userTurns.map((turn) => turn.content))]).slice(-4);
  const companionEmotions = unique([...previous.emotionalArc.companion, ...detectEmotions(assistantTurns.map((turn) => turn.content))]).slice(-4);
  const newDecisions = meaningful.flatMap((turn) => extractSentences(turn.content, /\b(let'?s|we(?:'|’)ll|we will|i(?:'|’)ll|i will|decided|agreed|it(?:'|’)s a plan|meet at|see you at|cancel(?:led)?|reschedul(?:e|ed))\b/i));
  const newUnresolved = meaningful.flatMap((turn) => extractSentences(turn.content, /\b(not sure|don(?:'|’)t know|need to decide|figure (?:it|that) out|tell you later|talk about (?:it|that) later|unfinished|still need to)\b/i));
  const lastTurn = meaningful.at(-1);
  if (lastTurn?.role === 'user' && /\?\s*$/.test(lastTurn.content)) newUnresolved.push(lastTurn.content);
  const importantWording = meaningful.flatMap((turn) => importantPhrases(turn)).slice(-5);
  const recent = summarizeConversation(meaningful.map((turn) => ({ role: turn.role === 'assistant' ? 'assistant' : 'user', content: turn.content })), 900);
  const state: RollingConversationState = {
    version: 2,
    currentTopic: topicFrom(latestUser) ?? previous.currentTopic,
    userIntent: latestUser ? describeUserIntent(latestUser) : previous.userIntent,
    companionStance: latestAssistant ? compact(latestAssistant, 240) : previous.companionStance,
    emotionalArc: { user: userEmotions, companion: companionEmotions, trajectory: emotionalTrajectory(userEmotions) },
    decisions: unique([...previous.decisions, ...newDecisions].map((item) => compact(item, 180))).slice(-5),
    unresolvedPoints: reconcileUnresolved(previous.unresolvedPoints, newUnresolved, meaningful).slice(-5),
    importantWording: uniqueWording([...previous.importantWording, ...importantWording]).slice(-5),
    recentContext: [previous.recentContext.slice(-650), recent].filter(Boolean).join('\n').slice(-1_400),
    sharedJokesOrReferences: unique([...previous.sharedJokesOrReferences, ...meaningful.filter((turn) => /\b(lol|haha|inside joke|remember when|teas(?:e|ing))\b/i.test(turn.content)).map((turn) => compact(turn.content, 160))]).slice(-4),
    storyReferences: previous.storyReferences.slice(-4),
    updatedThroughMessageId: meaningful.at(-1)?.id ?? previous.updatedThroughMessageId,
    updatedAt: meaningful.at(-1)?.createdAt ?? now.toISOString(),
  };
  return JSON.stringify(state);
}

export function parseRollingConversationState(value: unknown): RollingConversationState {
  if (!value || typeof value !== 'string') return emptyState();
  let parsed: LegacyConversationState | Partial<RollingConversationState>;
  try { parsed = JSON.parse(value) as LegacyConversationState | Partial<RollingConversationState>; }
  catch { return { ...emptyState(), recentContext: compact(value, 1_400) }; }
  if (parsed.version === 2) {
    const state = parsed;
    return {
      ...emptyState(), ...state,
      currentTopic: stringOrNull(state.currentTopic), userIntent: stringOrNull(state.userIntent), companionStance: stringOrNull(state.companionStance),
      emotionalArc: { user: strings(state.emotionalArc?.user).slice(-4), companion: strings(state.emotionalArc?.companion).slice(-4), trajectory: stringOrNull(state.emotionalArc?.trajectory) },
      decisions: strings(state.decisions).slice(-5), unresolvedPoints: strings(state.unresolvedPoints).slice(-5),
      importantWording: Array.isArray(state.importantWording) ? state.importantWording.filter((item): item is {speaker:'user'|'companion';text:string} => Boolean(item) && (item.speaker === 'user' || item.speaker === 'companion') && typeof item.text === 'string').slice(-5) : [],
      recentContext: typeof state.recentContext === 'string' ? state.recentContext.slice(-1_400) : '', sharedJokesOrReferences: strings(state.sharedJokesOrReferences).slice(-4), storyReferences: strings(state.storyReferences).slice(-4),
    };
  }
  const legacy = parsed as LegacyConversationState;
  return {
    ...emptyState(), currentTopic: strings(legacy.topics).at(-1) ?? null, recentContext: String(legacy.recentContext ?? '').slice(-1_400),
    emotionalArc: { user: legacy.emotionalContext ? detectEmotions([legacy.emotionalContext]) : [], companion: [], trajectory: legacy.emotionalContext ? compact(legacy.emotionalContext, 180) : null },
    unresolvedPoints: strings(legacy.unresolvedConversationPoints).slice(-5), sharedJokesOrReferences: strings(legacy.sharedJokesOrReferences).slice(-4), storyReferences: strings(legacy.storyReferences).slice(-4), updatedThroughMessageId: legacy.updatedThroughMessageId,
  };
}

export function formatRollingConversationState(value: unknown): string {
  const state = parseRollingConversationState(value);
  if (!state.currentTopic && !state.recentContext && !state.decisions.length && !state.unresolvedPoints.length) return 'None.';
  return [
    `Current topic: ${state.currentTopic ?? 'No durable topic.'}`,
    `User intent: ${state.userIntent ?? 'No durable intent.'}`,
    `Companion stance: ${state.companionStance ?? 'No durable stance.'}`,
    `Emotional arc: ${state.emotionalArc.trajectory ?? 'No strong emotional movement.'}`,
    `Decisions: ${state.decisions.join(' | ') || 'None.'}`,
    `Unresolved points: ${state.unresolvedPoints.join(' | ') || 'None.'}`,
    `Important wording: ${state.importantWording.map((item) => `${item.speaker}: “${item.text}”`).join(' | ') || 'None.'}`,
    `Recent compressed context: ${state.recentContext || 'None.'}`,
  ].join('\n');
}

function emptyState(): RollingConversationState { return { version: 2, currentTopic: null, userIntent: null, companionStance: null, emotionalArc: { user: [], companion: [], trajectory: null }, decisions: [], unresolvedPoints: [], importantWording: [], recentContext: '', sharedJokesOrReferences: [], storyReferences: [], updatedThroughMessageId: undefined, updatedAt: undefined }; }
function normalizeTurn(turn: RollingConversationTurn) { return { id: turn.id, role: turn.role, content: compact(turn.content, 600), createdAt: turn.createdAt ?? turn.created_at }; }
function detectEmotions(values: string[]): string[] { return unique(values.flatMap((value) => emotionGroups.filter(([, pattern]) => pattern.test(value)).map(([emotion]) => emotion))); }
function emotionalTrajectory(emotions: string[]): string | null { if (!emotions.length) return null; return emotions.length === 1 ? `User is expressing ${emotions[0]}.` : `User moved from ${emotions[0]} toward ${emotions.at(-1)}.`; }
function topicFrom(value: string): string | null { const sentences=value.split(/[.!?]/).map((item)=>item.trim()).filter(Boolean);const cleaned=sentences.find((item)=>!/^(?:hey|hi|okay|ok|so|well|thanks?|thank you)$/i.test(item))??sentences[0]; return cleaned && cleaned.length > 2 ? compact(cleaned, 140) : null; }
function describeUserIntent(value: string): string { const query = classifyConversationQuery(value); if (query !== 'general') return `Reopening ${query.replace('_', ' ')} context.`; if (/\b(sorry|apolog|forgive|made you feel)\b/i.test(value)) return 'Trying to repair tension.'; if (/\b(i feel|today was|rough|awful|scared|worried|overwhelmed)\b/i.test(value)) return 'Sharing emotion and seeking an authentic response.'; if (/\b(lol|haha|kidding|teas)\b/i.test(value)) return 'Playful connection.'; if (/\?$/.test(value.trim())) return 'Asking for the companion’s answer or point of view.'; return 'Sharing an update or continuing the current topic.'; }
function extractSentences(value: string, pattern: RegExp): string[] { return value.split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter((item) => pattern.test(item)); }
function importantPhrases(turn: ReturnType<typeof normalizeTurn>): Array<{ speaker: 'user' | 'companion'; text: string }> { const pattern = turn.role === 'user' ? /\b(i (?:love|hate|want|need|feel|wish|promise|remember)|i(?:'|’)m (?:not|really|actually)|never|always)\b/i : /\b(i (?:want|care|feel|promise|will|won(?:'|’)t)|you matter|we can)\b/i; return extractSentences(turn.content, pattern).slice(-2).map((text) => ({ speaker: turn.role === 'assistant' ? 'companion' : 'user', text: compact(text, 170) })); }
function reconcileUnresolved(previous: string[], next: string[], turns: Array<ReturnType<typeof normalizeTurn>>): string[] { const all = unique([...previous, ...next].map((item) => compact(item, 180))); const answerText = turns.filter((turn) => turn.role === 'assistant').map((turn) => turn.content.toLowerCase()).join(' '); return all.filter((item) => { const keywords = item.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter((word) => word.length > 5).slice(0, 3); return !keywords.length || keywords.filter((word) => answerText.includes(word)).length < 2; }); }
function uniqueWording(values: Array<{ speaker: 'user' | 'companion'; text: string }>) { const seen = new Set<string>(); return values.filter((value) => { const key = `${value.speaker}:${value.text.toLowerCase()}`; if (!value.text || seen.has(key)) return false; seen.add(key); return true; }); }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function stringOrNull(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))]; }
function compact(value: string, limit: number): string { const text = value.replace(/\s+/g, ' ').trim(); return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`; }
