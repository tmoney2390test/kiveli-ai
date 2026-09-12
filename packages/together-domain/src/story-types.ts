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

export interface StoryValidationReport { errors: string[]; warnings: string[] }

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
