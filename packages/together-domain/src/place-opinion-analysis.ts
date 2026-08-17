export type PlaceOpinionReasoningCode='explicit_character_opinion'|'opinion_changed'|'shared_experience_reaction';

export type PlaceOpinionCandidate={
  placeRef:string;
  sentiment:number;
  confidence:number;
  summary:string;
  tags:string[];
  favoriteDetails:string[];
  dislikedDetails:string[];
  reasoningCode:PlaceOpinionReasoningCode;
};

export type PlaceOpinionAnalysisPlace={slug:string;name:string;current:boolean;existingView:string|null};
export type PlaceOpinionAnalysisInput={assistantMessage:string;places:PlaceOpinionAnalysisPlace[]};

export function deterministicPlaceOpinionCandidates(input:PlaceOpinionAnalysisInput):PlaceOpinionCandidate[]{
  if(!assistantExpressesPlaceOpinion(input.assistantMessage))return[];
  if(!input.places.length)return[];
  const lower=input.assistantMessage.toLowerCase();
  const named=input.places.find((place)=>lower.includes(place.name.toLowerCase())||lower.includes(place.slug.replace(/-/g,' ')));
  const place=named??input.places.find((item)=>item.current);if(!place)return[];
  const negative=/\b(hate|dislike|can'?t stand|not my (?:kind of )?place|too crowded|too loud|avoid|worse than|awful|terrible)\b/i.test(input.assistantMessage);
  const positive=/\b(love|really like|enjoy|my kind of place|favorite|growing on me|better than i expected|good fit|great|perfect)\b/i.test(input.assistantMessage);
  if(!negative&&!positive)return[];
  const changed=/\b(growing on me|changed my mind|used to|better than i expected|not anymore|lately)\b/i.test(input.assistantMessage);
  const tags=['quiet','crowded','music','food','coffee','romantic','creative','outdoors','loud','cozy','social'].filter((tag)=>lower.includes(tag));
  return[{placeRef:place.slug,sentiment:negative&&!positive?-.65:positive&&!negative?.7:.1,confidence:.72,summary:opinionSentence(input.assistantMessage),tags,favoriteDetails:[],dislikedDetails:[],reasoningCode:changed?'opinion_changed':'explicit_character_opinion'}];
}

export function validatePlaceOpinionCandidates(value:unknown,input:PlaceOpinionAnalysisInput):PlaceOpinionCandidate[]{
  if(!assistantExpressesPlaceOpinion(input.assistantMessage))return[];
  const allowed=new Set(input.places.map((place)=>place.slug));
  const reasons=new Set<PlaceOpinionReasoningCode>(['explicit_character_opinion','opinion_changed','shared_experience_reaction']);
  return(Array.isArray(value)?value:[]).slice(0,3).flatMap((item):PlaceOpinionCandidate[]=>{
    if(!item||typeof item!=='object')return[];const row=item as Record<string,unknown>;
    const placeRef=stringValue(row['placeRef']).toLowerCase(),summary=stringValue(row['summary']).trim().slice(0,280),reasoningCode=stringValue(row['reasoningCode']) as PlaceOpinionReasoningCode;
    const confidence=clampUnit(row['confidence']),sentiment=Math.max(-1,Math.min(1,Number(row['sentiment']??0)));
    if(!allowed.has(placeRef)||summary.length<8||confidence<.65||!Number.isFinite(sentiment)||!reasons.has(reasoningCode))return[];
    const strings=(candidate:unknown,limit:number)=>Array.isArray(candidate)?[...new Set(candidate.map(String).map((entry)=>entry.trim()).filter(Boolean))].slice(0,limit):[];
    return[{placeRef,sentiment,confidence:Math.min(.95,confidence),summary,tags:strings(row['tags'],8),favoriteDetails:strings(row['favoriteDetails'],6),dislikedDetails:strings(row['dislikedDetails'],6),reasoningCode}];
  });
}

function assistantExpressesPlaceOpinion(message:string):boolean{return/\b(i (?:really )?(?:like|love|enjoy|prefer|dislike|hate)|i can'?t stand|not my (?:kind of )?place|my kind of place|growing on me|changed my mind|better than i expected|worse than i expected|i(?:'m| am) (?:not )?(?:into|fond of)|(?:it|this place) (?:is|feels|seems) (?:actually |really |kind of )?(?:great|perfect|awful|terrible|too loud|too crowded|not for me))\b/i.test(message);}
function opinionSentence(message:string):string{return message.split(/(?<=[.!?])\s+/).find((sentence)=>assistantExpressesPlaceOpinion(sentence))?.trim().slice(0,280)??message.trim().slice(0,280);}
function clampUnit(value:unknown):number{const number=Number(value);return Math.max(0,Math.min(1,Number.isFinite(number)?number:.5));}
function stringValue(value:unknown):string{return typeof value==='string'?value:'';}
