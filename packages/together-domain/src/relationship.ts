import { relationshipMetricNames, relationshipStages, type InteractionQuality, type RelationshipChangeSource, type RelationshipEvidenceSummary, type RelationshipHealth, type RelationshipMetrics, type RelationshipMilestoneProposal, type RelationshipPacingConfig, type RelationshipPresentationContext, type RelationshipProgressionEvaluation, type RelationshipStage, type RelationshipState } from './types.ts';

export const defaultRelationship:RelationshipState={stage:'stranger',trust:8,comfort:6,attraction:8,affinity:8,familiarity:0,respect:10,conflict:0,romantic_interest:0,commitment:0,conversationCount:0,conversationSessionCount:0,meaningfulInteractionCount:0,activeMajorConflict:false,romanceEnabled:true,romancePathStatus:'open'};
const maxDelta:Record<RelationshipChangeSource,number>={ordinary_chat:2,meaningful_disclosure:4,date:8,life_event:3,introduction:3,debug:100};
const qualityLimit:Record<InteractionQuality,number>={trivial:0,normal:1,meaningful:4,shared_experience:8,major_relationship_event:10};

export function clampMetric(value:number):number{return Math.max(0,Math.min(100,Math.round(value)));}
export function applyRelationshipProposal(state:RelationshipState,proposal:Partial<RelationshipMetrics>,source:RelationshipChangeSource):RelationshipState{return applyBoundedChanges(state,proposal,maxDelta[source]);}
export function applyInteractionProposal(state:RelationshipState,proposal:Partial<RelationshipMetrics>,quality:InteractionQuality,options:{recentLowSignalTurns?:number;romanceEnabled?:boolean;romanticSignal?:boolean}={}):RelationshipState{
  const romanceEnabled=options.romanceEnabled??state.romanceEnabled!==false;
  const repetitionMultiplier=quality==='trivial'?0:(options.recentLowSignalTurns??0)>=8?.1:(options.recentLowSignalTurns??0)>=4?.5:1;
  const sanitized={...proposal};
  if(!options.romanticSignal){delete sanitized.attraction;delete sanitized.romantic_interest;delete sanitized.commitment;}
  if(!romanceEnabled){sanitized.attraction=Math.min(0,Number(sanitized.attraction??0));sanitized.romantic_interest=Math.min(0,Number(sanitized.romantic_interest??0));sanitized.commitment=Math.min(0,Number(sanitized.commitment??0));}
  return applyBoundedChanges(state,Object.fromEntries(Object.entries(sanitized).map(([key,value])=>[key,Number(value)*repetitionMultiplier])),qualityLimit[quality]);
}
function applyBoundedChanges(state:RelationshipState,proposal:Partial<RelationshipMetrics>,limit:number):RelationshipState{const next={...state};for(const metric of relationshipMetricNames){const requested=Number(proposal[metric]??0);const delta=Math.max(-limit,Math.min(limit,Number.isFinite(requested)?requested:0));next[metric]=clampMetric(state[metric]+delta);}return next;}

export function classifyInteractionQuality(message:string,signals:{hasMemory?:boolean;hasOpenThread?:boolean;repair?:boolean;sharedExperience?:boolean;majorEvent?:boolean}={}):InteractionQuality{
  const text=message.trim().toLowerCase();
  if(signals.majorEvent)return'major_relationship_event';
  if(signals.sharedExperience)return'shared_experience';
  if(signals.hasMemory||signals.hasOpenThread||signals.repair||/\b(i feel|i'm scared|i am scared|i need to tell you|i've never told|i am worried|i'm worried|thank you for|i was wrong|i'm sorry)\b/.test(text))return'meaningful';
  if(text.length<24&&/^(hey|hi|hello|lol|lmao|cool|yeah|yep|nope|what'?s up|sup|ok|okay|nice|haha)[!?.\s]*$/.test(text))return'trivial';
  return'normal';
}

export function recordConversation(state:RelationshipState):RelationshipState{return{...state,conversationCount:state.conversationCount+1};}
export function canTransitionStage(from:RelationshipStage,to:RelationshipStage):boolean{return relationshipStages.indexOf(to)-relationshipStages.indexOf(from)===1;}
export function transitionStage(state:RelationshipState,to:RelationshipStage):RelationshipState{if(!canTransitionStage(state.stage,to))throw new Error(`Invalid relationship transition: ${state.stage} -> ${to}`);return{...state,stage:to};}

function progressionCount(state:RelationshipState):number{return state.meaningfulInteractionCount??state.conversationCount;}
export function firstDateEligibility(state:RelationshipState):{eligible:boolean;reasons:string[]}{const reasons:string[]=[];if(state.romanceEnabled===false)reasons.push('romance_disabled');if(state.romancePathStatus==='friends_only')reasons.push('friends_only');if(state.familiarity<28)reasons.push('needs_more_familiarity');if(state.trust<24)reasons.push('needs_more_trust');if(state.attraction<22)reasons.push('needs_more_attraction');if(progressionCount(state)<5)reasons.push('needs_more_meaningful_interactions');if((state.conversationSessionCount??1)<1)reasons.push('needs_more_conversation_sessions');if(state.activeMajorConflict||state.conflict>45)reasons.push('active_conflict');if(!['friend','flirting'].includes(state.stage))reasons.push('stage_not_ready');return{eligible:reasons.length===0,reasons};}
export function describeRelationship(state:RelationshipState):string{if(state.activeMajorConflict||state.conflict>45)return'Things feel a little tense right now.';if(['dating','exclusive','long_term'].includes(state.stage))return'You two have gotten noticeably closer.';if(state.trust>=35||state.comfort>=35)return'They are starting to open up to you.';if(state.stage==='friend'||state.stage==='flirting')return'There is an easy warmth between you.';return'You are still getting to know each other.';}

// Compatibility selector used by older surfaces. Database progression is guarded by Relationship Engine V2.
export function nextRelationshipMilestone(state:RelationshipState):RelationshipMilestoneProposal|null{
  const count=progressionCount(state);
  if(state.activeMajorConflict||state.conflict>45)return{kind:'repair',fromStage:state.stage,tone:'honest',presentationKey:'relationship.repair'};
  if(state.stage==='stranger'&&count>=1)return{kind:'keep_in_touch',fromStage:'stranger',toStage:'acquaintance',tone:'warm_slightly_vulnerable',presentationKey:'relationship.keep_in_touch'};
  if(state.stage==='acquaintance'&&count>=5&&state.familiarity>=15&&state.trust>=14)return{kind:'friendship_deepened',fromStage:'acquaintance',toStage:'friend',tone:'warm',presentationKey:'relationship.friendship_deepened'};
  if(state.romanceEnabled!==false&&state.romancePathStatus!=='friends_only'&&state.stage==='friend'&&count>=8&&state.attraction>=18&&state.comfort>=18)return{kind:'romantic_spark',fromStage:'friend',toStage:'flirting',tone:'playful_open',presentationKey:'relationship.romantic_spark'};
  if(firstDateEligibility(state).eligible)return{kind:'first_date_invitation',fromStage:state.stage,tone:'inviting',presentationKey:'relationship.first_date_invitation'};
  return null;
}

export function relationshipHealth(state:RelationshipState,unresolvedMisses=0):RelationshipHealth{
  if(state.activeMajorConflict||state.conflict>45||unresolvedMisses>0)return'strained';
  if(state.conflict>25||state.trust<25||state.respect<25)return'uncertain';
  if(state.trust>=60&&state.comfort>=55&&state.respect>=50&&state.conflict<20)return'close';
  if(state.trust>=35&&state.comfort>=30&&state.conflict<30)return'warm';
  return'steady';
}

export function relationshipMilestonePresentationReady(kind:RelationshipMilestoneProposal['kind'],state:RelationshipState,context:RelationshipPresentationContext={}):{ready:boolean;blockers:string[]}{
  const blockers:string[]=[];const activity=String(context.activity??'').toLowerCase(),mood=String(context.mood??'').toLowerCase();
  if(context.activeCommitment)blockers.push('active_commitment');
  if(context.waitingOnMissResolution&&kind!=='repair')blockers.push('unresolved_missed_commitment');
  if(context.availability==='busy'||/\b(sleep|working|client|meeting|commut|driving|running late|waiting for you|getting ready)\b/.test(activity))blockers.push('companion_busy');
  if(kind!=='repair'&&context.energy==='low'&&/\b(stress|upset|angry|overwhelmed|exhaust|tired)\b/.test(mood))blockers.push('poor_moment');
  const now=context.now??new Date(),last=state.lastMajorMilestoneAt?new Date(state.lastMajorMilestoneAt):null;if(last&&!Number.isNaN(last.getTime())&&now.getTime()-last.getTime()<6*3600000)blockers.push('milestone_cooldown');
  return{ready:blockers.length===0,blockers};
}

export function evaluateRelationshipProgression(input:{state:RelationshipState;evidence:RelationshipEvidenceSummary;pacing?:RelationshipPacingConfig;presentation?:RelationshipPresentationContext}):RelationshipProgressionEvaluation{
  const{state,evidence}=input,pacing=input.pacing??{},health=relationshipHealth(state,evidence.unresolvedMisses),pace=pacing.pace??'balanced';
  const friendshipDays=pace==='fast'?1:pace==='slow'?3:2,exclusiveDays=pace==='fast'?2:pace==='slow'?5:3,longTermDays=pace==='fast'?5:pace==='slow'?10:7;
  const romanceTrust=Math.round(14+((pacing.needsTrustBeforeRomance??.5)-.5)*8),romanceComfort=Math.round(18+((pacing.needsTrustBeforeRomance??.5)-.5)*6);
  const exclusiveCommitment=Math.round(28+((pacing.needsComfortBeforeCommitment??.5)-.5)*8-((pacing.exclusivityPreference??.5)-.5)*6);
  const longTermCommitment=Math.round(50+((pacing.needsComfortBeforeCommitment??.5)-.5)*8-((pacing.longTermOrientation??.5)-.5)*8);
  const daysSinceDating=elapsedDays(state.datingStartedAt,input.presentation?.now),daysSinceExclusive=elapsedDays(state.exclusiveAt,input.presentation?.now);
  let proposal:RelationshipMilestoneProposal|null=null;const blockers:string[]=[];
  if(state.activeMajorConflict||state.conflict>45)proposal={kind:'repair',fromStage:state.stage,tone:'honest',presentationKey:'relationship.repair'};
  else if(state.stage==='stranger'){
    if(evidence.progressionInteractions>=1)proposal={kind:'keep_in_touch',fromStage:'stranger',toStage:'acquaintance',tone:'warm_slightly_vulnerable',presentationKey:'relationship.keep_in_touch'};else blockers.push('needs_meaningful_interaction');
  }else if(state.stage==='acquaintance'){
    if(state.trust<14)blockers.push('needs_more_trust');if(state.familiarity<15)blockers.push('needs_more_familiarity');if(evidence.progressionInteractions<3)blockers.push('needs_more_shared_history');if(evidence.distinctActiveDays<friendshipDays)blockers.push('needs_more_time');
    if(!blockers.length)proposal={kind:'friendship_deepened',fromStage:'acquaintance',toStage:'friend',tone:'warm',presentationKey:'relationship.friendship_deepened'};
  }else if(state.stage==='friend'){
    if(state.romanceEnabled===false||state.romancePathStatus==='friends_only')return{stage:state.stage,health,nextMilestone:null};
    if(state.trust<romanceTrust)blockers.push('needs_more_trust');if(state.attraction<18)blockers.push('needs_more_attraction');if(state.comfort<romanceComfort)blockers.push('needs_more_comfort');if(evidence.romanticSignals<2&&evidence.positiveDates<1)blockers.push('needs_mutual_romantic_signal');
    if(!blockers.length)proposal={kind:'romantic_spark',fromStage:'friend',toStage:'flirting',tone:'playful_open',presentationKey:'relationship.romantic_spark'};
  }else if(state.stage==='flirting'){
    if(state.romanceEnabled===false||state.romancePathStatus==='friends_only')return{stage:state.stage,health,nextMilestone:null};
    if(evidence.definingDateCompleted&&evidence.definingDatePositive)proposal={kind:'dating_start',fromStage:'flirting',toStage:'dating',tone:'warm_direct',presentationKey:'relationship.dating_start'};
    else if(!state.relationshipDefiningDateSessionId){if(state.familiarity<28)blockers.push('needs_more_familiarity');if(state.trust<24)blockers.push('needs_more_trust');if(state.attraction<22)blockers.push('needs_more_attraction');if(evidence.progressionInteractions<5)blockers.push('needs_more_shared_history');if(!blockers.length)proposal={kind:'first_date_invitation',fromStage:'flirting',tone:'inviting',presentationKey:'relationship.first_date_invitation'};}
  }else if(state.stage==='dating'){
    if(state.trust<42)blockers.push('needs_more_trust');if(state.comfort<40)blockers.push('needs_more_comfort');if(state.romantic_interest<40)blockers.push('needs_more_romantic_interest');if(state.commitment<exclusiveCommitment)blockers.push('needs_more_commitment');if(state.respect<35)blockers.push('needs_more_respect');if(state.conflict>35||state.activeMajorConflict)blockers.push('active_conflict');if(evidence.unresolvedMisses>0)blockers.push('unresolved_missed_commitment');if(daysSinceDating<exclusiveDays)blockers.push('needs_more_time');if(evidence.sharedExperiencesAfterStage<2)blockers.push('needs_more_shared_experiences');
    if(!blockers.length)proposal={kind:'exclusivity',fromStage:'dating',toStage:'exclusive',tone:'intentional',presentationKey:'relationship.exclusivity'};
  }else if(state.stage==='exclusive'){
    if(state.trust<58)blockers.push('needs_more_trust');if(state.comfort<55)blockers.push('needs_more_comfort');if(state.respect<50)blockers.push('needs_more_respect');if(state.commitment<longTermCommitment)blockers.push('needs_more_commitment');if(state.conflict>30||state.activeMajorConflict)blockers.push('active_conflict');if(evidence.unresolvedMisses>0)blockers.push('unresolved_missed_commitment');if(daysSinceExclusive<longTermDays)blockers.push('needs_more_time');if(evidence.sharedExperiencesAfterStage<3)blockers.push('needs_more_shared_experiences');if(evidence.futurePlanningAfterStage<1)blockers.push('needs_future_planning');if(state.majorConflictStartedAt&&evidence.repairsAfterMajorConflict<1)blockers.push('needs_conflict_repair');
    if(!blockers.length)proposal={kind:'long_term',fromStage:'exclusive',toStage:'long_term',tone:'deeply_committed',presentationKey:'relationship.long_term'};
  }
  if(!proposal)return{stage:state.stage,health,nextMilestone:null};
  const presentation=relationshipMilestonePresentationReady(proposal.kind,state,{...input.presentation,waitingOnMissResolution:evidence.unresolvedMisses>0});
  return{stage:state.stage,health,nextMilestone:{kind:proposal.kind,eligible:true,presentationReady:presentation.ready,blockers:presentation.blockers,proposal}};
}

function elapsedDays(value?:string,now=new Date()):number{if(!value)return 0;const date=new Date(value);if(Number.isNaN(date.getTime()))return 0;return Math.max(0,(now.getTime()-date.getTime())/86400000);}

export function relationshipCue(state:RelationshipState):{label:string;detail:string;tone:'warm'|'spark'|'tense'|'steady'}{if(state.activeMajorConflict||state.conflict>45)return{label:'A little distance',detail:'Something feels unresolved. An honest conversation could help.',tone:'tense'};if(state.stage==='long_term')return{label:'Deeply connected',detail:'You have built a steady shared history together.',tone:'warm'};if(state.stage==='exclusive')return{label:'Choosing each other',detail:'This relationship feels intentional and secure.',tone:'warm'};if(state.stage==='dating')return{label:'Growing closer',detail:'Shared experiences are turning into something meaningful.',tone:'warm'};if(state.stage==='flirting')return{label:'There\u2019s a spark',detail:'The warmth between you has a playful romantic edge.',tone:'spark'};if(state.stage==='friend')return{label:'Easy closeness',detail:'Trust is growing and they are opening up naturally.',tone:'warm'};if(state.stage==='acquaintance')return{label:'Getting acquainted',detail:'You are beginning to understand each other.',tone:'steady'};return{label:'A first impression',detail:'Your shared story is just beginning.',tone:'steady'};}
