export type StoryCatalogItem={
  slug:string;title:string;genre:string;description:string;worldSlug:string;status:'playable'|'coming_soon';
  durationLabel:string;accent:string;
  campaign:null|{id:string;status:string;loop:number;factsDiscovered:number;factsTotal:number|null;endingsDiscovered:number;endingsTotal:number|null;completedEndingId:string|null;lastPlayedAt:string;version:number};
};
export type StoryLibrary={stories:StoryCatalogItem[];discoveries:Array<{story_slug:string;discovery_type:string;discovery_key:string;discovered_at:string}>};
export type StoryEvidence={id:string;title:string;description:string;source:string;category:'critical'|'character_truth'|'atmosphere';relatedCharacterIds:string[];relatedLocationIds:string[];trackId?:string;corroborates?:string[];contradicts?:string[];presentedTo:string[];discoveredThisLoop:boolean;pinned:boolean};
export type StoryDepartureWarning={minutesUntil:number;departureMinute:number;time:string};
export type StoryFollowPlan={targetLocationId:string;targetLocationName:string;travelMinutes:number;arrivalMinute:number;arrivalTime:string;catchable:boolean;mayMoveBeforeArrival:boolean};
export type StoryPerson={id:string;name:string;role:string;portraitSlug:string;biography:string;activity?:string;departureWarning?:StoryDepartureWarning|null;followPlan?:StoryFollowPlan|null;trust:number;suspicion:number;emotionalState?:string;relationshipCue?:string|null;participationTier?:'core'|'supporting'|'ambient'|'excluded';pinned?:boolean;currentLocationId?:string|null;approaches?:Array<{id:string;label:string;timeCost:number}>};
export type StoryAmbientPerson=StoryPerson&{participationTier:'ambient'};
export type StoryLocation={id:string;name:string;subtitle:string;description:string;unlocked:boolean;travelMinutes:number|null;current:boolean;visitedThisLoop:boolean;knownCharacters:Array<{id:string;name:string;portraitSlug:string;activity?:string;departureWarning?:StoryDepartureWarning|null}>};
export type StoryMessage={id:string;role:'user'|'character'|'system';character_slug:string|null;content:string;loop_number:number;story_minute:number;location_slug:string;metadata:Record<string,unknown>;created_at:string};
export type StoryGuidanceLead={id:string;kind:'conversation'|'investigation'|'location'|'finale';title:string;reason:string;actionLabel:string;sourceId:string;characterId?:string;locationId?:string;interactionId?:string;approachId?:string;endingId?:string;availableNow:boolean;priority:number};
export type StoryInvestigationTrack={id:string;title:string;question:string;description:string;requiredCount:number;discoveredCount:number;completed:boolean;status:'unopened'|'active'|'resolved'};
export type StoryCampaign={
  id:string;storySlug:string;worldId?:string|null;title:string;subtitle:string;status:'active'|'midnight'|'completed'|'abandoned';version:number;loop:number;currentMinute:number;currentTime:string;minutesToMidnight:number;
  currentLocation:{id:string;name:string;subtitle:string;description:string;artworkKey?:string|null;state?:string;sensoryVocabulary?:string[]};factsDiscovered:number;factsTotal:number;deductionsCompleted:number;deductionsTotal:number;endingsDiscovered:number;endingsTotal:number;
  contentVersion?:number;compatibility?:null|{migratedInMemory:boolean;fromVersion:number;toVersion:number;message:string};theme?:Record<string,unknown>|null;
  evidence:StoryEvidence[];deductions:StoryInvestigationTrack[];locations:StoryLocation[];presentCharacters:StoryPerson[];othersNearby:StoryAmbientPerson[];dossiers:StoryPerson[];
  interactions:Array<{id:string;title:string;description:string;timeCost:number;newInformation:boolean}>;timeline:Array<{id:string;title:string;time:string;minute:number|null;locationId:string|null;witnessed:boolean;known:boolean;changedThisLoop:boolean;pinned:boolean}>;
  availableEndings:Array<{id:string;title:string;description:string}>;completedEnding:null|{id:string;title:string;description:string;epilogue:string};discoveredEndingIds:string[];endingArchive:Array<{id:string;title:string;discovered:boolean}>;majorChoices:string[];loopHistory:Array<Record<string,unknown>>;inventory:string[];
  settings:{textSize?:'small'|'medium'|'large';sound?:boolean;motion?:boolean;content?:'standard'|'mature';guidance?:'subtle'|'balanced'|'direct'};messages:StoryMessage[];
  guidance:{phase:'discovery'|'investigation'|'confrontation'|'resolution';phaseLabel:string;objective:string;objectiveReason:string;hintLevel:0|1|2;stalledActions:number;leads:StoryGuidanceLead[];recentOutcome:null|{madeProgress:boolean;title:string;detail:string;next:string}};
  proactiveBeat?:null|{characterId:string;title:string;body:string;tone:'invitation'|'pressure'|'recognition'};
  arrivalOpportunity?:null|{characterId:string;name:string;portraitSlug:string;activity?:string|null};
};
export type StoryAction={type:'travel';locationId:string}|{type:'follow';characterId:string}|{type:'absence';characterId:string;choice:'wait'|'leave_note'|'ask_nearby'}|{type:'investigate';interactionId:string}|{type:'wait';minutes:number}|{type:'reset'}|{type:'finale';endingId:string}|{type:'present_evidence';characterId:string;evidenceId:string};
export type StoryActionResponse={action?:Record<string,unknown>;campaign:StoryCampaign};
