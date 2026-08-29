import { buildStoryDialogueAuthorization, storyPersistencePolicy } from './story-director.ts';

export const STORY_LOOP_START_MINUTE = 20 * 60 + 40;
export const STORY_LOOP_END_MINUTE = 24 * 60;
export const STORY_DIALOGUE_MINUTES = 2;

export type StoryCampaignStatus = 'active' | 'midnight' | 'completed' | 'abandoned';
export type StoryEvidenceKind = 'critical' | 'character_truth' | 'atmosphere';
export type StoryEvidenceDiscoverySource = 'conversation' | 'investigation' | 'witnessed_event' | 'system';
export type StoryActionKind = 'travel' | 'follow' | 'absence' | 'investigate' | 'conversation' | 'present_evidence' | 'wait' | 'reset' | 'finale';
export type StoryParticipationTier = 'core' | 'supporting' | 'ambient' | 'excluded';
export type StoryEmotionalState = 'calm' | 'guarded' | 'curious' | 'frightened' | 'convinced' | 'hostile' | 'desperate' | 'resigned' | (string & { readonly __storyEmotionalState?: never });
export type StoryClaimMode = 'fact' | 'mistaken_belief' | 'intentional_lie';
export type StoryConversationIntent = 'casual' | 'probe' | 'reassure' | 'challenge' | 'observe' | 'present_evidence' | 'ask_about_character' | 'request_help' | 'accuse' | 'leave_conversation';
export type StoryRelationshipSignal = 'reassured' | 'shared_evidence' | 'challenged' | 'accused' | 'asked_for_help' | 'observed' | 'neutral';
export type StoryConversationalMove = 'answer' | 'deflect' | 'tease' | 'challenge' | 'reassure' | 'confide' | 'ask' | 'interrupt' | 'redirect' | 'correct';
export type StoryResponseShape = 'concise' | 'hesitant' | 'layered' | 'corrective' | 'question_led' | 'emotion_first';

export interface StoryTheme {
  accent: string;
  accentSecondary?: string;
  evidenceAccent?: string;
  danger?: string;
  displayFont?: 'serif' | 'sans';
  borderTreatment?: string;
  sceneOverlay?: string;
  navigationOrnament?: string;
}

export interface StoryLocationDefinition {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  travelMinutes: Record<string, number>;
  unlock?: StoryRequirements;
  baseLocationSlug?: string;
  participation?: 'core' | 'supporting' | 'ambient';
  artworkKey?: string;
  openingMinute?: number;
  closingMinute?: number;
  arrivalNarration?: string;
  lateNightNarration?: string;
  alteredNarration?: string;
  sensoryVocabulary?: string[];
  environmentalStates?: StoryLocationStateDefinition[];
}

export interface StoryLocationStateDefinition {
  id: string;
  title: string;
  narration: string;
  requirements?: StoryRequirements;
}

export interface StoryCharacterScheduleBlock {
  locationId: string;
  startsAt: number;
  endsAt: number;
  activity: string;
  /** Higher-priority authored branches override the canonical block when their requirements pass. */
  priority?: number;
  requirements?: StoryRequirements;
}

export type StoryPresenceTransitionType = 'arrived' | 'departed';
export type StoryPresenceTransitionReason = 'schedule' | 'story_branch' | 'loop_reset';

export interface StoryPresenceTransition {
  type: StoryPresenceTransitionType;
  characterId: string;
  originLocationId: string | null;
  destinationLocationId: string | null;
  storyMinute: number;
  activity: string;
  witnessed: boolean;
  reason: StoryPresenceTransitionReason;
}

export interface StoryPresenceForecast {
  characterId: string;
  originLocationId: string;
  destinationLocationId: string | null;
  departureMinute: number;
  minutesUntil: number;
  activity: string;
}

export interface StoryFollowPlan {
  characterId: string;
  targetLocationId: string;
  travelMinutes: number;
  arrivalMinute: number;
  catchable: boolean;
  mayMoveBeforeArrival: boolean;
}

export interface StoryFollowOutcome {
  characterId: string;
  attemptedLocationId: string;
  actualLocationId: string | null;
  caught: boolean;
  rerouted: boolean;
  travelMinutes: number;
  trace: string;
  resumedThread: string | null;
}

export type StoryAbsenceChoice = 'wait' | 'leave_note' | 'ask_nearby';

export interface StoryAbsenceOutcome {
  characterId: string;
  choice: StoryAbsenceChoice;
  content: string;
  witnessCharacterId: string | null;
  targetLocationId: string | null;
}

export interface StoryCharacterDefinition {
  id: string;
  name: string;
  role: string;
  portraitSlug: string;
  biography: string;
  baselineTrust: number;
  baselineSuspicion: number;
  schedules: StoryCharacterScheduleBlock[];
  persistentTrustPerLoop?: number;
  participationTier?: StoryParticipationTier;
  publicRole?: string;
  publicBiography?: string;
  storyProfile?: CharacterStoryProfile;
}

export interface StoryBeliefDefinition {
  id: string;
  statement: string;
  relatedFactIds?: string[];
  exhaustedAfterUse?: boolean;
}

export interface StoryRevealRule {
  id: string;
  factId?: string;
  beliefId?: string;
  lieId?: string;
  mode: StoryClaimMode;
  requirements?: StoryRequirements;
  intentTerms?: string[];
  allowedIntents?: StoryConversationIntent[];
  approachIds?: string[];
  willingness?: 'open' | 'cautious' | 'reluctant';
  mutuallyExclusiveBranch?: string;
}

export interface StoryEmotionalTransition {
  id: string;
  from: StoryEmotionalState[];
  to: StoryEmotionalState;
  trigger: 'trust_gain' | 'suspicion_gain' | 'evidence_presented' | 'fact_revealed' | 'challenge' | 'reassure' | 'authored_action';
  requirements?: StoryRequirements;
}

export interface CharacterStoryProfile {
  characterId: string;
  participationTier: StoryParticipationTier;
  dramaticFunction: string;
  currentNightObjective: string;
  secondaryObjective?: string;
  fear?: string;
  leverage?: string;
  interactionStyle: string;
  conversationalStrategy: string;
  storyVoiceAdditions?: string[];
  physicalMannerisms?: string[];
  publicFactIds?: string[];
  knownFactIds: string[];
  mistakenBeliefs?: StoryBeliefDefinition[];
  intentionalLies?: StoryBeliefDefinition[];
  forbiddenTopics?: string[];
  revealRules: StoryRevealRule[];
  initialEmotionalState?: StoryEmotionalState;
  emotionalTransitions?: StoryEmotionalTransition[];
  authoredOpeningBeats?: string[];
  authoredRecognitionMoments?: string[];
  authoredConfrontationBeats?: string[];
  alterableEventIds?: string[];
  endingIds?: string[];
  resetBehavior?: 'reset' | 'preserve' | 'policy';
  crossLoopMemory?: 'none' | 'faint_recognition' | 'full';
  /** Optional dramatic pressure used by the Story Director; never exposed as game state. */
  pressure?: string;
  /** How the character presently frames the player before the conversation changes it. */
  playerStance?: string;
  /** Authored, non-forcing openings the character may initiate when the scene warrants it. */
  proactiveBeats?: string[];
  /** The condition under which the character stops pressing their present agenda. */
  agendaExitCondition?: string;
  speechFingerprint?: StorySpeechFingerprint;
  /** Optional authored exit variants. Use {destination}, {activity}, and {firstName} placeholders. */
  departureLines?: string[];
}

export interface StorySpeechFingerprint {
  cadence: string;
  sentenceLength: 'short' | 'mixed' | 'long';
  contractions: 'frequent' | 'natural' | 'rare';
  humor: string;
  hesitation: string;
  directness: string;
  questionStyle: string;
  vocabulary: string[];
  emotionalTells: string[];
  avoids: string[];
  responseShapes: StoryResponseShape[];
  /** Style samples only. They must not contain undiscovered canonical facts. */
  voiceExamples: string[];
}

export interface StoryEvidenceDefinition {
  id: string;
  title: string;
  description: string;
  source: string;
  relatedCharacterIds: string[];
  relatedLocationIds: string[];
  trackId?: string;
  kind: StoryEvidenceKind;
  corroborates?: string[];
  contradicts?: string[];
  artworkKey?: string;
  hiddenCanonicalDescription?: string;
  critical?: boolean;
  prerequisiteFactIds?: string[];
  discoverySources?: string[];
  persistsBetweenLoops?: boolean;
  changesScheduleOrInteractions?: boolean;
  exhaustedAfterDisclosure?: boolean;
  /** Character truths default to conversation-only. Other evidence defaults to any validated source. */
  discoveryModes?: StoryEvidenceDiscoverySource[];
}

export function storyEvidenceCanBeDiscoveredBy(item: StoryEvidenceDefinition, source: StoryEvidenceDiscoverySource): boolean {
  const modes = item.discoveryModes ?? (item.kind === 'character_truth' ? ['conversation'] : ['conversation', 'investigation', 'witnessed_event', 'system']);
  return modes.includes(source);
}

/** Explicit client projection. Hidden canon and authoring-only gates never cross the API boundary. */
export function storyEvidenceClientView(item: StoryEvidenceDefinition): {
  id: string; title: string; description: string; source: string; category: StoryEvidenceKind;
  relatedCharacterIds: string[]; relatedLocationIds: string[]; trackId?: string;
  corroborates?: string[]; contradicts?: string[];
} {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    source: item.source,
    category: item.kind,
    relatedCharacterIds: [...item.relatedCharacterIds],
    relatedLocationIds: [...item.relatedLocationIds],
    ...(item.trackId ? { trackId: item.trackId } : {}),
    ...(item.corroborates ? { corroborates: [...item.corroborates] } : {}),
    ...(item.contradicts ? { contradicts: [...item.contradicts] } : {}),
  };
}

export interface StoryDeductionDefinition {
  id: string;
  title: string;
  description: string;
  /** Player-facing question while this line of inquiry is unresolved. */
  question?: string;
  /** Non-spoiler direction shown before the deduction is complete. */
  objective?: string;
  requiredEvidenceIds: string[];
  unlocks: string[];
}

export interface StoryTimedEventDefinition {
  id: string;
  title: string;
  minute: number;
  locationId: string;
  description: string;
  discoverEvidenceId?: string;
  changedByFlag?: string;
}

export interface StoryInteractionDefinition {
  id: string;
  title: string;
  description: string;
  locationId: string;
  timeCost: number;
  discoverEvidenceIds: string[];
  setFlags?: string[];
  requirements?: StoryRequirements;
  trustDelta?: number;
  suspicionDelta?: number;
  eventImpactFlags?: string[];
  repeatable?: boolean;
  persistsBetweenLoops?: boolean;
  authoredNarration?: string;
}

export interface StoryDialogueApproachDefinition {
  id: string;
  characterId: string;
  label: string;
  promptIntent: string;
  timeCost: number;
  discoverEvidenceIds: string[];
  trustDelta?: number;
  suspicionDelta?: number;
  setFlags?: string[];
  requirements?: StoryRequirements;
}

export interface StoryEndingDefinition {
  id: string;
  title: string;
  description: string;
  epilogue: string;
  requirements: StoryRequirements;
}

export interface StoryRequirements {
  exactLoop?: number;
  minLoop?: number;
  maxLoop?: number;
  locationId?: string;
  evidenceIds?: string[];
  deductionIds?: string[];
  flags?: string[];
  anyFlags?: string[];
  characterPresentId?: string;
  minTrust?: Record<string, number>;
  maxSuspicion?: Record<string, number>;
  inventoryIds?: string[];
  presentedEvidenceIds?: string[];
  witnessedEventIds?: string[];
  emotionalStates?: StoryEmotionalState[];
  minMinute?: number;
  maxMinute?: number;
  requiredIntent?: StoryConversationIntent;
  authoredInteractionId?: string;
  factNotExhaustedId?: string;
}

export interface StoryDefinition {
  id?: string;
  version?: number;
  worldId?: string;
  slug: string;
  title: string;
  subtitle: string;
  durationLabel: string;
  synopsis?: string;
  theme?: StoryTheme;
  persistencePolicy?: string;
  loopStartMinute: number;
  loopEndMinute: number;
  resetEvidenceIds?: string[];
  startLocationId: string;
  locations: StoryLocationDefinition[];
  characters: StoryCharacterDefinition[];
  evidence: StoryEvidenceDefinition[];
  deductions: StoryDeductionDefinition[];
  timedEvents: StoryTimedEventDefinition[];
  interactions: StoryInteractionDefinition[];
  dialogueApproaches: StoryDialogueApproachDefinition[];
  endings: StoryEndingDefinition[];
  knownBaseCharacterIds?: string[];
  knownBaseLocationIds?: string[];
  storyInstructions?: string[];
  openingNarration?: string;
}

/** Validates authored references before a story is exposed to players. */
export function validateStoryDefinition(definition: StoryDefinition): string[] {
  const errors: string[] = [];
  const locationIds = definition.locations.map((item) => item.id);
  const characterIds = definition.characters.map((item) => item.id);
  const evidenceIds = definition.evidence.map((item) => item.id);
  const deductionIds = definition.deductions.map((item) => item.id);
  const interactionIds = definition.interactions.map((item) => item.id);
  const approachIds = definition.dialogueApproaches.map((item) => item.id);
  const locations = new Set(locationIds), characters = new Set(characterIds), evidence = new Set(evidenceIds), deductions = new Set(deductionIds);
  const unique = (label: string, ids: string[]) => { if (new Set(ids).size !== ids.length) errors.push(`duplicate_${label}`); };
  const requireId = (set: Set<string>, id: string, path: string) => { if (!set.has(id)) errors.push(`${path}:${id}`); };
  const validateRequirements = (requirements: StoryRequirements | undefined, path: string) => {
    if (!requirements) return;
    if (requirements.locationId) requireId(locations, requirements.locationId, `${path}_location`);
    if (requirements.characterPresentId) requireId(characters, requirements.characterPresentId, `${path}_character`);
    requirements.evidenceIds?.forEach((id) => requireId(evidence, id, `${path}_evidence`));
    requirements.presentedEvidenceIds?.forEach((id) => requireId(evidence, id, `${path}_presented_evidence`));
    requirements.deductionIds?.forEach((id) => requireId(deductions, id, `${path}_deduction`));
    requirements.witnessedEventIds?.forEach((id) => { if (!definition.timedEvents.some((item) => item.id === id)) errors.push(`${path}_event:${id}`); });
    Object.keys(requirements.minTrust ?? {}).forEach((id) => requireId(characters, id, `${path}_trust_character`));
    Object.keys(requirements.maxSuspicion ?? {}).forEach((id) => requireId(characters, id, `${path}_suspicion_character`));
    if (requirements.authoredInteractionId && !interactionIds.includes(requirements.authoredInteractionId) && !approachIds.includes(requirements.authoredInteractionId)) errors.push(`${path}_authored_interaction:${requirements.authoredInteractionId}`);
    if (requirements.factNotExhaustedId) requireId(evidence, requirements.factNotExhaustedId, `${path}_exhausted_fact`);
  };
  unique('locations', locationIds); unique('characters', characterIds); unique('evidence', evidenceIds); unique('deductions', deductionIds); unique('interactions', interactionIds); unique('approaches', approachIds);
  requireId(locations, definition.startLocationId, 'start_location');
  for (const location of definition.locations) {
    for (const target of Object.keys(location.travelMinutes)) requireId(locations, target, `travel:${location.id}`);
    validateRequirements(location.unlock, `location:${location.id}`);
    location.environmentalStates?.forEach((item) => validateRequirements(item.requirements, `location_state:${location.id}:${item.id}`));
  }
  for (const character of definition.characters) {
    const sorted = [...character.schedules].sort((a, b) => a.startsAt - b.startsAt);
    for (const [index, block] of sorted.entries()) {
      requireId(locations, block.locationId, `schedule:${character.id}`);
      validateRequirements(block.requirements, `schedule:${character.id}`);
      if (block.startsAt < definition.loopStartMinute || block.endsAt > definition.loopEndMinute || block.startsAt >= block.endsAt) errors.push(`schedule_time:${character.id}`);
      if (index > 0 && sorted[index - 1]!.endsAt > block.startsAt && (sorted[index - 1]!.priority ?? 0) === (block.priority ?? 0)) errors.push(`schedule_conflict:${character.id}`);
    }
    const profile = character.storyProfile;
    if (profile) {
      if (profile.characterId !== character.id) errors.push(`profile_character:${character.id}`);
      if (profile.participationTier === 'core') {
        if (!profile.speechFingerprint) errors.push(`core_speech_fingerprint:${character.id}`);
        else {
          if (profile.speechFingerprint.voiceExamples.length < 6) errors.push(`core_voice_examples:${character.id}`);
          if (profile.speechFingerprint.responseShapes.length < 2) errors.push(`core_response_shapes:${character.id}`);
          if (!profile.speechFingerprint.avoids.length) errors.push(`core_voice_avoids:${character.id}`);
        }
      }
      for (const id of profile.knownFactIds) requireId(evidence, id, `known_fact:${character.id}`);
      for (const rule of profile.revealRules) {
        if (rule.factId) { requireId(evidence, rule.factId, `reveal_fact:${character.id}`); if (!profile.knownFactIds.includes(rule.factId)) errors.push(`reveal_unknown_fact:${character.id}:${rule.factId}`); }
        if (rule.beliefId && !profile.mistakenBeliefs?.some((item) => item.id === rule.beliefId)) errors.push(`reveal_unknown_belief:${character.id}:${rule.beliefId}`);
        if (rule.lieId && !profile.intentionalLies?.some((item) => item.id === rule.lieId)) errors.push(`reveal_unknown_lie:${character.id}:${rule.lieId}`);
        rule.approachIds?.forEach((id) => { if (!approachIds.includes(id)) errors.push(`reveal_approach:${character.id}:${id}`); });
        validateRequirements(rule.requirements, `reveal:${character.id}:${rule.id}`);
      }
      profile.emotionalTransitions?.forEach((item) => validateRequirements(item.requirements, `emotion:${character.id}:${item.id}`));
      if (profile.participationTier === 'ambient' && profile.knownFactIds.some((id) => definition.evidence.find((item) => item.id === id)?.kind === 'critical')) errors.push(`ambient_critical_fact:${character.id}`);
    }
  }
  for (const item of definition.evidence) {
    item.relatedCharacterIds.forEach((id) => requireId(characters, id, `evidence_character:${item.id}`));
    item.relatedLocationIds.forEach((id) => requireId(locations, id, `evidence_location:${item.id}`));
    if (item.kind === 'character_truth') {
      const conversationRoutes = definition.dialogueApproaches.filter((approach) => approach.discoverEvidenceIds.includes(item.id));
      if (!conversationRoutes.length) errors.push(`unreachable_character_truth:${item.id}`);
      if (conversationRoutes.some((approach) => !item.relatedCharacterIds.includes(approach.characterId))) errors.push(`character_truth_speaker_mismatch:${item.id}`);
    }
  }
  definition.resetEvidenceIds?.forEach((id) => requireId(evidence, id, 'reset_evidence'));
  for (const deduction of definition.deductions) deduction.requiredEvidenceIds.forEach((id) => requireId(evidence, id, `deduction:${deduction.id}`));
  for (const event of definition.timedEvents) {
    requireId(locations, event.locationId, `event:${event.id}`);
    if (event.minute < definition.loopStartMinute || event.minute > definition.loopEndMinute) errors.push(`event_time:${event.id}`);
    if (event.discoverEvidenceId) {
      requireId(evidence, event.discoverEvidenceId, `event_evidence:${event.id}`);
      const fact = definition.evidence.find((item) => item.id === event.discoverEvidenceId);
      if (fact && !storyEvidenceCanBeDiscoveredBy(fact, 'witnessed_event')) errors.push(`event_discovery_mode:${event.id}:${fact.id}`);
    }
  }
  for (const interaction of definition.interactions) {
    requireId(locations, interaction.locationId, `interaction:${interaction.id}`);
    if (!Number.isFinite(interaction.timeCost) || interaction.timeCost <= 0) errors.push(`interaction_time:${interaction.id}`);
    interaction.discoverEvidenceIds.forEach((id) => {
      requireId(evidence, id, `interaction_evidence:${interaction.id}`);
      const fact = definition.evidence.find((item) => item.id === id);
      if (fact && !storyEvidenceCanBeDiscoveredBy(fact, 'investigation')) errors.push(`interaction_discovery_mode:${interaction.id}:${fact.id}`);
    });
    validateRequirements(interaction.requirements, `interaction:${interaction.id}`);
  }
  for (const approach of definition.dialogueApproaches) {
    requireId(characters, approach.characterId, `approach:${approach.id}`);
    approach.discoverEvidenceIds.forEach((id) => {
      requireId(evidence, id, `approach_evidence:${approach.id}`);
      const fact = definition.evidence.find((item) => item.id === id);
      if (fact && !storyEvidenceCanBeDiscoveredBy(fact, 'conversation')) errors.push(`approach_discovery_mode:${approach.id}:${fact.id}`);
    });
    validateRequirements(approach.requirements, `approach:${approach.id}`);
  }
  for (const ending of definition.endings) validateRequirements(ending.requirements, `ending:${ending.id}`);
  for (const fact of definition.evidence) fact.prerequisiteFactIds?.forEach((id) => requireId(evidence, id, `fact_prerequisite:${fact.id}`));
  const cycles = circularPrerequisites(definition.evidence.map((item) => ({ id: item.id, requires: item.prerequisiteFactIds ?? [] })));
  cycles.forEach((id) => errors.push(`circular_fact_prerequisite:${id}`));
  for (const fact of definition.evidence.filter((item) => item.kind === 'critical')) {
    const routed = definition.interactions.some((item) => item.discoverEvidenceIds.includes(fact.id) && storyEvidenceCanBeDiscoveredBy(fact, 'investigation'))
      || definition.dialogueApproaches.some((item) => item.discoverEvidenceIds.includes(fact.id) && storyEvidenceCanBeDiscoveredBy(fact, 'conversation'))
      || definition.timedEvents.some((item) => item.discoverEvidenceId === fact.id && storyEvidenceCanBeDiscoveredBy(fact, 'witnessed_event'))
      || Boolean(definition.resetEvidenceIds?.includes(fact.id) && storyEvidenceCanBeDiscoveredBy(fact, 'system'));
    if (!routed) errors.push(`unreachable_critical_fact:${fact.id}`);
  }
  const routedFacts = new Set<string>([
    ...(definition.resetEvidenceIds ?? []),
    ...definition.interactions.flatMap((item) => item.discoverEvidenceIds.filter((id) => {
      const fact = definition.evidence.find((candidate) => candidate.id === id);
      return Boolean(fact && storyEvidenceCanBeDiscoveredBy(fact, 'investigation'));
    })),
    ...definition.dialogueApproaches.flatMap((item) => item.discoverEvidenceIds.filter((id) => {
      const fact = definition.evidence.find((candidate) => candidate.id === id);
      return Boolean(fact && storyEvidenceCanBeDiscoveredBy(fact, 'conversation'));
    })),
    ...definition.timedEvents.flatMap((item) => {
      if (!item.discoverEvidenceId) return [];
      const fact = definition.evidence.find((candidate) => candidate.id === item.discoverEvidenceId);
      return fact && storyEvidenceCanBeDiscoveredBy(fact, 'witnessed_event') ? [fact.id] : [];
    }),
  ]);
  const reachableDeductions = new Set(definition.deductions.filter((item) => item.requiredEvidenceIds.every((id) => routedFacts.has(id))).map((item) => item.id));
  for (const deduction of definition.deductions) if (!reachableDeductions.has(deduction.id)) errors.push(`unreachable_deduction:${deduction.id}`);
  for (const ending of definition.endings) {
    const impossibleEvidence = ending.requirements.evidenceIds?.some((id) => !routedFacts.has(id));
    const impossibleDeduction = ending.requirements.deductionIds?.some((id) => !reachableDeductions.has(id));
    if (impossibleEvidence || impossibleDeduction) errors.push(`unreachable_ending:${ending.id}`);
  }
  return errors;
}

export interface StoryValidationReport { errors: string[]; warnings: string[] }

export function validateStoryDefinitionReport(definition: StoryDefinition): StoryValidationReport {
  const errors = validateStoryDefinition(definition);
  const warnings: string[] = [];
  if (!definition.version) warnings.push('missing_content_version');
  if (!definition.theme) warnings.push('missing_theme');
  for (const location of definition.locations) {
    if (location.participation === 'core' && (!location.arrivalNarration || !location.alteredNarration || !location.lateNightNarration)) warnings.push(`incomplete_location_states:${location.id}`);
    for (const target of Object.keys(location.travelMinutes)) {
      const reverse = definition.locations.find((item) => item.id === target)?.travelMinutes[location.id];
      if (reverse === undefined) warnings.push(`one_way_travel:${location.id}:${target}`);
    }
  }
  for (const character of definition.characters) {
    const profile = character.storyProfile;
    if (!profile) warnings.push(`implicit_ambient_profile:${character.id}`);
    else if (profile.participationTier === 'core' && (!profile.authoredOpeningBeats?.length || !profile.authoredConfrontationBeats?.length)) warnings.push(`thin_core_profile:${character.id}`);
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

export interface StoryCharacterState {
  trust: number;
  suspicion: number;
  presentedEvidenceIds: string[];
  conversationCount: number;
  emotionalState?: StoryEmotionalState;
  exhaustedFactIds?: string[];
  usedTopicIds?: string[];
  continuity?: StoryConversationContinuity;
}

export interface StoryConversationContinuity {
  lastIntent?: StoryConversationIntent;
  lastPlayerMessage?: string;
  lastCharacterReply?: string;
  recentExchangeSummaries: string[];
  openThreads: string[];
  lastRelationshipSignal?: StoryRelationshipSignal;
  relationshipCue?: string;
  recentMoves?: StoryConversationalMove[];
  residue?: StoryConversationResidue[];
  /** A canonical catch-up/note cue consumed by the next generated reply. */
  pendingResumeCue?: string;
}

export interface StoryConversationResidue {
  kind: 'question' | 'avoidance' | 'accusation' | 'joke' | 'awkwardness' | 'promise' | 'correction';
  summary: string;
  createdAtTurn: number;
}

export interface StoryConversationEffect {
  trustDelta: number;
  suspicionDelta: number;
  signal: StoryRelationshipSignal;
  cue: string;
}

/**
 * Relationship movement is deterministic and intent-based. Merely sending a message never
 * earns trust; the player's approach and validated evidence do.
 */
export function storyConversationEffect(
  intent: StoryConversationIntent,
  options: { firstEvidencePresentation?: boolean; authoredTrustDelta?: number; authoredSuspicionDelta?: number } = {},
): StoryConversationEffect {
  const base: Record<StoryConversationIntent, StoryConversationEffect> = {
    casual: { trustDelta: 0, suspicionDelta: 0, signal: 'neutral', cue: 'is settling into a more natural conversation with you' },
    probe: { trustDelta: 0, suspicionDelta: 0, signal: 'neutral', cue: 'is listening, but has not decided what to make of you' },
    reassure: { trustDelta: 2, suspicionDelta: -1, signal: 'reassured', cue: 'seems a little less guarded' },
    challenge: { trustDelta: 0, suspicionDelta: 1, signal: 'challenged', cue: 'watches you more carefully' },
    observe: { trustDelta: 0, suspicionDelta: -1, signal: 'observed', cue: 'notices that you are paying attention' },
    present_evidence: { trustDelta: 0, suspicionDelta: 0, signal: 'shared_evidence', cue: 'is reassessing what they believed' },
    ask_about_character: { trustDelta: 0, suspicionDelta: 0, signal: 'neutral', cue: 'weighs how much of someone else’s story is theirs to tell' },
    request_help: { trustDelta: 1, suspicionDelta: 0, signal: 'asked_for_help', cue: 'is considering whether to help you' },
    accuse: { trustDelta: -2, suspicionDelta: 3, signal: 'accused', cue: 'has become openly wary of you' },
    leave_conversation: { trustDelta: 0, suspicionDelta: 0, signal: 'neutral', cue: 'lets the conversation end without chasing you' },
  };
  const selected = base[intent];
  return {
    ...selected,
    trustDelta: selected.trustDelta + (options.authoredTrustDelta ?? 0) + (options.firstEvidencePresentation ? 4 : 0),
    suspicionDelta: selected.suspicionDelta + (options.authoredSuspicionDelta ?? 0) - (options.firstEvidencePresentation ? 2 : 0),
  };
}

export interface StoryLoopSummary {
  loop: number;
  factsDiscovered: string[];
  eventsWitnessed: string[];
  locationsVisited: string[];
  recap: string;
}

export interface StoryCampaignState {
  storySlug: string;
  status: StoryCampaignStatus;
  currentLoop: number;
  currentMinute: number;
  currentLocationId: string;
  evidenceIds: string[];
  deductionIds: string[];
  inventoryIds: string[];
  persistentFlags: string[];
  loopFlags: string[];
  witnessedEventIds: string[];
  loopDiscoveredEvidenceIds: string[];
  loopVisitedLocationIds: string[];
  characterStates: Record<string, StoryCharacterState>;
  loopHistory: StoryLoopSummary[];
  discoveredEndingIds: string[];
  completedEndingId: string | null;
  pinnedEvidenceId: string | null;
  pinnedCharacterId: string | null;
  pinnedEventId: string | null;
  contentVersion?: number;
  persistencePolicy?: string;
}

export type StoryAction =
  | { type: 'travel'; locationId: string }
  | { type: 'follow'; characterId: string }
  | { type: 'absence'; characterId: string; choice: StoryAbsenceChoice }
  | { type: 'investigate'; interactionId: string }
  | { type: 'conversation'; characterId: string; approachId?: string; freeformText?: string; evidenceId?: string }
  | { type: 'present_evidence'; characterId: string; evidenceId: string }
  | { type: 'wait'; minutes: number }
  | { type: 'reset' }
  | { type: 'finale'; endingId: string };

export interface StoryActionResult {
  state: StoryCampaignState;
  timeAdvanced: number;
  evidenceDiscovered: string[];
  deductionsCompleted: string[];
  eventsWitnessed: string[];
  presenceTransitions: StoryPresenceTransition[];
  followOutcome?: StoryFollowOutcome;
  absenceOutcome?: StoryAbsenceOutcome;
  endingReached?: string;
  resetSummary?: StoryLoopSummary;
}

export class StoryRuleError extends Error {
  readonly code: 'INVALID_ACTION' | 'LOCKED' | 'NOT_PRESENT' | 'MIDNIGHT_REQUIRED' | 'FINALE_LOCKED';
  constructor(code: 'INVALID_ACTION' | 'LOCKED' | 'NOT_PRESENT' | 'MIDNIGHT_REQUIRED' | 'FINALE_LOCKED', message: string) {
    super(message);
    this.code = code;
    this.name = 'StoryRuleError';
  }
}

export function initialStoryCampaign(definition: StoryDefinition): StoryCampaignState {
  const state: StoryCampaignState = {
    storySlug: definition.slug,
    status: 'active',
    currentLoop: 0,
    currentMinute: definition.loopStartMinute,
    currentLocationId: definition.startLocationId,
    evidenceIds: [],
    deductionIds: [],
    inventoryIds: ['brass-memory-token'],
    persistentFlags: ['remembers-loop'],
    loopFlags: [],
    witnessedEventIds: [],
    loopDiscoveredEvidenceIds: [],
    loopVisitedLocationIds: [definition.startLocationId],
    characterStates: Object.fromEntries(definition.characters.map((character) => [character.id, {
      trust: character.baselineTrust,
      suspicion: character.baselineSuspicion,
      presentedEvidenceIds: [],
      conversationCount: 0,
      emotionalState: character.storyProfile?.initialEmotionalState ?? 'calm',
      exhaustedFactIds: [],
      usedTopicIds: [],
    }])),
    loopHistory: [],
    discoveredEndingIds: [],
    completedEndingId: null,
    pinnedEvidenceId: null,
    pinnedCharacterId: null,
    pinnedEventId: null,
    contentVersion: definition.version ?? 1,
    persistencePolicy: definition.persistencePolicy ?? 'knowledge-persists-loop-resets',
  };
  return storyPersistencePolicy(definition.persistencePolicy).onCampaignStart(state);
}

export function resolveStoryCharacterLocation(definition: StoryDefinition, state: StoryCampaignState, characterId: string): StoryCharacterScheduleBlock | null {
  const character = definition.characters.find((item) => item.id === characterId);
  if (!character) return null;
  return [...character.schedules]
    .filter((block) => state.currentMinute >= block.startsAt && state.currentMinute < block.endsAt && storyScheduleRequirementMet(state, block.requirements))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0] ?? null;
}

/** Returns only the next validated movement, never the character's full authored schedule. */
export function resolveStoryDepartureForecast(
  definition: StoryDefinition,
  state: StoryCampaignState,
  characterId: string,
  maximumMinutes = 10,
): StoryPresenceForecast | null {
  const origin = resolveStoryCharacterLocation(definition, state, characterId);
  if (!origin) return null;
  const limit = Math.min(definition.loopEndMinute, state.currentMinute + Math.max(0, maximumMinutes));
  for (let minute = state.currentMinute + 1; minute <= limit; minute += 1) {
    const future = { ...state, currentMinute: minute };
    const destination = resolveStoryCharacterLocation(definition, future, characterId);
    if ((destination?.locationId ?? null) === origin.locationId) continue;
    return {
      characterId,
      originLocationId: origin.locationId,
      destinationLocationId: destination?.locationId ?? null,
      departureMinute: minute,
      minutesUntil: minute - state.currentMinute,
      activity: destination?.activity ?? origin.activity,
    };
  }
  return null;
}

/** A cheap, deterministic catchability check used by both the API projection and Follow action. */
export function resolveStoryFollowPlan(definition: StoryDefinition, state: StoryCampaignState, characterId: string): StoryFollowPlan | null {
  const schedule = resolveStoryCharacterLocation(definition, state, characterId);
  const origin = definition.locations.find((item) => item.id === state.currentLocationId);
  if (!schedule || !origin || schedule.locationId === state.currentLocationId) return null;
  const travelMinutes = origin.travelMinutes[schedule.locationId];
  if (!travelMinutes) return null;
  const arrivalMinute = Math.min(definition.loopEndMinute, state.currentMinute + travelMinutes);
  const arrivalState = { ...state, currentMinute: arrivalMinute };
  const arrivalSchedule = resolveStoryCharacterLocation(definition, arrivalState, characterId);
  return {
    characterId,
    targetLocationId: schedule.locationId,
    travelMinutes,
    arrivalMinute,
    catchable: arrivalSchedule?.locationId === schedule.locationId,
    mayMoveBeforeArrival: arrivalSchedule?.locationId !== schedule.locationId,
  };
}

export function storyCharactersAtLocation(definition: StoryDefinition, state: StoryCampaignState, locationId = state.currentLocationId): StoryCharacterDefinition[] {
  return definition.characters.filter((character) => resolveStoryCharacterLocation(definition, state, character.id)?.locationId === locationId);
}

export function storyRequirementMet(definition: StoryDefinition, state: StoryCampaignState, requirements?: StoryRequirements): boolean {
  if (!requirements) return true;
  if (requirements.exactLoop !== undefined && state.currentLoop !== requirements.exactLoop) return false;
  if (requirements.minLoop !== undefined && state.currentLoop < requirements.minLoop) return false;
  if (requirements.maxLoop !== undefined && state.currentLoop > requirements.maxLoop) return false;
  if (requirements.locationId && state.currentLocationId !== requirements.locationId) return false;
  if (requirements.evidenceIds?.some((id) => !state.evidenceIds.includes(id))) return false;
  if (requirements.deductionIds?.some((id) => !state.deductionIds.includes(id))) return false;
  if (requirements.flags?.some((flag) => !state.persistentFlags.includes(flag) && !state.loopFlags.includes(flag))) return false;
  if (requirements.anyFlags?.length && !requirements.anyFlags.some((flag) => state.persistentFlags.includes(flag) || state.loopFlags.includes(flag))) return false;
  if (requirements.characterPresentId && !storyCharactersAtLocation(definition, state).some((character) => character.id === requirements.characterPresentId)) return false;
  if (requirements.minTrust && Object.entries(requirements.minTrust).some(([id, threshold]) => (state.characterStates[id]?.trust ?? 0) < threshold)) return false;
  if (requirements.maxSuspicion && Object.entries(requirements.maxSuspicion).some(([id, threshold]) => (state.characterStates[id]?.suspicion ?? 0) > threshold)) return false;
  if (requirements.inventoryIds?.some((id) => !state.inventoryIds.includes(id))) return false;
  if (requirements.witnessedEventIds?.some((id) => !state.witnessedEventIds.includes(id))) return false;
  if (requirements.minMinute !== undefined && state.currentMinute < requirements.minMinute) return false;
  if (requirements.maxMinute !== undefined && state.currentMinute > requirements.maxMinute) return false;
  return true;
}

export function availableStoryInteractions(definition: StoryDefinition, state: StoryCampaignState): StoryInteractionDefinition[] {
  return definition.interactions.filter((interaction) => interaction.locationId === state.currentLocationId
    && storyRequirementMet(definition, state, interaction.requirements)
    && (interaction.repeatable !== false || !state.loopFlags.includes(`interaction:${interaction.id}:completed`)));
}

export function availableStoryApproaches(definition: StoryDefinition, state: StoryCampaignState, characterId: string): StoryDialogueApproachDefinition[] {
  if (resolveStoryCharacterLocation(definition, state, characterId)?.locationId !== state.currentLocationId) return [];
  return definition.dialogueApproaches.filter((approach) => approach.characterId === characterId && storyRequirementMet(definition, state, approach.requirements));
}

export function availableStoryEndings(definition: StoryDefinition, state: StoryCampaignState): StoryEndingDefinition[] {
  return definition.endings.filter((ending) => storyRequirementMet(definition, state, ending.requirements));
}

export function applyStoryAction(definition: StoryDefinition, current: StoryCampaignState, action: StoryAction): StoryActionResult {
  if (current.status === 'completed') throw new StoryRuleError('INVALID_ACTION', 'This campaign has already reached an ending.');
  if (current.status === 'midnight' && action.type !== 'reset') throw new StoryRuleError('MIDNIGHT_REQUIRED', 'The night has reached midnight. Begin the next loop to continue.');
  const policy = storyPersistencePolicy(definition.persistencePolicy);
  const authoredActionId = action.type === 'investigate' ? action.interactionId : action.type === 'finale' ? action.endingId : action.type === 'conversation' ? action.approachId : undefined;
  if (authoredActionId && !policy.validateStorySpecificAction(current, authoredActionId)) throw new StoryRuleError('LOCKED', 'That story-specific action is not available in this campaign.');
  let state = cloneState(current);
  let timeAdvanced = 0;
  let discovered: string[] = [];
  let witnessed: string[] = [];
  let presenceTransitions: StoryPresenceTransition[] = [];
  let followOutcome: StoryFollowOutcome | undefined;
  let absenceOutcome: StoryAbsenceOutcome | undefined;
  let endingReached: string | undefined;
  let resetSummary: StoryLoopSummary | undefined;

  if (action.type === 'travel') {
    const destination = definition.locations.find((location) => location.id === action.locationId);
    const origin = definition.locations.find((location) => location.id === state.currentLocationId);
    if (!destination || !origin) throw new StoryRuleError('INVALID_ACTION', 'That route is unavailable.');
    if (!storyRequirementMet(definition, state, destination.unlock)) throw new StoryRuleError('LOCKED', 'That part of Vespormoor is still inaccessible.');
    const travelMinutes = origin.travelMinutes[destination.id];
    if (!travelMinutes) throw new StoryRuleError('LOCKED', 'You have not found a route there yet.');
    state.currentLocationId = destination.id;
    state.loopVisitedLocationIds = unique([...state.loopVisitedLocationIds, destination.id]);
    ({ state, witnessed, presenceTransitions } = advanceStoryActionTime(definition, current, state, travelMinutes, destination.id));
    timeAdvanced = travelMinutes;
  } else if (action.type === 'follow') {
    const character = definition.characters.find((item) => item.id === action.characterId);
    if (!character) throw new StoryRuleError('INVALID_ACTION', 'That person is not part of this story.');
    const plan = resolveStoryFollowPlan(definition, state, action.characterId);
    if (!plan) throw new StoryRuleError('LOCKED', `${character.name} cannot be followed from here right now.`);
    const attemptedLocation = definition.locations.find((item) => item.id === plan.targetLocationId);
    if (!attemptedLocation || !storyRequirementMet(definition, state, attemptedLocation.unlock)) throw new StoryRuleError('LOCKED', 'That route is not available yet.');
    const originLocationId = state.currentLocationId;
    state.currentLocationId = attemptedLocation.id;
    state.loopVisitedLocationIds = unique([...state.loopVisitedLocationIds, attemptedLocation.id]);
    let advanced = advanceStoryActionTime(definition, current, state, plan.travelMinutes, attemptedLocation.id);
    state = advanced.state;
    witnessed = advanced.witnessed;
    presenceTransitions = advanced.presenceTransitions;
    timeAdvanced = plan.travelMinutes;
    let actual = resolveStoryCharacterLocation(definition, state, action.characterId);
    let rerouted = false;
    if (actual && actual.locationId !== state.currentLocationId && state.status === 'active') {
      const currentPlace = definition.locations.find((item) => item.id === state.currentLocationId);
      const rerouteMinutes = currentPlace?.travelMinutes[actual.locationId];
      if (rerouteMinutes && timeAdvanced + rerouteMinutes <= 30 && storyRequirementMet(definition, state, definition.locations.find((item) => item.id === actual!.locationId)?.unlock)) {
        const beforeReroute = cloneState(state);
        state.currentLocationId = actual.locationId;
        state.loopVisitedLocationIds = unique([...state.loopVisitedLocationIds, actual.locationId]);
        advanced = advanceStoryActionTime(definition, beforeReroute, state, rerouteMinutes, actual.locationId);
        state = advanced.state;
        witnessed = unique([...witnessed, ...advanced.witnessed]);
        presenceTransitions = [...presenceTransitions, ...advanced.presenceTransitions];
        timeAdvanced += rerouteMinutes;
        rerouted = true;
        actual = resolveStoryCharacterLocation(definition, state, action.characterId);
      }
    }
    const caught = actual?.locationId === state.currentLocationId;
    const resumedThread = caught ? resumeThreadFor(state.characterStates[action.characterId]?.continuity) : null;
    const actualLocation = actual ? definition.locations.find((item) => item.id === actual.locationId) : null;
    const attemptedSensory = attemptedLocation.sensoryVocabulary?.[0] ?? attemptedLocation.subtitle.toLowerCase();
    const trace = caught
      ? `${character.name.split(' ')[0]} is here${rerouted ? ' after you adjusted course' : ''}.`
      : `${character.name.split(' ')[0]} has already moved on. ${attemptedLocation.name} still carries ${attemptedSensory}${actualLocation ? `, and a fresh lead points toward ${actualLocation.name}` : ''}.`;
    if (caught) {
      const characterState = state.characterStates[action.characterId];
      if (characterState) state.characterStates[action.characterId] = {
        ...characterState,
        continuity: {
          recentExchangeSummaries: characterState.continuity?.recentExchangeSummaries ?? [],
          openThreads: characterState.continuity?.openThreads ?? [],
          ...characterState.continuity,
          pendingResumeCue: `The player followed ${character.name.split(' ')[0]} from ${definition.locations.find((item) => item.id === originLocationId)?.name ?? 'the previous scene'} and caught up at ${actualLocation?.name ?? attemptedLocation.name}.${resumedThread ? ` Resume this unresolved thread naturally: ${resumedThread}` : ' Acknowledge the reunion briefly without replaying the departure.'}`,
        },
      };
    }
    followOutcome = { characterId: action.characterId, attemptedLocationId: attemptedLocation.id, actualLocationId: actual?.locationId ?? null, caught, rerouted, travelMinutes: timeAdvanced, trace, resumedThread };
  } else if (action.type === 'absence') {
    const character = definition.characters.find((item) => item.id === action.characterId);
    if (!character) throw new StoryRuleError('INVALID_ACTION', 'That person is not part of this story.');
    if (resolveStoryCharacterLocation(definition, state, action.characterId)?.locationId === state.currentLocationId) throw new StoryRuleError('INVALID_ACTION', `${character.name} is already here.`);
    const target = resolveStoryCharacterLocation(definition, state, action.characterId);
    const cost = action.choice === 'wait' ? 5 : 2;
    ({ state, witnessed, presenceTransitions } = advanceStoryActionTime(definition, current, state, cost, state.currentLocationId));
    timeAdvanced = cost;
    const nearby = storyCharactersAtLocation(definition, state).find((item) => item.id !== action.characterId && item.storyProfile?.participationTier !== 'excluded');
    let content: string;
    if (action.choice === 'wait') {
      const arrived = resolveStoryCharacterLocation(definition, state, action.characterId)?.locationId === state.currentLocationId;
      content = arrived ? `${character.name.split(' ')[0]} arrives while you wait.` : `You wait five minutes, but ${character.name.split(' ')[0]} does not return.`;
    } else if (action.choice === 'leave_note') {
      content = `You leave ${character.name.split(' ')[0]} a note at ${definition.locations.find((item) => item.id === state.currentLocationId)?.name ?? 'this place'}.`;
      const characterState = state.characterStates[action.characterId];
      if (characterState) state.characterStates[action.characterId] = {
        ...characterState,
        continuity: {
          recentExchangeSummaries: characterState.continuity?.recentExchangeSummaries ?? [],
          openThreads: characterState.continuity?.openThreads ?? [],
          ...characterState.continuity,
          pendingResumeCue: `The player left you a note after missing you at ${definition.locations.find((item) => item.id === current.currentLocationId)?.name ?? 'your last location'}. Acknowledge it naturally when you next speak.`,
        },
      };
    } else {
      content = nearby
        ? `${nearby.name.split(' ')[0]} says ${character.name.split(' ')[0]} was last seen heading toward ${target ? definition.locations.find((item) => item.id === target.locationId)?.name ?? 'another part of town' : 'an unknown destination'}.`
        : `No one nearby can say where ${character.name.split(' ')[0]} went.`;
    }
    absenceOutcome = { characterId: action.characterId, choice: action.choice, content, witnessCharacterId: action.choice === 'ask_nearby' ? nearby?.id ?? null : null, targetLocationId: target?.locationId ?? null };
  } else if (action.type === 'investigate') {
    const interaction = definition.interactions.find((item) => item.id === action.interactionId);
    if (!interaction || interaction.locationId !== state.currentLocationId) throw new StoryRuleError('INVALID_ACTION', 'That clue is not available here.');
    if (!storyRequirementMet(definition, state, interaction.requirements)) throw new StoryRuleError('LOCKED', 'You do not know enough to investigate that yet.');
    discovered = interaction.discoverEvidenceIds.filter((id) => {
      const evidence = definition.evidence.find((item) => item.id === id);
      return Boolean(evidence && storyEvidenceCanBeDiscoveredBy(evidence, 'investigation') && !state.evidenceIds.includes(id));
    });
    state = addEvidence(state, discovered);
    state.loopFlags = unique([...state.loopFlags, ...(interaction.setFlags ?? []), `interaction:${interaction.id}:completed`]);
    if (interaction.persistsBetweenLoops) state.persistentFlags = unique([...state.persistentFlags, `interaction:${interaction.id}:completed`]);
    ({ state, witnessed, presenceTransitions } = advanceStoryActionTime(definition, current, state, interaction.timeCost, state.currentLocationId));
    timeAdvanced = interaction.timeCost;
  } else if (action.type === 'conversation') {
    const character = definition.characters.find((item) => item.id === action.characterId);
    if (!character) throw new StoryRuleError('INVALID_ACTION', 'That person is not part of this story.');
    if (resolveStoryCharacterLocation(definition, state, action.characterId)?.locationId !== state.currentLocationId) throw new StoryRuleError('NOT_PRESENT', `${character.name} is not here now.`);
    const approach = action.approachId ? definition.dialogueApproaches.find((item) => item.id === action.approachId && item.characterId === action.characterId) : undefined;
    if (action.approachId && (!approach || !storyRequirementMet(definition, state, approach.requirements))) throw new StoryRuleError('LOCKED', 'That approach is not available yet.');
    const characterState = state.characterStates[action.characterId] ?? { trust: character.baselineTrust, suspicion: character.baselineSuspicion, presentedEvidenceIds: [], conversationCount: 0 };
    if (action.evidenceId && !state.evidenceIds.includes(action.evidenceId)) throw new StoryRuleError('INVALID_ACTION', 'That evidence has not been discovered.');
    const profile = character.storyProfile;
    const authorization = profile ? buildStoryDialogueAuthorization({ definition, state, characterId: action.characterId, message: action.freeformText ?? approach?.promptIntent ?? '', ...(action.approachId ? { approachId: action.approachId } : {}), ...(action.evidenceId ? { evidenceId: action.evidenceId } : {}) }) : null;
    const requestedReveal = approach?.discoverEvidenceIds ?? matchFreeformReveal(definition, state, action.characterId, action.freeformText ?? '');
    const conversationalReveal = (authorization ? requestedReveal.filter((id) => authorization.permittedFactIds.includes(id)) : requestedReveal)
      .filter((id) => {
        const evidence = definition.evidence.find((item) => item.id === id);
        return Boolean(evidence && storyEvidenceCanBeDiscoveredBy(evidence, 'conversation'));
      });
    discovered = conversationalReveal.filter((id) => !state.evidenceIds.includes(id));
    state = addEvidence(state, discovered);
    const firstEvidencePresentation = Boolean(action.evidenceId && !characterState.presentedEvidenceIds.includes(action.evidenceId));
    const effect = storyConversationEffect(authorization?.intent ?? 'probe', {
      firstEvidencePresentation,
      ...(approach?.trustDelta !== undefined ? { authoredTrustDelta: approach.trustDelta } : {}),
      ...(approach?.suspicionDelta !== undefined ? { authoredSuspicionDelta: approach.suspicionDelta } : {}),
    });
    state.characterStates[action.characterId] = {
      ...characterState,
      trust: clamp(characterState.trust + effect.trustDelta, 0, 100),
      suspicion: clamp(characterState.suspicion + effect.suspicionDelta, 0, 100),
      presentedEvidenceIds: action.evidenceId ? unique([...characterState.presentedEvidenceIds, action.evidenceId]) : characterState.presentedEvidenceIds,
      conversationCount: characterState.conversationCount + 1,
      emotionalState: characterState.emotionalState ?? profile?.initialEmotionalState ?? 'calm',
      exhaustedFactIds: unique([...(characterState.exhaustedFactIds ?? []), ...discovered.filter((id) => definition.evidence.find((item) => item.id === id)?.exhaustedAfterDisclosure)]),
      usedTopicIds: unique([...(characterState.usedTopicIds ?? []), ...(approach ? [approach.id] : [])]),
      continuity: {
        recentExchangeSummaries: characterState.continuity?.recentExchangeSummaries ?? [],
        openThreads: characterState.continuity?.openThreads ?? [],
        ...characterState.continuity,
        lastIntent: authorization?.intent ?? 'probe',
        lastRelationshipSignal: effect.signal,
        relationshipCue: effect.cue,
      },
    };
    state.loopFlags = unique([...state.loopFlags, ...(approach?.setFlags ?? [])]);
    const cost = STORY_DIALOGUE_MINUTES;
    ({ state, witnessed, presenceTransitions } = advanceStoryActionTime(definition, current, state, cost, state.currentLocationId));
    timeAdvanced = cost;
  } else if (action.type === 'present_evidence') {
    const character = definition.characters.find((item) => item.id === action.characterId);
    if (!character || !state.evidenceIds.includes(action.evidenceId)) throw new StoryRuleError('INVALID_ACTION', 'That evidence cannot be presented.');
    if (resolveStoryCharacterLocation(definition, state, action.characterId)?.locationId !== state.currentLocationId) throw new StoryRuleError('NOT_PRESENT', `${character.name} is not here now.`);
    const characterState = state.characterStates[action.characterId]!;
    const firstPresentation = !characterState.presentedEvidenceIds.includes(action.evidenceId);
    state.characterStates[action.characterId] = {
      ...characterState,
      trust: clamp(characterState.trust + (firstPresentation ? 4 : 0), 0, 100),
      suspicion: clamp(characterState.suspicion - (firstPresentation ? 2 : 0), 0, 100),
      presentedEvidenceIds: unique([...characterState.presentedEvidenceIds, action.evidenceId]),
      conversationCount: characterState.conversationCount + 1,
    };
    state.loopFlags = unique([...state.loopFlags, `presented:${action.characterId}:${action.evidenceId}`]);
    ({ state, witnessed, presenceTransitions } = advanceStoryActionTime(definition, current, state, STORY_DIALOGUE_MINUTES, state.currentLocationId));
    timeAdvanced = STORY_DIALOGUE_MINUTES;
  } else if (action.type === 'wait') {
    const minutes = clamp(Math.round(action.minutes), 5, 60);
    ({ state, witnessed, presenceTransitions } = advanceStoryActionTime(definition, current, state, minutes, state.currentLocationId));
    timeAdvanced = minutes;
  } else if (action.type === 'reset') {
    if (state.status !== 'midnight' && state.currentMinute < definition.loopEndMinute) throw new StoryRuleError('MIDNIGHT_REQUIRED', 'The Engine has not reset the night yet.');
    discovered = (definition.resetEvidenceIds ?? []).filter((id) => !state.evidenceIds.includes(id));
    state = addEvidence(state, discovered);
    resetSummary = summarizeLoop(definition, state);
    const beforeReset = { ...cloneState(state), currentMinute: Math.max(definition.loopStartMinute, definition.loopEndMinute - 1) };
    state = resetStoryLoop(definition, state, resetSummary);
    presenceTransitions = storyPresenceTransitionsBetween(definition, beforeReset, state, state.currentMinute, {
      departureObserverLocationId: beforeReset.currentLocationId,
      arrivalObserverLocationId: state.currentLocationId,
      reason: 'loop_reset',
    });
  } else if (action.type === 'finale') {
    const ending = definition.endings.find((item) => item.id === action.endingId);
    if (!ending || !storyRequirementMet(definition, state, ending.requirements)) throw new StoryRuleError('FINALE_LOCKED', 'Your evidence and alliances do not support that ending yet.');
    state.status = 'completed';
    state.completedEndingId = ending.id;
    state.discoveredEndingIds = unique([...state.discoveredEndingIds, ending.id]);
    endingReached = ending.id;
  }

  const beforeDeductions = state.deductionIds;
  state.deductionIds = unique([...state.deductionIds, ...definition.deductions.filter((deduction) => deduction.requiredEvidenceIds.every((id) => state.evidenceIds.includes(id))).map((deduction) => deduction.id)]);
  const deductionsCompleted = state.deductionIds.filter((id) => !beforeDeductions.includes(id));
  state = policy.onActionCommitted(state);
  return { state, timeAdvanced, evidenceDiscovered: discovered, deductionsCompleted, eventsWitnessed: witnessed, presenceTransitions, ...(followOutcome ? { followOutcome } : {}), ...(absenceOutcome ? { absenceOutcome } : {}), ...(endingReached ? { endingReached } : {}), ...(resetSummary ? { resetSummary } : {}) };
}

export function formatStoryTime(minute: number): string {
  const normalized = minute % (24 * 60);
  const hour24 = Math.floor(normalized / 60);
  const minutePart = normalized % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour = hour24 % 12 || 12;
  return `${hour}:${String(minutePart).padStart(2, '0')} ${suffix}`;
}

export function minutesToMidnight(definition: StoryDefinition, state: StoryCampaignState): number {
  return Math.max(0, definition.loopEndMinute - state.currentMinute);
}

function advanceStoryActionTime(
  definition: StoryDefinition,
  beforeAction: StoryCampaignState,
  source: StoryCampaignState,
  minutes: number,
  observerLocationId: string,
): { state: StoryCampaignState; witnessed: string[]; presenceTransitions: StoryPresenceTransition[] } {
  const immediate = storyPresenceTransitionsBetween(definition, beforeAction, source, source.currentMinute, {
    departureObserverLocationId: observerLocationId,
    arrivalObserverLocationId: observerLocationId,
    reason: 'story_branch',
  });
  const advanced = advanceStoryTime(definition, source, minutes, observerLocationId);
  return { ...advanced, presenceTransitions: [...immediate, ...advanced.presenceTransitions] };
}

function advanceStoryTime(
  definition: StoryDefinition,
  source: StoryCampaignState,
  minutes: number,
  observerLocationId: string,
): { state: StoryCampaignState; witnessed: string[]; presenceTransitions: StoryPresenceTransition[] } {
  const state = cloneState(source);
  const from = state.currentMinute;
  const target = Math.min(definition.loopEndMinute, state.currentMinute + minutes);
  const witnessed: string[] = [];
  const presenceTransitions: StoryPresenceTransition[] = [];
  for (let minute = from + 1; minute <= target; minute += 1) {
    const previous = cloneState(state);
    state.currentMinute = minute;
    const events = definition.timedEvents.filter((event) => event.minute === minute && event.locationId === state.currentLocationId && !state.witnessedEventIds.includes(event.id));
    const eventIds = events.map((event) => event.id);
    witnessed.push(...eventIds);
    state.witnessedEventIds = unique([...state.witnessedEventIds, ...eventIds]);
    addEvidenceInPlace(state, events.flatMap((event) => {
      if (!event.discoverEvidenceId) return [];
      const evidence = definition.evidence.find((item) => item.id === event.discoverEvidenceId);
      return evidence && storyEvidenceCanBeDiscoveredBy(evidence, 'witnessed_event') ? [event.discoverEvidenceId] : [];
    }));
    presenceTransitions.push(...storyPresenceTransitionsBetween(definition, previous, state, minute, {
      departureObserverLocationId: observerLocationId,
      arrivalObserverLocationId: observerLocationId,
      reason: 'schedule',
    }));
  }
  if (state.currentMinute >= definition.loopEndMinute) state.status = 'midnight';
  return { state, witnessed: unique(witnessed), presenceTransitions };
}

export function storyPresenceTransitionsBetween(
  definition: StoryDefinition,
  before: StoryCampaignState,
  after: StoryCampaignState,
  storyMinute: number,
  context: {
    departureObserverLocationId: string;
    arrivalObserverLocationId: string;
    reason: StoryPresenceTransitionReason;
  },
): StoryPresenceTransition[] {
  const transitions: StoryPresenceTransition[] = [];
  for (const character of definition.characters) {
    const origin = resolveStoryCharacterLocation(definition, before, character.id);
    const destination = resolveStoryCharacterLocation(definition, after, character.id);
    const originLocationId = origin?.locationId ?? null;
    const destinationLocationId = destination?.locationId ?? null;
    if (originLocationId === destinationLocationId) continue;
    const activity = destination?.activity ?? origin?.activity ?? 'Moving through the story';
    if (originLocationId) transitions.push({
      type: 'departed', characterId: character.id, originLocationId, destinationLocationId,
      storyMinute, activity, witnessed: originLocationId === context.departureObserverLocationId, reason: context.reason,
    });
    if (destinationLocationId) transitions.push({
      type: 'arrived', characterId: character.id, originLocationId, destinationLocationId,
      storyMinute, activity, witnessed: destinationLocationId === context.arrivalObserverLocationId, reason: context.reason,
    });
  }
  return transitions;
}

function resetStoryLoop(definition: StoryDefinition, source: StoryCampaignState, summary: StoryLoopSummary): StoryCampaignState {
  const previousLoop = source.currentLoop;
  const characterStates = Object.fromEntries(definition.characters.map((character) => {
    const persistentBonus = Math.min(10, previousLoop + 1) * (character.persistentTrustPerLoop ?? 0);
    const previousContinuity = source.characterStates[character.id]?.continuity;
    const memoryMode = character.storyProfile?.crossLoopMemory ?? 'none';
    const continuity: StoryConversationContinuity | undefined = memoryMode === 'full' ? previousContinuity : memoryMode === 'faint_recognition' && previousContinuity ? {
      recentExchangeSummaries: [],
      openThreads: [],
      recentMoves: [],
      residue: [],
      ...(previousContinuity.lastRelationshipSignal ? { lastRelationshipSignal: previousContinuity.lastRelationshipSignal } : {}),
      relationshipCue: 'seems to recognize the emotional shape of a conversation they should not remember',
    } : undefined;
    return [character.id, {
      trust: clamp(character.baselineTrust + persistentBonus, 0, 100),
      suspicion: character.baselineSuspicion,
      presentedEvidenceIds: [],
      conversationCount: 0,
      emotionalState: character.storyProfile?.resetBehavior === 'preserve' ? source.characterStates[character.id]?.emotionalState ?? character.storyProfile?.initialEmotionalState ?? 'calm' : character.storyProfile?.initialEmotionalState ?? 'calm',
      exhaustedFactIds: [],
      usedTopicIds: [],
      ...(continuity ? { continuity } : {}),
    } satisfies StoryCharacterState];
  }));
  const reset: StoryCampaignState = {
    ...cloneState(source),
    status: 'active',
    currentLoop: previousLoop + 1,
    currentMinute: definition.loopStartMinute,
    currentLocationId: definition.startLocationId,
    inventoryIds: ['brass-memory-token'],
    loopFlags: [],
    witnessedEventIds: [],
    loopDiscoveredEvidenceIds: [],
    loopVisitedLocationIds: [definition.startLocationId],
    characterStates,
    loopHistory: [...source.loopHistory, summary],
    completedEndingId: null,
  };
  const policy = storyPersistencePolicy(definition.persistencePolicy);
  return policy.onLoopStart(policy.onLoopReset(source, reset));
}

function summarizeLoop(definition: StoryDefinition, state: StoryCampaignState): StoryLoopSummary {
  const factTitles = state.loopDiscoveredEvidenceIds.map((id) => definition.evidence.find((item) => item.id === id)?.title).filter(Boolean);
  const eventTitles = state.witnessedEventIds.map((id) => definition.timedEvents.find((item) => item.id === id)?.title).filter(Boolean);
  const recap = factTitles.length
    ? `You carried ${factTitles.length} new ${factTitles.length === 1 ? 'truth' : 'truths'} through midnight: ${factTitles.slice(0, 3).join(', ')}${factTitles.length > 3 ? ', and more' : ''}.`
    : eventTitles.length
      ? `You witnessed ${eventTitles.slice(0, 2).join(' and ')}, but midnight reclaimed the physical night.`
      : 'The night reset. Your brass token preserved the shape of what you learned.';
  return { loop: state.currentLoop, factsDiscovered: [...state.loopDiscoveredEvidenceIds], eventsWitnessed: [...state.witnessedEventIds], locationsVisited: [...state.loopVisitedLocationIds], recap };
}

function resumeThreadFor(continuity?: StoryConversationContinuity): string | null {
  return continuity?.openThreads.at(-1)
    ?? continuity?.residue?.slice().sort((left, right) => right.createdAtTurn - left.createdAtTurn)[0]?.summary
    ?? null;
}

function matchFreeformReveal(definition: StoryDefinition, state: StoryCampaignState, characterId: string, text: string): string[] {
  const normalized = text.toLowerCase();
  if (!normalized.trim()) return [];
  const approaches = definition.dialogueApproaches.filter((approach) => approach.characterId === characterId && storyRequirementMet(definition, state, approach.requirements));
  return unique(approaches.filter((approach) => approach.promptIntent.toLowerCase().split(/\W+/).filter((word) => word.length >= 5).some((word) => normalized.includes(word))).flatMap((approach) => approach.discoverEvidenceIds));
}

function addEvidence(state: StoryCampaignState, evidenceIds: string[]): StoryCampaignState {
  const next = cloneState(state);
  addEvidenceInPlace(next, evidenceIds);
  return next;
}

function addEvidenceInPlace(state: StoryCampaignState, evidenceIds: string[]): void {
  state.evidenceIds = unique([...state.evidenceIds, ...evidenceIds]);
  state.loopDiscoveredEvidenceIds = unique([...state.loopDiscoveredEvidenceIds, ...evidenceIds]);
}

function cloneState(state: StoryCampaignState): StoryCampaignState {
  return structuredClone(state);
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function storyScheduleRequirementMet(state: StoryCampaignState, requirements?: StoryRequirements): boolean {
  if (!requirements) return true;
  if (requirements.exactLoop !== undefined && state.currentLoop !== requirements.exactLoop) return false;
  if (requirements.minLoop !== undefined && state.currentLoop < requirements.minLoop) return false;
  if (requirements.maxLoop !== undefined && state.currentLoop > requirements.maxLoop) return false;
  if (requirements.evidenceIds?.some((id) => !state.evidenceIds.includes(id))) return false;
  if (requirements.deductionIds?.some((id) => !state.deductionIds.includes(id))) return false;
  if (requirements.witnessedEventIds?.some((id) => !state.witnessedEventIds.includes(id))) return false;
  if (requirements.flags?.some((flag) => !state.persistentFlags.includes(flag) && !state.loopFlags.includes(flag))) return false;
  if (requirements.anyFlags?.length && !requirements.anyFlags.some((flag) => state.persistentFlags.includes(flag) || state.loopFlags.includes(flag))) return false;
  return true;
}

function circularPrerequisites(nodes: Array<{ id: string; requires: string[] }>): string[] {
  const graph = new Map(nodes.map((item) => [item.id, item.requires]));
  const visiting = new Set<string>(), visited = new Set<string>(), cycles = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) { cycles.add(id); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of graph.get(id) ?? []) visit(next);
    visiting.delete(id); visited.add(id);
  };
  nodes.forEach((item) => visit(item.id));
  return [...cycles];
}
