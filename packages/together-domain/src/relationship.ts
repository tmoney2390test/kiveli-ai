import { relationshipMetricNames, relationshipStages, type InteractionQuality, type RelationshipChangeSource, type RelationshipMetrics, type RelationshipMilestoneProposal, type RelationshipStage, type RelationshipState } from './types.ts';

export const defaultRelationship:RelationshipState={stage:'stranger',trust:8,comfort:6,attraction:8,affinity:8,familiarity:0,respect:10,conflict:0,romantic_interest:0,commitment:0,conversationCount:0,conversationSessionCount:0,meaningfulInteractionCount:0,activeMajorConflict:false,romanceEnabled:true};
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
export function firstDateEligibility(state:RelationshipState):{eligible:boolean;reasons:string[]}{const reasons:string[]=[];if(state.romanceEnabled===false)reasons.push('romance_disabled');if(state.familiarity<28)reasons.push('needs_more_familiarity');if(state.trust<24)reasons.push('needs_more_trust');if(state.attraction<22)reasons.push('needs_more_attraction');if(progressionCount(state)<5)reasons.push('needs_more_meaningful_interactions');if((state.conversationSessionCount??1)<1)reasons.push('needs_more_conversation_sessions');if(state.activeMajorConflict||state.conflict>45)reasons.push('active_conflict');if(!['friend','flirting'].includes(state.stage))reasons.push('stage_not_ready');return{eligible:reasons.length===0,reasons};}
export function describeRelationship(state:RelationshipState):string{if(state.activeMajorConflict||state.conflict>45)return'Things feel a little tense right now.';if(['dating','exclusive','long_term'].includes(state.stage))return'You two have gotten noticeably closer.';if(state.trust>=35||state.comfort>=35)return'They are starting to open up to you.';if(state.stage==='friend'||state.stage==='flirting')return'There is an easy warmth between you.';return'You are still getting to know each other.';}

export function nextRelationshipMilestone(state:RelationshipState):RelationshipMilestoneProposal|null{
  const count=progressionCount(state);
  if(state.activeMajorConflict||state.conflict>45)return{kind:'repair',fromStage:state.stage,tone:'honest',presentationKey:'relationship.repair'};
  if(state.stage==='stranger'&&count>=1)return{kind:'keep_in_touch',fromStage:'stranger',toStage:'acquaintance',tone:'warm_slightly_vulnerable',presentationKey:'relationship.keep_in_touch'};
  if(state.stage==='acquaintance'&&count>=5&&state.familiarity>=15&&state.trust>=14)return{kind:'friendship_deepened',fromStage:'acquaintance',toStage:'friend',tone:'warm',presentationKey:'relationship.friendship_deepened'};
  if(state.romanceEnabled!==false&&state.stage==='friend'&&count>=8&&state.attraction>=18&&state.comfort>=18)return{kind:'romantic_spark',fromStage:'friend',toStage:'flirting',tone:'playful_open',presentationKey:'relationship.romantic_spark'};
  if(firstDateEligibility(state).eligible)return{kind:'first_date_invitation',fromStage:state.stage,tone:'inviting',presentationKey:'relationship.first_date_invitation'};
  return null;
}

export function relationshipCue(state:RelationshipState):{label:string;detail:string;tone:'warm'|'spark'|'tense'|'steady'}{if(state.activeMajorConflict||state.conflict>45)return{label:'A little distance',detail:'Something feels unresolved. An honest conversation could help.',tone:'tense'};if(state.stage==='long_term')return{label:'Deeply connected',detail:'You have built a steady shared history together.',tone:'warm'};if(state.stage==='exclusive')return{label:'Choosing each other',detail:'This relationship feels intentional and secure.',tone:'warm'};if(state.stage==='dating')return{label:'Growing closer',detail:'Shared experiences are turning into something meaningful.',tone:'warm'};if(state.stage==='flirting')return{label:'There\u2019s a spark',detail:'The warmth between you has a playful romantic edge.',tone:'spark'};if(state.stage==='friend')return{label:'Easy closeness',detail:'Trust is growing and they are opening up naturally.',tone:'warm'};if(state.stage==='acquaintance')return{label:'Getting acquainted',detail:'You are beginning to understand each other.',tone:'steady'};return{label:'A first impression',detail:'Your shared story is just beginning.',tone:'steady'};}
