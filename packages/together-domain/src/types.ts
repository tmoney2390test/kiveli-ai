export const relationshipMetricNames=['trust','comfort','attraction','affinity','familiarity','respect','conflict','romantic_interest','commitment'] as const;
export type RelationshipMetricName=typeof relationshipMetricNames[number];
export type RelationshipMetrics=Record<RelationshipMetricName,number>;
export const relationshipStages=['stranger','acquaintance','friend','flirting','dating','exclusive','long_term'] as const;
export type RelationshipStage=typeof relationshipStages[number];
export type RomancePathStatus='open'|'friends_only';
export type RelationshipHealth='strained'|'uncertain'|'steady'|'warm'|'close';
export interface RelationshipState extends RelationshipMetrics{stage:RelationshipStage;conversationCount:number;conversationSessionCount?:number;meaningfulInteractionCount?:number;activeMajorConflict:boolean;romanceEnabled?:boolean;romancePathStatus?:RomancePathStatus;stageEnteredAt?:string;datingStartedAt?:string;exclusiveAt?:string;longTermAt?:string;lastMajorMilestoneAt?:string;relationshipDefiningDateSessionId?:string;datingInvitationAcceptedAt?:string;majorConflictStartedAt?:string;lastRepairCompletedAt?:string}
export type RelationshipChangeSource='ordinary_chat'|'meaningful_disclosure'|'date'|'life_event'|'introduction'|'debug';
export type InteractionQuality='trivial'|'normal'|'meaningful'|'shared_experience'|'major_relationship_event';
export const relationshipMilestoneKinds=['keep_in_touch','friendship_deepened','romantic_spark','first_date_invitation','dating_start','exclusivity','long_term','repair'] as const;
export type RelationshipMilestoneKind=typeof relationshipMilestoneKinds[number];
export interface RelationshipMilestoneProposal{kind:RelationshipMilestoneKind;fromStage:RelationshipStage;toStage?:RelationshipStage;tone:string;presentationKey:string;context?:Record<string,unknown>}
export const relationshipEvidenceTypes=['meaningful_conversation','romantic_signal','shared_plan_completed','date_completed','trip_completed','major_shared_moment','commitment_kept','commitment_missed','repair_completed','future_planning'] as const;
export type RelationshipEvidenceType=typeof relationshipEvidenceTypes[number];
export interface RelationshipEvidenceSummary{meaningfulConversations:number;romanticSignals:number;distinctActiveDays:number;progressionInteractions:number;sharedExperiences:number;positiveDates:number;completedTrips:number;majorSharedMoments:number;commitmentsKept:number;commitmentsMissed:number;repairsCompleted:number;futurePlanning:number;unresolvedMisses:number;sharedExperiencesAfterStage:number;futurePlanningAfterStage:number;repairsAfterMajorConflict:number;definingDateCompleted:boolean;definingDatePositive:boolean}
export interface RelationshipPacingConfig{pace?:'slow'|'balanced'|'fast';romanceInitiative?:number;exclusivityPreference?:number;longTermOrientation?:number;needsTrustBeforeRomance?:number;needsComfortBeforeCommitment?:number;conflictSensitivity?:number}
export interface RelationshipPresentationContext{availability?:'available'|'limited'|'busy'|string;energy?:'low'|'medium'|'high'|string;mood?:string;activity?:string;activeCommitment?:boolean;waitingOnMissResolution?:boolean;now?:Date}
export interface RelationshipProgressionEvaluation{stage:RelationshipStage;health:RelationshipHealth;nextMilestone:{kind:RelationshipMilestoneKind;eligible:boolean;presentationReady:boolean;blockers:string[];proposal:RelationshipMilestoneProposal}|null}

export const memoryTypes=['semantic','preference','episodic','relationship','emotional','open_thread'] as const;
export type MemoryType=typeof memoryTypes[number];
export interface MemoryCandidate{type:MemoryType;canonicalText:string;importance:number;confidence:number;sensitivity:'none'|'personal'|'sensitive';dedupeKey:string;subjectKey:string;metadata?:Record<string,unknown>}
export interface MemoryRecord extends MemoryCandidate{id:string;pinned:boolean;status:'active'|'forgotten'|'superseded';createdAt:string;updatedAt:string;lastRecalledAt?:string}

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
