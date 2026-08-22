export const LOCATION_LORE_VERSION=2 as const;

export type LocationRecurringPerson={
  label:string;
  role:string;
  rhythm?:string;
  canonicalCharacterSlug?:string;
};

export type LocationLoreV2={
  version?:number;
  authored?:boolean;
  summary?:string;
  atmosphere?:string[];
  sensoryDetails?:string[];
  signatureDetails?:string[];
  layout?:string[];
  crowdRhythm?:Record<string,string>;
  conversationHooks?:string[];
  stableFacts?:string[];
  localEtiquette?:string[];
  nearbyLocationSlugs?:string[];
  publicHistory?:string[];
  recurringPeople?:LocationRecurringPerson[];
  activityNotes?:Record<string,string>;
  accessNotes?:string[];
  weatherNotes?:string[];
  storySeeds?:string[];
};

export type LocationVisualContextV2={
  canonicalPrompt?:string;
  indoorOutdoor?:'indoor'|'outdoor'|'mixed';
  architecture?:string[];
  materials?:string[];
  lighting?:string[];
  furniture?:string[];
  recurringObjects?:string[];
  atmosphere?:string[];
  visualAnchors?:string[];
  avoid?:string[];
  viewpoints?:string[];
  daypartLighting?:Record<string,string>;
  weatherVariants?:Record<string,string>;
};

export type LocationLoreIntent='general'|'location'|'plan'|'date'|'story'|'media';

export type LocationLoreSelection={
  summary?:string;
  atmosphere:string[];
  sensoryDetails:string[];
  signatureDetails:string[];
  layout:string[];
  crowdNow?:string;
  stableFacts:string[];
  localEtiquette:string[];
  conversationHooks:string[];
  publicHistory:string[];
  recurringPeople:LocationRecurringPerson[];
  activityNotes:Record<string,string>;
  accessNotes:string[];
  weatherNotes:string[];
  storySeeds:string[];
};

export function normalizeLocationLore(value:unknown):LocationLoreV2{
  const row=isRecord(value)?value:{};
  const version=numberOrUndefined(row['version']),authored=typeof row['authored']==='boolean'?row['authored']:undefined,summary=stringOrUndefined(row['summary']);
  return{
    ...(version!==undefined?{version}:{}),
    ...(authored!==undefined?{authored}:{}),
    ...(summary?{summary}:{}),
    atmosphere:stringArray(row['atmosphere']),
    sensoryDetails:stringArray(row['sensoryDetails']),
    signatureDetails:stringArray(row['signatureDetails']),
    layout:stringArray(row['layout']),
    crowdRhythm:stringRecord(row['crowdRhythm']),
    conversationHooks:stringArray(row['conversationHooks']),
    stableFacts:stringArray(row['stableFacts']),
    localEtiquette:stringArray(row['localEtiquette']),
    nearbyLocationSlugs:stringArray(row['nearbyLocationSlugs']),
    publicHistory:stringArray(row['publicHistory']),
    recurringPeople:Array.isArray(row['recurringPeople'])?row['recurringPeople'].flatMap((item)=>{
      if(!isRecord(item))return[];
      const label=stringOrUndefined(item['label']),role=stringOrUndefined(item['role']);
      if(!label||!role)return[];
      return[{label,role,...(stringOrUndefined(item['rhythm'])?{rhythm:String(item['rhythm'])}:{}),...(stringOrUndefined(item['canonicalCharacterSlug'])?{canonicalCharacterSlug:String(item['canonicalCharacterSlug'])}:{})}];
    }):[],
    activityNotes:stringRecord(row['activityNotes']),
    accessNotes:stringArray(row['accessNotes']),
    weatherNotes:stringArray(row['weatherNotes']),
    storySeeds:stringArray(row['storySeeds']),
  };
}

export function selectLocationLore(input:{lore:unknown;intent?:LocationLoreIntent;daypart?:string;seed?:string}):LocationLoreSelection{
  const lore=normalizeLocationLore(input.lore),intent=input.intent??'general',seed=input.seed??`${input.daypart??'afternoon'}:${intent}`;
  const direct=intent==='location'||intent==='story',planning=intent==='plan'||intent==='date';
  return{
    ...(lore.summary?{summary:lore.summary}:{}),
    atmosphere:rotate(lore.atmosphere??[],seed,direct?3:2),
    sensoryDetails:rotate(lore.sensoryDetails??[],`${seed}:sensory`,direct?3:1),
    signatureDetails:rotate(lore.signatureDetails??[],`${seed}:signature`,direct?3:2),
    layout:direct?rotate(lore.layout??[],`${seed}:layout`,3):[],
    ...(input.daypart&&lore.crowdRhythm?.[input.daypart]?{crowdNow:lore.crowdRhythm[input.daypart]}:{}),
    stableFacts:rotate(lore.stableFacts??[],`${seed}:facts`,direct?4:2),
    localEtiquette:direct||planning?rotate(lore.localEtiquette??[],`${seed}:etiquette`,2):[],
    conversationHooks:intent==='general'||direct?rotate(lore.conversationHooks??[],`${seed}:hooks`,2):[],
    publicHistory:direct?rotate(lore.publicHistory??[],`${seed}:history`,3):[],
    recurringPeople:direct?rotate(lore.recurringPeople??[],`${seed}:people`,3):[],
    activityNotes:planning||direct?takeRecord(lore.activityNotes??{},planning?5:3):{},
    accessNotes:planning||direct?rotate(lore.accessNotes??[],`${seed}:access`,3):[],
    weatherNotes:direct||planning?rotate(lore.weatherNotes??[],`${seed}:weather`,2):[],
    storySeeds:intent==='story'?rotate(lore.storySeeds??[],`${seed}:story`,3):[],
  };
}

export function compactLocationLoreForDirectory(value:unknown):LocationLoreV2{
  const lore=normalizeLocationLore(value);
  return{
    ...(lore.version!==undefined?{version:lore.version}:{}),
    ...(lore.authored!==undefined?{authored:lore.authored}:{}),
    ...(lore.summary?{summary:lore.summary}:{}),
    atmosphere:(lore.atmosphere??[]).slice(0,2),
    signatureDetails:(lore.signatureDetails??[]).slice(0,2),
    crowdRhythm:lore.crowdRhythm??{},
    accessNotes:(lore.accessNotes??[]).slice(0,1),
  };
}

function rotate<T>(items:T[],seed:string,limit:number):T[]{
  if(items.length<=limit)return[...items];
  const offset=stableHash(seed)%items.length;
  return Array.from({length:limit},(_,index)=>items[(offset+index)%items.length]!).filter((item,index,all)=>all.indexOf(item)===index);
}

function stableHash(value:string){let hash=2166136261;for(let index=0;index<value.length;index+=1){hash^=value.charCodeAt(index);hash=Math.imul(hash,16777619);}return hash>>>0;}
function takeRecord(value:Record<string,string>,limit:number){return Object.fromEntries(Object.entries(value).slice(0,limit));}
function isRecord(value:unknown):value is Record<string,unknown>{return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);}
function stringArray(value:unknown):string[]{return Array.isArray(value)?[...new Set(value.map((item)=>String(item).trim()).filter(Boolean))]:[];}
function stringRecord(value:unknown):Record<string,string>{return isRecord(value)?Object.fromEntries(Object.entries(value).flatMap(([key,item])=>{const text=stringOrUndefined(item);return text?[[key,text]]:[]})):{};}
function stringOrUndefined(value:unknown):string|undefined{if(typeof value!=='string')return undefined;const text=value.trim();return text||undefined;}
function numberOrUndefined(value:unknown):number|undefined{const number=Number(value);return Number.isFinite(number)?number:undefined;}
