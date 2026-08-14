import{relationshipMetricNames,relationshipStages,type RelationshipChangeSource,type RelationshipMetrics,type RelationshipMilestoneProposal,type RelationshipStage,type RelationshipState}from'./types';

export const defaultRelationship:RelationshipState={stage:'stranger',trust:8,comfort:6,attraction:8,affinity:8,familiarity:0,respect:10,conflict:0,romantic_interest:0,commitment:0,conversationCount:0,activeMajorConflict:false};
const maxDelta:Record<RelationshipChangeSource,number>={ordinary_chat:2,meaningful_disclosure:4,date:8,life_event:3,introduction:3,debug:100};

export function clampMetric(value:number):number{return Math.max(0,Math.min(100,Math.round(value)));}
export function applyRelationshipProposal(state:RelationshipState,proposal:Partial<RelationshipMetrics>,source:RelationshipChangeSource):RelationshipState{
  const limit=maxDelta[source];const next={...state};
  for(const metric of relationshipMetricNames){const requested=Number(proposal[metric]??0);const delta=Math.max(-limit,Math.min(limit,Number.isFinite(requested)?requested:0));next[metric]=clampMetric(state[metric]+delta);}
  return next;
}
export function recordConversation(state:RelationshipState):RelationshipState{return{...state,conversationCount:state.conversationCount+1};}
export function canTransitionStage(from:RelationshipStage,to:RelationshipStage):boolean{return relationshipStages.indexOf(to)-relationshipStages.indexOf(from)===1;}
export function transitionStage(state:RelationshipState,to:RelationshipStage):RelationshipState{
  if(!canTransitionStage(state.stage,to))throw new Error(`Invalid relationship transition: ${state.stage} -> ${to}`);
  return{...state,stage:to};
}
export function firstDateEligibility(state:RelationshipState):{eligible:boolean;reasons:string[]}{
  const reasons:string[]=[];
  if(state.familiarity<28)reasons.push('needs_more_familiarity');
  if(state.trust<24)reasons.push('needs_more_trust');
  if(state.attraction<22)reasons.push('needs_more_attraction');
  if(state.conversationCount<5)reasons.push('needs_more_conversations');
  if(state.activeMajorConflict||state.conflict>45)reasons.push('active_conflict');
  if(!['friend','flirting'].includes(state.stage))reasons.push('stage_not_ready');
  return{eligible:reasons.length===0,reasons};
}
export function describeRelationship(state:RelationshipState):string{
  if(state.activeMajorConflict||state.conflict>45)return'Things feel a little tense right now.';
  if(['dating','exclusive','long_term'].includes(state.stage))return'You two have gotten noticeably closer.';
  if(state.trust>=35||state.comfort>=35)return'Maya is starting to open up to you.';
  if(state.stage==='friend'||state.stage==='flirting')return'There is an easy spark between you.';
  return'You are still getting to know each other.';
}

export function nextRelationshipMilestone(state:RelationshipState):RelationshipMilestoneProposal|null{
  if(state.activeMajorConflict||state.conflict>45)return{kind:'repair',fromStage:state.stage,title:'Something feels unresolved',body:'Maya would rather address the tension honestly than pretend it is not there.',prompt:'How do you want to handle it?',choices:[{id:'talk_it_out',label:'Talk it out',tone:'primary'},{id:'give_space',label:'Give her some space',tone:'secondary'}]};
  if(state.stage==='stranger'&&state.conversationCount>=1)return{kind:'keep_in_touch',fromStage:'stranger',toStage:'acquaintance',title:'Keep in touch?',body:'Maya pauses before leaving, then offers a small smile. “I’d like to keep talking, if you would.”',prompt:'What do you say?',choices:[{id:'accept',label:'I’d like that',tone:'primary'},{id:'defer',label:'Let’s take it slowly',tone:'secondary'}]};
  if(state.stage==='acquaintance'&&state.conversationCount>=5&&state.familiarity>=15&&state.trust>=14)return{kind:'friendship_deepened',fromStage:'acquaintance',toStage:'friend',title:'This is becoming real',body:'The conversation has started to feel less like chance meetings and more like an actual friendship.',prompt:'How do you meet the moment?',choices:[{id:'accept',label:'I feel it too',tone:'primary'},{id:'defer',label:'Keep getting to know each other',tone:'secondary'}]};
  if(state.stage==='friend'&&state.conversationCount>=8&&state.attraction>=18&&state.comfort>=18)return{kind:'romantic_spark',fromStage:'friend',toStage:'flirting',title:'There’s a spark here',body:'Maya lets a teasing moment linger, giving you room to decide whether this stays friendship or becomes something more.',prompt:'Where do you want this to go?',choices:[{id:'accept',label:'Lean into the spark',tone:'primary'},{id:'stay_friends',label:'Keep this as friendship',tone:'secondary'},{id:'defer',label:'Not yet',tone:'secondary'}]};
  if(firstDateEligibility(state).eligible)return{kind:'first_date_invitation',fromStage:state.stage,title:'Dinner at Juniper?',body:'Maya grins. “You’ve mentioned that place enough times. Are you actually going to take me?”',prompt:'What do you say?',choices:[{id:'accept',label:'Yes—let’s do it',tone:'primary'},{id:'defer',label:'Ask me again later',tone:'secondary'}]};
  return null;
}

export function relationshipCue(state:RelationshipState):{label:string;detail:string;tone:'warm'|'spark'|'tense'|'steady'}{
  if(state.activeMajorConflict||state.conflict>45)return{label:'A little distance',detail:'Something feels unresolved. An honest conversation could help.',tone:'tense'};
  if(state.stage==='long_term')return{label:'Deeply connected',detail:'You have built a steady shared history together.',tone:'warm'};
  if(state.stage==='exclusive')return{label:'Choosing each other',detail:'This relationship feels intentional and secure.',tone:'warm'};
  if(state.stage==='dating')return{label:'Growing closer',detail:'Shared experiences are turning into something meaningful.',tone:'warm'};
  if(state.stage==='flirting')return{label:'There’s a spark',detail:'The warmth between you has a playful romantic edge.',tone:'spark'};
  if(state.stage==='friend')return{label:'Easy closeness',detail:'Trust is growing and Maya is opening up naturally.',tone:'warm'};
  if(state.stage==='acquaintance')return{label:'Getting acquainted',detail:'You are beginning to understand each other.',tone:'steady'};
  return{label:'A first impression',detail:'Your shared story is just beginning.',tone:'steady'};
}
