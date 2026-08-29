import type {
  CharacterStoryProfile,
  StoryActionResult,
  StoryCampaignState,
  StoryClaimMode,
  StoryConversationIntent,
  StoryConversationResidue,
  StoryConversationalMove,
  StoryDefinition,
  StoryLocationDefinition,
  StoryResponseShape,
  StoryRequirements,
  StoryRevealRule,
} from './stories.ts';
import { resolveStoryCharacterLocation, resolveStoryDepartureForecast, resolveStoryFollowPlan } from './stories.ts';

export interface StoryDialogueAuthorization {
  characterId: string;
  intent: StoryConversationIntent;
  permittedFactIds: string[];
  permittedBeliefIds: string[];
  permittedLieIds: string[];
  forbiddenFactIds: string[];
  permittedLeadIds: string[];
  permittedActionIds: string[];
}

export interface StructuredStoryDialogue {
  spokenDialogue: string;
  stageDirection?: string;
  referencedFactIds: string[];
  expressedBeliefIds: string[];
  expressedLieIds: string[];
  proposedReactionId?: string;
  proposedLeadId?: string;
  proposedActionIds: string[];
}

export interface StoryProactiveBeat {
  characterId: string;
  title: string;
  body: string;
  tone: 'invitation' | 'pressure' | 'recognition';
}

export interface StorySecondarySpeakerSelection {
  characterId: string;
  reason: 'direct_reference' | 'evidence_relevance' | 'character_reference' | 'new_arrival';
}

export interface StoryDialoguePlan {
  move: StoryConversationalMove;
  responseShape: StoryResponseShape;
  shouldAskQuestion: boolean;
  questionGuidance: string;
  residueToAcknowledge?: StoryConversationResidue;
  groundedObservation: string;
  reasonCodes: string[];
}

export interface StoryDialogueQualityReport {
  acceptable: boolean;
  issues: Array<'generic_question' | 'question_stack' | 'prompt_restatement' | 'repeated_opening' | 'exposition_dump' | 'assistant_tone' | 'puzzle_speak'>;
}

export interface StoryPersistencePolicy {
  id: string;
  onCampaignStart(state: StoryCampaignState): StoryCampaignState;
  onLoopStart(state: StoryCampaignState): StoryCampaignState;
  onActionCommitted(state: StoryCampaignState): StoryCampaignState;
  onLoopReset(before: StoryCampaignState, reset: StoryCampaignState): StoryCampaignState;
  getPersistentState(state: StoryCampaignState): Record<string, unknown>;
  getResettableState(state: StoryCampaignState): Record<string, unknown>;
  buildAdditionalConversationContext(state: StoryCampaignState): string[];
  validateStorySpecificAction(_state: StoryCampaignState, _actionId: string): boolean;
}

const policyRegistry = new Map<string, StoryPersistencePolicy>();

export function registerStoryPersistencePolicy(policy: StoryPersistencePolicy): void {
  if (!policy.id.trim()) throw new Error('story_policy_id_required');
  policyRegistry.set(policy.id, policy);
}

export function storyPersistencePolicy(id = 'knowledge-persists-loop-resets'): StoryPersistencePolicy {
  return policyRegistry.get(id) ?? policyRegistry.get('knowledge-persists-loop-resets')!;
}

const vespormoorPolicy: StoryPersistencePolicy = {
  id: 'knowledge-persists-loop-resets',
  onCampaignStart: (state) => state,
  onLoopStart: (state) => state,
  onActionCommitted: (state) => state,
  onLoopReset: (before, reset) => ({ ...reset, evidenceIds: [...before.evidenceIds], deductionIds: [...before.deductionIds], persistentFlags: [...before.persistentFlags] }),
  getPersistentState: (state) => ({ evidenceIds: state.evidenceIds, deductionIds: state.deductionIds, persistentFlags: state.persistentFlags, loopHistory: state.loopHistory }),
  getResettableState: (state) => ({ loopFlags: state.loopFlags, witnessedEventIds: state.witnessedEventIds, currentMinute: state.currentMinute, characterStates: state.characterStates }),
  buildAdditionalConversationContext: () => ['Player discoveries persist across midnight; ordinary physical and emotional state does not.'],
  validateStorySpecificAction: () => true,
};
registerStoryPersistencePolicy(vespormoorPolicy);

export function resolveCharacterStoryProfile(definition: StoryDefinition, characterId: string): CharacterStoryProfile | null {
  const explicit = definition.characters.find((item) => item.id === characterId)?.storyProfile;
  if (explicit) return explicit;
  if (!definition.knownBaseCharacterIds?.includes(characterId)) return null;
  return {
    characterId,
    participationTier: 'ambient',
    dramaticFunction: 'Local resident',
    currentNightObjective: 'Continue their ordinary evening safely.',
    interactionStyle: 'Natural, concise, and grounded in public knowledge.',
    conversationalStrategy: 'Discuss only public events and atmosphere; admit uncertainty about the mystery.',
    knownFactIds: [],
    revealRules: [],
    initialEmotionalState: 'calm',
    resetBehavior: 'reset',
    crossLoopMemory: 'none',
  };
}

export function resolveLocationStoryProfile(definition: StoryDefinition, locationId: string): StoryLocationDefinition | null {
  const explicit = definition.locations.find((item) => item.id === locationId || item.baseLocationSlug === locationId);
  if (explicit) return explicit;
  if (!definition.knownBaseLocationIds?.includes(locationId)) return null;
  return {
    id: locationId,
    baseLocationSlug: locationId,
    name: titleCase(locationId),
    subtitle: 'An ordinary part of tonight’s Vespormoor',
    description: 'The location follows its canonical Kivelli atmosphere and schedule. No hidden story fact is available here without an authored overlay.',
    travelMinutes: {},
    participation: 'ambient',
    artworkKey: locationId,
    sensoryVocabulary: ['rain-dark stone', 'muted conversation', 'distant bells'],
  };
}

export function classifyStoryConversationIntent(message: string, evidenceId?: string): StoryConversationIntent {
  if (evidenceId) return 'present_evidence';
  const value = message.toLowerCase();
  if (/\b(leave|goodbye|later|done here)\b/.test(value)) return 'leave_conversation';
  if (/\b(accuse|you did|your fault|lying|liar|confess)\b/.test(value)) return 'accuse';
  if (/\b(help|need you|will you|can you stop|work with me)\b/.test(value)) return 'request_help';
  if (/\b(who is|what about|know .*\b(?:elara|celeste|owen|zuri|rafael|marcus|isabella|tomas|seraphine|luca|jun|adrian))\b/.test(value)) return 'ask_about_character';
  if (/\b(prove|wrong|impossible|challenge|doesn'?t add up)\b/.test(value)) return 'challenge';
  if (/\b(trust|believe you|safe|not alone|understand|sorry)\b/.test(value)) return 'reassure';
  if (/\b(look|watch|notice|observe|listen|feel)\b/.test(value)) return 'observe';
  if (/\b(?:bell|loop|reset|token|engine|evidence|clue|mystery|ritual|anchor|observatory|records?|ledger|readings?|lake lights?|missing (?:time|page|name)|what happened|who did|why did|how did|what do you know)\b/.test(value)) return 'probe';
  return 'casual';
}

export function requirementMetForStoryDirector(input: {
  definition: StoryDefinition;
  state: StoryCampaignState;
  requirements?: StoryRequirements;
  characterId: string;
  intent: StoryConversationIntent;
  approachId?: string;
}): boolean {
  const { state, requirements } = input;
  if (!requirements) return true;
  if (requirements.exactLoop !== undefined && state.currentLoop !== requirements.exactLoop) return false;
  if (requirements.minLoop !== undefined && state.currentLoop < requirements.minLoop) return false;
  if (requirements.maxLoop !== undefined && state.currentLoop > requirements.maxLoop) return false;
  if (requirements.locationId && state.currentLocationId !== requirements.locationId) return false;
  if (requirements.evidenceIds?.some((id) => !state.evidenceIds.includes(id))) return false;
  if (requirements.deductionIds?.some((id) => !state.deductionIds.includes(id))) return false;
  if (requirements.inventoryIds?.some((id) => !state.inventoryIds.includes(id))) return false;
  if (requirements.witnessedEventIds?.some((id) => !state.witnessedEventIds.includes(id))) return false;
  if (requirements.flags?.some((flag) => !state.persistentFlags.includes(flag) && !state.loopFlags.includes(flag))) return false;
  if (requirements.anyFlags?.length && !requirements.anyFlags.some((flag) => state.persistentFlags.includes(flag) || state.loopFlags.includes(flag))) return false;
  const characterState = state.characterStates[input.characterId];
  if (requirements.minTrust && Object.entries(requirements.minTrust).some(([id, threshold]) => (state.characterStates[id]?.trust ?? 0) < threshold)) return false;
  if (requirements.maxSuspicion && Object.entries(requirements.maxSuspicion).some(([id, threshold]) => (state.characterStates[id]?.suspicion ?? 0) > threshold)) return false;
  if (requirements.emotionalStates?.length && !requirements.emotionalStates.includes(characterState?.emotionalState ?? 'calm')) return false;
  if (requirements.presentedEvidenceIds?.some((id) => !characterState?.presentedEvidenceIds.includes(id))) return false;
  if (requirements.minMinute !== undefined && state.currentMinute < requirements.minMinute) return false;
  if (requirements.maxMinute !== undefined && state.currentMinute > requirements.maxMinute) return false;
  if (requirements.requiredIntent && requirements.requiredIntent !== input.intent) return false;
  if (requirements.authoredInteractionId && requirements.authoredInteractionId !== input.approachId) return false;
  if (requirements.factNotExhaustedId && characterState?.exhaustedFactIds?.includes(requirements.factNotExhaustedId)) return false;
  if (requirements.characterPresentId) {
    const candidate = input.definition.characters.find((item) => item.id === requirements.characterPresentId);
    const present = candidate?.schedules.some((block) => state.currentMinute >= block.startsAt && state.currentMinute < block.endsAt && block.locationId === state.currentLocationId);
    if (!present) return false;
  }
  return true;
}

export function buildStoryDialogueAuthorization(input: {
  definition: StoryDefinition;
  state: StoryCampaignState;
  characterId: string;
  message: string;
  approachId?: string;
  evidenceId?: string;
}): StoryDialogueAuthorization {
  const profile = resolveCharacterStoryProfile(input.definition, input.characterId);
  const intent = classifyStoryConversationIntent(input.message, input.evidenceId);
  if (!profile || profile.participationTier === 'excluded') return { characterId: input.characterId, intent, permittedFactIds: [], permittedBeliefIds: [], permittedLieIds: [], forbiddenFactIds: input.definition.evidence.map((item) => item.id), permittedLeadIds: [], permittedActionIds: [] };
  const matched = profile.revealRules.filter((rule) => ruleMatches(rule, input, intent));
  const permittedFactIds = unique(matched.filter((rule) => rule.mode === 'fact' && rule.factId && profile.knownFactIds.includes(rule.factId)).map((rule) => rule.factId!)).slice(0, 1);
  const permittedBeliefIds = unique(matched.filter((rule) => rule.mode === 'mistaken_belief' && rule.beliefId && profile.mistakenBeliefs?.some((belief) => belief.id === rule.beliefId)).map((rule) => rule.beliefId!)).slice(0, 1);
  const permittedLieIds = unique(matched.filter((rule) => rule.mode === 'intentional_lie' && rule.lieId && profile.intentionalLies?.some((lie) => lie.id === rule.lieId)).map((rule) => rule.lieId!)).slice(0, 1);
  const publicFacts = (profile.publicFactIds ?? []).filter((id) => input.state.evidenceIds.includes(id));
  for (const id of publicFacts) if (!permittedFactIds.includes(id) && permittedFactIds.length < 1) permittedFactIds.push(id);
  if (input.evidenceId && input.state.evidenceIds.includes(input.evidenceId) && !permittedFactIds.includes(input.evidenceId)) {
    permittedFactIds.splice(0, permittedFactIds.length, input.evidenceId);
  }
  return {
    characterId: input.characterId,
    intent,
    permittedFactIds,
    permittedBeliefIds,
    permittedLieIds,
    forbiddenFactIds: input.definition.evidence.map((item) => item.id).filter((id) => !permittedFactIds.includes(id)),
    permittedLeadIds: input.definition.dialogueApproaches.filter((item) => item.characterId === input.characterId
      && item.id !== input.approachId
      && !input.state.characterStates[input.characterId]?.usedTopicIds?.includes(item.id)
      && requirementMetForStoryDirector({ definition: input.definition, state: input.state, ...(item.requirements ? { requirements: item.requirements } : {}), characterId: input.characterId, intent, ...(input.approachId ? { approachId: input.approachId } : {}) }))
      .map((item) => item.id),
    permittedActionIds: input.definition.interactions.filter((item) => item.locationId === input.state.currentLocationId
      && (item.repeatable !== false || !input.state.loopFlags.includes(`interaction:${item.id}:completed`))
      && requirementMetForStoryDirector({ definition: input.definition, state: input.state, ...(item.requirements ? { requirements: item.requirements } : {}), characterId: input.characterId, intent, ...(input.approachId ? { approachId: input.approachId } : {}) }))
      .map((item) => item.id),
  };
}

export function planStoryDialogue(input: {
  definition: StoryDefinition;
  state: StoryCampaignState;
  characterId: string;
  intent: StoryConversationIntent;
  userMessage: string;
  reactiveOnly?: boolean;
  reactionToCharacterName?: string;
}): StoryDialoguePlan {
  const profile = resolveCharacterStoryProfile(input.definition, input.characterId);
  const characterState = input.state.characterStates[input.characterId];
  const emotionalState = characterState?.emotionalState ?? profile?.initialEmotionalState ?? 'calm';
  const priorMoves = characterState?.continuity?.recentMoves ?? [];
  const residue = characterState?.continuity?.residue?.[0];
  let move: StoryConversationalMove;
  const reasonCodes: string[] = [];
  if (input.reactiveOnly) {
    move = emotionalState === 'hostile' || input.intent === 'accuse' ? 'challenge' : stableChoice(['interrupt', 'correct', 'tease'], `${input.characterId}:${input.userMessage}`);
    reasonCodes.push('live_scene_reaction');
  } else if (input.intent === 'accuse') {
    move = (characterState?.suspicion ?? 0) >= 60 ? 'deflect' : 'challenge'; reasonCodes.push('accusation');
  } else if (input.intent === 'reassure') {
    move = ['guarded', 'frightened'].includes(emotionalState) ? 'confide' : 'reassure'; reasonCodes.push('emotional_reassurance');
  } else if (input.intent === 'request_help') {
    move = (characterState?.trust ?? 0) >= 45 ? 'answer' : 'challenge'; reasonCodes.push('request_for_help');
  } else if (input.intent === 'present_evidence') {
    move = 'correct'; reasonCodes.push('evidence_changes_frame');
  } else if (input.intent === 'challenge') {
    move = stableChoice(['answer', 'challenge', 'correct'], `${input.characterId}:${characterState?.conversationCount ?? 0}`); reasonCodes.push('claim_challenged');
  } else if (input.intent === 'ask_about_character') {
    move = (characterState?.trust ?? 0) >= 55 ? 'answer' : 'deflect'; reasonCodes.push('third_party_discretion');
  } else if (input.intent === 'casual') {
    move = stableChoice(['answer', 'tease', 'ask'], `${input.characterId}:casual:${input.userMessage}:${characterState?.conversationCount ?? 0}`);
    reasonCodes.push('ordinary_conversation');
  } else if (residue?.kind === 'question' && substantiallyAnswers(input.userMessage, residue.summary)) {
    move = 'answer'; reasonCodes.push('open_thread_answered');
  } else {
    move = stableChoice(['answer', 'ask', 'redirect', 'confide'], `${input.characterId}:${input.userMessage}:${characterState?.conversationCount ?? 0}`);
    reasonCodes.push('natural_floor_choice');
  }
  if (priorMoves.length >= 2 && priorMoves.slice(-2).every((item) => item === move)) {
    move = move === 'answer' ? 'ask' : 'answer';
    reasonCodes.push('anti_repetition');
  }
  const fingerprint = profile?.speechFingerprint;
  const availableShapes = fingerprint?.responseShapes?.length ? fingerprint.responseShapes : ['concise', 'layered', 'emotion_first'] satisfies StoryResponseShape[];
  let responseShape = stableChoice(availableShapes, `${input.characterId}:${input.userMessage}:${move}`);
  if (emotionalState === 'frightened') responseShape = 'hesitant';
  else if (move === 'correct') responseShape = 'corrective';
  else if (move === 'confide') responseShape = 'emotion_first';
  const hasOpenQuestion = Boolean(characterState?.continuity?.openThreads.length);
  const shouldAskQuestion = !input.reactiveOnly && !hasOpenQuestion && ['ask', 'confide', 'challenge'].includes(move) && (characterState?.conversationCount ?? 0) % 3 !== 2;
  const location = input.definition.locations.find((item) => item.id === input.state.currentLocationId);
  const palette = location?.sensoryVocabulary ?? [];
  const groundedObservation = palette.length
    ? stableChoice(palette, `${input.characterId}:${input.state.currentMinute}`)
    : location?.description.slice(0, 160) ?? 'the immediate room';
  return {
    move,
    responseShape,
    shouldAskQuestion,
    questionGuidance: shouldAskQuestion
      ? input.intent === 'casual'
        ? 'Ask one natural, reciprocal question about the person or immediate conversation. Do not turn it into an investigation prompt.'
        : (fingerprint?.questionStyle ?? 'Ask one specific question whose answer could change what the character does next.')
      : 'Do not append a question merely to keep the user talking.',
    ...(residue ? { residueToAcknowledge: residue } : {}),
    groundedObservation,
    reasonCodes,
  };
}

export function evaluateStoryDialogueQuality(input: { text: string; userMessage: string; recentCharacterMessages: string[]; intent?: StoryConversationIntent }): StoryDialogueQualityReport {
  const text = input.text.trim();
  const normalized = text.toLowerCase();
  const issues: StoryDialogueQualityReport['issues'] = [];
  const questionCount = (text.match(/\?/g) ?? []).length;
  if (/\b(?:what do you think|how does that make you feel|tell me more about that)\b/i.test(text)) issues.push('generic_question');
  if (questionCount > 1) issues.push('question_stack');
  const promptOpening = input.userMessage.toLowerCase().split(/\s+/).slice(0, 5).join(' ');
  if (promptOpening.length > 16 && normalized.startsWith(promptOpening)) issues.push('prompt_restatement');
  const opening = normalized.split(/\s+/).slice(0, 5).join(' ');
  if (opening.length > 12 && input.recentCharacterMessages.slice(-4).some((message) => message.toLowerCase().split(/\s+/).slice(0, 5).join(' ') === opening)) issues.push('repeated_opening');
  if (text.split(/\s+/).length > 88 && (text.match(/[.!?]/g) ?? []).length >= 5) issues.push('exposition_dump');
  if (/\b(?:as an ai|i can help you|how may i assist|i understand your concern)\b/i.test(text)) issues.push('assistant_tone');
  if (input.intent === 'casual' && /\b(?:the pattern|doesn'?t fit|could not have happened|what did you (?:actually )?witness|what felt wrong|detail(?:s)? (?:I|we|you) can (?:trust|prove|verify)|start with the (?:thing|part)|right pieces|wrong order)\b/i.test(text)) issues.push('puzzle_speak');
  return { acceptable: !issues.some((issue) => ['assistant_tone', 'question_stack', 'repeated_opening', 'puzzle_speak'].includes(issue)), issues: unique(issues) };
}

export function repairStoryDialogueStyle(text: string, report: StoryDialogueQualityReport): string {
  let value = text.trim();
  if (report.issues.includes('assistant_tone') || report.issues.includes('puzzle_speak')) return '';
  if (report.issues.includes('generic_question')) {
    value = value.replace(/(?:^|\s+)(?:What do you think|How does that make you feel|Tell me more about that)\??/gi, '').trim();
  }
  if (report.issues.includes('question_stack')) {
    const firstQuestion = value.indexOf('?');
    if (firstQuestion >= 0) value = value.slice(0, firstQuestion + 1).trim();
  }
  if (report.issues.includes('repeated_opening')) {
    const firstSentenceEnd = value.search(/[.!?]/);
    const remainder = firstSentenceEnd >= 0 ? value.slice(firstSentenceEnd + 1).trim() : '';
    if (remainder.split(/\s+/).length >= 5) value = remainder;
  }
  if (report.issues.includes('exposition_dump')) {
    const sentences = value.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [value];
    value = sentences.slice(0, 4).join(' ').replace(/\s+/g, ' ').trim();
  }
  return value;
}

function ruleMatches(rule: StoryRevealRule, input: { definition: StoryDefinition; state: StoryCampaignState; characterId: string; message: string; approachId?: string }, intent: StoryConversationIntent): boolean {
  if (rule.allowedIntents?.length && !rule.allowedIntents.includes(intent)) return false;
  if (rule.approachIds?.length && (!input.approachId || !rule.approachIds.includes(input.approachId))) return false;
  if (!rule.approachIds?.length && rule.intentTerms?.length && !rule.intentTerms.some((term) => input.message.toLowerCase().includes(term.toLowerCase()))) return false;
  if (rule.mutuallyExclusiveBranch) {
    const [group] = rule.mutuallyExclusiveBranch.split(':', 1);
    const prefix = `branch:${group}:`;
    const selected = [...input.state.persistentFlags, ...input.state.loopFlags].find((flag) => flag.startsWith(prefix));
    if (selected && selected !== `branch:${rule.mutuallyExclusiveBranch}`) return false;
  }
  return requirementMetForStoryDirector({
    definition: input.definition,
    state: input.state,
    ...(rule.requirements ? { requirements: rule.requirements } : {}),
    characterId: input.characterId,
    intent,
    ...(input.approachId ? { approachId: input.approachId } : {}),
  });
}

export function parseStructuredStoryDialogue(value: string): StructuredStoryDialogue | null {
  try {
    const source = value.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    const row = JSON.parse(source) as Record<string, unknown>;
    if (typeof row['spokenDialogue'] !== 'string' || !row['spokenDialogue'].trim()) return null;
    return {
      spokenDialogue: row['spokenDialogue'].trim(),
      ...(typeof row['stageDirection'] === 'string' && row['stageDirection'].trim() ? { stageDirection: row['stageDirection'].trim() } : {}),
      referencedFactIds: strings(row['referencedFactIds']),
      expressedBeliefIds: strings(row['expressedBeliefIds']),
      expressedLieIds: strings(row['expressedLieIds']),
      ...(typeof row['proposedReactionId'] === 'string' ? { proposedReactionId: row['proposedReactionId'] } : {}),
      ...(typeof row['proposedLeadId'] === 'string' ? { proposedLeadId: row['proposedLeadId'] } : {}),
      proposedActionIds: strings(row['proposedActionIds']),
    };
  } catch { return null; }
}

export function validateStructuredStoryDialogue(input: { definition: StoryDefinition; authorization: StoryDialogueAuthorization; result: StructuredStoryDialogue }): { valid: boolean; rejectedIds: string[]; sanitized: StructuredStoryDialogue } {
  const rejectedIds = [
    ...input.result.referencedFactIds.filter((id) => !input.authorization.permittedFactIds.includes(id)),
    ...input.result.expressedBeliefIds.filter((id) => !input.authorization.permittedBeliefIds.includes(id)),
    ...input.result.expressedLieIds.filter((id) => !input.authorization.permittedLieIds.includes(id)),
    ...input.result.proposedActionIds.filter((id) => !input.authorization.permittedActionIds.includes(id)),
    ...(input.result.proposedLeadId && !input.authorization.permittedLeadIds.includes(input.result.proposedLeadId) ? [input.result.proposedLeadId] : []),
  ];
  const wordCount = input.result.spokenDialogue.trim().split(/\s+/).length;
  const validText = wordCount >= 3 && wordCount <= 110 && input.result.spokenDialogue.length <= 1200;
  const proposedLeadId = input.result.proposedLeadId && input.authorization.permittedLeadIds.includes(input.result.proposedLeadId)
    ? input.result.proposedLeadId
    : null;
  const sanitized: StructuredStoryDialogue = {
    ...input.result,
    referencedFactIds: input.result.referencedFactIds.filter((id) => input.authorization.permittedFactIds.includes(id)),
    expressedBeliefIds: input.result.expressedBeliefIds.filter((id) => input.authorization.permittedBeliefIds.includes(id)),
    expressedLieIds: input.result.expressedLieIds.filter((id) => input.authorization.permittedLieIds.includes(id)),
    proposedActionIds: input.result.proposedActionIds.filter((id) => input.authorization.permittedActionIds.includes(id)),
    ...(proposedLeadId ? { proposedLeadId } : {}),
  };
  if (!proposedLeadId) delete sanitized.proposedLeadId;
  return { valid: validText && rejectedIds.length === 0, rejectedIds: unique(rejectedIds), sanitized };
}

export function applyValidatedStoryReaction(definition: StoryDefinition, result: StoryActionResult, characterId: string, reactionId?: string): StoryActionResult {
  if (!reactionId) return result;
  const profile = resolveCharacterStoryProfile(definition, characterId);
  const transition = profile?.emotionalTransitions?.find((item) => item.id === reactionId && item.from.includes(result.state.characterStates[characterId]?.emotionalState ?? 'calm'));
  if (!transition) return result;
  const next = structuredClone(result);
  next.state.characterStates[characterId] = { ...next.state.characterStates[characterId]!, emotionalState: transition.to };
  return next;
}

/** Records bounded conversational continuity after validated dialogue has been generated. */
export function applyStoryConversationContinuity(input: {
  result: StoryActionResult;
  characterId: string;
  userMessage: string;
  characterReply: string;
  intent: StoryConversationIntent;
  move?: StoryConversationalMove;
}): StoryActionResult {
  const next = structuredClone(input.result);
  const state = next.state.characterStates[input.characterId];
  if (!state) return next;
  const prior = state.continuity ?? { recentExchangeSummaries: [], openThreads: [] };
  const retainedPrior = { ...prior };
  delete retainedPrior.pendingResumeCue;
  const player = excerpt(input.userMessage, 180);
  const reply = excerpt(input.characterReply, 220);
  const summary = `Player (${input.intent}): “${player}” ${input.characterId}: “${reply}”`;
  const priorThreads = prior.openThreads.filter((thread) => !substantiallyAnswers(input.userMessage, thread));
  const newQuestion = lastQuestion(input.characterReply);
  const residue = deriveResidue(input, state.conversationCount);
  next.state.characterStates[input.characterId] = {
    ...state,
    continuity: {
      ...retainedPrior,
      lastIntent: input.intent,
      lastPlayerMessage: player,
      lastCharacterReply: reply,
      recentExchangeSummaries: [...prior.recentExchangeSummaries, summary].slice(-6),
      openThreads: [...priorThreads, ...(newQuestion ? [newQuestion] : [])].slice(-4),
      recentMoves: [...(prior.recentMoves ?? []), ...(input.move ? [input.move] : [])].slice(-6),
      residue: [...(prior.residue ?? []).filter((item) => !substantiallyAnswers(input.userMessage, item.summary)), ...residue].slice(-6),
    },
  };
  return next;
}

/** Records only what two co-present characters actually said; it never changes player relationships. */
export function applyStoryCharacterExchangeContinuity(input: {
  result: StoryActionResult;
  primaryCharacterId: string;
  primaryName: string;
  primaryReply: string;
  secondaryCharacterId: string;
  secondaryName: string;
  secondaryReply: string;
  secondaryMove: StoryConversationalMove;
}): StoryActionResult {
  const next = structuredClone(input.result);
  const primary = next.state.characterStates[input.primaryCharacterId];
  const secondary = next.state.characterStates[input.secondaryCharacterId];
  if (!primary || !secondary) return next;
  const primaryContinuity = primary.continuity ?? { recentExchangeSummaries: [], openThreads: [] };
  const secondaryContinuity = secondary.continuity ?? { recentExchangeSummaries: [], openThreads: [] };
  const exchange = `${input.primaryName}: “${excerpt(input.primaryReply, 150)}” ${input.secondaryName}: “${excerpt(input.secondaryReply, 170)}”`;
  const residueKind: StoryConversationResidue['kind'] = input.secondaryMove === 'tease'
    ? 'joke'
    : ['challenge', 'correct', 'interrupt'].includes(input.secondaryMove)
      ? 'correction'
      : 'awkwardness';
  const sharedResidue: StoryConversationResidue = { kind: residueKind, summary: excerpt(exchange, 220), createdAtTurn: primary.conversationCount };
  next.state.characterStates[input.primaryCharacterId] = {
    ...primary,
    continuity: {
      ...primaryContinuity,
      recentExchangeSummaries: [...primaryContinuity.recentExchangeSummaries, exchange].slice(-6),
      openThreads: primaryContinuity.openThreads.slice(-4),
      recentMoves: (primaryContinuity.recentMoves ?? []).slice(-6),
      residue: [...(primaryContinuity.residue ?? []), sharedResidue].slice(-6),
    },
  };
  next.state.characterStates[input.secondaryCharacterId] = {
    ...secondary,
    conversationCount: secondary.conversationCount + 1,
    continuity: {
      ...secondaryContinuity,
      recentExchangeSummaries: [...secondaryContinuity.recentExchangeSummaries, exchange].slice(-6),
      openThreads: secondaryContinuity.openThreads.slice(-4),
      recentMoves: [...(secondaryContinuity.recentMoves ?? []), input.secondaryMove].slice(-6),
      residue: [...(secondaryContinuity.residue ?? []), sharedResidue].slice(-6),
    },
  };
  return next;
}

/** Selects at most one authored character initiative for the current scene. */
export function resolveStoryProactiveBeat(input: {
  definition: StoryDefinition;
  state: StoryCampaignState;
  presentCharacterIds: string[];
}): StoryProactiveBeat | null {
  for (const characterId of input.presentCharacterIds) {
    const character = input.definition.characters.find((item) => item.id === characterId);
    const profile = resolveCharacterStoryProfile(input.definition, characterId);
    if (!character || !profile || !['core', 'supporting'].includes(profile.participationTier)) continue;
    const state = input.state.characterStates[characterId];
    if ((state?.conversationCount ?? 0) === 0) {
      const body = profile.proactiveBeats?.[0] ?? profile.authoredOpeningBeats?.[0];
      if (body) return { characterId, title: `${character.name} catches your attention`, body, tone: 'invitation' };
    }
    if ((state?.emotionalState === 'hostile' || (state?.suspicion ?? 0) >= 65) && profile.authoredConfrontationBeats?.length) {
      const body = profile.authoredConfrontationBeats[(state?.conversationCount ?? 0) % profile.authoredConfrontationBeats.length]!;
      return { characterId, title: `${character.name} will not let it pass`, body, tone: 'pressure' };
    }
    if (input.state.currentLoop > 0 && profile.crossLoopMemory !== 'none' && profile.authoredRecognitionMoments?.length && (state?.conversationCount ?? 0) === 0) {
      return { characterId, title: `${character.name} seems to recognize you`, body: profile.authoredRecognitionMoments[0]!, tone: 'recognition' };
    }
  }
  return null;
}

/** Conservative scene-floor routing: silence is preferred unless a second person is genuinely implicated. */
export function selectStorySecondarySpeaker(input: {
  definition: StoryDefinition;
  state: StoryCampaignState;
  primaryCharacterId: string;
  presentCharacterIds: string[];
  userMessage: string;
  primaryReply: string;
  evidenceId?: string;
  newlyArrivedCharacterIds?: string[];
}): StorySecondarySpeakerSelection | null {
  const normalizedUser = input.userMessage.toLowerCase();
  const normalizedReply = input.primaryReply.toLowerCase();
  const evidence = input.evidenceId ? input.definition.evidence.find((item) => item.id === input.evidenceId) : undefined;
  type Candidate = { characterId: string; score: number; reason: StorySecondarySpeakerSelection['reason'] };
  let best: Candidate | null = null;
  for (const characterId of input.presentCharacterIds) {
    if (characterId === input.primaryCharacterId) continue;
    const character = input.definition.characters.find((item) => item.id === characterId);
    const profile = resolveCharacterStoryProfile(input.definition, characterId);
    if (!character || !profile || !['core', 'supporting'].includes(profile.participationTier)) continue;
    const nameTokens = character.name.toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length > 2 && !['doctor', 'professor'].includes(part));
    const names = [character.name.toLowerCase(), ...nameTokens];
    let candidate: Candidate | null = null;
    if (names.some((name) => name.length > 2 && normalizedUser.includes(name))) candidate = { characterId, score: 100, reason: 'direct_reference' };
    else if (evidence?.relatedCharacterIds.includes(characterId)) candidate = { characterId, score: 70, reason: 'evidence_relevance' };
    else if (names.some((name) => name.length > 2 && normalizedReply.includes(name))) candidate = { characterId, score: 45, reason: 'character_reference' };
    else if (input.newlyArrivedCharacterIds?.includes(characterId) && /\b(?:everyone|anyone|all of you|you all|either of you)\b/i.test(input.userMessage)) candidate = { characterId, score: 35, reason: 'new_arrival' };
    if (candidate && (!best || candidate.score > best.score)) best = candidate;
  }
  return best ? { characterId: best.characterId, reason: best.reason } : null;
}

export function storyDirectorInspector(definition: StoryDefinition, state: StoryCampaignState, characterId?: string): Record<string, unknown> {
  const profile = characterId ? resolveCharacterStoryProfile(definition, characterId) : null;
  const authorization = characterId ? buildStoryDialogueAuthorization({ definition, state, characterId, message: 'inspect current state' }) : null;
  const character = characterId ? definition.characters.find((item) => item.id === characterId) : null;
  const schedule = characterId ? resolveStoryCharacterLocation(definition, state, characterId) : null;
  const forecast = characterId ? resolveStoryDepartureForecast(definition, state, characterId, 30) : null;
  const followPlan = characterId ? resolveStoryFollowPlan(definition, state, characterId) : null;
  const scheduleEvaluation = character?.schedules.map((block) => ({ locationId: block.locationId, startsAt: block.startsAt, endsAt: block.endsAt, activity: block.activity, priority: block.priority ?? 0, inTimeWindow: state.currentMinute >= block.startsAt && state.currentMinute < block.endsAt, selected: schedule === block })) ?? [];
  return { storySlug: definition.slug, contentVersion: definition.version ?? 1, persistencePolicy: definition.persistencePolicy ?? 'knowledge-persists-loop-resets', loop: state.currentLoop, currentMinute: state.currentMinute, locationId: state.currentLocationId, characterId: characterId ?? null, resolvedPresence: schedule ? { locationId: schedule.locationId, activity: schedule.activity } : null, departureForecast: forecast, followPlan, scheduleEvaluation, pendingResumeCue: characterId ? state.characterStates[characterId]?.continuity?.pendingResumeCue ?? null : null, emotionalState: characterId ? state.characterStates[characterId]?.emotionalState ?? null : null, participationTier: profile?.participationTier ?? null, knownFactIds: profile?.knownFactIds ?? [], mistakenBeliefIds: profile?.mistakenBeliefs?.map((item) => item.id) ?? [], intentionalLieIds: profile?.intentionalLies?.map((item) => item.id) ?? [], permittedFactIds: authorization?.permittedFactIds ?? [], lockedFactIds: authorization?.forbiddenFactIds ?? [], availableActionIds: authorization?.permittedActionIds ?? [], persistentState: storyPersistencePolicy(definition.persistencePolicy).getPersistentState(state), resettableState: storyPersistencePolicy(definition.persistencePolicy).getResettableState(state) };
}

function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function unique<T>(items: T[]): T[] { return [...new Set(items)]; }
function titleCase(value: string): string { return value.split('-').map((part) => part ? part[0]!.toUpperCase() + part.slice(1) : part).join(' '); }
export function storyClaimModeLabel(mode: StoryClaimMode): string { return mode === 'fact' ? 'KNOWN FACT' : mode === 'mistaken_belief' ? 'BELIEF — MAY BE FALSE' : 'AUTHORIZED LIE'; }
function excerpt(value: string, limit: number): string { const compact = value.replace(/\s+/g, ' ').trim(); return compact.length <= limit ? compact : `${compact.slice(0, Math.max(1, limit - 1)).trimEnd()}…`; }
function lastQuestion(value: string): string | null { const matches = value.match(/[^?]{3,}\?/g); return matches?.length ? excerpt(matches[matches.length - 1]!, 160) : null; }
function substantiallyAnswers(message: string, thread: string): boolean {
  const words = new Set(message.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 5));
  return thread.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 5).some((word) => words.has(word));
}
function stableChoice<T>(items: readonly T[], seed: string): T {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  return items[Math.abs(hash) % items.length]!;
}
function deriveResidue(input: { userMessage: string; characterReply: string; intent: StoryConversationIntent; move?: StoryConversationalMove }, turn: number): StoryConversationResidue[] {
  const rows: StoryConversationResidue[] = [];
  if (input.intent === 'accuse') rows.push({ kind: 'accusation', summary: excerpt(input.userMessage, 140), createdAtTurn: turn });
  if (input.move === 'deflect' || input.move === 'redirect') rows.push({ kind: 'avoidance', summary: excerpt(input.userMessage, 140), createdAtTurn: turn });
  if (input.move === 'tease') rows.push({ kind: 'joke', summary: excerpt(input.characterReply, 140), createdAtTurn: turn });
  if (/\b(?:wait|no,? that|what i mean|rather)\b/i.test(input.characterReply)) rows.push({ kind: 'correction', summary: excerpt(input.characterReply, 140), createdAtTurn: turn });
  if (/\bI(?:'ll| will)\b/i.test(input.characterReply)) rows.push({ kind: 'promise', summary: excerpt(input.characterReply, 140), createdAtTurn: turn });
  const question = lastQuestion(input.characterReply);
  if (question) rows.push({ kind: 'question', summary: question, createdAtTurn: turn });
  const priority: Record<StoryConversationResidue['kind'], number> = { accusation: 100, question: 90, promise: 80, avoidance: 70, correction: 60, awkwardness: 50, joke: 40 };
  return rows.sort((left, right) => priority[right.kind] - priority[left.kind]).slice(0, 2);
}
