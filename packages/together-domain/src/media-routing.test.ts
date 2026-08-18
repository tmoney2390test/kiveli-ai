import{describe,expect,it}from'vitest';
import{modelFamilyFor,resolveMediaContentPolicy,routeMediaGeneration,type MediaRouteCapability}from'./media-routing.ts';

const registry:MediaRouteCapability[]=[
  {id:'wavespeed-multiref',provider:'wavespeed',model:'wavespeed-ai/flux-kontext-dev/multi-ultra-fast',modelFamily:'flux',mediaTypes:['image'],contentLevels:['standard','romance'],supportsCharacterReference:true,supportsLocationReference:true,maxReferenceImages:4,supportsLoRA:false,loraModelFamilies:[],supportsImageEditing:true,supportsImageToVideo:false,qualityTiers:['economy','standard','premium'],priority:100,enabled:true,asynchronous:true},
  {id:'wavespeed-z-lora',provider:'wavespeed',model:'wavespeed-ai/z-image/turbo-lora',modelFamily:'z-image',mediaTypes:['image'],contentLevels:['standard','romance'],supportsCharacterReference:false,supportsLocationReference:false,maxReferenceImages:0,supportsLoRA:true,loraModelFamilies:['z-image'],supportsImageEditing:false,supportsImageToVideo:false,qualityTiers:['standard','premium'],priority:90,enabled:true,asynchronous:true},
  {id:'openai',provider:'openai',model:'gpt-image-2',modelFamily:'openai-image',mediaTypes:['image'],contentLevels:['standard','romance'],supportsCharacterReference:true,supportsLocationReference:true,maxReferenceImages:2,supportsLoRA:false,loraModelFamilies:[],supportsImageEditing:true,supportsImageToVideo:false,qualityTiers:['economy','standard','premium'],priority:40,enabled:true,asynchronous:false},
];

const input={mediaType:'image' as const,contentLevel:'standard' as const,qualityTier:'standard' as const,shotType:'scene' as const,characterIdentityAvailable:true,characterLoRAAvailable:false,locationReferenceAvailable:true,outfitReferenceAvailable:false,source:'user_request',userTier:'free',preferredProvider:'wavespeed'};

describe('media routing',()=>{
  it('prefers a validated character and location route',()=>{const route=routeMediaGeneration(input,registry);expect(route?.capability.id).toBe('wavespeed-multiref');expect(route?.reasonCode).toBe('character_plus_location_references');});
  it('uses only a compatible LoRA family',()=>{const route=routeMediaGeneration({...input,locationReferenceAvailable:false,characterLoRAAvailable:true,characterLoRAModelFamily:'z-image'},registry);expect(route?.capability.id).toBe('wavespeed-z-lora');const incompatible=routeMediaGeneration({...input,locationReferenceAvailable:false,characterLoRAAvailable:true,characterLoRAModelFamily:'sdxl'},registry);expect(incompatible?.capability.id).not.toBe('wavespeed-z-lora');});
  it('keeps fallback ordering deterministic',()=>{expect(routeMediaGeneration(input,registry)?.fallbacks.map((item)=>item.id)).toEqual(['openai','wavespeed-z-lora']);});
  it('identifies model families conservatively',()=>{expect(modelFamilyFor('wavespeed-ai/flux-2-klein-4b/edit-lora')).toBe('flux');expect(modelFamilyFor('vendor/new-model')).toBe('unknown');});
});

describe('media policy',()=>{
  const policy={requestedLevel:'standard' as const,source:'user_request',automatic:false,ageVerified:true,characterAge:29,fictionalCharacter:true,realPersonRequest:false,nonConsensualRequest:false,minorRelatedRequest:false,characterAllowsRequestedLevel:true,romanceEnabled:true,suggestiveMediaEnabled:false,matureMediaEnabled:false,explicitMediaEnabled:false,adultVideoEnabled:false,mediaType:'image' as const,adultMediaFeatureEnabled:false};
  it('allows standard fictional-adult media',()=>expect(resolveMediaContentPolicy(policy).allowed).toBe(true));
  it('rejects unverified accounts and underage characters',()=>{expect(resolveMediaContentPolicy({...policy,ageVerified:false}).reasonCode).toBe('age_verification_required');expect(resolveMediaContentPolicy({...policy,characterAge:17}).reasonCode).toBe('adult_character_required');});
  it('rejects real-person and automatic adult generation',()=>{expect(resolveMediaContentPolicy({...policy,realPersonRequest:true}).reasonCode).toBe('real_person_likeness');expect(resolveMediaContentPolicy({...policy,requestedLevel:'suggestive',suggestiveMediaEnabled:true,adultMediaFeatureEnabled:true,automatic:true}).reasonCode).toBe('automatic_adult_media_disabled');});
  it('requires explicit user and feature permission for higher levels',()=>{expect(resolveMediaContentPolicy({...policy,requestedLevel:'mature'}).allowed).toBe(false);expect(resolveMediaContentPolicy({...policy,requestedLevel:'mature',matureMediaEnabled:true,adultMediaFeatureEnabled:true}).allowed).toBe(true);});
  it('requires a separate adult-video permission',()=>{expect(resolveMediaContentPolicy({...policy,requestedLevel:'suggestive',suggestiveMediaEnabled:true,adultMediaFeatureEnabled:true,mediaType:'video'}).reasonCode).toBe('adult_video_disabled');expect(resolveMediaContentPolicy({...policy,requestedLevel:'suggestive',suggestiveMediaEnabled:true,adultMediaFeatureEnabled:true,adultVideoEnabled:true,mediaType:'video'}).allowed).toBe(true);});
  it('never lets policy or provider routing bypass real-person and consent boundaries',()=>{expect(resolveMediaContentPolicy({...policy,requestedLevel:'explicit',explicitMediaEnabled:true,adultMediaFeatureEnabled:true,realPersonRequest:true}).allowed).toBe(false);expect(resolveMediaContentPolicy({...policy,nonConsensualRequest:true}).reasonCode).toBe('consent_boundary');});
  it('keeps character-authored media boundaries authoritative',()=>expect(resolveMediaContentPolicy({...policy,requestedLevel:'mature',matureMediaEnabled:true,adultMediaFeatureEnabled:true,characterAllowsRequestedLevel:false}).reasonCode).toBe('character_boundary'));
});
