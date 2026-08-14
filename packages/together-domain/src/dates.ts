import{datePhases,type DatePhase,type DateSessionState,type RelationshipMetrics}from'./types';

export function startDate(id:string):DateSessionState{return{id,phase:'arrival',phaseIndex:0,status:'active',choices:[]};}
export function advanceDate(session:DateSessionState,choiceId:string):DateSessionState{
  if(session.status!=='active')throw new Error('Only active dates can advance.');
  const nextIndex=session.phaseIndex+1;if(nextIndex>=datePhases.length-1)return{...session,phase:'resolution',phaseIndex:datePhases.length-1,status:'completed',choices:[...session.choices,choiceId]};
  return{...session,phase:datePhases[nextIndex]!,phaseIndex:nextIndex,status:'active',choices:[...session.choices,choiceId]};
}
export function dateChoiceImpact(choiceId:string):Partial<RelationshipMetrics>{
  if(choiceId.includes('callback')||choiceId.includes('airport'))return{familiarity:4,comfort:4,affinity:3,attraction:2};
  if(choiceId.includes('share')||choiceId.includes('dessert'))return{comfort:3,attraction:3,romantic_interest:3};
  if(choiceId.includes('listen')||choiceId.includes('day'))return{trust:3,respect:3,comfort:2};
  if(choiceId.includes('walk'))return{attraction:4,romantic_interest:4,commitment:1};
  return{affinity:2,familiarity:2};
}
export function isValidPhaseTransition(from:DatePhase,to:DatePhase):boolean{return datePhases.indexOf(to)-datePhases.indexOf(from)===1;}
