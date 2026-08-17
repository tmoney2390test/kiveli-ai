export type PlaceOpinionSource='chat'|'scene'|'date'|'plan'|'authored';

export type PlaceOpinionEvidence={
  sentiment:number;
  confidence:number;
  summary:string;
  tags:string[];
  favoriteDetails:string[];
  dislikedDetails:string[];
  source:PlaceOpinionSource;
};

export type CharacterPlacePerspectiveState={
  sentiment:number;
  confidence:number;
  opinionSummary:string|null;
  opinionTags:string[];
  favoriteDetails:string[];
  dislikedDetails:string[];
  evidenceCount:number;
};

const sourceWeight:Record<PlaceOpinionSource,number>={chat:.8,scene:1,date:1,plan:.9,authored:1.4};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,Number.isFinite(value)?value:0));
const clean=(items:string[],limit:number)=>[...new Set(items.map((item)=>item.trim()).filter(Boolean))].slice(0,limit);

export function emptyCharacterPlacePerspective():CharacterPlacePerspectiveState{return{sentiment:0,confidence:0,opinionSummary:null,opinionTags:[],favoriteDetails:[],dislikedDetails:[],evidenceCount:0};}

/** Applies one validated observation without allowing a single line of dialogue
 * to overwrite a well-supported view. Contradictory evidence moves sentiment
 * gradually while retaining the latest high-confidence summary. */
export function applyPlaceOpinionEvidence(current:CharacterPlacePerspectiveState|undefined,evidence:PlaceOpinionEvidence):CharacterPlacePerspectiveState{
  const state=current??emptyCharacterPlacePerspective();
  const confidence=clamp(evidence.confidence,0,1);
  const weight=confidence*sourceWeight[evidence.source];
  if(weight<.4||!evidence.summary.trim())return state;
  const priorWeight=Math.min(8,Math.max(state.confidence,state.evidenceCount*.7));
  const sentiment=clamp((state.sentiment*priorWeight+clamp(evidence.sentiment,-1,1)*weight)/Math.max(.001,priorWeight+weight),-1,1);
  const nextConfidence=clamp(1-(1-state.confidence)*(1-Math.min(.32,weight*.24)),0,1);
  const mayReplaceSummary=!state.opinionSummary||confidence>=.72||Math.sign(sentiment)!==Math.sign(state.sentiment);
  return{
    sentiment,
    confidence:nextConfidence,
    opinionSummary:mayReplaceSummary?evidence.summary.trim().slice(0,280):state.opinionSummary,
    opinionTags:clean([...state.opinionTags,...evidence.tags],10),
    favoriteDetails:clean([...state.favoriteDetails,...evidence.favoriteDetails],8),
    dislikedDetails:clean([...state.dislikedDetails,...evidence.dislikedDetails],8),
    evidenceCount:state.evidenceCount+1,
  };
}

export function mergeAuthoredPlacePerspective(authored:CharacterPlacePerspectiveState|undefined,learned:CharacterPlacePerspectiveState|undefined):CharacterPlacePerspectiveState{
  if(!authored)return learned??emptyCharacterPlacePerspective();
  if(!learned||learned.evidenceCount===0)return authored;
  const authoredWeight=Math.max(.5,authored.confidence*1.4),learnedWeight=Math.max(.7,Math.min(8,learned.evidenceCount*.7));
  return{
    sentiment:clamp((authored.sentiment*authoredWeight+learned.sentiment*learnedWeight)/(authoredWeight+learnedWeight),-1,1),
    confidence:Math.max(authored.confidence,learned.confidence),
    opinionSummary:learned.opinionSummary??authored.opinionSummary,
    opinionTags:clean([...authored.opinionTags,...learned.opinionTags],10),
    favoriteDetails:clean([...authored.favoriteDetails,...learned.favoriteDetails],8),
    dislikedDetails:clean([...authored.dislikedDetails,...learned.dislikedDetails],8),
    evidenceCount:learned.evidenceCount,
  };
}

export function placeSentimentLabel(value:number):'avoids'|'not a favorite'|'mixed'|'likes'|'favorite'{if(value<=-.55)return'avoids';if(value<=-.18)return'not a favorite';if(value<.25)return'mixed';if(value<.72)return'likes';return'favorite';}
