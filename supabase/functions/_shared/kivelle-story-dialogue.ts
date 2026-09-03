import type { SupabaseClient } from '@supabase/supabase-js';
import { buildResponsesRequestBody, executeResponsesHttp, extractResponsesText } from '../../../packages/together-domain/src/ai-provider.ts';
import { normalizeResponsesUsage } from '../../../packages/together-domain/src/ai-usage.ts';
import { formatStoryTime, resolveStoryDepartureForecast, type StoryActionResult, type StoryCampaignState, type StoryDefinition } from '../../../packages/together-domain/src/stories.ts';
import { buildStoryDialogueAuthorization, evaluateStoryDialogueQuality, parseStructuredStoryDialogue, planStoryDialogue, repairStoryDialogueStyle, resolveCharacterStoryProfile, storyClaimModeLabel, storyPersistencePolicy, validateStructuredStoryDialogue, type StoryDialogueAuthorization, type StoryDialoguePlan, type StructuredStoryDialogue } from '../../../packages/together-domain/src/story-director.ts';
import { recordAiUsage } from './kivelle-ai-usage.ts';
import { acquireProviderSlot, releaseProviderSlot } from './kivelle-provider-concurrency.ts';
import { openAIDialogueModel } from './together-ai.ts';

type Row = Record<string, unknown>;

type CanonicalStoryIdentity = {
  occupation: string;
  biography: string;
  interests: string[];
  personality: string;
  communicationStyle: string;
};

const canonicalStoryIdentityCache = new Map<string, { expiresAt: number; value: CanonicalStoryIdentity | null }>();
const CANONICAL_STORY_IDENTITY_TTL_MS = 10 * 60 * 1000;

export type StoryDialogueGeneration = { text: string; provider: string; model: string; fallback: boolean; structured: StructuredStoryDialogue; authorization: StoryDialogueAuthorization; plan: StoryDialoguePlan; qualityIssues: string[]; rejectedIds: string[] };

export async function generateStoryDialogue(input: {
  db: SupabaseClient;
  userId: string;
  correlationId: string;
  campaignId: string;
  definition: StoryDefinition;
  before: StoryCampaignState;
  result: StoryActionResult;
  characterId: string;
  userMessage: string;
  approachId?: string;
  evidenceId?: string;
  contentMode: 'standard' | 'mature';
  recentMessages: Row[];
  reactionTo?: { characterId: string; characterName: string; text: string };
  reactiveOnly?: boolean;
}): Promise<StoryDialogueGeneration> {
  const character = input.definition.characters.find((item) => item.id === input.characterId)!;
  const profile = resolveCharacterStoryProfile(input.definition, input.characterId);
  const approach = input.approachId ? input.definition.dialogueApproaches.find((item) => item.id === input.approachId) : undefined;
  const baseAuthorization = buildStoryDialogueAuthorization({ definition: input.definition, state: input.before, characterId: input.characterId, message: input.userMessage, ...(input.approachId ? { approachId: input.approachId } : {}), ...(input.evidenceId ? { evidenceId: input.evidenceId } : {}) });
  const authorization: StoryDialogueAuthorization = input.reactiveOnly
    ? { ...baseAuthorization, permittedFactIds: [], permittedBeliefIds: [], permittedLieIds: [], permittedLeadIds: [], permittedActionIds: [] }
    : baseAuthorization;
  const plan = planStoryDialogue({ definition: input.definition, state: input.before, characterId: input.characterId, intent: authorization.intent, userMessage: input.userMessage, ...(input.reactiveOnly ? { reactiveOnly: true } : {}), ...(input.reactionTo ? { reactionToCharacterName: input.reactionTo.characterName } : {}) });
  const allowedEvidence = input.definition.evidence.filter((item) => authorization.permittedFactIds.includes(item.id));
  const permittedLeads = input.definition.dialogueApproaches.filter((item) => authorization.permittedLeadIds.includes(item.id));
  const permittedActions = input.definition.interactions.filter((item) => authorization.permittedActionIds.includes(item.id));
  const beliefs = profile?.mistakenBeliefs?.filter((item) => authorization.permittedBeliefIds.includes(item.id)) ?? [];
  const lies = profile?.intentionalLies?.filter((item) => authorization.permittedLieIds.includes(item.id)) ?? [];
  const currentLocation = input.definition.locations.find((item) => item.id === input.before.currentLocationId)!;
  const characterState = input.before.characterStates[character.id];
  const departure = input.result.presenceTransitions.find((transition) => transition.type === 'departed' && transition.characterId === character.id && transition.witnessed);
  const departureDestination = departure?.destinationLocationId
    ? input.definition.locations.find((item) => item.id === departure.destinationLocationId)
    : null;
  const departurePressure = departure ? null : resolveStoryDepartureForecast(input.definition, input.before, character.id, 10);
  const continuity = characterState?.continuity;
  const fingerprint = profile?.speechFingerprint;
  const examples = fingerprint?.voiceExamples ?? [];
  const exampleOffset = examples.length ? (characterState?.conversationCount ?? 0) % examples.length : 0;
  const selectedExamples = examples.length ? [examples[exampleOffset]!, examples[(exampleOffset + Math.max(1, Math.floor(examples.length / 2))) % examples.length]!].filter((value, index, rows) => rows.indexOf(value) === index) : [];
  const canonicalIdentity = await resolveCanonicalStoryIdentity(input.db, character.id);
  const recentTranscript = input.recentMessages.slice(-10).map((message) => {
    if (message.role === 'user') return `PLAYER: ${String(message.content).slice(0, 900)}`;
    if (message.role === 'character') {
      const speakerId = String(message.character_slug ?? 'unknown-character');
      const speakerName = input.definition.characters.find((item) => item.id === speakerId)?.name ?? speakerId;
      return `${speakerName.toUpperCase()} [${speakerId}]: ${String(message.content).slice(0, 900)}`;
    }
    return `SYSTEM EVENT: ${String(message.content).slice(0, 900)}`;
  });
  const prompt = [
    '<KIVELLI_STORY_DIALOGUE>',
    `STORY: ${input.definition.title}`,
    `SPEAKER: ${character.name}`,
    ...(canonicalIdentity ? [
      `CANONICAL KIVELLI IDENTITY: ${canonicalIdentity.occupation || 'Vespormoor resident'}. ${canonicalIdentity.biography}`,
      `ORDINARY LIFE AND INTERESTS: ${canonicalIdentity.interests.join(', ') || 'Use the companion’s established ordinary life.'}`,
      `CANONICAL PERSONALITY: ${canonicalIdentity.personality}`,
      `CANONICAL COMMUNICATION STYLE: ${canonicalIdentity.communicationStyle}`,
      'IDENTITY PRIORITY: Canonical companion identity controls ordinary personality and speech. The Story profile adds tonight’s knowledge, pressure, and objective; it does not replace the person with a clue dispenser.',
    ] : []),
    'NORMAL CONVERSATION PRIORITY: The speaker is a person, not a puzzle dispenser. Greetings, personal questions, humor, opinions, and ordinary social conversation receive direct, natural responses in the companion’s established voice.',
    `DRAMATIC FUNCTION: ${profile?.dramaticFunction ?? character.publicRole ?? 'Local witness'}`,
    `CURRENT OBJECTIVE: ${profile?.currentNightObjective ?? 'Continue the present conversation safely.'}`,
    `SECONDARY OBJECTIVE: ${profile?.secondaryObjective ?? 'Protect their immediate interests without derailing the scene.'}`,
    `CURRENT PRESSURE: ${profile?.pressure ?? profile?.fear ?? 'The night is moving faster than they would like.'}`,
    `STANCE TOWARD PLAYER: ${profile?.playerStance ?? continuity?.relationshipCue ?? 'Still deciding what the player means to them.'}`,
    `AGENDA EXIT CONDITION: ${profile?.agendaExitCondition ?? 'Stop pressing when the player gives a credible answer or the present danger changes.'}`,
    `INTERACTION STYLE: ${profile?.interactionStyle ?? 'Natural, concise, and in character.'}`,
    `CONVERSATIONAL STRATEGY: ${profile?.conversationalStrategy ?? 'Answer only from public knowledge and admit uncertainty.'}`,
    `SOCIAL MOVE FOR THIS TURN: ${plan.move}. This is the social purpose, not something to announce.`,
    `CONVERSATION INTENT: ${authorization.intent}.`,
    ...(authorization.intent === 'casual' ? ['CASUAL TURN: Keep the mystery in the background. Answer as this person would during an ordinary conversation in this setting. Do not introduce a clue, warning, test, or cryptic prompt unless the player explicitly raised the mystery.'] : []),
    `RESPONSE SHAPE: ${plan.responseShape}. Let the visible rhythm follow it without becoming mannered.`,
    `QUESTION POLICY: ${plan.questionGuidance}`,
    `PHYSICAL MANNERISMS: ${(profile?.physicalMannerisms ?? []).join('; ') || 'Use physical behavior sparingly.'}`,
    `SPEECH CADENCE: ${fingerprint?.cadence ?? 'Natural spoken cadence with varied sentence length.'}`,
    `SENTENCE LENGTH: ${fingerprint?.sentenceLength ?? 'mixed'}; CONTRACTIONS: ${fingerprint?.contractions ?? 'natural'}.`,
    `HUMOR: ${fingerprint?.humor ?? 'Only when natural.'}`,
    `HESITATION: ${fingerprint?.hesitation ?? 'Allow uncertainty without verbal clutter.'}`,
    `DIRECTNESS: ${fingerprint?.directness ?? 'Match the relationship and current emotion.'}`,
    `CHARACTER VOCABULARY: ${(fingerprint?.vocabulary ?? []).join(', ') || 'Use occupation-appropriate ordinary language.'}`,
    `EMOTIONAL TELLS: ${(fingerprint?.emotionalTells ?? []).join('; ') || 'Let emotion alter rhythm rather than explaining it.'}`,
    `VOICE AVOIDS: ${(fingerprint?.avoids ?? []).join('; ') || 'Avoid assistant-like phrasing and lore lectures.'}`,
    ...(selectedExamples.length ? ['VOICE EXAMPLES — style only; never copy their content:', ...selectedExamples.map((example) => `- “${example}”`)] : []),
    `CURRENT EMOTIONAL STATE: ${input.before.characterStates[character.id]?.emotionalState ?? profile?.initialEmotionalState ?? 'calm'}`,
    `CURRENT CANONICAL REALITY: Loop ${input.before.currentLoop}; ${formatStoryTime(input.before.currentMinute)}; ${currentLocation.name}.`,
    ...(departure ? [
      `VALIDATED END-OF-TURN TRANSITION: At ${formatStoryTime(departure.storyMinute)}, ${character.name} departs ${currentLocation.name}${departureDestination ? ` for ${departureDestination.name}` : ''}. Their next activity is: ${departure.activity}. This movement is already canonical.`,
      `TRANSITION DELIVERY: Close the reply naturally by acknowledging the departure${departureDestination ? ` and tell the player they can find ${character.name.split(' ')[0]} at ${departureDestination.name}` : ''}. Do not invent any other movement.`,
    ] : []),
    ...(departurePressure ? [`UPCOMING OBLIGATION: ${character.name} has about ${departurePressure.minutesUntil} minutes before their validated schedule changes. Let this subtly affect pace or attention, but do not reveal a full schedule, exact destination, or claim the departure has happened yet.`] : []),
    `LOCATION SENSORY PALETTE: ${(currentLocation.sensoryVocabulary ?? []).join('; ') || currentLocation.description}`,
    `PLAYER TRUST: ${input.before.characterStates[character.id]?.trust ?? character.baselineTrust}/100. SUSPICION: ${input.before.characterStates[character.id]?.suspicion ?? character.baselineSuspicion}/100.`,
    approach ? `AUTHORED APPROACH: ${approach.promptIntent}` : 'AUTHORED APPROACH: freeform conversation; respond normally. Hidden facts remain off-limits, but ordinary personal and situational conversation is allowed.',
    input.evidenceId ? `EVIDENCE PRESENTED: ${input.definition.evidence.find((item) => item.id === input.evidenceId)?.title ?? 'validated evidence'}` : 'EVIDENCE PRESENTED: none.',
    ...(input.reactionTo ? [`LIVE SCENE: ${input.reactionTo.characterName} just said: “${input.reactionTo.text.slice(0, 700)}”`] : []),
    `OPTIONAL GROUNDED DETAIL: ${plan.groundedObservation}. Use at most one immediate observation, and only if it fits.`,
    ...(plan.residueToAcknowledge ? [`CONVERSATIONAL RESIDUE: ${plan.residueToAcknowledge.kind} — ${plan.residueToAcknowledge.summary}. Acknowledge only if this turn naturally touches it.`] : []),
    ...(continuity?.pendingResumeCue ? [`REUNION CONTINUITY: ${continuity.pendingResumeCue} Treat this as already-established reality. Briefly reconnect, then continue the unfinished thought rather than restarting the conversation.`] : []),
    ...(continuity?.recentExchangeSummaries.length ? ['CHARACTER-SPECIFIC CONTINUITY:', ...continuity.recentExchangeSummaries.map((item) => `- ${item}`)] : []),
    ...(continuity?.openThreads.length ? ['OPEN THREADS THIS CHARACTER MAY NATURALLY RETURN TO:', ...continuity.openThreads.map((item) => `- ${item}`)] : []),
    `STORY TONE: ${input.contentMode === 'mature' ? 'Mature. Adult themes and stronger language are allowed when natural, but story canon remains authoritative.' : 'Standard. Keep language and themes broadly accessible.'}`,
    'ALLOWED CANONICAL FACTS:',
    ...(allowedEvidence.length ? allowedEvidence.map((item) => `- [${item.id}] ${item.title}: ${item.hiddenCanonicalDescription ?? item.description}`) : ['- No hidden story fact is currently authorized for disclosure.']),
    'AUTHORIZED NON-CANONICAL CLAIMS:',
    ...(beliefs.length ? beliefs.map((item) => `- [${item.id}] ${storyClaimModeLabel('mistaken_belief')}: ${item.statement}`) : []),
    ...(lies.length ? lies.map((item) => `- [${item.id}] ${storyClaimModeLabel('intentional_lie')}: ${item.statement}`) : []),
    ...(!beliefs.length && !lies.length ? ['- None.'] : []),
    'OPTIONAL ACTIONABLE LEADS:',
    ...(permittedLeads.length ? permittedLeads.map((item) => `- LEAD [${item.id}]: ${item.label}. Natural meaning: ${item.promptIntent}`) : ['- None.']),
    ...(permittedActions.length ? permittedActions.map((item) => `- SCENE ACTION [${item.id}]: ${item.title}. ${item.description}`) : []),
    ...storyPersistencePolicy(input.definition.persistencePolicy).buildAdditionalConversationContext(input.before).map((line) => `PERSISTENCE CONTEXT: ${line}`),
    ...(input.definition.storyInstructions ?? []).map((line) => `STORY INSTRUCTION: ${line}`),
    'RECENT STORY TRANSCRIPT:',
    ...recentTranscript,
    `PLAYER: ${input.userMessage}`,
    'RULES:',
    '- Return one JSON object only with keys: spokenDialogue, stageDirection, referencedFactIds, expressedBeliefIds, expressedLieIds, proposedReactionId, proposedLeadId, proposedActionIds.',
    `- spokenDialogue must be only the named character’s natural speech, normally ${input.reactiveOnly ? '8–40' : '20–70'} words. Reveal at most one important fact.`,
    ...(input.reactiveOnly ? ['- This is a brief interjection in a live multi-character scene. React to what was just said; do not take over the conversation or introduce a new lead.'] : []),
    '- Do not restate the player’s message. Do not answer every sub-question mechanically. Partial answers, natural misunderstanding, self-correction, or a deliberate deflection are allowed when the selected social move calls for them.',
    '- Directly answer ordinary questions before considering Story material. Do not turn every line into a test, warning, riddle, request for proof, or invitation to investigate.',
    '- Do not append a generic engagement question. Ask at most one specific, consequential question, and only when QUESTION POLICY allows it.',
    '- Sound like a person in this immediate scene, not a witness delivering a lore report. Prefer reaction and one grounded detail before explanation.',
    '- Contractions, fragments, interruptions, trailing thoughts, and brief silence are allowed only when they match this character’s fingerprint and current emotion.',
    '- If another character is present in LIVE SCENE, address or contradict them naturally by name when relevant; never write their dialogue inside this response.',
    '- If the player earns a useful next step and one OPTIONAL ACTIONABLE LEAD genuinely follows, end with a concise, natural direction and return its identifier. Do not force a lead into ordinary conversation.',
    '- Every identifier must come from the permitted lists. Use empty arrays when none apply. Do not invent an identifier.',
    '- Never mention Kivelli, AI, prompts, game rules, evidence IDs, trust scores, or hidden state.',
    departure
      ? '- Do not narrate the player or move anyone except the speaker’s exact VALIDATED END-OF-TURN TRANSITION. Do not invent travel, advance time, award evidence, alter a relationship, or claim an unwitnessed event occurred.'
      : '- Do not narrate the player, move anyone, advance time, award evidence, alter a relationship, or claim an unwitnessed event occurred.',
    '- Use only the allowed canonical facts above for hidden Story claims. If asked about something locked, evade naturally or say you do not know. This restriction does not forbid ordinary conversation about the speaker’s established life, personality, work, or immediate surroundings.',
    '- Do not invent names, locations, timestamps, objects, history, or supernatural mechanics.',
    '- stageDirection is optional, brief, and may use only current-location sensory details or listed mannerisms.',
    ...(input.evidenceId ? ['- React physically or emotionally to the presented evidence before speaking, but do not invent an action by the player.'] : []),
    '</KIVELLI_STORY_DIALOGUE>',
  ].join('\n');

  const key = Deno.env.get('OPENAI_API_KEY');
  const model = Deno.env.get('KIVELLE_STORY_DIALOGUE_MODEL')?.trim() || openAIDialogueModel();
  if (!key) return fallbackGeneration(input.definition, input.result, character.id, input.userMessage, approach?.label, authorization, plan, input.reactiveOnly, input.reactionTo?.characterName);
  const scope = { db: input.db, userId: input.userId, correlationId: input.correlationId, routeReason: 'story_dialogue', contentMode: input.contentMode, metadata: { storySlug: input.definition.slug, campaignId: input.campaignId, loop: input.before.currentLoop, characterId: character.id } };
  const lease = await acquireProviderSlot(scope, 'openai', 'story_dialogue');
  const started = Date.now();
  try {
    const response = await executeResponsesHttp(fetch, 'openai', key, buildResponsesRequestBody({ model, prompt, maxOutputTokens: 280, stream: false }));
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    const usage = normalizeResponsesUsage('openai', body['usage'] ?? (body['response'] as Row | undefined)?.['usage']);
    if (!response.ok) throw new Error(`story_dialogue_http_${response.status}`);
    const generated = extractResponsesText(body);
    const structured = parseStructuredStoryDialogue(generated);
    const structuredValidation = structured ? validateStructuredStoryDialogue({ definition: input.definition, authorization, result: structured }) : null;
    const recentCharacterMessages = input.recentMessages
      .filter((message) => message.role === 'character' && message.character_slug === character.id)
      .map((message) => String(message.content));
    const quality = structuredValidation?.valid
      ? evaluateStoryDialogueQuality({ text: structuredValidation.sanitized.spokenDialogue, userMessage: input.userMessage, recentCharacterMessages, intent: authorization.intent })
      : { acceptable: false, issues: [] };
    const repairedText = structuredValidation?.valid
      ? repairStoryDialogueStyle(structuredValidation.sanitized.spokenDialogue, quality)
      : '';
    const spokenDialogue = ensureCanonicalDepartureClosure(input.definition, input.result, character.id, repairedText);
    const sanitized = structuredValidation?.valid
      ? { ...structuredValidation.sanitized, spokenDialogue }
      : null;
    const dialogueValidation = sanitized?.spokenDialogue
      ? validateStoryDialogue(input.definition, input.before, input.result, sanitized.spokenDialogue, authorization, character.id)
      : { valid: false, reason: structured ? 'style_repair_empty' : 'invalid_json' };
    if (!structured || !structuredValidation?.valid || !sanitized || !dialogueValidation.valid) {
      const fallback = fallbackGeneration(input.definition, input.result, character.id, input.userMessage, approach?.label, authorization, plan, input.reactiveOnly, input.reactionTo?.characterName);
      await recordAiUsage(scope, { provider: 'openai', model, operation: 'story_dialogue', usage, latencyMs: Date.now() - started, success: true, metadata: { fallback: true, validationReason: dialogueValidation.reason ?? 'structured_output', rejectedIdentifierCount: structuredValidation?.rejectedIds.length ?? 0 } });
      return { ...fallback, rejectedIds: structuredValidation?.rejectedIds ?? [] };
    }
    await recordAiUsage(scope, { provider: 'openai', model, operation: 'story_dialogue', usage, latencyMs: Date.now() - started, success: true, metadata: { fallback: false, factCount: sanitized.referencedFactIds.length, qualityIssueCount: quality.issues.length, conversationalMove: plan.move, responseShape: plan.responseShape } });
    return { text: sanitized.spokenDialogue, provider: 'openai', model, fallback: false, structured: sanitized, authorization, plan, qualityIssues: quality.issues, rejectedIds: [] };
  } catch (error) {
    await recordAiUsage(scope, { provider: 'openai', model, operation: 'story_dialogue', latencyMs: Date.now() - started, success: false, errorCode: error instanceof Error ? error.message.slice(0, 80) : 'unknown' });
    return fallbackGeneration(input.definition, input.result, character.id, input.userMessage, approach?.label, authorization, plan, input.reactiveOnly, input.reactionTo?.characterName);
  } finally {
    await releaseProviderSlot(scope, lease);
  }
}

export function validateStoryDialogue(definition: StoryDefinition, before: StoryCampaignState, result: StoryActionResult, text: string, authorization?: StoryDialogueAuthorization, characterId?: string): { valid: boolean; reason?: string } {
  const value = text.trim();
  if (!value || value.length > 1600) return { valid: false, reason: 'length' };
  if (/^(?:assistant|character|system|speaker)\s*:/i.test(value) || /<\/?[A-Z_]+>|```|\*[^*]{2,}\*/.test(value)) return { valid: false, reason: 'format' };
  const canonicalDeparture = characterId
    ? result.presenceTransitions.find((transition) => transition.type === 'departed' && transition.characterId === characterId && transition.witnessed)
    : undefined;
  const movementClaim = /\b(I|we)\s+(?:walk|leave|arrive|travel|go|move|run|drive|head)\s+(?:to|toward|into|back)\b/i.exec(value);
  if (movementClaim && (!canonicalDeparture || movementClaim[1]?.toLowerCase() === 'we')) return { valid: false, reason: 'movement_claim' };
  if (canonicalDeparture) {
    const namedLocations = definition.locations.filter((location) => value.toLowerCase().includes(location.name.toLowerCase()));
    if (namedLocations.some((location) => location.id !== canonicalDeparture.destinationLocationId && location.id !== canonicalDeparture.originLocationId)) return { valid: false, reason: 'movement_claim' };
  }
  if (/\b(?:new fact|evidence unlocked|deduction complete|trust\s*[+-]|loop flag)\b/i.test(value)) return { valid: false, reason: 'game_state_claim' };
  const allowed = new Set([...before.evidenceIds, ...result.evidenceDiscovered]);
  const guarded: Array<[RegExp, string[]]> = [
    [/\b(?:permanent\s+)?anchor\b|erased from (?:reality|everyone'?s memory)/i, ['anchor-living-cost','erasure-corrections','owen-frequency']],
    [/\bGabriel(?:\s+Sayer)?\b/i, ['gabriel-sayer','gabriel-death','temporal-echo']],
    [/\bEleanor(?:\s+Vale)?\b/i, ['eleanor-first-anchor','elara-lineage','restore-eleanor']],
    [/\btemporal echo\b|assembled from (?:memory|grief)/i, ['temporal-echo']],
    [/\bthree (?:connected )?components\b|one (?:Vesper )?Engine\b/i, ['single-engine']],
    [/\bCeleste\b.{0,40}\breactivat/i, ['celeste-reactivated']],
  ];
  for (const [pattern, evidenceIds] of guarded) if (pattern.test(value) && !evidenceIds.some((id) => allowed.has(id))) return { valid: false, reason: 'hidden_fact' };
  if (authorization && containsForbiddenStoryFact(definition, authorization, value)) return { valid: false, reason: 'hidden_fact' };
  const explicitTimes = value.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g) ?? [];
  const permittedTimes = new Set([
    formatStoryTime(before.currentMinute).replace(/\s[AP]M$/, ''),
    ...(canonicalDeparture ? [formatStoryTime(canonicalDeparture.storyMinute).replace(/\s[AP]M$/, '')] : []),
  ]);
  if (explicitTimes.some((time) => !permittedTimes.has(time))) return { valid: false, reason: 'invented_time' };
  return { valid: true };
}

function fallbackStoryDialogue(definition: StoryDefinition, result: StoryActionResult, characterId: string, plan: StoryDialoguePlan, intent: StoryDialogueAuthorization['intent'], userMessage: string, approachLabel?: string): string {
  const character = definition.characters.find((item) => item.id === characterId)!;
  const revealed = result.evidenceDiscovered.map((id) => definition.evidence.find((item) => item.id === id)).find(Boolean);
  if (revealed) return `${revealed.description} That much I trust. The rest still does not fit.`;
  if (intent === 'casual') return casualFallbackStoryDialogue(character.name, userMessage, `${characterId}:${userMessage}:${plan.move}`);
  const seed = `${characterId}:${plan.move}:${approachLabel ?? ''}`;
  const choices: Partial<Record<StoryDialoguePlan['move'], string[]>> = {
    answer: [`Here is what I can say: I noticed the same break in the pattern. I do not know what caused it yet.`, `I know part of it, not all of it. The detail I trust is the one that keeps repeating.`],
    deflect: [`Not yet. You are asking me to name something before I know who else is listening.`, `That answer has consequences. Give me one detail I can verify first.`],
    tease: [`Bold question. Conveniently vague evidence. You can do better than that.`, `You make suspicion sound almost charming. Almost.`],
    challenge: [`Then be precise. What did you actually witness, and what are you only assuming?`, `I am not accepting that premise just because you said it confidently.`],
    reassure: [`I believe that you saw something. I am still deciding what it means. Those are not the same thing.`, `You are not imagining the pattern. Stay with what you can prove.`],
    confide: [`I have been avoiding the same conclusion. Saying it aloud does not make it safer, but it does make it harder to ignore.`, `There is a part of this I have not told anyone. I am not ready to call it certainty.`],
    ask: [`One thing first: which detail changed when you looked again?`, `Start with the part that felt wrong before you knew why.`],
    interrupt: [`Wait. I have heard enough versions of this to know that one does not fit.`, `No—stop there. That detail changes the order of everything.`],
    redirect: [`Leave the theory aside for a moment. Tell me what was physically in front of you.`, `We can argue about motives later. Start with the thing that could not have happened.`],
    correct: [`No. That is close, but it is not what happened. The sequence matters.`, `You have the right pieces in the wrong order.`],
  };
  const available = choices[plan.move] ?? choices.answer!;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  return available[Math.abs(hash) % available.length]!;
}

function fallbackGeneration(definition: StoryDefinition, result: StoryActionResult, characterId: string, userMessage: string, approachLabel: string | undefined, authorization: StoryDialogueAuthorization, plan: StoryDialoguePlan, reactiveOnly = false, reactionToName?: string): StoryDialogueGeneration {
  const baseText = reactiveOnly
    ? `${reactionToName ?? 'They'} may be leaving something out. I would not settle this until the details agree.`
    : fallbackStoryDialogue(definition, result, characterId, plan, authorization.intent, userMessage, approachLabel);
  const text = ensureCanonicalDepartureClosure(definition, result, characterId, baseText);
  const factId = result.evidenceDiscovered.find((id) => authorization.permittedFactIds.includes(id));
  const structured: StructuredStoryDialogue = { spokenDialogue: text, referencedFactIds: factId ? [factId] : [], expressedBeliefIds: [], expressedLieIds: [], proposedActionIds: [] };
  return { text, provider: 'deterministic', model: 'kivelle-story-deterministic', fallback: true, structured, authorization, plan, qualityIssues: [], rejectedIds: [] };
}

function casualFallbackStoryDialogue(characterName: string, userMessage: string, seed: string): string {
  const firstName = characterName.split(' ')[0] ?? characterName;
  const value = userMessage.trim().toLowerCase();
  if (/^(?:hi|hey|hello|good (?:morning|afternoon|evening))\b/.test(value)) return `Hey. I’m ${firstName}. You look like you’ve already had an interesting night.`;
  if (/\bhow are you|how'?s it going|you okay\b/.test(value)) return `A little distracted, if I’m honest, but I’m all right. How about you?`;
  if (/\bwhat are you doing|what.*up to|what brings you here\b/.test(value)) return `Trying to finish what I came here to do without letting the whole evening turn into work.`;
  if (/\b(?:beautiful|pretty|handsome|cute|gorgeous|like you)\b/.test(value)) return `Careful. I might start believing you.`;
  const choices = [
    `That’s fair. I’m trying to keep one eye on what’s happening around us and still have a normal conversation.`,
    `I can work with that. This night has been strange enough without making every conversation strange too.`,
    `All right. Let’s leave the town’s drama alone for a minute—what were you actually hoping to talk about?`,
  ];
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  return choices[Math.abs(hash) % choices.length]!;
}

async function resolveCanonicalStoryIdentity(db: SupabaseClient, characterSlug: string): Promise<CanonicalStoryIdentity | null> {
  const cached = canonicalStoryIdentityCache.get(characterSlug);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const { data, error } = await db
    .from('together_character_templates')
    .select('name,slug,occupation,biography,current_published_version,together_character_versions(version,interests,personality_config,communication_style,character_bible)')
    .eq('slug', characterSlug)
    .maybeSingle();
  if (error || !data) {
    canonicalStoryIdentityCache.set(characterSlug, { expiresAt: Date.now() + CANONICAL_STORY_IDENTITY_TTL_MS, value: null });
    return null;
  }
  const row = data as Row;
  const versions = Array.isArray(row['together_character_versions']) ? row['together_character_versions'] as Row[] : [];
  const publishedVersion = Number(row['current_published_version'] ?? 0);
  const version = versions.find((item) => Number(item['version'] ?? 0) === publishedVersion)
    ?? [...versions].sort((a, b) => Number(b['version'] ?? 0) - Number(a['version'] ?? 0))[0];
  const interests = version?.['interests'];
  const value: CanonicalStoryIdentity = {
    occupation: conciseIdentityValue(row['occupation'], 120),
    biography: conciseIdentityValue(row['biography'], 320),
    interests: Array.isArray(interests) ? interests.map((item) => String(item)).filter(Boolean).slice(0, 8) : [],
    personality: conciseIdentityValue(version?.['personality_config'], 420),
    communicationStyle: conciseIdentityValue(version?.['communication_style'], 360),
  };
  canonicalStoryIdentityCache.set(characterSlug, { expiresAt: Date.now() + CANONICAL_STORY_IDENTITY_TTL_MS, value });
  return value;
}

function conciseIdentityValue(value: unknown, maxLength: number): string {
  if (value === null || value === undefined) return '';
  const rendered = typeof value === 'string' ? value : JSON.stringify(value);
  return rendered.replace(/\s+/g, ' ').slice(0, maxLength);
}

export function ensureCanonicalDepartureClosure(definition: StoryDefinition, result: StoryActionResult, characterId: string, text: string): string {
  const departure = result.presenceTransitions.find((transition) => transition.type === 'departed' && transition.characterId === characterId && transition.witnessed);
  if (!departure) return text;
  const destination = departure.destinationLocationId ? definition.locations.find((item) => item.id === departure.destinationLocationId) : null;
  const lower = text.toLowerCase();
  if (destination && lower.includes(destination.name.toLowerCase()) && /\b(?:I\s+(?:need|have|ought|should|'ve\s+got)\s+to\s+(?:leave|go|head|move)|I(?:'m|\s+am)\s+(?:leaving|going|heading|moving)|find\s+me|meet\s+me)\b/i.test(text)) return text;
  const character = definition.characters.find((item) => item.id === characterId);
  const authored = character?.storyProfile?.departureLines ?? [];
  const generic = destination
    ? [
      `I need to move. Find me at ${destination.name} if you still want answers.`,
      `I can't stay. Catch up with me at ${destination.name} and we'll finish this there.`,
      `That's my cue. I'm headed to ${destination.name}—come find me if this still matters.`,
      `Hold that thought. I have to be at ${destination.name}, but this conversation isn't finished.`,
      `Time's moving. Meet me at ${destination.name}; I'll tell you what I can there.`,
      `I have somewhere I need to be. ${destination.name}. Don't make me repeat the invitation.`,
    ]
    : ['I need to move. We can finish this another time.', 'I cannot stay, but this conversation is not over.'];
  const choices = authored.length ? authored : generic;
  const template = stableDepartureChoice(choices, `${characterId}:${departure.storyMinute}:${departure.activity}`);
  const close = template
    .replaceAll('{destination}', destination?.name ?? 'somewhere else')
    .replaceAll('{activity}', departure.activity)
    .replaceAll('{firstName}', character?.name.split(' ')[0] ?? characterId);
  return `${text.trim()}\n\n${close}`;
}

function stableDepartureChoice(lines: string[], seed: string): string {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  return lines[Math.abs(hash) % lines.length]!;
}

function containsForbiddenStoryFact(definition: StoryDefinition, authorization: StoryDialogueAuthorization, text: string): boolean {
  const normalized = text.toLowerCase();
  for (const fact of definition.evidence.filter((item) => authorization.forbiddenFactIds.includes(item.id))) {
    const tokens = `${fact.title} ${fact.hiddenCanonicalDescription ?? fact.description}`.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 6 && !['vespormoor','evidence','during','through','because','without','should','could','would'].includes(token));
    const matches = [...new Set(tokens)].filter((token) => normalized.includes(token)).length;
    if (matches >= 3) return true;
  }
  return false;
}
