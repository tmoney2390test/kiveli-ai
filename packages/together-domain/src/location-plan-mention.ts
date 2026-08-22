export type PlannableLocationMention = {
  id:string;
  worldId?:string;
  worldSlug?:string;
  name:string;
  slug:string;
  category:string;
  activities:string[];
  dateTypes?:string[];
  aliases?:string[];
  private?:boolean;
};

export type AssistantLocationPlanMatch = {
  locationId:string;
  worldId?:string;
  locationName:string;
  locationSlug:string;
  worldSlug?:string;
  activityKey:string;
  activityLabel:string;
  title:string;
  matchedPhrase:string;
};

export const LOCATION_PLAN_DISMISSAL_COOLDOWN_MS=24*60*60*1000;

export type LocationPlanDismissal = {
  payload?:Record<string,unknown>|null;
  updated_at?:string|null;
};

/** Keep a dismissed character-authored venue suggestion quiet for one day. */
export function isLocationPlanDismissalCoolingDown(locationId:string,dismissals:readonly LocationPlanDismissal[],now:Date=new Date(),cooldownMs:number=LOCATION_PLAN_DISMISSAL_COOLDOWN_MS):boolean{
  const nowMs=now.getTime();
  return dismissals.some((dismissal)=>{
    const dismissedLocationId=dismissal.payload?.['locationId'];
    if(typeof dismissedLocationId!=='string'||dismissedLocationId!==locationId)return false;
    const dismissedAt=new Date(String(dismissal.updated_at??'')).getTime();
    return Number.isFinite(dismissedAt)&&dismissedAt<=nowMs&&nowMs-dismissedAt<cooldownMs;
  });
}

/** Resolve a character-authored place mention to one canonical, plannable venue. */
export function matchAssistantLocationPlan(text:string,locations:PlannableLocationMention[],options:{excludeLocationIds?:readonly string[]}={}):AssistantLocationPlanMatch|null{
  const normalizedPlainText=normalizePlacePhrase(text),normalizedText=` ${normalizedPlainText} `;
  if(!normalizedPlainText)return null;
  const excluded=new Set(options.excludeLocationIds??[]);
  const candidates=locations.flatMap((location)=>{
    if(excluded.has(location.id)||['home','work'].includes(normalizePlacePhrase(location.category))||location.private)return[];
    const activityLabel=firstPlanActivity(location);
    if(!activityLabel)return[];
    const phrases=locationPhrases(location)
      .map((phrase)=>({raw:phrase,normalized:normalizePlacePhrase(phrase)}))
      .filter((phrase,index,all)=>phrase.normalized.length>=3&&all.findIndex((item)=>item.normalized===phrase.normalized)===index);
    const activityKey=normalizePlacePhrase(activityLabel).replace(/\s+/g,'_');
    return phrases.map((phrase)=>({location,activityKey,activityLabel,phrase}));
  });
  const exact=candidates.filter((candidate)=>normalizedText.includes(` ${candidate.phrase.normalized} `)).sort((left,right)=>right.phrase.normalized.length-left.phrase.normalized.length)[0];
  const fuzzy=exact?null:uniqueFuzzyCandidate(normalizedPlainText,candidates);
  const selected=exact??fuzzy;
  if(!selected)return null;
  const{location,activityKey,activityLabel,phrase}=selected;
  return{locationId:location.id,...(location.worldId?{worldId:location.worldId}:{}),...(location.worldSlug?{worldSlug:location.worldSlug}:{}),locationName:location.name,locationSlug:location.slug,activityKey,activityLabel,title:`${titleCase(activityLabel)} at ${location.name}`,matchedPhrase:phrase.raw};
}

export function normalizePlacePhrase(value:string):string{
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
}

function firstPlanActivity(location:PlannableLocationMention):string|null{
  const values=[...(location.dateTypes??[]),...location.activities].map((value)=>value.trim()).filter(Boolean);
  return values.find((value)=>!/^(work|working|home|sleep|rest|editing|client work)$/i.test(value))??null;
}

function locationPhrases(location:PlannableLocationMention):string[]{
  const canonical=normalizePlacePhrase(location.name).split(' ').filter(Boolean),suffix=canonical.length>=3?canonical.slice(1).join(' '):'';
  return[location.name,location.slug.replace(/-/g,' '),...(location.aliases??[]),suffix].filter(Boolean);
}

function uniqueFuzzyCandidate(text:string,candidates:Array<{location:PlannableLocationMention;activityKey:string;activityLabel:string;phrase:{raw:string;normalized:string}}>){
  const words=text.split(' ').filter(Boolean),matches=candidates.filter((candidate)=>{
    const phraseWords=candidate.phrase.normalized.split(' ').filter(Boolean);
    if(phraseWords.length<2)return false;
    for(let start=0;start<=words.length-phraseWords.length;start+=1){
      const window=words.slice(start,start+phraseWords.length);let edits=0,valid=true;
      for(let index=0;index<phraseWords.length;index+=1){const distance=boundedEditDistance(window[index]!,phraseWords[index]!,1);if(distance>1){valid=false;break;}edits+=distance;}
      if(valid&&edits<=1)return true;
    }
    return false;
  });
  const byLocation=new Map(matches.map((candidate)=>[candidate.location.id,candidate]));
  return byLocation.size===1?[...byLocation.values()][0]!:null;
}

function boundedEditDistance(left:string,right:string,limit:number):number{
  if(left===right)return 0;
  if(Math.abs(left.length-right.length)>limit)return limit+1;
  let previous=Array.from({length:right.length+1},(_,index)=>index);
  for(let leftIndex=1;leftIndex<=left.length;leftIndex+=1){const current=[leftIndex];let rowMinimum=current[0]!;for(let rightIndex=1;rightIndex<=right.length;rightIndex+=1){const value=Math.min(current[rightIndex-1]!+1,previous[rightIndex]!+1,previous[rightIndex-1]!+(left[leftIndex-1]===right[rightIndex-1]?0:1));current[rightIndex]=value;rowMinimum=Math.min(rowMinimum,value);}if(rowMinimum>limit)return limit+1;previous=current;}
  return previous[right.length]!;
}

function titleCase(value:string){return value.replace(/\b\w/g,(letter)=>letter.toUpperCase());}
