export type MediaType='image'|'video'|'lora';
export type MediaContentLevel='standard'|'romance'|'suggestive'|'mature'|'explicit';
export type MediaQualityTier='economy'|'standard'|'premium';
export type MediaShotType='selfie'|'portrait'|'candid'|'full_body'|'scene';
export type MediaReferenceRole='character_identity'|'character_training'|'location_environment'|'world_environment'|'outfit_continuity'|'previous_media';

export type MediaRouteCapability={
  id:string;provider:string;model:string;modelFamily:string;
  mediaTypes:MediaType[];contentLevels:MediaContentLevel[];
  supportsCharacterReference:boolean;supportsLocationReference:boolean;maxReferenceImages:number;
  supportsLoRA:boolean;loraModelFamilies:string[];supportsImageEditing:boolean;supportsImageToVideo:boolean;
  qualityTiers:MediaQualityTier[];estimatedCost?:number;priority:number;enabled:boolean;asynchronous:boolean;
  preferredForUserRequests?:boolean;
  preferredForQualityRetry?:boolean;
  requiresReferenceImages?:boolean;
};

export type MediaRouteInput={
  mediaType:MediaType;contentLevel:MediaContentLevel;qualityTier:MediaQualityTier;shotType:MediaShotType;
  characterIdentityAvailable:boolean;characterLoRAAvailable:boolean;characterLoRAModelFamily?:string;
  locationReferenceAvailable:boolean;worldReferenceAvailable?:boolean;outfitReferenceAvailable:boolean;
  source:string;userTier:string;preferredProvider?:string;
  qualityRetry?:boolean;
  requiresCharacterReference?:boolean;
  requiresImageEditing?:boolean;
  adultPipelineAuthorized?:boolean;
};

export type MediaRoute={capability:MediaRouteCapability;reasonCode:string;fallbacks:MediaRouteCapability[]};

export function routeMediaGeneration(input:MediaRouteInput,registry:MediaRouteCapability[]):MediaRoute|null{
  if(['suggestive','mature','explicit'].includes(input.contentLevel)&&!input.adultPipelineAuthorized)return null;
  if(input.requiresCharacterReference&&!input.characterIdentityAvailable)return null;
  const hasReference=input.characterIdentityAvailable||input.locationReferenceAvailable||Boolean(input.worldReferenceAvailable)||input.outfitReferenceAvailable;
  const candidates=registry.filter((entry)=>entry.enabled&&entry.mediaTypes.includes(input.mediaType)&&entry.contentLevels.includes(input.contentLevel)&&entry.qualityTiers.includes(input.qualityTier)&&(!entry.requiresReferenceImages||hasReference)&&(!input.requiresCharacterReference||(entry.supportsCharacterReference&&entry.maxReferenceImages>0))&&(!input.requiresImageEditing||entry.supportsImageEditing)&&(!input.characterLoRAAvailable||!entry.supportsLoRA||entry.loraModelFamilies.includes(input.characterLoRAModelFamily??''))&&(!(input.mediaType==='video')||entry.supportsImageToVideo));
  const scored=candidates.map((entry)=>({entry,score:entry.priority+providerPreference(entry,input)+referenceFit(entry,input)+loraFit(entry,input)+qualityFit(entry,input)+requestSourceFit(entry,input)+qualityRetryFit(entry,input)})).sort((a,b)=>b.score-a.score||a.entry.id.localeCompare(b.entry.id));
  const primary=scored[0]?.entry;if(!primary)return null;
  return{capability:primary,reasonCode:routeReason(primary,input),fallbacks:scored.slice(1).map((item)=>item.entry)};
}

function providerPreference(entry:MediaRouteCapability,input:MediaRouteInput){return input.preferredProvider&&entry.provider===input.preferredProvider?30:0;}
function referenceFit(entry:MediaRouteCapability,input:MediaRouteInput){let score=0;if(input.characterIdentityAvailable&&entry.supportsCharacterReference)score+=18;if(input.locationReferenceAvailable&&entry.supportsLocationReference)score+=input.shotType==='scene'?24:16;if(!input.locationReferenceAvailable&&input.worldReferenceAvailable&&entry.supportsLocationReference)score+=8;if(input.outfitReferenceAvailable&&entry.maxReferenceImages>=3)score+=5;if((input.characterIdentityAvailable||input.locationReferenceAvailable)&&entry.maxReferenceImages===0)score-=65;return score;}
function loraFit(entry:MediaRouteCapability,input:MediaRouteInput){if(!input.characterLoRAAvailable)return 0;return entry.supportsLoRA&&entry.loraModelFamilies.includes(input.characterLoRAModelFamily??'')?100:-5;}
function qualityFit(entry:MediaRouteCapability,input:MediaRouteInput){return input.qualityTier==='premium'&&entry.qualityTiers.includes('premium')?4:0;}
function requestSourceFit(entry:MediaRouteCapability,input:MediaRouteInput){if(!entry.preferredForUserRequests)return 0;return['user_request','user_edit'].includes(input.source)?36:-36;}
function qualityRetryFit(entry:MediaRouteCapability,input:MediaRouteInput){return input.qualityRetry&&entry.preferredForQualityRetry?80:0;}
function routeReason(entry:MediaRouteCapability,input:MediaRouteInput){if(input.mediaType==='video')return'image_to_video';if(input.requiresImageEditing)return'source_image_edit';if(input.characterLoRAAvailable&&entry.supportsLoRA&&input.locationReferenceAvailable&&entry.supportsLocationReference)return'compatible_lora_plus_location';if(input.locationReferenceAvailable&&entry.supportsLocationReference&&input.characterIdentityAvailable&&entry.supportsCharacterReference)return'character_plus_location_references';if(input.characterLoRAAvailable&&entry.supportsLoRA)return'compatible_character_lora';if(input.characterIdentityAvailable&&entry.supportsCharacterReference)return'character_reference';return'textual_context_fallback';}

export type MediaPolicyInput={
  requestedLevel:MediaContentLevel;source:string;automatic:boolean;ageVerified:boolean;characterAge:number;
  fictionalCharacter:boolean;realPersonRequest:boolean;nonConsensualRequest:boolean;minorRelatedRequest:boolean;
  characterAllowsRequestedLevel:boolean;
  romanceEnabled:boolean;suggestiveMediaEnabled:boolean;matureMediaEnabled:boolean;explicitMediaEnabled:boolean;adultVideoEnabled:boolean;
  mediaType:'image'|'video';adultMediaFeatureEnabled:boolean;
  adultPipelineAuthorized?:boolean;
};

export type MediaPolicyDecision={allowed:boolean;resolvedLevel:MediaContentLevel;reasonCode:string};

export function resolveCharacterMediaBoundaries(versionBoundaries:unknown,templateBoundaries:unknown):Record<string,unknown>{
  const template=templateBoundaries&&typeof templateBoundaries==='object'&&!Array.isArray(templateBoundaries)?templateBoundaries as Record<string,unknown>:{};
  const version=versionBoundaries&&typeof versionBoundaries==='object'&&!Array.isArray(versionBoundaries)?versionBoundaries as Record<string,unknown>:{};
  return{...template,...version};
}

export function resolveMediaContentPolicy(input:MediaPolicyInput):MediaPolicyDecision{
  if(!input.ageVerified)return deny('age_verification_required');
  if(input.characterAge<18||input.minorRelatedRequest)return deny('adult_character_required');
  if(!input.fictionalCharacter||input.realPersonRequest)return deny('real_person_likeness');
  if(input.nonConsensualRequest)return deny('consent_boundary');
  if(['suggestive','mature','explicit'].includes(input.requestedLevel)&&!input.adultPipelineAuthorized)return deny('web_adult_authorization_required');
  if(!input.characterAllowsRequestedLevel)return deny('character_boundary');
  if(input.requestedLevel!=='standard'&&!input.romanceEnabled)return deny('romance_disabled');
  if(input.automatic&&['suggestive','mature','explicit'].includes(input.requestedLevel))return deny('automatic_adult_media_disabled');
  if(input.mediaType==='video'&&input.requestedLevel!=='standard'&&!input.adultVideoEnabled)return deny('adult_video_disabled');
  if(['suggestive','mature','explicit'].includes(input.requestedLevel)&&!input.adultMediaFeatureEnabled)return deny('adult_media_feature_disabled');
  if(input.requestedLevel==='suggestive'&&!input.suggestiveMediaEnabled)return deny('suggestive_media_disabled');
  if(input.requestedLevel==='mature'&&!input.matureMediaEnabled)return deny('mature_media_disabled');
  if(input.requestedLevel==='explicit'&&!input.explicitMediaEnabled)return deny('explicit_media_disabled');
  return{allowed:true,resolvedLevel:input.requestedLevel,reasonCode:'allowed'};
}

function deny(reasonCode:string):MediaPolicyDecision{return{allowed:false,resolvedLevel:'standard',reasonCode};}

export function modelFamilyFor(model:string):string{
  const value=model.toLowerCase();
  if(value.includes('z-image'))return'z-image';
  if(value.includes('flux'))return'flux';
  if(value.includes('ltx'))return'ltx';
  if(value.includes('chroma'))return'chroma';
  if(value.includes('gpt-image'))return'openai-image';
  if(value.includes('gemini'))return'gemini-image';
  if(value.includes('qwen'))return'qwen-image';
  if(value.includes('grok'))return'grok-image';
  return'unknown';
}
