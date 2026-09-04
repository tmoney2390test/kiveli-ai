export const relationshipMetricNames=['trust','comfort','attraction','affinity','familiarity','respect','conflict','romantic_interest','commitment'] as const;
export type RelationshipMetricName=typeof relationshipMetricNames[number];
export type RelationshipMetrics=Record<RelationshipMetricName,number>;
export const relationshipStages=['stranger','acquaintance','friend','flirting','dating','exclusive','long_term'] as const;
export type RelationshipStage=typeof relationshipStages[number];
export type RomancePathStatus='open'|'friends_only';
export type RelationshipHealth='strained'|'uncertain'|'steady'|'warm'|'close';
export interface RelationshipState extends RelationshipMetrics{stage:RelationshipStage;conversationCount:number;conversationSessionCount?:number;meaningfulInteractionCount?:number;engagementScore?:number;genuineBackAndForthTurns?:number;trivialEngagementScore?:number;chemistryHeat?:number;physicalTension?:number;userFlirtSignals?:number;characterFlirtSignals?:number;mutualFlirtSignals?:number;attractionAcknowledged?:boolean;lastChemistryChangeAt?:string;lastFlirtSignalAt?:string;activeMajorConflict:boolean;romanceEnabled?:boolean;romancePathStatus?:RomancePathStatus;stageEnteredAt?:string;datingStartedAt?:string;exclusiveAt?:string;longTermAt?:string;lastMajorMilestoneAt?:string;relationshipDefiningDateSessionId?:string;datingInvitationAcceptedAt?:string;majorConflictStartedAt?:string;lastRepairCompletedAt?:string}
export type RelationshipChangeSource='ordinary_chat'|'meaningful_disclosure'|'date'|'life_event'|'introduction'|'debug';
export type InteractionQuality='trivial'|'normal'|'meaningful'|'shared_experience'|'major_relationship_event';
export const relationshipMilestoneKinds=['keep_in_touch','friendship_deepened','romantic_spark','first_date_invitation','dating_start','exclusivity','long_term','repair'] as const;
export type RelationshipMilestoneKind=typeof relationshipMilestoneKinds[number];
export interface RelationshipMilestoneProposal{kind:RelationshipMilestoneKind;fromStage:RelationshipStage;toStage?:RelationshipStage;tone:string;presentationKey:string;context?:Record<string,unknown>}
export const relationshipEvidenceTypes=['meaningful_conversation','romantic_signal','shared_plan_completed','date_completed','trip_completed','major_shared_moment','commitment_kept','commitment_missed','repair_completed','future_planning','trust_consequence','trust_repair'] as const;
export type RelationshipEvidenceType=typeof relationshipEvidenceTypes[number];
export const trustConsequenceKinds=['hostility','contempt','deception','manipulation','boundary_violation','confidence_breach','vulnerability_dismissal','threat','broken_promise'] as const;
export type TrustConsequenceKind=typeof trustConsequenceKinds[number];
export const trustConsequenceSeverities=['minor','moderate','serious','major'] as const;
export type TrustConsequenceSeverity=typeof trustConsequenceSeverities[number];
export interface TrustConsequenceProposal{kind:TrustConsequenceKind;severity:TrustConsequenceSeverity;confidence:number;reasonCode:string;evidenceBasis:'explicit_user_language'|'canonical_context';repairable:boolean;source:'deterministic'|'model'}
export interface TrustRepairProposal{apology:boolean;accountability:boolean;correctiveAction:boolean;confidence:number;reasonCode:string;source:'deterministic'|'model'}
export interface RelationshipEvidenceSummary{meaningfulConversations:number;romanticSignals:number;distinctActiveDays:number;progressionInteractions:number;engagementScore?:number;genuineBackAndForthTurns?:number;sharedExperiences:number;positiveDates:number;completedTrips:number;majorSharedMoments:number;commitmentsKept:number;commitmentsMissed:number;repairsCompleted:number;futurePlanning:number;unresolvedMisses:number;sharedExperiencesAfterStage:number;futurePlanningAfterStage:number;repairsAfterMajorConflict:number;definingDateCompleted:boolean;definingDatePositive:boolean}
export interface RelationshipPacingConfig{pace?:'slow'|'balanced'|'fast';romanceInitiative?:number;exclusivityPreference?:number;longTermOrientation?:number;needsTrustBeforeRomance?:number;needsComfortBeforeCommitment?:number;conflictSensitivity?:number}
export interface RelationshipPresentationContext{availability?:string;energy?:string;mood?:string;activity?:string;activeCommitment?:boolean;waitingOnMissResolution?:boolean;now?:Date}
export interface RelationshipProgressionEvaluation{stage:RelationshipStage;health:RelationshipHealth;nextMilestone:{kind:RelationshipMilestoneKind;eligible:boolean;presentationReady:boolean;blockers:string[];proposal:RelationshipMilestoneProposal}|null}
export type SpiceLevel=1|2|3;
export type ChemistryBand='none'|'little'|'flirty'|'strong'|'electric';
export type FlirtExpressionStyle='playful'|'competitive'|'direct'|'adventurous'|'subtle'|'warm';
export interface ConversationEngagementInput{message:string;precedingAssistantMessage?:string;recentUserMessages?:string[];memoryWorthy?:boolean;relationshipSignificant?:boolean;repair?:boolean;sharedExperience?:boolean;majorEvent?:boolean}
export interface ConversationEngagementEvaluation{quality:InteractionQuality;score:number;trivialScore:number;genuineTurn:boolean;directlyResponsive:boolean;newInformation:boolean;relationshipSignificant:boolean;reasonCodes:string[]}
export interface ChemistrySignal{strength:number;kind:'none'|'compliment'|'teasing'|'interest'|'attraction'|'date'|'affectionate'|'suggestive'|'rejection';reasonCodes:string[]}
export interface ChemistryUpdateInput{state:RelationshipState;spiceLevel:SpiceLevel;userSignal:ChemistrySignal;characterSignal:ChemistrySignal;personality?:Record<string,unknown>;contextFit?:number;currentMood?:string;now?:Date}
export interface ChemistryUpdate{chemistryHeat:number;physicalTension:number;userFlirtSignals:number;characterFlirtSignals:number;mutualFlirtSignals:number;attractionAcknowledged:boolean;lastChemistryChangeAt?:string;lastFlirtSignalAt?:string;heatDelta:number;canInitiateFlirt:boolean;expressionStyle:FlirtExpressionStyle;band:ChemistryBand;reasonCodes:string[]}

export const memoryTypes=['semantic','preference','episodic','relationship','emotional','open_thread'] as const;
export type MemoryType=typeof memoryTypes[number];
export interface MemoryCandidate{type:MemoryType;canonicalText:string;importance:number;confidence:number;sensitivity:'none'|'personal'|'sensitive';dedupeKey:string;subjectKey:string;metadata?:Record<string,unknown>}
export interface MemoryRecord extends MemoryCandidate{id:string;pinned:boolean;status:'active'|'forgotten'|'superseded';createdAt:string;updatedAt:string;lastRecalledAt?:string;lastRetrievedAt?:string;lastMentionedAt?:string;retrievalCount?:number;mentionCount?:number;reinforcementCount?:number;worldId?:string;locationId?:string;participantInstanceIds?:string[];contextTags?:string[];sourceType?:MemorySourceType;sourceId?:string;episodeId?:string;validFrom?:string;validTo?:string;supersedesMemoryId?:string}
export type MemoryRecallMode='silent_context'|'natural_callback'|'direct_recall';
export type MemorySourceType='message'|'scene'|'plan'|'date'|'moment'|'life_event'|'manual';
export interface MemoryActivationContext{now:Date;query:string;intent:string;worldId?:string;locationId?:string;activityKey?:string;interactionKey?:string;participantInstanceIds?:string[];relationshipStage?:string;currentMood?:string;recentAssistantMemoryIds?:string[]}
export interface ActivatedMemory{id:string;canonicalText:string;memoryType:string;semanticSimilarity:number;lexicalRelevance:number;sceneRelevance:number;relationshipRelevance:number;importance:number;emotionalSalience:number;recentRetrievalPenalty:number;recentMentionPenalty:number;activationScore:number;recallMode:MemoryRecallMode;reasonCodes:string[]}
export interface MemoryRecallPlan{silentContext:ActivatedMemory[];callbackCandidates:ActivatedMemory[];directRecall:ActivatedMemory[];explicitCallbackAllowance:number}
export interface CharacterMemoryProfile{salientDomains:string[];locationCueStrength:number;activityCueStrength:number;socialCueStrength:number;nostalgia:number;detailOrientation:number;callbackFrequency:number;behavioralLearningRate:number}
export interface EpisodeSignificanceInput{durationMinutes:number;meaningfulActionCount:number;actionFamilyCount:number;relationshipSignificance?:number;firstTimeActivity?:boolean;firstTimeLocation?:boolean;milestoneAction?:boolean;explicitPhoto?:boolean;emotionalShift?:number;routinePenalty?:number}
export interface UserBehaviorObservation{sourceId:string;sceneId?:string;occurredAt:string;value?:string;weight?:number}
export interface UserBehaviorPatternEvaluation{eligible:boolean;confidence:number;supportCount:number;distinctScenes:number;distinctDays:number;reasonCodes:string[]}

export interface OpenThread{topic:string;dedupeKey:string;expectedAt?:string;importance:number;createdAt:string;resolvedAt?:string;followUpEligible:boolean}
export interface ScheduleEntry{dayOfWeek:number;startMinute:number;endMinute:number;location:string;activity:string;availability:'available'|'limited'|'busy';energyDelta:number;moodInfluence?:string}
export interface CharacterLifeState{location:string;activity:string;availability:'available'|'limited'|'busy';mood:string;energy:'low'|'medium'|'high';resolvedAt:string}
export interface LifeEventTemplate{id:string;title:string;type:string;significance:number;location:string;participants:string[];proactiveEligible:boolean;summary:string}
export interface SimulatedLifeEvent extends LifeEventTemplate{occurredAt:string;userVisible:boolean}

export const lifeEventCategories=['ordinary','work','social','relationship','family','personal','discovery','celebration','conflict','opportunity','setback','health','weather','world','romance','intimacy','travel'] as const;
export type LifeEventCategory=typeof lifeEventCategories[number];
export const eventTones=['mundane','funny','positive','awkward','stressful','exciting','romantic','emotional','surprising'] as const;
export type EventTone=typeof eventTones[number];
export const eventScales=['micro','normal','meaningful','major'] as const;
export type EventScale=typeof eventScales[number];
export const contentLevels=['standard','romance','mature','explicit'] as const;
export type ContentLevel=typeof contentLevels[number];
export interface ContentConditions{minRelationshipStage?:RelationshipStage;maxRelationshipStage?:RelationshipStage;minMetrics?:Partial<RelationshipMetrics>;maxConflict?:number;requiredCharactersIntroduced?:string[];requiredLocations?:string[];requiredMemories?:string[];requiredArcState?:string;timeOfDay?:string[];daysOfWeek?:number[];contentMode?:ContentLevel[];cooldownDays?:number}
export interface ContentEffects{relationship?:Partial<RelationshipMetrics>;mood?:Record<string,number>;availability?:string;createMoment?:boolean;openThread?:{topic:string;importance?:number};unlockContent?:string[];beginArc?:string;advanceArc?:string;photoOpportunity?:string}
export interface RichLifeEventTemplate extends LifeEventTemplate{category:LifeEventCategory;tone:EventTone;scale:EventScale;contentLevel:ContentLevel;conditions?:ContentConditions;effects?:ContentEffects;locationTags?:string[];narrativeSeed?:string;followups?:string[]}
export interface StoryArcChapter{id:string;title:string;triggerConditions?:ContentConditions;eventTemplateIds?:string[];possibleNextChapterIds?:string[];userVisibility:'hidden'|'contextual'|'visible';mayTriggerProactiveMessage:boolean;mayCreateMoment:boolean;narrativeSeed:string;minimumHoursBeforeNext?:number}
export interface StoryArcTemplate{id:string;slug:string;title:string;category:string;eligibleCharacters:string[];minRelationshipStage?:RelationshipStage;prerequisites?:ContentConditions;chapters:StoryArcChapter[];cooldownDays?:number;repeatable:boolean;priority:'minor'|'major'}
export interface ActiveStoryArc{id:string;templateId:string;currentChapterId:string;status:'active'|'paused'|'completed';nextEligibleAt?:string;startedAt:string;completedAt?:string}
export interface ContentSelectionContext{now:Date;relationship:RelationshipState;characterSlug:string;locationTags:string[];contentMode:ContentLevel;recentTemplateIds:string[];recentCategories:LifeEventCategory[];activeArcIds:string[];seed:string}
export interface ScoredContentCandidate{template:RichLifeEventTemplate;score:number;reasons:string[]}

export const datePhases=['arrival','ordering','early_conversation','personal_conversation','unexpected_moment','dessert','after_date','resolution'] as const;
export type DatePhase=typeof datePhases[number];
export interface DateSessionState{id:string;phase:DatePhase;phaseIndex:number;status:'upcoming'|'active'|'completed'|'deferred';choices:string[]}

export interface KnowledgeFact{id:string;ownerInstanceId:string;canonicalText:string;sensitivity:'none'|'personal'|'sensitive'}
export interface KnowledgeTransfer{factId:string;fromInstanceId:string;toInstanceId:string;eventId:string;reason:string;createdAt:string}

export interface DialogueContext{
  character:{name:string;occupation:string;personality:string[];communicationStyle:Record<string,unknown>;boundaries:string[]};
  life:CharacterLifeState;
  relationship:RelationshipState;
  memories:Pick<MemoryRecord,'id'|'type'|'canonicalText'|'importance'>[];
  openThreads:OpenThread[];
  social:{companions:string[];recentEvents:string[]};
  recentConversation:{role:'user'|'assistant';content:string;createdAt:string}[];
  userMessage:string;
}
export interface PostConversationProposal{relationshipChanges:Partial<RelationshipMetrics>;memoryCandidates:MemoryCandidate[];resolvedThreads:string[];newThreads:OpenThread[];momentCandidate:boolean;moodEffects:Record<string,number>}
