import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';
import { track } from './together.ts';

export type MediaSource = 'user_request'|'life_event'|'date'|'moment'|'story';
export type MediaContentLevel = 'standard'|'romance'|'suggestive'|'mature'|'explicit';
export type ShotType = 'selfie'|'portrait'|'candid'|'full_body'|'scene';
export type PhotoRequestIntent = { requested:boolean;subject:'companion'|'location'|'activity'|'outfit'|'event'|'date'|'unknown';shotPreference?:ShotType;requestedContentLevel?:MediaContentLevel;confidence:number };
export type CompanionVisualIdentity = { canonicalDescription:string;age:number;referenceStoragePaths:string[];hair?:string;eyes?:string;skinTone?:string;build?:string;approximateHeight?:string;identifyingFeatures?:string[];tattoos?:string[];piercings?:string[];fashionStyle?:string;recurringAccessories?:string[];visualDoNotChange?:string[];photoStyle?:Record<string,unknown> };
export type CanonicalImageGenerationRequest = {
  mediaId:string;
  companion:{templateId:string;versionId:string;name:string;age:number};
  visualIdentity:CompanionVisualIdentity;
  referenceImages:Array<{bytes:Uint8Array;contentType:string;name:string}>;
  context:{location?:{id:string;name:string;description?:string;category?:string};activity?:string;mood?:string;timeOfDay?:string;lifeEvent?:Record<string,unknown>;date?:Record<string,unknown>;moment?:Record<string,unknown>;story?:Record<string,unknown>;outfitKey?:string};
  composition:{shotType:ShotType;framing?:string;aspectRatio:string};
  contentLevel:MediaContentLevel;
  qualityTier:'economy'|'standard'|'premium';
};
export type ImageProviderCapabilities = {referenceImages:boolean;identityFidelity:boolean;imageEditing:boolean;standard:boolean;romance:boolean;suggestive:boolean;mature:boolean;explicit:boolean;supportedAspectRatios:string[]};
export type ImageGenerationResult = {bytes:Uint8Array;contentType:string;width:number;height:number;providerRequestId?:string;model:string;estimatedCost?:number};
export interface ImageGenerationProvider { id:string;capabilities:ImageProviderCapabilities;generate(request:CanonicalImageGenerationRequest):Promise<ImageGenerationResult> }

const PHOTO_PATTERNS = /\b(send|show|take|share|see|want|lemme|let me)\b.{0,30}\b(photo|picture|pic|selfie|outfit|look|where you are|what you(?:'re| are) doing)\b|\b(selfie|photo|picture|pic)\s*\??$/i;
const REAL_PERSON_PATTERN = /\b(celebrity|public figure|look exactly like|face of|identical to)\b/i;
const SEXUAL_PATTERN = /\b(nude|naked|topless|tits?|boobs?|breasts?|pussy|dick|cock|sex|explicit)\b/i;

export function classifyPhotoRequest(text:string):PhotoRequestIntent {
  const requested=PHOTO_PATTERNS.test(text);
  const lower=text.toLowerCase();
  const subject:PhotoRequestIntent['subject']=/where you are|studio|cafe|café|rooftop|riverwalk|place/.test(lower)?'location':/outfit|wearing|look/.test(lower)?'outfit':/doing|working|activity/.test(lower)?'activity':/date/.test(lower)?'date':requested?'companion':'unknown';
  const shotPreference:ShotType|undefined=/selfie/.test(lower)?'selfie':/full.?body|outfit/.test(lower)?'full_body':subject==='location'?'scene':/portrait/.test(lower)?'portrait':undefined;
  const requestedContentLevel:MediaContentLevel|undefined=SEXUAL_PATTERN.test(text)?'explicit':/sexy|suggestive|lingerie/.test(lower)?'suggestive':/romantic|kiss/.test(lower)?'romance':undefined;
  return {requested,subject,...(shotPreference?{shotPreference}:{}),...(requestedContentLevel?{requestedContentLevel}:{}),confidence:requested?.94:0};
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
        for(const reference of request.referenceImages.slice(0,2))form.append('image[]',new Blob([reference.bytes],{type:reference.contentType}),reference.name);
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
    for(const reference of request.referenceImages.slice(0,2))parts.push({inline_data:{mime_type:reference.contentType,data:uint8ToBase64(reference.bytes)}});
    const imageSize=request.qualityTier==='economy'?'512':'1K';
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),90000);
    try{
      const response=await fetch(`https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(this.model)}:generateContent`,{method:'POST',headers:{'x-goog-api-key':this.apiKey,'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{responseModalities:['IMAGE'],responseFormat:{image:{aspectRatio:request.composition.aspectRatio,imageSize}}}}),signal:controller.signal});
      const payload=await response.json().catch(()=>({})) as {responseId?:string;candidates?:Array<{content?:{parts?:Array<{inlineData?:{data?:string;mimeType?:string};inline_data?:{data?:string;mime_type?:string}}>}}>;error?:{message?:string}};
      const output=payload.candidates?.[0]?.content?.parts?.find((part)=>part.inlineData?.data||part.inline_data?.data);
      const data=output?.inlineData?.data??output?.inline_data?.data;const contentType=output?.inlineData?.mimeType??output?.inline_data?.mime_type??'image/png';
      if(!response.ok||!data)throw new AppError(response.status===429?'RATE_LIMITED':'PROVIDER_UNAVAILABLE',response.status===429?'Photo requests are busy right now. Try again soon.':'The photo could not be taken right now.',response.status===429?429:503,true);
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
  const location=request.context.location;
  const referenceRule=request.referenceImages.length?'This is the same fictional adult companion shown in the supplied identity reference.':'Use the canonical identity description exactly and keep it stable across images.';
  return [
    'IDENTITY',referenceRule,`${request.companion.name} is a fictional adult age ${request.companion.age}.`,line(identity.canonicalDescription),`Hair: ${line(identity.hair)}. Eyes: ${line(identity.eyes)}. Skin tone: ${line(identity.skinTone)}. Build: ${line(identity.build)}.`,`Identifying features: ${list(identity.identifyingFeatures)||'preserve the canonical identity'}.`,
    'SCENE',location?`${location.name}. ${line(location.description,'A believable real environment consistent with this location.')}`:'A believable environment consistent with the current Kivelle world.',
    'ACTIVITY',line(request.context.activity,'a natural moment from the current day'),
    'MOOD',line(request.context.mood,'natural and relaxed'),
    'TIME / LIGHTING',`${line(request.context.timeOfDay,'current local time')}; believable available light.`,
    'WARDROBE',request.context.outfitKey?`Continue the established outfit ${request.context.outfitKey}.`:`Natural ${line(identity.fashionStyle,'contemporary')} clothing appropriate to the place and activity.`,
    'COMPOSITION',`${request.composition.shotType.replace('_',' ')} photo, ${request.composition.aspectRatio}, ${line(request.composition.framing,'grounded framing with useful environmental context')}.`,
    'CAMERA STYLE','Believable personal smartphone or camera photo, natural lighting, subtle imperfections, realistic environment, natural expression. Avoid glossy advertising, glamour-campaign staging, fantasy rendering, oversaturation, text, logos, extra fingers, and impossible mirror geometry.',
    'CONTINUITY REQUIREMENTS','World state is authoritative. Do not change the location, activity, time, outfit continuity, or companion identity. Do not add people unless they are explicitly part of the event context.',
    'CONTENT LEVEL',request.contentLevel==='romance'?'Warm, affectionate, non-explicit romantic tone appropriate to the established relationship.':'Everyday non-explicit life photo.',
    'DO-NOT-CHANGE IDENTITY',`Preserve facial identity, adult age, body proportions, hair, eye color, and distinguishing features. ${list(identity.visualDoNotChange)}. Do not redesign the person and do not imitate any real person or celebrity.`,
  ].join('\n');
}

function timeOfDay(date=new Date()):string{const hour=date.getHours();return hour<6?'night':hour<12?'morning':hour<17?'afternoon':hour<21?'evening':'night';}
function requestKey(input:QueueMediaInput,intent:PhotoRequestIntent):string{return [input.source,input.characterInstanceId,input.messageId??input.lifeEventId??input.dateSessionId??input.momentId??input.storyArcId??input.idempotencyKey??intent.subject].join(':');}

export type QueueMediaInput={userId:string;characterInstanceId:string;source:MediaSource;conversationId?:string;messageId?:string;lifeEventId?:string;dateSessionId?:string;momentId?:string;storyArcId?:string;requestText?:string;idempotencyKey?:string;force?:boolean};
export async function queueMediaRequest(db:SupabaseClient,input:QueueMediaInput):Promise<Record<string,unknown>|null>{
  const intent=classifyPhotoRequest(input.requestText??'');
  if(input.source==='user_request'&&!intent.requested&&!input.force)return null;
  if(intent.requestedContentLevel&&['suggestive','mature','explicit'].includes(intent.requestedContentLevel))throw new AppError('PROVIDER_UNAVAILABLE','That kind of photo is not available.',422);
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
  const [{data:location},{data:opportunities}]=await Promise.all([
    locationId?db.from('together_locations').select('*').eq('id',locationId).maybeSingle():Promise.resolve({data:null}),
    db.from('together_photo_opportunities').select('*').eq('active',true),
  ]);
  const opportunity=scorePhotoOpportunities(opportunities??[],{locationSlug:String(location?.slug??''),relationshipStage:String(instance.relationship_stage),source:input.source,intent,recent:recent??[]});
  const requestedLevel:PhotoRequestIntent['requestedContentLevel']=intent.requestedContentLevel;
  const romanceAllowed=Boolean((profile.content_preferences as Record<string,unknown>)?.romanceEnabled!==false)&&['flirting','dating','exclusive','long_term'].includes(String(instance.relationship_stage));
  const contentLevel:MediaContentLevel=requestedLevel==='romance'&&romanceAllowed?'romance':input.source==='date'&&romanceAllowed?'romance':'standard';
  routeImageProvider(contentLevel);
  const shotType=intent.shotPreference??String(opportunity?.shot_type??(input.source==='user_request'?'selfie':'candid')) as ShotType;
  const aspectRatio=shotType==='scene'?'16:9':shotType==='selfie'||shotType==='full_body'?'4:5':'1:1';
  const qualityTier=input.source==='date'||input.source==='moment'||input.source==='story'?'premium':input.source==='user_request'?'standard':'economy';
  const outfitKey=await resolveOutfitKey(db,input,instance,now);
  const metadata={source:input.source,photoOpportunitySlug:opportunity?.slug??null,shotType,locationId:locationId??null,resolvedContentLevel:contentLevel,qualityTier,aspectRatio,requestKey:key,requestIntent:{subject:intent.subject,confidence:intent.confidence},requestHint:safeRequestText(input.requestText),sceneSummary:`${String(template.name)} ${shotType==='scene'?'shared a view from':'sent a photo while at'} ${String(location?.name??'City Life')} during ${String(instance.current_activity)}.`,activity:String(instance.current_activity),mood:String(instance.current_mood),timeOfDay:timeOfDay(now),outfitKey,relationshipStage:String(instance.relationship_stage),relationshipDirection:String(relationship?.recent_direction??'steady')};
  const row={user_id:input.userId,character_instance_id:input.characterInstanceId,conversation_id:input.conversationId??null,message_id:input.messageId??null,life_event_id:input.lifeEventId??null,date_session_id:input.dateSessionId??null,moment_id:input.momentId??null,story_arc_id:input.storyArcId??null,location_id:locationId??null,media_type:'image',content_level:contentLevel,provider:configuredImageProvider()?.id??null,status:'queued',request_key:key,metadata};
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

async function resolveOutfitKey(db:SupabaseClient,input:QueueMediaInput,instance:Record<string,unknown>,now:Date):Promise<string>{
  const linked=input.lifeEventId?await db.from('together_life_events').select('metadata').eq('id',input.lifeEventId).maybeSingle():null;
  const existing=(linked?.data?.metadata as Record<string,unknown>|undefined)?.outfitKey;
  if(typeof existing==='string')return existing;
  const day=now.toISOString().slice(0,10);
  const style=String(((instance.together_character_versions as Record<string,unknown>)?.visual_identity as Record<string,unknown>|undefined)?.fashionStyle??'city-casual').toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,32);
  const key=`${day}-${style||'city-casual'}`;
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
  const references:Array<{bytes:Uint8Array;contentType:string;name:string}>=[];
  const paths=Array.isArray(identity.referenceStoragePaths)?identity.referenceStoragePaths.map(String).slice(0,2):[];
  for(const path of paths){const {data}=await db.storage.from('kivelle-character-reference').download(path);if(data)references.push({bytes:new Uint8Array(await data.arrayBuffer()),contentType:data.type||'image/png',name:path.split('/').at(-1)??'reference.png'});}
  return {mediaId:String(media.id),companion:{templateId:String(instance.character_template_id),versionId:String(instance.character_version_id),name:String(template.name),age:Number(template.age)},visualIdentity:{canonicalDescription:String(identity.canonicalDescription??template.biography??template.name),age:Number(identity.age??template.age),referenceStoragePaths:paths,hair:String(identity.hair??''),eyes:String(identity.eyes??''),skinTone:String(identity.skinTone??''),build:String(identity.build??''),approximateHeight:String(identity.approximateHeight??''),identifyingFeatures:Array.isArray(identity.identifyingFeatures)?identity.identifyingFeatures.map(String):[],tattoos:Array.isArray(identity.tattoos)?identity.tattoos.map(String):[],piercings:Array.isArray(identity.piercings)?identity.piercings.map(String):[],fashionStyle:String(identity.fashionStyle??''),recurringAccessories:Array.isArray(identity.recurringAccessories)?identity.recurringAccessories.map(String):[],visualDoNotChange:Array.isArray(identity.visualDoNotChange)?identity.visualDoNotChange.map(String):[],photoStyle:(identity.photoStyle??{}) as Record<string,unknown>},referenceImages:references,context:{location:location?{id:String(location.id),name:String(location.name),description:String(location.description),category:String(location.category)}:undefined,activity:String(meta.activity??instance.current_activity),mood:String(meta.mood??instance.current_mood),timeOfDay:String(meta.timeOfDay??timeOfDay()),outfitKey:String(meta.outfitKey??'')||undefined},composition:{shotType:String(meta.shotType??'candid') as ShotType,aspectRatio:String(meta.aspectRatio??'4:5')},contentLevel:String(media.content_level??'standard') as MediaContentLevel,qualityTier:String(meta.qualityTier??'standard') as CanonicalImageGenerationRequest['qualityTier']};
}

export async function kickMediaDispatcher():Promise<void>{
  const secret=Deno.env.get('TOGETHER_MEDIA_DISPATCH_SECRET');
  const url=Deno.env.get('SUPABASE_URL');
  if(!secret||!url)return;
  await fetch(`${url}/functions/v1/together-media-dispatch`,{method:'POST',headers:{'x-together-dispatch-secret':secret,'Content-Type':'application/json'},body:'{"limit":3}'}).catch(()=>undefined);
}
