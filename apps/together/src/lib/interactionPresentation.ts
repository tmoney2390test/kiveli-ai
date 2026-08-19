import type { CharacterInteractionProposal, SceneAction } from '../types';

export type InteractionFeedbackPresentation={label:string;status:'accepted'|'countered'|'declined';counterLabel?:string};

export function interactionFeedback(action:SceneAction|undefined,fallbackLabel:string):InteractionFeedbackPresentation{
  const status=action?.decision_status==='countered'?'countered':action?.decision_status==='declined'?'declined':'accepted';
  const counter=action?.result?.counterCandidate;
  const counterLabel=counter&&typeof counter==='object'?String((counter as Record<string,unknown>).label??'').trim():'';
  return{label:fallbackLabel,status,...(counterLabel?{counterLabel}:{})};
}

export function interactionFeedbackCopy(feedback:InteractionFeedbackPresentation,characterName:string){
  if(feedback.status==='countered')return`${characterName} suggested ${feedback.counterLabel??'something else'} instead.`;
  if(feedback.status==='declined')return`${characterName} passed on ${feedback.label}.`;
  return`You chose ${feedback.label}.`;
}

export function proposalHeading(proposal:CharacterInteractionProposal,characterName:string){return proposal.source==='counter'?`${characterName.toUpperCase()} HAS ANOTHER IDEA`:`${characterName.toUpperCase()} HAS AN IDEA`;}
