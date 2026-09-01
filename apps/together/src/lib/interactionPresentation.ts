import type { CharacterInteractionProposal, Message, SceneAction } from '../types';

export type SceneActionTimelineEntry={id:string;label:string;resolvedLabel:string;decision:'accepted'|'countered'|'declined'};

export function sceneActionTimelineEntryFromAction(action:SceneAction,fallbackLabel:string):SceneActionTimelineEntry{
  const decision=sceneActionDecision(action.decision_status);
  const requestedLabel=nonEmptyString(action.payload?.candidate&&typeof action.payload.candidate==='object'?(action.payload.candidate as Record<string,unknown>).label:null)??fallbackLabel;
  const counter=action.result?.counterCandidate;
  const counterLabel=counter&&typeof counter==='object'?nonEmptyString((counter as Record<string,unknown>).label):null;
  const resultLabel=nonEmptyString(action.result?.label);
  const resolvedLabel=decision==='countered'?(counterLabel??resultLabel??requestedLabel):(resultLabel??requestedLabel);
  return{id:action.id,label:requestedLabel,resolvedLabel,decision};
}

export function sceneActionTimelineEntryFromMessage(message:Message):SceneActionTimelineEntry|null{
  const metadata=message.provider_metadata;
  if(message.role!=='assistant'||metadata?.source!=='scene_action')return null;
  const id=nonEmptyString(metadata.sceneActionId),label=nonEmptyString(metadata.sceneActionLabel),resolvedLabel=nonEmptyString(metadata.sceneActionResolvedLabel)??label;
  if(!id||!label||!resolvedLabel)return null;
  return{id,label,resolvedLabel,decision:sceneActionDecision(metadata.sceneActionDecision)};
}

export function sceneActionDividerLabel(entry:SceneActionTimelineEntry,characterName:string){
  const name=characterName.trim().split(/\s+/)[0]||characterName.trim()||'Your companion';
  if(entry.decision==='countered')return`${name} suggested ${entry.resolvedLabel} instead`;
  if(entry.decision==='declined')return`${name} passed on ${entry.label}`;
  return`${completedActionLabel(entry.resolvedLabel,name)}${mentionsName(entry.resolvedLabel,name)?'':` with ${name}`}`;
}

function completedActionLabel(value:string,characterName:string){
  const personalized=value.trim()
    .replace(/\bthey are\b/gi,`${characterName} is`)
    .replace(/\bthey're\b/gi,`${characterName} is`)
    .replace(/\btheir\b/gi,`${characterName}'s`)
    .replace(/\bthem\b/gi,characterName)
    .replace(/\s+together\b/gi,'')
    .replace(/\s{2,}/g,' ')
    .trim();
  const match=personalized.match(/^([^\s]+)(.*)$/);
  if(!match)return'Got together';
  const sourceVerb=match[1]??'',verb=sourceVerb.toLowerCase(),rest=match[2]??'';
  const irregular:Record<string,string>={bring:'Brought',buy:'Bought',choose:'Chose',come:'Came',do:'Did',drink:'Drank',eat:'Ate',find:'Found',get:'Got',give:'Gave',go:'Went',have:'Had',keep:'Kept',leave:'Left',let:'Let',make:'Made',map:'Mapped',meet:'Met','people-watch':'People-watched',pick:'Picked',put:'Put',read:'Read',ride:'Rode',run:'Ran',say:'Said',see:'Saw',sing:'Sang',sit:'Sat',spend:'Spent',stand:'Stood',take:'Took',tell:'Told',think:'Thought'};
  const past=irregular[verb]??regularPastTense(sourceVerb);
  return`${past}${rest}`.trim();
}

function regularPastTense(verb:string){
  if(/e$/i.test(verb))return`${verb}d`;
  if(/[^aeiou]y$/i.test(verb))return`${verb.slice(0,-1)}ied`;
  if(/^(?:chat|grab|plan|step|stop)$/i.test(verb))return`${verb}${verb.at(-1)}ed`;
  return`${verb}ed`;
}

function mentionsName(label:string,name:string){return new RegExp(`\\b${escapeRegExp(name)}\\b`,'i').test(label.replace(/\bthem\b/gi,name).replace(/\btheir\b/gi,`${name}'s`).replace(/\bthey(?: are|'re)\b/gi,`${name} is`));}
function escapeRegExp(value:string){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function nonEmptyString(value:unknown){const normalized=typeof value==='string'?value.trim():'';return normalized||null;}
function sceneActionDecision(value:unknown):SceneActionTimelineEntry['decision']{return value==='countered'?'countered':value==='declined'?'declined':'accepted';}

export function proposalHeading(proposal:CharacterInteractionProposal,characterName:string){return proposal.source==='counter'?`${characterName.toUpperCase()} HAS ANOTHER IDEA`:`${characterName.toUpperCase()} HAS AN IDEA`;}
