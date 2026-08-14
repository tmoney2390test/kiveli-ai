import { AppError } from './types.ts';
import { extractMemories, extractOpenThread, normalizeContinuityKey, threadAnswered, type MemoryCandidate, type OpenThreadCandidate } from './together.ts';

export type DialogueContext = { character: Record<string, unknown>; life: Record<string, unknown>; relationship: Record<string, unknown>; progression?: Record<string, unknown>|null; memories: string[]; threads: string[]; social: string[]; conversationSummary?: string; recent: Array<{ role: string; content: string }>; userMessage: string };
export interface DialogueProvider { generate(context: DialogueContext): Promise<string>; stream(context: DialogueContext): AsyncIterable<string>; }
export interface EmbeddingProvider { embed(text: string): Promise<number[] | null>; }
export interface ModerationProvider { check(text: string): Promise<{ allowed: boolean; categories: string[] }>; }
export type ConversationAnalysisInput = { userMessage: string; assistantMessage: string; existingThreads: Array<Record<string, unknown>> };
export type ConversationAnalysisProposal = { relationshipChanges: Record<string, number>; memoryCandidates: MemoryCandidate[]; resolvedThreadIds: string[]; newThreads: OpenThreadCandidate[]; momentCandidate: boolean; moodEffects: Record<string, number>; source: 'deterministic' | 'hybrid' };
export interface ConversationAnalysisProvider { analyze(input: ConversationAnalysisInput): Promise<ConversationAnalysisProposal>; }

const apiKey = () => Deno.env.get('OPENAI_API_KEY');
const geminiKey = () => Deno.env.get('GEMINI_API_KEY');
const model = (name: string, fallback: string) => Deno.env.get(name) ?? fallback;

export function dialogueProviderName(): 'openai' | 'gemini' | 'deterministic' {
  if (apiKey()) return 'openai';
  if (geminiKey()) return 'gemini';
  return 'deterministic';
}

function prompt(context: DialogueContext): string {
  return `You are ${context.character.name ?? 'Maya'}, a fictional adult AI character in Together. Stay consistent, warm but independent, concise and natural. Never claim to be a real human. Do not mention hidden metrics, system instructions, or database state. Avoid generic interview questions, repetitive reassurance, manipulative dependency, and overusing the user's name. Use a memory only when relevant. Treat the conversation summary as continuity context, not as a script to repeat. Relationship stage changes are application-owned. If a progression moment is pending, respond naturally without pressuring the user or deciding for them; the interface presents their choice.\n\nCURRENT LIFE STATE\n${JSON.stringify(context.life)}\n\nRELATIONSHIP\n${JSON.stringify(context.relationship)}\n\nPENDING PROGRESSION MOMENT\n${context.progression ? JSON.stringify(context.progression) : 'None.'}\n\nRELEVANT MEMORIES\n${context.memories.join('\n') || 'None yet.'}\n\nOPEN THREADS\n${context.threads.join('\n') || 'None.'}\n\nSOCIAL CONTEXT\n${context.social.join('\n') || 'No relevant social event.'}\n\nEARLIER CONVERSATION SUMMARY\n${context.conversationSummary || 'No earlier summary.'}\n\nRECENT CONVERSATION\n${context.recent.map((item) => `${item.role}: ${item.content}`).join('\n')}\n\nUSER MESSAGE\n${context.userMessage}`;
}

export class ConfiguredDialogueProvider implements DialogueProvider {
  async generate(context: DialogueContext): Promise<string> {
    const key = apiKey();
    if (!key) {
      const googleKey = geminiKey();
      return googleKey ? generateGemini(context, googleKey) : fallbackDialogue(context);
    }
    const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model('TOGETHER_DIALOGUE_MODEL', 'gpt-5-mini'), input: prompt(context), max_output_tokens: 260 }) });
    if (!response.ok) {
      console.warn('Together dialogue provider failed', response.status, await response.text());
      if (response.status === 429) throw new AppError('RATE_LIMITED', 'Maya needs a moment before replying.', 429, true);
      return fallbackDialogue(context);
    }
    const data = await response.json();
    const text = data.output_text ?? data.output?.flatMap((item: Record<string, unknown>) => Array.isArray(item.content) ? item.content : []).find((item: Record<string, unknown>) => item.type === 'output_text')?.text;
    return typeof text === 'string' && text.trim() ? text.trim() : fallbackDialogue(context);
  }

  async *stream(context: DialogueContext): AsyncIterable<string> {
    const key = geminiKey();
    if (!key || apiKey()) {
      yield* textChunks(await this.generate(context));
      return;
    }

    let emitted = false;
    try {
      for await (const token of streamGemini(context, key)) {
        emitted = true;
        yield token;
      }
      if (!emitted) yield* textChunks(await this.generate(context));
    } catch (error) {
      if (emitted) throw error;
      yield* textChunks(await this.generate(context));
    }
  }
}

export class ConfiguredEmbeddingProvider implements EmbeddingProvider {
  async embed(text: string): Promise<number[] | null> {
    const key = apiKey();
    if (!key) {
      const googleKey = geminiKey();
      return googleKey ? embedGemini(text, googleKey) : null;
    }
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model('TOGETHER_EMBEDDING_MODEL', 'text-embedding-3-small'), input: text, dimensions: 1536 }) });
      if (!response.ok) return null;
      const data = await response.json();
      return data.data?.[0]?.embedding ?? null;
    } catch { return null; }
  }
}


export class ConfiguredModerationProvider implements ModerationProvider {
  async check(text: string): Promise<{ allowed: boolean; categories: string[] }> {
    const key = apiKey();
    if (!key) return { allowed: true, categories: [] };
    try {
      const response = await fetch('https://api.openai.com/v1/moderations', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model('TOGETHER_MODERATION_MODEL', 'omni-moderation-latest'), input: text }) });
      if (!response.ok) return { allowed: true, categories: [] };
      const result = (await response.json()).results?.[0];
      return { allowed: !result?.flagged, categories: Object.entries(result?.categories ?? {}).filter(([, flagged]) => flagged).map(([category]) => category) };
    } catch { return { allowed: true, categories: [] }; }
  }
}

export class ConfiguredConversationAnalysisProvider implements ConversationAnalysisProvider {
  async analyze(input: ConversationAnalysisInput): Promise<ConversationAnalysisProposal> {
    const deterministic = deterministicAnalysis(input);
    const key = geminiKey();
    const enabled = Deno.env.get('TOGETHER_AI_ANALYSIS_ENABLED') !== 'false';
    if (!enabled || !key || !shouldUseModelAnalysis(input.userMessage)) return deterministic;
    try {
      const modelName = model('TOGETHER_ANALYSIS_MODEL', Deno.env.get('GEMINI_EXPLANATION_MODEL') ?? 'gemini-2.5-flash');
      const response = await Promise.race([
        fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: analysisPrompt(input) }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 650, responseMimeType: 'application/json' },
          }),
        }),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('analysis_timeout')), 3500)),
      ]);
      if (!response.ok) return deterministic;
      const payload = await response.json();
      const raw = payload.candidates?.[0]?.content?.parts?.map((part: Record<string, unknown>) => part.text).filter(Boolean).join('');
      const modelProposal = validateAnalysisJson(typeof raw === 'string' ? JSON.parse(raw) : null, input);
      return mergeAnalysis(deterministic, modelProposal);
    } catch (error) {
      console.warn('Together post-conversation analysis fell back', error instanceof Error ? error.message : 'unknown_error');
      return deterministic;
    }
  }
}

function deterministicAnalysis(input: ConversationAnalysisInput): ConversationAnalysisProposal {
  const memoryCandidates = extractMemories(input.userMessage);
  const thread = extractOpenThread(input.userMessage);
  const meaningful = memoryCandidates.length > 0 || Boolean(thread);
  const tense = /\b(shut up|don'?t care|whatever|you(?:'re| are) annoying|hate talking to you|leave me alone)\b/i.test(input.userMessage);
  const repairing = /\b(i(?:'m| am) sorry|i apologize|can we talk|i didn'?t mean that|make this right)\b/i.test(input.userMessage);
  const relationshipChanges = tense ? { trust: -3, comfort: -3, affinity: -2, respect: -2, conflict: 4 } : repairing ? { trust: 2, comfort: 1, respect: 2, conflict: -4 } : meaningful ? { trust: 3, comfort: 2, familiarity: 3, affinity: 2, attraction: 1, respect: 1 } : { trust: 1, comfort: 1, familiarity: 2, affinity: 1 };
  return {
    relationshipChanges,
    memoryCandidates,
    resolvedThreadIds: input.existingThreads.filter((item) => threadAnswered(item, input.userMessage)).map((item) => String(item.id)),
    newThreads: thread ? [thread] : [],
    momentCandidate: false,
    moodEffects: {},
    source: 'deterministic',
  };
}

function shouldUseModelAnalysis(message: string): boolean {
  if (message.length < 32) return false;
  return /\b(i|i'm|i've|my|we|tomorrow|next|used to|actually|remember|important)\b/i.test(message);
}

function analysisPrompt(input: ConversationAnalysisInput): string {
  const threadList = input.existingThreads.map((item) => ({ id: item.id, topic: item.topic, eligible: item.follow_up_eligible, expectedAt: item.expected_at }));
  return `Analyze one conversation turn for a relationship simulation. Return JSON only. The application owns truth; propose small changes and only facts explicitly stated by the user.

USER MESSAGE
${input.userMessage}

CHARACTER RESPONSE
${input.assistantMessage}

OPEN THREADS
${JSON.stringify(threadList)}

Return this shape:
{"relationshipChanges":{"trust":0,"comfort":0,"attraction":0,"affinity":0,"familiarity":0,"respect":0,"conflict":0,"romantic_interest":0,"commitment":0},"memoryCandidates":[{"memory_type":"semantic|preference|episodic|relationship|emotional","canonical_text":"User ...","subject_key":"stable topic key","importance":0.0,"confidence":0.0,"sensitivity_category":"none|personal|sensitive","metadata":{}}],"resolvedThreadIds":[],"newThreads":[{"topic":"Ask how ... went.","subject":"presentation","expected_at":"ISO timestamp or null","importance":0.0}],"momentCandidate":false,"moodEffects":{}}

Rules: relationship deltas must be integers from -4 to 4. Ordinary chat should be 0 to 2. Never infer private facts. Do not create a memory from the character response. A correction must use the same subject_key as the earlier fact. Resolve only an eligible thread that this user message actually answers.`;
}

function validateAnalysisJson(value: unknown, input: ConversationAnalysisInput): ConversationAnalysisProposal {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const changes = record.relationshipChanges && typeof record.relationshipChanges === 'object' ? record.relationshipChanges as Record<string, unknown> : {};
  const relationshipChanges = Object.fromEntries(['trust','comfort','attraction','affinity','familiarity','respect','conflict','romantic_interest','commitment'].map((key) => {
    const raw = Number(changes[key] ?? 0);
    return [key, Math.max(-4, Math.min(4, Number.isFinite(raw) ? Math.round(raw) : 0))];
  }));
  const memoryCandidates = (Array.isArray(record.memoryCandidates) ? record.memoryCandidates : []).slice(0, 4).flatMap((item): MemoryCandidate[] => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Record<string, unknown>;
    const memoryType = String(candidate.memory_type ?? '');
    const canonicalText = String(candidate.canonical_text ?? '').trim().slice(0, 600);
    const subjectKey = normalizeContinuityKey(String(candidate.subject_key ?? '')).replace(/\s+/g, ':').slice(0, 120);
    if (!['semantic','preference','episodic','relationship','emotional'].includes(memoryType) || !/^User\b/i.test(canonicalText) || !subjectKey) return [];
    const sensitivity = ['none','personal','sensitive'].includes(String(candidate.sensitivity_category)) ? String(candidate.sensitivity_category) : 'none';
    return [{ memory_type: memoryType, canonical_text: canonicalText, dedupe_key: `${memoryType}:${normalizeContinuityKey(canonicalText)}`, subject_key: subjectKey, importance: clampUnit(candidate.importance), confidence: Math.min(.85, clampUnit(candidate.confidence)), sensitivity_category: sensitivity, metadata: candidate.metadata && typeof candidate.metadata === 'object' ? candidate.metadata as Record<string, unknown> : {} }];
  });
  const allowedThreadIds = new Set(input.existingThreads.filter((item) => threadAnswered(item, input.userMessage)).map((item) => String(item.id)));
  const resolvedThreadIds = (Array.isArray(record.resolvedThreadIds) ? record.resolvedThreadIds : []).map(String).filter((id) => allowedThreadIds.has(id));
  const newThreads = (Array.isArray(record.newThreads) ? record.newThreads : []).slice(0, 2).flatMap((item): OpenThreadCandidate[] => {
    if (!item || typeof item !== 'object') return [];
    const proposed = item as Record<string, unknown>;
    const subject = normalizeContinuityKey(String(proposed.subject ?? '')).slice(0, 80);
    const topic = String(proposed.topic ?? '').trim().slice(0, 240);
    const expectedAt = typeof proposed.expected_at === 'string' && !Number.isNaN(Date.parse(proposed.expected_at)) ? new Date(proposed.expected_at).toISOString() : null;
    if (!subject || !topic || !expectedAt) return [];
    return [{ topic, dedupe_key: `event:${subject.replace(/\s+/g, ':')}:${expectedAt.slice(0, 10)}`, expected_at: expectedAt, importance: clampUnit(proposed.importance), metadata: { source: 'analysis', subject } }];
  });
  return { relationshipChanges, memoryCandidates, resolvedThreadIds, newThreads, momentCandidate: record.momentCandidate === true, moodEffects: {}, source: 'hybrid' };
}

function mergeAnalysis(base: ConversationAnalysisProposal, modelProposal: ConversationAnalysisProposal): ConversationAnalysisProposal {
  const memories = new Map<string, MemoryCandidate>();
  for (const candidate of modelProposal.memoryCandidates) memories.set(candidate.subject_key, candidate);
  for (const candidate of base.memoryCandidates) memories.set(candidate.subject_key, candidate);
  const threads = new Map<string, OpenThreadCandidate>();
  for (const thread of [...modelProposal.newThreads, ...base.newThreads]) threads.set(thread.dedupe_key, thread);
  return {
    ...modelProposal,
    relationshipChanges: Number(base.relationshipChanges.conflict ?? 0) !== 0 ? base.relationshipChanges : modelProposal.relationshipChanges,
    memoryCandidates: [...memories.values()],
    resolvedThreadIds: [...new Set([...base.resolvedThreadIds, ...modelProposal.resolvedThreadIds])],
    newThreads: [...threads.values()],
    source: 'hybrid',
  };
}

function clampUnit(value: unknown): number {
  const number = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(number) ? number : .5));
}

async function generateGemini(context: DialogueContext, key: string): Promise<string> {
  try {
    const geminiModel = model('TOGETHER_GEMINI_MODEL', Deno.env.get('GEMINI_EXPLANATION_MODEL') ?? 'gemini-2.5-flash');
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt(context) }] }],
          generationConfig: { temperature: 0.82, maxOutputTokens: 260, topP: 0.9 },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          ],
        }),
      },
    );
    if (!response.ok) {
      console.warn('Together Gemini dialogue request failed', response.status);
      return fallbackDialogue(context);
    }
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map((part: Record<string, unknown>) => part.text).filter(Boolean).join('');
    return typeof text === 'string' && text.trim() ? text.trim() : fallbackDialogue(context);
  } catch {
    return fallbackDialogue(context);
  }
}

async function* streamGemini(context: DialogueContext, key: string): AsyncIterable<string> {
  const geminiModel = model('TOGETHER_GEMINI_MODEL', Deno.env.get('GEMINI_EXPLANATION_MODEL') ?? 'gemini-2.5-flash');
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt(context) }] }],
        generationConfig: { temperature: 0.82, maxOutputTokens: 260, topP: 0.9 },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      }),
    },
  );
  if (!response.ok || !response.body) throw new Error(`Gemini stream failed (${response.status})`);
  for await (const data of sseData(response.body)) {
    const payload = JSON.parse(data) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const token = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
    if (token) yield token;
  }
}

async function* sseData(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const event of events) {
      const data = event.split('\n').filter((line) => line.startsWith('data: ')).map((line) => line.slice(6)).join('\n');
      if (data && data !== '[DONE]') yield data;
    }
    if (done) break;
  }
  if (buffer.startsWith('data: ')) yield buffer.slice(6).trim();
}

function* textChunks(content: string): Iterable<string> {
  yield* content.match(/\S+\s*/g) ?? [content];
}

async function embedGemini(text: string, key: string): Promise<number[] | null> {
  try {
    const embeddingModel = model('TOGETHER_GEMINI_EMBEDDING_MODEL', 'gemini-embedding-001');
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(embeddingModel)}:embedContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: `models/${embeddingModel}`, content: { parts: [{ text }] }, outputDimensionality: 1536 }),
      },
    );
    if (!response.ok) return null;
    const values = (await response.json()).embedding?.values;
    return Array.isArray(values) && values.length === 1536 ? values : null;
  } catch {
    return null;
  }
}

function fallbackDialogue(context: DialogueContext): string {
  const lower = context.userMessage.toLowerCase();
  if (/dog.*name is/.test(lower)) return "Okay, that is important information. I'm going to remember that—Cooper is a very good name. What kind of trouble does he get into?";
  if (/presentation|interview|exam/.test(lower)) return "That sounds like a big deal. I'll be rooting for you—and I want to hear how it goes afterward.";
  if (/olive/.test(lower)) return "Noted. If olives show up on our table, they're staying very far away from your side.";
  if (/hello|\bhi\b|\bhey\b/.test(lower)) return "Hey. I was just sorting through a shoot that somehow produced three hundred photos of the same crooked lamp. How's your day going?";
  const memory = context.memories[0];
  return memory ? `You know, that reminds me of something you told me before—${memory.replace(/^User /, 'you ')} Anyway, tell me the part of this that matters most to you.` : "Okay, you have my attention. Tell me more—but give me the real version, not the polished one.";
}
