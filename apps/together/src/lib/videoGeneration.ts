import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DirectVideoLocationOption, VideoAudioMode, VideoDurationSeconds, VideoGenerationOptions, VideoResolution, VideoRouteOption, VideoUiGroup } from '../types';

export type VideoSelection={routeId:string;resolution:VideoResolution;duration:number;sound:boolean};
const STORAGE_KEY='kivelle:video-generation-settings:v2';
const RESOLUTIONS:ReadonlySet<string>=new Set(['480p','540p','720p','768p','1080p','4k']);
const AUDIO_MODES:ReadonlySet<string>=new Set(['toggleable','always','none','reference_only']);
const UI_GROUPS:ReadonlySet<string>=new Set(['recommended','alternatives','experimental']);
const SOURCE_MODES:ReadonlySet<string>=new Set(['existing_photo','canonical_references','generated_first_frame']);
const TIERS:ReadonlySet<string>=new Set(['standard','premium','sound','silent']);
const CONTENT_CLASSES:ReadonlySet<string>=new Set(['sfw','adult_capable']);

function record(value:unknown):Record<string,unknown>|null{return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;}
function stringValue(value:unknown):string|null{return typeof value==='string'&&value.trim()?value.trim():null;}
function stringList(value:unknown):string[]{return Array.isArray(value)?value.flatMap((item)=>{const text=stringValue(item);return text?[text]:[];}):[];}
function numberList(value:unknown):number[]{return Array.isArray(value)?[...new Set(value.map(Number).filter((item)=>Number.isInteger(item)&&item>0&&item<=20))].sort((a,b)=>a-b):[];}

function normalizedLocation(value:unknown):DirectVideoLocationOption|null{
  const item=record(value),source=stringValue(item?.source),name=stringValue(item?.name),worldId=stringValue(item?.worldId),worldName=stringValue(item?.worldName);
  if(!item||!source||!['current','home','place'].includes(source)||!name||!worldId||!worldName)return null;
  return{source:source as DirectVideoLocationOption['source'],locationId:stringValue(item.locationId),name,detail:stringValue(item.detail),worldId,worldName};
}

export function normalizeVideoRouteOption(value:unknown):VideoRouteOption|null{
  const item=record(value);if(!item)return null;
  const id=stringValue(item.id),displayName=stringValue(item.displayName),badge=stringValue(item.badge),description=stringValue(item.description);
  const allowedDurations=numberList(item.allowedDurations),supportedResolutions=stringList(item.supportedResolutions).filter((entry)=>RESOLUTIONS.has(entry)) as VideoResolution[];
  const audioMode=stringValue(item.audioMode),quotes=record(item.creditQuotes),providerQuotes=record(item.providerCostQuotes),uiGroup=stringValue(item.uiGroup),futureConsumerTier=stringValue(item.futureConsumerTier),contentClass=stringValue(item.contentClass),contentLabel=stringValue(item.contentLabel),modelFamily=stringValue(item.modelFamily);
  if(!id||!displayName||!badge||!description||!contentClass||!CONTENT_CLASSES.has(contentClass)||!contentLabel||!modelFamily||!allowedDurations.length||!supportedResolutions.length||!audioMode||!AUDIO_MODES.has(audioMode)||!quotes||!providerQuotes||!uiGroup||!UI_GROUPS.has(uiGroup)||!futureConsumerTier||!TIERS.has(futureConsumerTier))return null;
  const soundChoices=['none','reference_only'].includes(audioMode)?[false]:[false,true];
  for(const resolution of supportedResolutions)for(const duration of allowedDurations)for(const sound of soundChoices){const key=videoQuoteKey(resolution,duration,sound),quote=Number(quotes[key]),providerQuote=Number(providerQuotes[key]);if(!Number.isFinite(quote)||quote<0||!Number.isFinite(providerQuote)||providerQuote<0)return null;}
  const durationCandidate=Number(item.durationSeconds),durationSeconds=allowedDurations.includes(durationCandidate)?durationCandidate:allowedDurations[0]!;
  const resolutionCandidate=stringValue(item.resolution),resolution=supportedResolutions.includes(resolutionCandidate as VideoResolution)?resolutionCandidate as VideoResolution:supportedResolutions[0]!;
  const sourceModes=stringList(item.sourceModes).filter((entry)=>SOURCE_MODES.has(entry)) as VideoRouteOption['sourceModes'];
  const aspectRatios=stringList(item.supportedAspectRatios).filter((entry)=>entry==='9:16'||entry==='16:9') as Array<'9:16'|'16:9'>;
  const wait=record(item.estimatedWaitSeconds),requirements=record(item.referenceImageRequirements),badges=stringList(item.badges);
  return{
    id,modelKey:stringValue(item.modelKey)??undefined,modelEndpoint:stringValue(item.modelEndpoint)??undefined,provider:'wavespeed',displayName,description,contentClass:contentClass as VideoRouteOption['contentClass'],contentLabel,modelFamily,badge,badges:badges.length?badges:[badge],uiGroup:uiGroup as VideoUiGroup,
    mediaMode:'image_to_video',sourceModes:sourceModes.length?sourceModes:['existing_photo'],durationSeconds,allowedDurations,resolution,supportedResolutions,supportedAspectRatios:aspectRatios.length?aspectRatios:['9:16','16:9'],aspectRatioBehavior:item.aspectRatioBehavior==='selectable'?'selectable':'source',
    referenceImageRequirements:{source:1,canonicalCharacterMin:Number(requirements?.canonicalCharacterMin)===0?0:0,canonicalCharacterMax:Number(requirements?.canonicalCharacterMax)===0?0:0},audioMode:audioMode as VideoAudioMode,audioLabel:stringValue(item.audioLabel)??(['none','reference_only'].includes(audioMode)?'This model currently generates silent video.':'Sound can be included or disabled.'),
    lastFrameSupport:item.lastFrameSupport===true,estimatedWaitSeconds:{min:Math.max(1,Number(wait?.min)||20),max:Math.max(1,Number(wait?.max)||300),median:Math.max(1,Number(wait?.median)||90)},creditQuotes:Object.fromEntries(Object.entries(quotes).flatMap(([key,raw])=>{const quote=Number(raw);return Number.isFinite(quote)&&quote>=0?[[key,quote]]:[]})),providerCostQuotes:Object.fromEntries(Object.entries(providerQuotes).flatMap(([key,raw])=>{const quote=Number(raw);return Number.isFinite(quote)&&quote>=0?[[key,quote]]:[]})),
    rawModelNamesExposed:item.rawModelNamesExposed===true,experimental:item.experimental===true,testingOnly:true,futureConsumerTier:futureConsumerTier as VideoRouteOption['futureConsumerTier'],
  };
}

export function normalizeVideoGenerationOptions(value:unknown):VideoGenerationOptions{
  const item=record(value);if(!item)throw new Error('Video models could not be loaded. Try again.');
  const suppliedRoutes=Array.isArray(item.routes)?item.routes:[],routes=suppliedRoutes.flatMap((route)=>{const normalized=normalizeVideoRouteOption(route);return normalized?[normalized]:[];});
  if(suppliedRoutes.length&&routes.length===0)throw new Error('Video models are updating. Try again in a moment.');
  const motionPresets=Array.isArray(item.motionPresets)?item.motionPresets.flatMap((value)=>{const preset=record(value),id=stringValue(preset?.id),displayName=stringValue(preset?.displayName),description=stringValue(preset?.description);return id&&['subtle','playful','cinematic'].includes(id)&&displayName&&description?[{id:id as 'subtle'|'playful'|'cinematic',displayName,description}]:[];}):[];
  const location=record(item.locationOptions),current=normalizedLocation(location?.current),home=normalizedLocation(location?.home),places=Array.isArray(location?.places)?location.places.flatMap((place)=>{const normalized=normalizedLocation(place);return normalized?[normalized]:[]}):[];
  const selectorMode=stringValue(item.selectorMode);
  return{
    available:item.available===true,selectorMode:selectorMode==='testers'||selectorMode==='all'?selectorMode:'off',rawModelNamesExposed:item.rawModelNamesExposed===true,testingPriceLabel:stringValue(item.testingPriceLabel)??undefined,
    sourceMode:SOURCE_MODES.has(String(item.sourceMode))?item.sourceMode as VideoGenerationOptions['sourceMode']:undefined,sourceAspectRatio:item.sourceAspectRatio==='16:9'?'16:9':'9:16',defaultRouteId:routes.some((route)=>route.id===item.defaultRouteId)?String(item.defaultRouteId):routes[0]?.id??null,routes,
    motionPresets:motionPresets.length?motionPresets:[{id:'subtle',displayName:'Subtle',description:'Natural micro-movement.'},{id:'playful',displayName:'Playful',description:'A little more expression and movement.'},{id:'cinematic',displayName:'Cinematic',description:'Gentle camera movement.'}],creditBalance:Number.isFinite(Number(item.creditBalance))?Number(item.creditBalance):null,
    activeVideo:item.activeVideo===true,activeVideoId:stringValue(item.activeVideoId),activeVideoStatus:typeof item.activeVideoStatus==='string'?item.activeVideoStatus as VideoGenerationOptions['activeVideoStatus']:null,latestVideoId:stringValue(item.latestVideoId),latestVideoStatus:typeof item.latestVideoStatus==='string'?item.latestVideoStatus as VideoGenerationOptions['latestVideoStatus']:null,
    referenceSummary:record(item.referenceSummary) as VideoGenerationOptions['referenceSummary']??undefined,
    locationOptions:location&&current&&stringValue(location.worldId)&&stringValue(location.worldName)?{defaultSource:'current',worldId:String(location.worldId),worldName:String(location.worldName),current,...(home?{home}:{}),places}:undefined,
  };
}

export function videoWaitLabel(route:VideoRouteOption):string{
  const wait=route.estimatedWaitSeconds;
  return wait.median>=120?`About ${Math.round(wait.median/60)}–${Math.ceil(wait.max/60)} min`:`About ${wait.min}–${wait.max} sec`;
}

export function videoQuoteKey(resolution:VideoResolution,duration:number,sound:boolean):string{return`${resolution}:${duration}:${sound?'sound':'silent'}`;}
export function videoCreditCost(route:VideoRouteOption,durationSeconds:VideoDurationSeconds=route.durationSeconds,resolution:VideoResolution=route.resolution,sound=false):number{
  const value=route.creditQuotes[videoQuoteKey(resolution,durationSeconds,sound)];
  return Number.isFinite(value)?Number(value):Number.POSITIVE_INFINITY;
}
export function videoProviderCostUsd(route:VideoRouteOption,durationSeconds:VideoDurationSeconds=route.durationSeconds,resolution:VideoResolution=route.resolution,sound=false):number{
  const value=route.providerCostQuotes[videoQuoteKey(resolution,durationSeconds,sound)];
  return Number.isFinite(value)?Number(value):Number.POSITIVE_INFINITY;
}
export function videoProviderCostLabel(value:number):string{return Number.isFinite(value)?`$${value.toFixed(2)}`:'Unavailable';}

export function videoComparisonQuote(route:VideoRouteOption,current:Partial<Pick<VideoSelection,'resolution'|'duration'|'sound'>>={}){
  const resolution=current.resolution&&route.supportedResolutions.includes(current.resolution)?current.resolution:route.resolution;
  const duration=current.duration&&route.allowedDurations.includes(current.duration)?current.duration:route.durationSeconds;
  const sound=Boolean(current.sound)&&!['none','reference_only'].includes(route.audioMode);
  const credits=videoCreditCost(route,duration,resolution,sound),providerCostUsd=videoProviderCostUsd(route,duration,resolution,sound);
  return{resolution,duration,sound,credits,providerCostUsd};
}

export function videoOutputLabel(route:VideoRouteOption,aspectRatio:VideoGenerationOptions['sourceAspectRatio'],durationSeconds:VideoDurationSeconds=route.durationSeconds,resolution:VideoResolution=route.resolution,sound=false):string{
  const audio=sound?'sound requested':route.audioMode==='always'?'audio removed before delivery':'silent';
  return `${durationSeconds}-second ${aspectRatio??route.supportedAspectRatios[0]} MP4 · ${resolution} · ${audio}`;
}

export function canSubmitVideoSelection(input:{route:VideoRouteOption|null;durationSeconds:VideoDurationSeconds;resolution?:VideoResolution;sound?:boolean;balance:number;loading:boolean;submitting:boolean;hasActiveVideo:boolean}):boolean{
  if(!input.route)return false;const resolution=input.resolution??input.route.resolution,sound=input.sound??false,cost=videoCreditCost(input.route,input.durationSeconds,resolution,sound);
  return input.route.allowedDurations.includes(input.durationSeconds)&&input.route.supportedResolutions.includes(resolution)&&(!sound||!['none','reference_only'].includes(input.route.audioMode))&&Number.isFinite(cost)&&!input.loading&&!input.submitting&&!input.hasActiveVideo&&input.balance>=cost;
}

export function validVideoFeedback(verdict:'looks_good'|'needs_work',reasonCodes:string[]):boolean{return verdict==='looks_good'?reasonCodes.length===0:reasonCodes.length>0;}

export function preferredVideoRouteId(options:Pick<VideoGenerationOptions,'routes'|'defaultRouteId'>,current=''):string{
  if(options.routes.some((route)=>route.id===current))return current;
  return options.routes.find((route)=>route.id===options.defaultRouteId)?.id??options.routes.find((route)=>route.badge.toLowerCase()==='recommended')?.id??options.routes[0]?.id??'';
}

export function videoDurationRangeLabel(route:Pick<VideoRouteOption,'allowedDurations'>):string{
  const durations=[...route.allowedDurations].sort((a,b)=>a-b),first=durations[0],last=durations.at(-1);
  return first===last?`${first} seconds`:`${first}–${last} seconds`;
}

export function normalizedVideoSelection(options:VideoGenerationOptions,stored?:Partial<VideoSelection>|null,currentRouteId=''):VideoSelection|null{
  const routeId=preferredVideoRouteId(options,stored?.routeId??currentRouteId),route=options.routes.find((item)=>item.id===routeId);if(!route)return null;
  const resolution=stored?.resolution&&route.supportedResolutions.includes(stored.resolution)?stored.resolution:route.resolution;
  const duration=stored?.duration&&route.allowedDurations.includes(stored.duration)?stored.duration:route.durationSeconds;
  const sound=Boolean(stored?.sound)&&!['none','reference_only'].includes(route.audioMode);
  return{routeId,resolution,duration,sound};
}

export async function loadVideoSelection():Promise<Partial<VideoSelection>|null>{try{const raw=await AsyncStorage.getItem(STORAGE_KEY);return raw?JSON.parse(raw) as Partial<VideoSelection>:null;}catch{return null;}}
export async function saveVideoSelection(value:VideoSelection):Promise<void>{try{await AsyncStorage.setItem(STORAGE_KEY,JSON.stringify(value));}catch{/* Preference persistence is best effort. */}}
