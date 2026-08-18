import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';
import { track } from './together.ts';
import { placeContextSnapshot, resolvePlaceContext, type PlaceContext } from './together-place.ts';
import { resolveMediaContentPolicy } from '../../../packages/together-domain/src/media-routing.ts';
import { classifyPhotoIntent, extractPhotoWardrobeDescription, resolveMediaSceneBoundary, resolvePhotoComposition } from '../../../packages/together-domain/src/media.ts';

export type MediaSource = 'user_request'|'life_event'|'date'|'moment'|'story';
export type MediaContentLevel = 'standard'|'romance'|'suggestive'|'mature'|'explicit';
export type ShotType = 'selfie'|'portrait'|'candid'|'full_body'|'scene';
export type PhotoRequestIntent = { requested:boolean;subject:'companion'|'location'|'activity'|'outfit'|'event'|'date'|'unknown';shotPreference?:ShotType;requestedContentLevel?:MediaContentLevel;confidence:number };
export type CompanionVisualIdentity = { canonicalDescription:string;age:number;referenceStoragePaths:string[];hair?:string;eyes?:string;skinTone?:string;build?:string;approximateHeight?:string;identifyingFeatures?:string[];tattoos?:string[];piercings?:string[];fashionStyle?:string;recurringAccessories?:string[];visualDoNotChange?:string[];photoStyle?:Record<string,unknown> };
export type MediaReferenceImage={role:'character_identity'|'character_training'|'location_environment'|'world_environment'|'outfit_continuity'|'previous_media';bytes?:Uint8Array;signedUrl?:string;contentType:string;name:string;assetId?:string;revision?:number;storageBucket?:string;storagePath?:string};
export type CanonicalImageGenerationRequest = {
  mediaId:string;
  companion:{templateId:string;versionId:string;name:string;age:number};
  visualIdentity:CompanionVisualIdentity;
  referenceImages:MediaReferenceImage[];
  context:{place?:PlaceContext;location?:{id:string;name:string;description?:string;category?:string};activity?:string;mood?:string;timeOfDay?:string;lifeEvent?:Record<string,unknown>;date?:Record<string,unknown>;plan?:Record<string,unknown>;moment?:Record<string,unknown>;story?:Record<string,unknown>;outfitKey?:string;outfitDescription?:string};
  composition:{shotType:ShotType;framing?:string;aspectRatio:string};
  contentLevel:MediaContentLevel;
  qualityTier:'economy'|'standard'|'premium';
  generationIntent?:{requestText:string;requestedContentLevel:MediaContentLevel};
  qualityRetry?:{reasonCodes:string[]};
  mediaProfile?:{id:string;provider:string;modelFamily:string;modelUrl:string;triggerWord?:string;revision:number};
};
export type ImageProviderCapabilities = {referenceImages:boolean;identityFidelity:boolean;imageEditing:boolean;standard:boolean;romance:boolean;suggestive:boolean;mature:boolean;explicit:boolean;supportedAspectRatios:string[]};
export type ImageGenerationResult = {bytes:Uint8Array;contentType:string;width:number;height:number;providerRequestId?:string;model:string;estimatedCost?:number};
export interface ImageGenerationProvider { id:string;capabilities:ImageProviderCapabilities;generate(request:CanonicalImageGenerationRequest):Promise<ImageGenerationResult> }

const REAL_PERSON_PATTERN = /\b(celebrity|public figure|look exactly like|face of|identical to)\b/i;
const SEXUAL_PATTERN = /\b(nude|naked|topless|tits?|boobs?|breasts?|pussy|dick|cock|sex|explicit)\b/i;

export function classifyPhotoRequest(text:string):PhotoRequestIntent {
  return classifyPhotoIntent(text) as PhotoRequestIntent;
}

export function safeRequestText(text?:string):string|undefined {
  if(!text)return undefined;
  if(REAL_PERSON_PATTERN.test(text)||SEXUAL_PATTERN.test(text))return undefined;
  return text.replace(/[\r\n]+/g,' ').trim().slice(0,180);
}

function contentCapability(capabilities:ImageProviderCapabilities,level:MediaContentLevel):boolean{return capabilities[level];}

export class OpenAIImageProvider implements ImageGenerationProvider {
  id='openai';
  capabilities:ImageProviderCapabilities={referenceImages:true,identityFidelity:true,imageEditing:true,standard:true,romance:true,suggestive:false,mature:false,explicit:false,supportedAspectRatios:['1:1','4:5','16:9']};
  constructor(private readonly apiKey:string,private readonly model:string){}
  async generate(request:CanonicalImageGenerationRequest):Promise<ImageGenerationResult>{
    if(!contentCapability(this.capabilities,request.contentLevel))throw new AppError('PROVIDER_UNAVAILABLE','This kind of photo is not available with the configured provider.',503);
    const prompt=buildImagePrompt(request);
    const size=request.composition.aspectRatio==='16:9'?'1536x1024':request.composition.aspectRatio==='1:1'?'1024x1024':'1024x1536';
    const quality=request.qualityTier==='economy'?'low':request.qualityTier==='premium'?'high':'medium';
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),90000);
    try{
      let response:Response;
      if(request.referenceImages.length){
        const form=new FormData();
        form.set('model',this.model);form.set('prompt',prompt);form.set('size',size);form.set('quality',quality);form.set('output_format','webp');form.set('input_fidelity','high');
        for(const reference of request.referenceImages.filter((item)=>item.bytes).slice(0,2))form.append('image[]',new Blob([reference.bytes!.slice().buffer as ArrayBuffer],{type:reference.contentType}),reference.name);
        response=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${this.apiKey}`},body:form,signal:controller.signal});
      }else{
        response=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{Authorization:`Bearer ${this.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:this.model,prompt,size,quality,output_format:'webp',n:1}),signal:controller.signal});
      }
      const payload=await response.json().catch(()=>({})) as {data?:Array<{b64_json?:string}>;error?:{message?:string;code?:string};id?:string};
      if(!response.ok||!payload.data?.[0]?.b64_json)throw new AppError('PROVIDER_UNAVAILABLE',response.status===429?'Photo requests are busy right now. Try again soon.':'The photo could not be taken right now.',response.status===429?429:503,true);
      const binary=atob(payload.data[0].b64_json);
      const bytes=Uint8Array.from(binary,(character)=>character.charCodeAt(0));
      const [width,height]=size.split('x').map(Number);
      return {bytes,contentType:'image/webp',width:width!,height:height!,providerRequestId:payload.id,model:this.model};
    }catch(error){
      if(error instanceof AppError)throw error;
      throw new AppError('PROVIDER_UNAVAILABLE','The photo could not be taken right now.',503,true);
    }finally{clearTimeout(timeout);}
  }
}

export class GeminiImageProvider implements ImageGenerationProvider {
  id='gemini';
  capabilities:ImageProviderCapabilities={referenceImages:true,identityFidelity:true,imageEditing:true,standard:true,romance:true,suggestive:false,mature:false,explicit:false,supportedAspectRatios:['1:1','4:5','16:9']};
  constructor(private readonly apiKey:string,private readonly model:string){}
  async generate(request:CanonicalImageGenerationRequest):Promise<ImageGenerationResult>{
    if(!contentCapability(this.capabilities,request.contentLevel))throw new AppError('PROVIDER_UNAVAILABLE','This kind of photo is not available with the configured provider.',503);
    const parts:Array<Record<string,unknown>>=[{text:buildImagePrompt(request)}];
    for(const reference of request.referenceImages.filter((item)=>item.bytes).slice(0,2))parts.push({inline_data:{mime_type:reference.contentType,data:uint8ToBase64(reference.bytes!)}});
    const imageSize=request.qualityTier==='economy'?'512':'1K';
    const aspectRatio={
      '1:1':'ASPECT_RATIO_ONE_BY_ONE',
      '4:5':'ASPECT_RATIO_FOUR_BY_FIVE',
      '16:9':'ASPECT_RATIO_SIXTEEN_BY_NINE',
    }[request.composition.aspectRatio];
    const providerImageSize=imageSize==='512'?'IMAGE_SIZE_FIVE_TWELVE':'IMAGE_SIZE_ONE_K';
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),90000);
    try{
      const response=await fetch(`https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(this.model)}:generateContent`,{method:'POST',headers:{'x-goog-api-key':this.apiKey,'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{responseModalities:['IMAGE'],responseFormat:{image:{aspectRatio,imageSize:providerImageSize}}}}),signal:controller.signal});
      const payload=await response.json().catch(()=>({})) as {responseId?:string;candidates?:Array<{content?:{parts?:Array<{inlineData?:{data?:string;mimeType?:string};inline_data?:{data?:string;mime_type?:string}}>}}>;error?:{message?:string;code?:number;status?:string}};
      const output=payload.candidates?.[0]?.content?.parts?.find((part)=>part.inlineData?.data||part.inline_data?.data);
      const data=output?.inlineData?.data??output?.inline_data?.data;const contentType=output?.inlineData?.mimeType??output?.inline_data?.mime_type??'image/png';
      if(!response.ok||!data){
        const diagnostic={provider:this.id,model:this.model,httpStatus:response.status,providerStatus:payload.error?.status,providerCode:payload.error?.code,message:payload.error?.message?.replace(/[\r\n]+/g,' ').slice(0,240),hasCandidate:Boolean(payload.candidates?.length)};
        console.error('Gemini image generation failed',diagnostic);
        if(response.status===429){
          const quotaBlocked=/quota|billing/i.test(payload.error?.message??'')||payload.error?.status==='RESOURCE_EXHAUSTED';
          if(quotaBlocked)throw new AppError('PROVIDER_QUOTA','Photos are unavailable until provider capacity is restored.',503,false);
          throw new AppError('RATE_LIMITED','Photo requests are busy right now. Try again soon.',429,true);
        }
        if(response.status===401||response.status===403)throw new AppError('PROVIDER_AUTH','The photo provider needs attention.',503,true);
        if(response.status===404)throw new AppError('PROVIDER_MODEL','The configured photo model is unavailable.',503,true);
        if(response.status===400)throw new AppError('PROVIDER_REQUEST_INVALID','The photo request could not be processed.',503,true);
        throw new AppError('PROVIDER_UNAVAILABLE','The photo could not be taken right now.',503,true);
      }
      const binary=atob(data);const bytes=Uint8Array.from(binary,(character)=>character.charCodeAt(0));const [width,height]=request.composition.aspectRatio==='16:9'?[1024,576]:request.composition.aspectRatio==='4:5'?[819,1024]:[1024,1024];
      return{bytes,contentType,width:imageSize==='512'?Math.round(width/2):width,height:imageSize==='512'?Math.round(height/2):height,providerRequestId:payload.responseId,model:this.model};
    }catch(error){if(error instanceof AppError)throw error;throw new AppError('PROVIDER_UNAVAILABLE','The photo could not be taken right now.',503,true);}finally{clearTimeout(timeout);}
  }
}

function uint8ToBase64(bytes:Uint8Array):string{let binary='';for(let index=0;index<bytes.length;index+=32768)binary+=String.fromCharCode(...bytes.subarray(index,index+32768));return btoa(binary);}

export function configuredImageProvider():ImageGenerationProvider|null {
  const selected=(Deno.env.get('KIVELLE_IMAGE_PROVIDER')??(Deno.env.get('OPENAI_API_KEY')?'openai':Deno.env.get('GEMINI_API_KEY')?'gemini':'none')).toLowerCase();
  if(selected==='none')return null;
  if(selected==='openai'){
    const key=Deno.env.get('OPENAI_API_KEY');
    if(!key)return null;
    return new OpenAIImageProvider(key,Deno.env.get('KIVELLE_IMAGE_MODEL')??'gpt-image-2');
  }
  if(selected==='gemini'){
    const key=Deno.env.get('GEMINI_API_KEY');if(!key)return null;
    return new GeminiImageProvider(key,Deno.env.get('KIVELLE_IMAGE_MODEL')??'gemini-3.1-flash-image');
  }
  return null;
}

export function routeImageProvider(level:MediaContentLevel):ImageGenerationProvider {
  const provider=configuredImageProvider();
  if(!provider||!contentCapability(provider.capabilities,level))throw new AppError('PROVIDER_UNAVAILABLE','That kind of photo is not available right now.',503);
  return provider;
}

function line(value:unknown,fallback='not specified'):string{return typeof value==='string'&&value.trim()?value.trim():fallback;}
function list(value:unknown):string{return Array.isArray(value)?value.map(String).filter(Boolean).join(', '):'';}
export function buildImagePrompt(request:CanonicalImageGenerationRequest):string {
  const identity=request.visualIdentity;
  const place=request.context.place,location=request.context.location;
  const sceneBoundary=resolveMediaSceneBoundary({locationName:place?.location.name??location?.name??'the current canonical place',locationType:place?.location.type,category:place?.location.category??location?.category,indoorOutdoor:place?.location.visualContext.indoorOutdoor});
  const characterReference=request.referenceImages.some((item)=>item.role==='character_identity');
  const referenceRule=characterReference?'Image 1 defines only the same fictional adult companion’s stable physical identity. Its clothing, accessories, pose, framing, background, and lighting are not canonical and must not be copied.':'Use the canonical identity description exactly and keep it stable across images.';
  const referenceInstructions=request.referenceImages.map((reference,index)=>`Image ${index+1} ${reference.role==='character_identity'?'defines only face, hair, eyes, skin tone, adult age, body identity, and stable identifying features—not wardrobe, pose, framing, background, or lighting':reference.role==='location_environment'?'defines the canonical location environment and its architecture, materials, layout cues, recurring objects, and atmosphere':reference.role==='world_environment'?'defines the wider canonical world identity':reference.role==='outfit_continuity'?'defines same-day clothing continuity and is the only image allowed to define wardrobe':reference.role==='previous_media'?'defines continuity from the approved previous media':'is a curated character-training identity reference whose wardrobe and background are non-canonical'}.`).join(' ');
  const outfitReference=request.referenceImages.some((item)=>item.role==='outfit_continuity');
  const wardrobe=request.context.outfitDescription
    ?`Use exactly this canonical clothing description from the companion's message: ${request.context.outfitDescription}`
    :outfitReference
      ?'Continue the clothing shown in the dedicated outfit-continuity reference. Do not take clothing from identity or location references.'
      :`Choose natural ${line(identity.fashionStyle,'contemporary')} clothing appropriate to this exact place, activity, weather, and time. Do not copy clothing from any identity or character-training reference.`;
  return [
    'IDENTITY',referenceRule,`${request.companion.name} is a fictional adult age ${request.companion.age}.`,line(identity.canonicalDescription),`Hair: ${line(identity.hair)}. Eyes: ${line(identity.eyes)}. Skin tone: ${line(identity.skinTone)}. Build: ${line(identity.build)}.`,`Identifying features: ${list(identity.identifyingFeatures)||'preserve the canonical identity'}.`,
    'REFERENCE ROLES',`${referenceRule} ${referenceInstructions} Location references define the exact environment. World references define only the wider regional identity and must never replace the exact location. Allow a natural new camera angle rather than copying the source composition. Every reference is invisible conditioning material only: never reproduce a source image as a framed photograph, poster, screen, thumbnail, profile card, collage, split screen, picture-in-picture, or image held by the subject.`,
    'WORLD',place?`${place.world.name}. ${place.world.description}\nSetting: ${line(place.world.visualContext.setting)}. Architecture: ${list(place.world.visualContext.architecture)}. Climate: ${line(place.world.visualContext.climate)}. Recurring elements: ${list(place.world.visualContext.recurringElements)}. Avoid: ${list(place.world.visualContext.avoid)}. These wider world cues are subordinate to the exact location below.`:'Use the canonical current Kivelle world.',
    'LOCATION PATH',place?.path??location?.name??'Current canonical place',
    'EXACT LOCATION',place?`${place.location.visualContext.canonicalPrompt??place.location.lore.summary??place.location.description}. Materials: ${list(place.location.visualContext.materials)}. Lighting: ${list(place.location.visualContext.lighting)}. Visual anchors: ${list(place.location.visualContext.visualAnchors)||list(place.location.lore.signatureDetails)}. Atmosphere: ${list(place.location.visualContext.atmosphere)||list(place.location.lore.atmosphere)}. Sensory/environmental cues: ${list(place.location.lore.sensoryDetails)}. Avoid: ${list(place.location.visualContext.avoid)}.`:location?`${location.name}. ${line(location.description,'A believable real environment consistent with this location.')}`:'A believable environment consistent with the current Kivelle world.',
    'ACTIVITY',line(request.context.activity,'a natural moment from the current day'),
    'MOOD',line(request.context.mood,'natural and relaxed'),
    'TIME / LIGHTING',`${place?`${place.clock.weekday} ${place.clock.localTime} (${place.clock.timezone}), ${place.clock.daypart}`:line(request.context.timeOfDay,'current local time')}; believable available light.`,
    'WARDROBE',wardrobe,
    'COMPOSITION',`${request.composition.shotType.replace('_',' ')} photo, ${request.composition.aspectRatio}, ${line(request.composition.framing,'grounded framing with useful environmental context')}.`,
    'CAMERA STYLE','One coherent believable personal smartphone or camera photo, natural lighting, subtle imperfections, realistic environment, natural expression, and a clear anatomically natural face. No collage, inset, diptych, screenshot, user interface, phone screen displaying a portrait, printed portrait, framed portrait, reference sheet, caption, prompt text, location label, watermark, or logo. Avoid glossy advertising, glamour-campaign staging, fantasy rendering, oversaturation, malformed or duplicated facial features, smeared eyes or mouth, extra fingers, and impossible mirror geometry.',
    'CONTINUITY REQUIREMENTS','World state is authoritative. Do not change the location, activity, time, canonical wardrobe description, or companion identity. Identity references never establish wardrobe. Do not add people unless they are explicitly part of the event context.',
    'CONTENT LEVEL',contentLevelPrompt(request.contentLevel),
    ...(request.generationIntent?.requestText?['APPROVED USER INTENT',`Use this approved visual request as creative direction without changing canonical identity, place, activity, consent boundaries, or content level: ${request.generationIntent.requestText}`]:[]),
    ...(request.qualityRetry?['QUALITY RETRY',`The previous candidate was rejected by visual quality control (${request.qualityRetry.reasonCodes.join(', ')}). Produce a fresh single photograph with one clear, detailed, naturally proportioned face. Do not reuse the previous composition or reproduce any reference image inside the scene.`]:[]),
    'FINAL SCENE GROUNDING',`${sceneBoundary.instruction} Do not show: ${sceneBoundary.avoid.join(', ')}. This exact spatial requirement overrides conflicting exterior/interior cues from the world description, generic photographic priors, earlier media, or the approved user wording.`,
    'FINAL WARDROBE GROUNDING',`${wardrobe} Clothing visible in identity or character-training references is source-image residue and must not appear unless it independently matches this wardrobe instruction.`,
    'DO-NOT-CHANGE IDENTITY',`Preserve facial identity, adult age, body proportions, hair, eye color, and distinguishing features. ${list(identity.visualDoNotChange)}. Do not redesign the person and do not imitate any real person or celebrity. The output must contain only the requested camera image—never a visible copy of an identity reference or any rendered instructions.`,
  ].join('\n');
}

function timeOfDay(date=new Date()):string{const hour=date.getHours();return hour<6?'night':hour<12?'morning':hour<17?'afternoon':hour<21?'evening':'night';}
function requestKey(input:QueueMediaInput,intent:PhotoRequestIntent):string{return [input.source,input.characterInstanceId,input.messageId??input.lifeEventId??input.dateSessionId??input.momentId??input.storyArcId??input.idempotencyKey??intent.subject].join(':');}

export type QueueMediaInput={userId:string;characterInstanceId:string;source:MediaSource;conversationId?:string;messageId?:string;lifeEventId?:string;dateSessionId?:string;momentId?:string;storyArcId?:string;sceneSessionId?:string;sceneActionId?:string;sharedPlanId?:string;requestText?:string;companionResponseText?:string;idempotencyKey?:string;force?:boolean};
export async function queueMediaRequest(db:SupabaseClient,input:QueueMediaInput):Promise<Record<string,unknown>|null>{
  const intent=classifyPhotoRequest(input.requestText??'');
  if(input.source==='user_request'&&!intent.requested&&!input.force)return null;
  const [{data:instance},{data:profile},{data:relationship}]=await Promise.all([
    db.from('together_character_instances').select('*,together_character_templates(*),together_character_versions(*)').eq('id',input.characterInstanceId).eq('user_id',input.userId).maybeSingle(),
    db.from('together_profiles').select('age_verified_at,content_preferences,photo_preferences').eq('user_id',input.userId).maybeSingle(),
    db.from('together_relationship_states').select('*').eq('character_instance_id',input.characterInstanceId).eq('user_id',input.userId).maybeSingle(),
  ]);
  if(!instance)throw new AppError('NOT_FOUND','That companion is unavailable.',404);
  const preferences=(profile?.photo_preferences??{}) as Record<string,unknown>;
  if(preferences.companionPhotos===false)return null;
  if(input.source!=='user_request'&&preferences.automaticPhotos===false)return null;
  const template=instance.together_character_templates as Record<string,unknown>;
  if(!profile?.age_verified_at||Number(template.age)<18)throw new AppError('FORBIDDEN','Photos require confirmed adult characters and accounts.',403);
  const key=requestKey(input,intent);
  const {data:duplicate}=await db.from('together_generated_media').select('*').eq('user_id',input.userId).eq('request_key',key).maybeSingle();
  if(duplicate)return duplicate;
  const now=new Date();
  const recentSince=new Date(now.getTime()-24*3600000).toISOString();
  const {data:recent}=await db.from('together_generated_media').select('id,created_at,status,metadata').eq('user_id',input.userId).eq('character_instance_id',input.characterInstanceId).gte('created_at',recentSince).in('status',['queued','generating','ready']).order('created_at',{ascending:false});
  if(input.source==='user_request'&&(recent??[]).filter((item)=>String((item.metadata as Record<string,unknown>)?.source)==='user_request').length>=12)throw new AppError('RATE_LIMITED','You have asked for several photos today. Try again later.',429,true);
  if(input.source!=='user_request'){
    if((recent??[]).filter((item)=>String((item.metadata as Record<string,unknown>)?.source)!=='user_request').length>=2)return null;
    if(recent?.some((item)=>String((item.metadata as Record<string,unknown>)?.source)!=='user_request'&&now.getTime()-new Date(item.created_at).getTime()<8*3600000))return null;
  }
  let locationId=String(instance.current_location_id??'')||undefined;
  if(input.lifeEventId){const {data:event}=await db.from('together_life_events').select('location_id').eq('id',input.lifeEventId).eq('user_id',input.userId).maybeSingle();locationId=String(event?.location_id??locationId??'')||undefined;}
  if(input.dateSessionId){const {data:date}=await db.from('together_date_sessions').select('together_date_templates(location_id)').eq('id',input.dateSessionId).eq('user_id',input.userId).maybeSingle();const template=date?.together_date_templates as unknown as Record<string,unknown>|null;locationId=String(template?.location_id??locationId??'')||undefined;}
  if(input.momentId){const {data:moment}=await db.from('together_moments').select('location_id').eq('id',input.momentId).eq('user_id',input.userId).maybeSingle();locationId=String(moment?.location_id??locationId??'')||undefined;}
  if(input.sceneSessionId){const {data:scene}=await db.from('together_scene_sessions').select('location_id').eq('id',input.sceneSessionId).eq('user_id',input.userId).eq('character_instance_id',input.characterInstanceId).maybeSingle();locationId=String(scene?.location_id??locationId??'')||undefined;}
  const [{data:location},{data:opportunities}]=await Promise.all([
    locationId?db.from('together_locations').select('*').eq('id',locationId).maybeSingle():Promise.resolve({data:null}),
    db.from('together_photo_opportunities').select('*').eq('active',true),
  ]);
  const place=locationId?await resolvePlaceContext({db,locationId,now,userId:input.userId,characterInstanceId:input.characterInstanceId}):null;
  const opportunity=scorePhotoOpportunities(opportunities??[],{locationSlug:String(location?.slug??''),relationshipStage:String(instance.relationship_stage),source:input.source,intent,recent:recent??[]});
  const requestedLevel:MediaContentLevel=intent.requestedContentLevel??(input.source==='date'?'romance':'standard');
  const romanceAllowed=Boolean((profile?.content_preferences as Record<string,unknown>|undefined)?.romanceEnabled!==false)&&['flirting','dating','exclusive','long_term'].includes(String(instance.relationship_stage));
  const contentPreferences=(profile.content_preferences??{}) as Record<string,unknown>,requestText=input.requestText??'';
  const requestedForPolicy=requestedLevel==='romance'&&!romanceAllowed?'standard':requestedLevel,characterBoundaries=(template.content_boundaries??{}) as Record<string,unknown>;
  const characterAllowsRequestedLevel=requestedForPolicy==='standard'?true:requestedForPolicy==='romance'?characterBoundaries.allows_romance!==false:requestedForPolicy==='suggestive'?characterBoundaries.allows_suggestive===true||characterBoundaries.allows_mature===true:requestedForPolicy==='mature'?characterBoundaries.allows_mature===true:characterBoundaries.allows_explicit===true;
  const policy=resolveMediaContentPolicy({requestedLevel:requestedForPolicy,source:input.source,automatic:input.source!=='user_request',ageVerified:Boolean(profile?.age_verified_at),characterAge:Number(template.age),fictionalCharacter:(template.metadata as Record<string,unknown>|undefined)?.fictional!==false,realPersonRequest:REAL_PERSON_PATTERN.test(requestText),nonConsensualRequest:/\b(non.?consensual|without (?:her|his|their) consent|secretly nude)\b/i.test(requestText),minorRelatedRequest:/\b(minor|underage|schoolgirl|schoolboy|child)\b/i.test(requestText),characterAllowsRequestedLevel,romanceEnabled:Boolean(contentPreferences.romanceEnabled!==false),suggestiveMediaEnabled:contentPreferences.suggestiveMediaEnabled===true,matureMediaEnabled:contentPreferences.matureMediaEnabled===true,explicitMediaEnabled:contentPreferences.explicitMediaEnabled===true,adultVideoEnabled:contentPreferences.adultVideoEnabled===true,mediaType:'image',adultMediaFeatureEnabled:envEnabled('KIVELLE_ADULT_MEDIA_ENABLED')});
  if(!policy.allowed)throw new AppError('FORBIDDEN',mediaPolicyMessage(policy.reasonCode),403);
  const contentLevel:MediaContentLevel=policy.resolvedLevel;
  const shotType=intent.shotPreference??String(opportunity?.shot_type??(input.source==='user_request'?'selfie':'candid')) as ShotType;
  const composition=resolvePhotoComposition({source:input.source,shotType});
  const aspectRatio=composition.aspectRatio;
  const qualityTier=input.source==='date'||input.source==='moment'||input.source==='story'?'premium':input.source==='user_request'?'standard':'economy';
  const outfitKey=await resolveOutfitKey(db,input,instance,now,place);
  const outfitDescription=input.companionResponseText?extractPhotoWardrobeDescription(input.companionResponseText):undefined;
  const referenceAssets=await snapshotReferenceAssets(db,{characterVersionId:String(instance.character_version_id),worldId:place?.world.id,locationId});
  const sceneBoundary=resolveMediaSceneBoundary({locationName:String(place?.location.name??location?.name??'the current canonical place'),locationType:place?.location.type,category:String(place?.location.category??location?.category??''),indoorOutdoor:place?.location.visualContext.indoorOutdoor});
  const hasLocationReference=referenceAssets.some((asset)=>asset.role==='location_canonical'||asset.role==='location_alternate'),hasWorldReference=sceneBoundary.setting!=='indoor'&&referenceAssets.some((asset)=>asset.role==='world_canonical');
  const metadata={source:input.source,photoOpportunitySlug:opportunity?.slug??null,shotType,framing:composition.framing,locationId:locationId??null,sceneSessionId:input.sceneSessionId??null,sceneActionId:input.sceneActionId??null,requestedContentLevel:requestedLevel,resolvedContentLevel:contentLevel,mediaPolicyReason:policy.reasonCode,qualityTier,aspectRatio,requestKey:key,requestIntent:{subject:intent.subject,confidence:intent.confidence},generationIntent:input.source==='user_request'&&input.requestText?{requestText:input.requestText.slice(0,400),requestedContentLevel:requestedLevel}:null,requestHint:safeRequestText(input.requestText),referenceAssets,sceneBoundary:sceneBoundary.setting,locationReferenceResolution:hasLocationReference?'location':hasWorldReference?'world':'text',location_reference_fallback:!hasLocationReference&&hasWorldReference?'world':null,sceneSummary:`${String(template.name)} ${shotType==='scene'?'shared a view from':'sent a photo while at'} ${String(place?.path??location?.name??'their current place')} during ${String(instance.current_activity)}.`,activity:String(instance.current_activity),mood:String(instance.current_mood),timeOfDay:place?.clock.daypart??timeOfDay(now),outfitKey,outfitDescription:outfitDescription??null,relationshipStage:String(instance.relationship_stage),relationshipDirection:String(relationship?.recent_direction??'steady'),placeContext:place?placeContextSnapshot(place):null};
  const row={user_id:input.userId,character_instance_id:input.characterInstanceId,conversation_id:input.conversationId??null,message_id:input.messageId??null,life_event_id:input.lifeEventId??null,date_session_id:input.dateSessionId??null,moment_id:input.momentId??null,story_arc_id:input.storyArcId??null,scene_session_id:input.sceneSessionId??null,scene_action_id:input.sceneActionId??null,shared_plan_id:input.sharedPlanId??null,world_id:place?.world.id??null,location_id:locationId??null,media_type:'image',content_level:contentLevel,provider:configuredImageProvider()?.id??null,status:'queued',request_key:key,metadata};
  const {data,error}=await db.from('together_generated_media').insert(row).select('*').single();
  if(error){const {data:race}=await db.from('together_generated_media').select('*').eq('user_id',input.userId).eq('request_key',key).maybeSingle();if(race)return race;throw new AppError('INTERNAL_ERROR','The photo request could not be queued.',500,true);}
  await track(db,input.userId,'media_queued',{mediaId:data.id,source:input.source,characterInstanceId:input.characterInstanceId,shotType,contentLevel});
  return data;
}

export function scorePhotoOpportunities(rows:Array<Record<string,unknown>>,context:{locationSlug:string;relationshipStage:string;source:MediaSource;intent:PhotoRequestIntent;recent:Array<Record<string,unknown>>}):Record<string,unknown>|null{
  const recentSlugs=new Set(context.recent.map((item)=>String((item.metadata as Record<string,unknown>)?.photoOpportunitySlug??'')));
  const stages=['stranger','acquaintance','friend','flirting','dating','exclusive','long_term'];
  return rows.map((row)=>{
    const tags=Array.isArray(row.location_tags)?row.location_tags.map(String):[];
    const allowed=Array.isArray(row.relationship_stages)?row.relationship_stages.map(String):[];
    let score=context.source==='user_request'?8:0;
    if(tags.includes(context.locationSlug))score+=6;else if(tags.length)score-=3;
    if(!allowed.length||allowed.includes(context.relationshipStage))score+=2;else score-=8;
    if(context.intent.shotPreference&&row.shot_type===context.intent.shotPreference)score+=4;
    if(recentSlugs.has(String(row.slug)))score-=7;
    if(stages.indexOf(context.relationshipStage)<0)score-=10;
    return {row,score};
  }).sort((a,b)=>b.score-a.score)[0]?.row??null;
}

async function resolveOutfitKey(db:SupabaseClient,input:QueueMediaInput,instance:Record<string,unknown>,now:Date,place:PlaceContext|null):Promise<string>{
  const linked=input.lifeEventId?await db.from('together_life_events').select('metadata').eq('id',input.lifeEventId).maybeSingle():null;
  const existing=(linked?.data?.metadata as Record<string,unknown>|undefined)?.outfitKey;
  if(typeof existing==='string')return existing;
  const day=now.toISOString().slice(0,10);
  const style=String(((instance.together_character_versions as Record<string,unknown>)?.visual_identity as Record<string,unknown>|undefined)?.fashionStyle??'city-casual').toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,32);
  const climate=String(place?.world.visualContext.climate??'temperate').toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,20);
  const key=`${day}-${climate}-${style||'city-casual'}`;
  if(input.lifeEventId)await db.from('together_life_events').update({metadata:{...((linked?.data?.metadata??{}) as Record<string,unknown>),outfitKey:key}}).eq('id',input.lifeEventId).eq('user_id',input.userId);
  return key;
}

export async function canonicalRequestForMedia(db:SupabaseClient,media:Record<string,unknown>):Promise<CanonicalImageGenerationRequest>{
  const {data:instance}=await db.from('together_character_instances').select('*,together_character_templates(*),together_character_versions(*)').eq('id',String(media.character_instance_id)).eq('user_id',String(media.user_id)).maybeSingle();
  if(!instance)throw new AppError('NOT_FOUND','The companion for this photo is unavailable.',404);
  const template=instance.together_character_templates as Record<string,unknown>;
  const version=instance.together_character_versions as Record<string,unknown>;
  const identity=(version.visual_identity??{}) as Record<string,unknown>;
  if(Number(template.age)<18)throw new AppError('FORBIDDEN','Photo generation is unavailable for this character.',403);
  const meta=(media.metadata??{}) as Record<string,unknown>;
  const locationId=String(media.location_id??meta.locationId??'');
  const {data:location}=locationId?await db.from('together_locations').select('*').eq('id',locationId).maybeSingle():{data:null};
  const snapshot=(meta.placeContext??null) as Record<string,any>|null;
  const resolvedPlace=locationId?await resolvePlaceContext({db,locationId,userId:String(media.user_id),characterInstanceId:String(media.character_instance_id)}).catch(()=>null):null;
  const historicalPlace=snapshot?{contextVersion:1 as const,world:{id:String(snapshot.worldId),slug:String(snapshot.worldSlug),name:String(snapshot.worldName),description:String(snapshot.worldDescription??''),timezone:String(snapshot.clock?.timezone??'UTC'),accessType:String(snapshot.worldAccessType??'historical'),visualContext:snapshot.worldVisualContext??{}},location:{id:String(snapshot.locationId),slug:String(snapshot.locationSlug),name:String(snapshot.locationName),description:String(snapshot.locationDescription??''),type:String(snapshot.locationType??'venue') as PlaceContext['location']['type'],category:String(snapshot.locationCategory??''),hours:snapshot.locationHours??null,possibleActivities:Array.isArray(snapshot.locationPossibleActivities)?snapshot.locationPossibleActivities.map(String):[],visualContext:snapshot.locationVisualContext??{},lore:snapshot.locationLore??{}},ancestry:Array.isArray(snapshot.ancestry)?snapshot.ancestry:[],nearby:Array.isArray(snapshot.nearby)?snapshot.nearby:[],path:String(snapshot.path??snapshot.locationName??'Historical place'),clock:snapshot.clock??{timezone:'UTC',localIso:'',weekday:'',localTime:'',daypart:'unknown'}} as PlaceContext:null;
  const place=historicalPlace??resolvedPlace;
  const references:MediaReferenceImage[]=[];
  const paths=Array.isArray(identity.referenceStoragePaths)?identity.referenceStoragePaths.map(String).slice(0,2):[];
  const snapshotted=Array.isArray(meta.referenceAssets)?meta.referenceAssets as Array<Record<string,unknown>>:[];
  const selectedRows=await resolveSnapshottedReferenceRows(db,snapshotted,{characterVersionId:String(instance.character_version_id),locationId:locationId||undefined,worldId:String(media.world_id??place?.world.id??'')||undefined});
  for(const row of selectedRows){const reference=await loadReferenceAsset(db,row);if(reference)references.push(reference);}
  if(!references.some((item)=>item.role==='character_identity'))for(const path of paths){const reference=await loadStorageReference(db,{role:'character_identity',bucket:'kivelle-character-reference',path,name:path.split('/').at(-1)??'reference.png'});if(reference)references.push(reference);}
  const outfitKey=String(meta.outfitKey??''),outfitDescription=typeof meta.outfitDescription==='string'?meta.outfitDescription:undefined;if(outfitKey&&!outfitDescription&&!references.some((item)=>item.role==='outfit_continuity')){const{data:previous}=await db.from('together_generated_media').select('id,storage_path,content_type,metadata').eq('user_id',String(media.user_id)).eq('character_instance_id',String(media.character_instance_id)).eq('media_type','image').eq('status','ready').neq('id',String(media.id)).order('created_at',{ascending:false}).limit(8);const match=(previous??[]).find((item)=>String((item.metadata as Record<string,unknown>)?.outfitKey??'')===outfitKey&&item.storage_path);if(match){const reference=await loadStorageReference(db,{role:'outfit_continuity',bucket:'together-user-media',path:String(match.storage_path),name:`outfit-${match.id}.jpg`,contentType:String(match.content_type??'image/jpeg')});if(reference)references.push(reference);}}
  const mediaProfile=await resolveCharacterMediaProfile(db,String(instance.character_version_id));
  const storedGenerationIntent=meta.generationIntent&&typeof meta.generationIntent==='object'?meta.generationIntent as Record<string,unknown>:null;
  const sceneBoundary=resolveMediaSceneBoundary({locationName:String(place?.location.name??location?.name??'the current canonical place'),locationType:place?.location.type,category:String(place?.location.category??location?.category??''),indoorOutdoor:place?.location.visualContext.indoorOutdoor});
  const groundedReferences=sceneBoundary.setting==='indoor'?references.filter((item)=>item.role!=='world_environment'):references;
  return {mediaId:String(media.id),companion:{templateId:String(instance.character_template_id),versionId:String(instance.character_version_id),name:String(template.name),age:Number(template.age)},visualIdentity:{canonicalDescription:String(identity.canonicalDescription??template.biography??template.name),age:Number(identity.age??template.age),referenceStoragePaths:paths,hair:String(identity.hair??''),eyes:String(identity.eyes??''),skinTone:String(identity.skinTone??''),build:String(identity.build??''),approximateHeight:String(identity.approximateHeight??''),identifyingFeatures:Array.isArray(identity.identifyingFeatures)?identity.identifyingFeatures.map(String):[],tattoos:Array.isArray(identity.tattoos)?identity.tattoos.map(String):[],piercings:Array.isArray(identity.piercings)?identity.piercings.map(String):[],fashionStyle:String(identity.fashionStyle??''),recurringAccessories:Array.isArray(identity.recurringAccessories)?identity.recurringAccessories.map(String):[],visualDoNotChange:Array.isArray(identity.visualDoNotChange)?identity.visualDoNotChange.map(String):[],photoStyle:(identity.photoStyle??{}) as Record<string,unknown>},referenceImages:sortReferences(groundedReferences).slice(0,4),context:{place:place??undefined,location:location?{id:String(location.id),name:String(location.name),description:String(location.description),category:String(location.category)}:undefined,activity:String(meta.activity??instance.current_activity),mood:String(meta.mood??instance.current_mood),timeOfDay:String(meta.timeOfDay??place?.clock.daypart??timeOfDay()),outfitKey:outfitKey||undefined,outfitDescription},composition:{shotType:String(meta.shotType??'candid') as ShotType,aspectRatio:String(meta.aspectRatio??'4:5'),framing:typeof meta.framing==='string'?meta.framing:undefined},contentLevel:String(media.content_level??'standard') as MediaContentLevel,qualityTier:String(meta.qualityTier??'standard') as CanonicalImageGenerationRequest['qualityTier'],...(storedGenerationIntent&&typeof storedGenerationIntent.requestText==='string'?{generationIntent:{requestText:storedGenerationIntent.requestText.slice(0,400),requestedContentLevel:String(storedGenerationIntent.requestedContentLevel??media.content_level??'standard') as MediaContentLevel}}:{}),...(mediaProfile?{mediaProfile}:{})};
}

async function snapshotReferenceAssets(db:SupabaseClient,input:{characterVersionId:string;worldId?:string;locationId?:string}):Promise<Array<Record<string,unknown>>>{
  const filters=[`character_version_id.eq.${input.characterVersionId}`,input.locationId?`location_id.eq.${input.locationId}`:'',input.worldId?`world_id.eq.${input.worldId}`:''].filter(Boolean).join(',');
  if(!filters)return[];
  const{data}=await db.from('together_media_reference_assets').select('id,asset_role,revision,storage_bucket,storage_path,character_version_id,location_id,world_id').eq('active',true).or(filters).order('revision',{ascending:false});
  const seen=new Set<string>();return(data??[]).filter((row)=>{const role=String(row.asset_role);if(seen.has(role)&&!['character_training','location_alternate'].includes(role))return false;seen.add(role);return true;}).slice(0,8).map((row)=>({assetId:row.id,role:row.asset_role,revision:row.revision,bucket:row.storage_bucket,path:row.storage_path}));
}

async function resolveSnapshottedReferenceRows(db:SupabaseClient,snapshot:Array<Record<string,unknown>>,scope:{characterVersionId:string;locationId?:string;worldId?:string}):Promise<Array<Record<string,unknown>>>{
  const ids=snapshot.map((item)=>String(item.assetId??'')).filter(Boolean);
  if(ids.length){const{data}=await db.from('together_media_reference_assets').select('*').in('id',ids);const byId=new Map((data??[]).map((row)=>[String(row.id),row]));return ids.map((id)=>byId.get(id)).filter(Boolean) as Array<Record<string,unknown>>;}
  const filters=[`character_version_id.eq.${scope.characterVersionId}`,scope.locationId?`location_id.eq.${scope.locationId}`:'',scope.worldId?`world_id.eq.${scope.worldId}`:''].filter(Boolean).join(',');if(!filters)return[];
  const{data}=await db.from('together_media_reference_assets').select('*').eq('active',true).or(filters).order('revision',{ascending:false});return(data??[]) as Array<Record<string,unknown>>;
}

async function loadReferenceAsset(db:SupabaseClient,row:Record<string,unknown>):Promise<MediaReferenceImage|null>{
  const role=referenceRole(String(row.asset_role)),bucket=String(row.storage_bucket??''),path=String(row.storage_path??'');if(!role||!bucket||!path)return null;
  return loadStorageReference(db,{role,bucket,path,name:String(row.source_key??path.split('/').at(-1)??'reference'),contentType:String(row.content_type??'image/jpeg'),assetId:String(row.id),revision:Number(row.revision??1)});
}

async function loadStorageReference(db:SupabaseClient,input:{role:MediaReferenceImage['role'];bucket:string;path:string;name:string;contentType?:string;assetId?:string;revision?:number}):Promise<MediaReferenceImage|null>{
  const[{data:signed},{data:blob}]=await Promise.all([db.storage.from(input.bucket).createSignedUrl(input.path,900),db.storage.from(input.bucket).download(input.path)]);
  if(!signed?.signedUrl&&!blob)return null;return{role:input.role,signedUrl:signed?.signedUrl,bytes:blob?new Uint8Array(await blob.arrayBuffer()):undefined,contentType:blob?.type||input.contentType||'image/jpeg',name:input.name,assetId:input.assetId,revision:input.revision,storageBucket:input.bucket,storagePath:input.path};
}

async function resolveCharacterMediaProfile(db:SupabaseClient,characterVersionId:string):Promise<CanonicalImageGenerationRequest['mediaProfile']|undefined>{
  if(!envEnabled('KIVELLE_WAVESPEED_LORA_ENABLED'))return undefined;const{data}=await db.from('together_character_media_profiles').select('*').eq('character_version_id',characterVersionId).eq('status','ready').order('source_revision',{ascending:false}).limit(1).maybeSingle();if(!data?.model_storage_path)return undefined;
  const bucket=String(data.model_storage_bucket??'kivelle-model-assets'),{data:signed}=await db.storage.from(bucket).createSignedUrl(String(data.model_storage_path),900);if(!signed?.signedUrl)return undefined;
  return{id:String(data.id),provider:String(data.provider),modelFamily:String(data.model_family),modelUrl:signed.signedUrl,triggerWord:typeof data.trigger_word==='string'?data.trigger_word:undefined,revision:Number(data.source_revision??1)};
}

function sortReferences(references:MediaReferenceImage[]):MediaReferenceImage[]{const priority:Record<MediaReferenceImage['role'],number>={character_identity:0,location_environment:1,world_environment:2,outfit_continuity:3,previous_media:4,character_training:5};return[...references].sort((a,b)=>priority[a.role]-priority[b.role]);}
function referenceRole(value:string):MediaReferenceImage['role']|null{return value==='location_canonical'||value==='location_alternate'?'location_environment':value==='world_canonical'?'world_environment':['character_identity','character_training','outfit_continuity','previous_media'].includes(value)?value as MediaReferenceImage['role']:null;}
function contentLevelPrompt(level:MediaContentLevel):string{return level==='standard'?'Everyday non-explicit life photo.':level==='romance'?'Warm, affectionate, non-explicit romantic tone appropriate to the established relationship.':level==='suggestive'?'Suggestive adult-only tone within approved character boundaries; no explicit sexual activity.':level==='mature'?'Mature adult-only sensual tone within approved character boundaries and the normalized user intent.':'Explicit adult-only fictional content, only as allowed by the approved normalized request and character boundaries.';}
function envEnabled(name:string):boolean{return['1','true','yes','on'].includes((Deno.env.get(name)??'false').toLowerCase());}
function mediaPolicyMessage(reason:string):string{return reason==='age_verification_required'?'Age verification is required for companion media.':reason==='adult_character_required'?'Media generation requires an adult fictional character.':reason==='real_person_likeness'?'Kivelle can create an original fictional appearance, but cannot copy a real person.':reason==='automatic_adult_media_disabled'?'Higher-intensity media is never generated automatically.':reason.endsWith('_disabled')?'That media preference is turned off.':'That media request is outside the character’s boundaries.';}

export async function kickMediaDispatcher():Promise<void>{
  const secret=Deno.env.get('TOGETHER_MEDIA_DISPATCH_SECRET');
  const url=Deno.env.get('SUPABASE_URL');
  if(!secret||!url)return;
  await fetch(`${url}/functions/v1/together-media-dispatch`,{method:'POST',headers:{'x-together-dispatch-secret':secret,'Content-Type':'application/json'},body:'{"limit":3}'}).catch(()=>undefined);
}
