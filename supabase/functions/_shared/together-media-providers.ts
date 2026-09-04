import{modelFamilyFor,routeMediaGeneration,type MediaRoute,type MediaRouteCapability}from'../../../packages/together-domain/src/media-routing.ts';
import{AppError}from'./types.ts';
import{buildImagePrompt,configuredImageProvider,mediaCaptureLightingForRequest,type CanonicalImageGenerationRequest,type ImageGenerationResult,type MediaReferenceImage}from'./together-media-base.ts';
import{configuredWaveSpeedClient,envBoolean,envNumber,type WaveSpeedClient,type WaveSpeedPrediction}from'./wavespeed.ts';
import{estimatedMediaProviderCost}from'../../../packages/together-domain/src/media-economics.ts';
import{adultPoseMustRebuild,hasUsableCharacterIdentityReference,requestImpliesFrontalGenitalVisibility,requestImpliesRearAdultAnatomy,requestRequiresIdentityPreservingAdultRoute,resolveAdultNudityScope,resolvePhotoDirection,resolveSpecificAnatomyExposure,visibleAdultAnatomyTargetLabels}from'../../../packages/together-domain/src/media.ts';
import{resolveVenicePipeline,VENICE_ADULT_EDIT_MODEL,VENICE_ADULT_FALLBACK_EDIT_MODEL,VENICE_ADULT_FINAL_EDIT_MODEL,VENICE_QUALITY_EDIT_MODEL,VENICE_STANDARD_EDIT_MODEL,VENICE_STANDARD_FALLBACK_EDIT_MODEL,veniceModelCostUsd}from'../../../packages/together-domain/src/venice-media.ts';
import{configuredVeniceClient,type VeniceEditResult,type VeniceImageClient}from'./venice.ts';
import{buildMediaEditConstraint,classifyMediaEditSemantics}from'../../../packages/together-domain/src/media-edit.ts';
import{buildMediaWorldContainmentInstruction}from'./together-media-world.ts';
import { buildVideoProviderPayload, configuredVideoRouteCatalog, videoProviderBaselineCostUsd, type VideoAspectRatio, type VideoMotionPreset, type VideoResolution, type VideoRouteId } from './kivelle-video-routes.ts';

export type CanonicalMediaRequest=CanonicalImageGenerationRequest&{mediaType:'image'|'video';videoRouteId?:VideoRouteId;motionPreset?:VideoMotionPreset;videoAspectRatio?:VideoAspectRatio;durationSeconds?:number;videoResolution?:VideoResolution;videoSound?:boolean;anonymousAdultPartner?:boolean};
export type ProviderAttempt={attemptNumber:number;stage:string;provider:string;model:string;routeId:string;estimatedCost?:number;generationMs?:number;success:boolean;failureCode?:string;providerRequestId?:string};
export type ProviderCompletedMedia={bytes?:Uint8Array;outputUrl?:string;contentType?:string;width?:number;height?:number;durationMs?:number;providerRequestId?:string;model:string;estimatedCost?:number;generationMs?:number;providerAttempts?:ProviderAttempt[];providerMetadata?:Record<string,unknown>};
export type ProviderSubmission={provider:string;providerRequestId:string;model:string;status:'submitted'|'completed';result?:ProviderCompletedMedia};

export interface MediaGenerationProvider{id:string;asynchronous:boolean;submit(request:CanonicalMediaRequest,route:MediaRouteCapability):Promise<ProviderSubmission>;getResult?(providerRequestId:string):Promise<ProviderResult>}
export type ProviderResult={status:'processing'|'completed'|'failed';result?:ProviderCompletedMedia;failureCode?:string;failureReasonSafe?:string};
export type RoutedProvider={route:MediaRoute;provider:MediaGenerationProvider};

export const WAVESPEED_GROUP_QWEN_ROUTE_ID='wavespeed-qwen2-pro-group-multiref';
const WAVESPEED_GROUP_QWEN_MODEL='wavespeed-ai/qwen-image-2.0-pro/edit';
export const WAVESPEED_ADULT_QWEN_ROUTE_ID='wavespeed-qwen2-pro-adult-reference-edit';
const WAVESPEED_ADULT_QWEN_MODEL='wavespeed-ai/qwen-image-2.0-pro/edit';
export const WAVESPEED_ADULT_COMPOSED_ROUTE_ID='wavespeed-wan22-realism-face-swap-adult';
const WAVESPEED_ADULT_SCENE_MODEL='wavespeed-ai/wan-2.2/text-to-image-realism';
const WAVESPEED_ADULT_IDENTITY_MODEL='wavespeed-ai/image-face-swap';
const ADULT_CONTENT_LEVELS:MediaRouteCapability['contentLevels']=['suggestive','mature','explicit'];

export function configuredMediaRegistry():MediaRouteCapability[]{
  const wave=envBoolean('KIVELLE_WAVESPEED_ENABLED')&&Boolean(Deno.env.get('WAVESPEED_API_KEY')),adult=envBoolean('KIVELLE_ADULT_MEDIA_ENABLED'),video=envBoolean('KIVELLE_VIDEO_ENABLED'),venice=envBoolean('KIVELLE_VENICE_ENABLED')&&Boolean(Deno.env.get('VENICE_API_KEY'));
  const veniceAdultModel=env('KIVELLE_VENICE_ADULT_MODEL',VENICE_ADULT_EDIT_MODEL);
  const standard:MediaRouteCapability['contentLevels']=['standard','romance'];
  const groupEnabled=wave&&envBoolean('KIVELLE_WAVESPEED_GROUP_IMAGES_ENABLED'),groupAdultValidated=adult&&envBoolean('KIVELLE_WAVESPEED_GROUP_ADULT_ROUTE_VALIDATED'),groupContentLevels:MediaRouteCapability['contentLevels']=[...standard,...(groupAdultValidated?ADULT_CONTENT_LEVELS:[])];
  const waveSpeedAdultImages=wave&&adult&&envBoolean('KIVELLE_WAVESPEED_ADULT_IMAGES_ENABLED')&&envBoolean('KIVELLE_WAVESPEED_ADULT_ROUTE_VALIDATED'),composedAdultImages=waveSpeedAdultImages&&envBoolean('KIVELLE_WAVESPEED_ADULT_COMPOSED_PIPELINE_ENABLED');
  const registry:MediaRouteCapability[]=[
    entry('venice-qwen2-reference-edit','venice',env('KIVELLE_VENICE_STANDARD_MODEL',VENICE_STANDARD_EDIT_MODEL),'qwen-image',['image'],standard,{character:true,location:true,max:3,edit:true,cost:estimatedMediaProviderCost('venice-qwen2-reference-edit')??veniceModelCostUsd(VENICE_STANDARD_EDIT_MODEL),priority:130,enabled:venice,userRequest:true,requiresRefs:true,async:false}),
    entry('venice-qwen2-pro-quality','venice',env('KIVELLE_VENICE_QUALITY_MODEL',VENICE_QUALITY_EDIT_MODEL),'qwen-image',['image'],standard,{character:true,location:true,max:3,edit:true,cost:estimatedMediaProviderCost('venice-qwen2-pro-quality')??veniceModelCostUsd(VENICE_QUALITY_EDIT_MODEL),priority:105,enabled:venice,qualityRetry:true,requiresRefs:true,async:false}),
    entry('venice-adult-two-stage','venice',veniceAdultModel,modelFamilyFor(veniceAdultModel),['image'],adult?['suggestive','mature','explicit']:[],{character:true,location:true,max:3,edit:true,cost:estimatedMediaProviderCost('venice-adult-two-stage')??.08,priority:140,enabled:venice&&adult&&envBoolean('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED'),userRequest:true,requiresRefs:true,async:false}),
    entry('wavespeed-kontext-pro-multiref','wavespeed',env('WAVESPEED_MODEL_REQUESTED_MULTIREF','wavespeed-ai/flux-kontext-pro/multi'),'flux',['image'],standard,{character:true,location:true,max:5,edit:true,cost:estimatedMediaProviderCost('wavespeed-kontext-pro-multiref')??undefined,priority:118,enabled:wave,userRequest:true,requiresRefs:true}),
    entry('wavespeed-kontext-max-multiref','wavespeed',env('WAVESPEED_MODEL_QUALITY_RETRY_MULTIREF','wavespeed-ai/flux-kontext-max/multi'),'flux',['image'],standard,{character:true,location:true,max:5,edit:true,cost:estimatedMediaProviderCost('wavespeed-kontext-max-multiref')??undefined,priority:117,enabled:wave,qualityRetry:true,requiresRefs:true}),
    entry(WAVESPEED_ADULT_COMPOSED_ROUTE_ID,'wavespeed',env('WAVESPEED_MODEL_ADULT_SCENE',WAVESPEED_ADULT_SCENE_MODEL),'photoreal-face-swap',['image'],ADULT_CONTENT_LEVELS,{character:true,location:false,max:1,edit:false,cost:estimatedMediaProviderCost(WAVESPEED_ADULT_COMPOSED_ROUTE_ID)??.035,priority:195,enabled:composedAdultImages,userRequest:true,qualityRetry:true,requiresRefs:true}),
    entry(WAVESPEED_ADULT_QWEN_ROUTE_ID,'wavespeed',env('WAVESPEED_MODEL_ADULT_EDIT',WAVESPEED_ADULT_QWEN_MODEL),'qwen-image',['image'],ADULT_CONTENT_LEVELS,{character:true,location:true,max:3,edit:true,cost:estimatedMediaProviderCost(WAVESPEED_ADULT_QWEN_ROUTE_ID)??.07,priority:165,enabled:waveSpeedAdultImages,userRequest:true,qualityRetry:true,requiresRefs:true}),
    entry(WAVESPEED_GROUP_QWEN_ROUTE_ID,'wavespeed',env('WAVESPEED_MODEL_GROUP_MULTIREF',WAVESPEED_GROUP_QWEN_MODEL),'qwen-image',['image'],groupContentLevels,{character:true,location:true,max:3,edit:true,cost:estimatedMediaProviderCost(WAVESPEED_GROUP_QWEN_ROUTE_ID)??.07,priority:155,enabled:groupEnabled,userRequest:true,qualityRetry:true,requiresRefs:true}),
    entry('wavespeed-multiref','wavespeed',env('WAVESPEED_MODEL_MULTIREF','wavespeed-ai/flux-kontext-dev/multi-ultra-fast'),'flux',['image'],standard,{character:true,location:true,max:4,edit:true,cost:estimatedMediaProviderCost('wavespeed-multiref')??undefined,priority:120,enabled:wave}),
    entry('wavespeed-zimage-lora','wavespeed',env('WAVESPEED_MODEL_STANDARD_LORA','wavespeed-ai/z-image/turbo-lora'),'z-image',['image'],standard,{lora:true,loraFamilies:['z-image'],priority:108,enabled:wave&&envBoolean('KIVELLE_WAVESPEED_LORA_ENABLED')}),
    entry('wavespeed-zimage-i2i-lora','wavespeed',env('WAVESPEED_MODEL_STANDARD_I2I_LORA','wavespeed-ai/z-image-turbo/image-to-image-lora'),'z-image',['image'],standard,{character:true,location:true,max:1,lora:true,loraFamilies:['z-image'],edit:true,priority:112,enabled:wave&&envBoolean('KIVELLE_WAVESPEED_LORA_ENABLED')}),
    entry('wavespeed-flux-edit-lora','wavespeed',env('WAVESPEED_MODEL_MULTIREF_LORA','wavespeed-ai/flux-2-klein-4b/edit-lora'),'flux',['image'],standard,{character:true,location:true,max:4,lora:true,loraFamilies:['flux'],edit:true,priority:114,enabled:wave&&envBoolean('KIVELLE_WAVESPEED_LORA_ENABLED')&&envBoolean('KIVELLE_WAVESPEED_EXPERIMENTAL_ROUTES')}),
    // Legacy LTX/"spicy" video routes are intentionally disabled. Tester
    // video is selected only through the canonical route catalog below.
    entry('wavespeed-video','wavespeed',env('WAVESPEED_MODEL_VIDEO','wavespeed-ai/ltx-2.3-spicy/image-to-video'),'ltx',['video'],standard,{character:true,location:true,max:1,i2v:true,priority:1,enabled:false}),
    entry('wavespeed-video-lora','wavespeed',env('WAVESPEED_MODEL_VIDEO_LORA','wavespeed-ai/ltx-2.3-spicy/image-to-video-lora'),'ltx',['video'],standard,{character:true,location:true,max:1,lora:true,loraFamilies:['ltx'],i2v:true,priority:1,enabled:false}),
    ...configuredVideoRouteCatalog().map((route)=>entry(route.id,route.provider,route.model,videoModelFamily(route.model),['video'],route.contentClass==='adult_capable'?ADULT_CONTENT_LEVELS:standard,{character:false,location:false,max:1,i2v:true,cost:videoProviderBaselineCostUsd(route,{resolution:route.defaultResolution,duration:route.defaultDuration,sound:route.audioMode==='always'}),priority:160,enabled:route.enabled})),
  ];
  const sync=configuredImageProvider();if(sync)registry.push(entry(`${sync.id}-image`,sync.id,sync.id==='openai'?env('KIVELLE_IMAGE_MODEL','gpt-image-2'):env('KIVELLE_IMAGE_MODEL','gemini-3.1-flash-image'),sync.id==='openai'?'openai-image':'gemini-image',['image'],standard,{character:true,location:true,max:2,edit:true,priority:50,enabled:true,async:false}));
  return registry;
}

export function configuredGroupImageRouteAvailable(contentLevel:string,minimumReferenceImages=2):boolean{return configuredMediaRegistry().some((route)=>route.enabled&&route.mediaTypes.includes('image')&&route.contentLevels.includes(contentLevel as MediaRouteCapability['contentLevels'][number])&&route.supportsCharacterReference&&route.maxReferenceImages>=minimumReferenceImages&&route.provider!=='venice');}

export function routeCanonicalMedia(request:CanonicalMediaRequest,input:{source:string;userTier:string;preferredProvider?:string}):RoutedProvider{
  const references=request.referenceImages;const profile=request.mediaProfile,subjectCount=Math.max(1,request.subjects?.length??1);
  const identitySubjects=new Set(references.filter((reference)=>reference.role==='character_identity'&&Boolean(reference.signedUrl||reference.bytes?.byteLength)).map((reference)=>reference.characterInstanceId).filter(Boolean)),characterIdentityAvailable=subjectCount===1?hasUsableCharacterIdentityReference(references):identitySubjects.size===subjectCount,requiresCharacterReference=request.mediaType==='image'&&request.generationKind!=='creator_identity';
  if(requiresCharacterReference&&!characterIdentityAvailable)throw new AppError('CHARACTER_REFERENCE_REQUIRED','The companion reference photo could not be prepared. No ungrounded image was sent to the provider.',409,true);
  const requiredReferences=subjectCount+(subjectCount>1&&request.generationKind==='photo_edit'?1:0),adultImage=request.mediaType==='image'&&ADULT_CONTENT_LEVELS.includes(request.contentLevel),uncensoredAdult=adultImage&&requestRequiresIdentityPreservingAdultRoute(request.generationIntent?.requestText),adultWaveSpeedPreferred=adultImage&&adultImageCanaryWaveSpeed(request.mediaId)&&!uncensoredAdult,selected=input.preferredProvider??(request.mediaType==='video'||adultWaveSpeedPreferred?'wavespeed':env('KIVELLE_IMAGE_PROVIDER','').toLowerCase()||undefined),preferred=selected??(canaryWaveSpeed(request.mediaId)?'wavespeed':undefined),composedAdultEligible=adultWaveSpeedPreferred&&subjectCount===1&&request.generationKind!=='photo_edit'&&request.anonymousAdultPartner!==true&&!uncensoredAdult,registry=configuredMediaRegistry().filter((route)=>route.id===WAVESPEED_ADULT_QWEN_ROUTE_ID&&!adultWaveSpeedPreferred?false:route.id===WAVESPEED_ADULT_COMPOSED_ROUTE_ID&&!composedAdultEligible?false:subjectCount===1?route.id!==WAVESPEED_GROUP_QWEN_ROUTE_ID:(![WAVESPEED_ADULT_QWEN_ROUTE_ID,WAVESPEED_ADULT_COMPOSED_ROUTE_ID].includes(route.id)&&route.supportsCharacterReference&&route.maxReferenceImages>=requiredReferences&&route.provider!=='venice'));
  const routeInput={mediaType:request.mediaType,contentLevel:request.contentLevel,qualityTier:request.qualityTier,shotType:request.composition.shotType,characterIdentityAvailable,characterLoRAAvailable:Boolean(profile?.modelUrl),characterLoRAModelFamily:profile?.modelFamily,locationReferenceAvailable:references.some((item)=>item.role==='location_environment'),worldReferenceAvailable:references.some((item)=>item.role==='world_environment'),outfitReferenceAvailable:references.some((item)=>item.role==='outfit_continuity'),source:input.source,userTier:input.userTier,preferredProvider:preferred,qualityRetry:Boolean(request.qualityRetry),requiresCharacterReference,requiresImageEditing:request.generationKind==='photo_edit',adultPipelineAuthorized:request.adultPipelineAuthorized===true};
  // KIVELLE_IMAGE_PROVIDER is an operator choice, not a weak scoring hint.
  // Prefer only that provider when it has an eligible route, then fail over to
  // the full registry when it cannot serve the requested content level (for
  // example OpenAI SFW plus Venice adult media).
  const preferredRegistry=selected?registry.filter((entry)=>entry.provider===selected):[];
  const route=(preferredRegistry.length?routeMediaGeneration(routeInput,preferredRegistry):null)??routeMediaGeneration(routeInput,registry);
  if(!route)throw new AppError('PROVIDER_UNAVAILABLE',subjectCount>1?'No configured provider can preserve both companion identities for that photo.':'No configured provider can preserve this companion’s identity for that photo.',503);
  const provider=providerForCapability(route.capability);return{route,provider};
}

export function providerForCapability(route:MediaRouteCapability):MediaGenerationProvider{
  if(route.provider==='wavespeed'){const client=configuredWaveSpeedClient();if(!client)throw new AppError('PROVIDER_NOT_CONFIGURED','Photo generation is not connected yet.',503);return new WaveSpeedMediaProvider(client);}
  if(route.provider==='venice'){const client=configuredVeniceClient();if(!client)throw new AppError('PROVIDER_NOT_CONFIGURED','Photo generation is not connected yet.',503);return new VeniceMediaProvider(client);}
  const provider=configuredImageProvider();if(!provider||provider.id!==route.provider)throw new AppError('PROVIDER_NOT_CONFIGURED','Photo generation is not connected yet.',503);
  return{id:provider.id,asynchronous:false,submit:async(request)=>{const result=await provider.generate(request);return{provider:provider.id,providerRequestId:result.providerRequestId??crypto.randomUUID(),model:result.model,status:'completed',result:syncResult(result)}}};
}

export class VeniceMediaProvider implements MediaGenerationProvider{
  id='venice';asynchronous=false;
  constructor(private readonly client:VeniceImageClient){}
  async submit(request:CanonicalMediaRequest,route:MediaRouteCapability):Promise<ProviderSubmission>{
    if(request.mediaType!=='image')throw new AppError('PROVIDER_UNAVAILABLE','That media type is not available through this provider.',503);
    // Venice multi-edit treats images after the first as masks/edit layers. Our
    // location and outfit images are descriptive references, not masks, so
    // sending them as layers makes otherwise valid companion requests fail
    // validation. Keep the canonical identity image as the actual edit source;
    // place, activity, outfit and time remain grounded in buildImagePrompt().
    const references=veniceReferences(request,route).slice(0,1),adultRoute=route.id==='venice-adult-two-stage';
    if(!adultRoute){
      const attempts:ProviderAttempt[]=[],models=[route.model,env('KIVELLE_VENICE_STANDARD_FALLBACK_MODEL',VENICE_STANDARD_FALLBACK_EDIT_MODEL)].filter((model,index,all)=>Boolean(model)&&all.indexOf(model)===index);
      let lastError:unknown;
      for(let index=0;index<models.length;index+=1){
        const model=models[index]!,fallback=index>0;
        try{
          const result=await runVeniceSingleAttempt({client:this.client,attempts,stage:fallback?'standard_fallback':'standard_primary',routeId:route.id,model,estimatedCost:veniceModelCostUsd(model),edit:optimizedVeniceEdit({model,prompt:buildVeniceImagePrompt(request),images:references,aspectRatio:request.composition.aspectRatio,safeMode:true,includeAspectRatio:true,forceMultiEdit:model===VENICE_STANDARD_FALLBACK_EDIT_MODEL})});
          return completedVeniceSubmission(result,route.id,attempts,fallback?'primary_then_fallback':'single_edit');
        }catch(error){lastError=error;if(!isVeniceStandardFallbackEligible(error)||index===models.length-1)break;}
      }
      throw new MediaProviderPipelineError(lastError,attempts);
    }
    if(!envBoolean('KIVELLE_ADULT_MEDIA_ENABLED')||!envBoolean('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED'))throw new AppError('PROVIDER_UNAVAILABLE','That kind of photo is not available right now.',503);
    const stages=resolveVenicePipeline({contentLevel:request.contentLevel,standardModel:env('KIVELLE_VENICE_STANDARD_MODEL',VENICE_STANDARD_EDIT_MODEL),adultModel:route.model,adultFinalModel:env('KIVELLE_VENICE_ADULT_FINAL_MODEL',VENICE_ADULT_FINAL_EDIT_MODEL)}),attempts:ProviderAttempt[]=[];
    const rebuildPose=adultPoseMustRebuild(request.generationIntent?.requestText);
    if(rebuildPose&&request.generationKind!=='photo_edit'){
      try{
        const final=await runVeniceAdultFinal({client:this.client,attempts,routeId:route.id,primaryModel:stages.at(-1)!.model,references,prompt:adultIdentityEditPrompt(request),aspectRatio:request.composition.aspectRatio,compactSingleEdit:true});
        return{provider:'venice',providerRequestId:final.providerRequestId,model:final.model,status:'completed',result:{bytes:final.bytes,contentType:final.contentType,providerRequestId:final.providerRequestId,model:final.model,estimatedCost:attempts.reduce((sum,item)=>sum+Number(item.estimatedCost??0),0),generationMs:attempts.reduce((sum,item)=>sum+Number(item.generationMs??0),0),providerAttempts:attempts,providerMetadata:{pipeline:'uncensored_adult_identity_edit',stageCount:attempts.length,fallbackUsed:attempts.some((item)=>item.stage==='final_adult_fallback')}}};
      }catch(error){throw new MediaProviderPipelineError(error,attempts);}
    }
    if(request.generationKind==='photo_edit'){
      try{
        const final=await runVeniceAdultFinal({client:this.client,attempts,routeId:route.id,primaryModel:stages.at(-1)!.model,references,prompt:adultEditPrompt(request),aspectRatio:request.composition.aspectRatio});
        return{provider:'venice',providerRequestId:final.providerRequestId,model:final.model,status:'completed',result:{bytes:final.bytes,contentType:final.contentType,providerRequestId:final.providerRequestId,model:final.model,estimatedCost:attempts.reduce((sum,item)=>sum+Number(item.estimatedCost??0),0),generationMs:attempts.reduce((sum,item)=>sum+Number(item.generationMs??0),0),providerAttempts:attempts,providerMetadata:{pipeline:'scoped_adult_source_edit',stageCount:attempts.length,fallbackUsed:attempts.some((item)=>item.stage==='final_adult_fallback')}}};
      }catch(error){throw new MediaProviderPipelineError(error,attempts);}
    }
    let base:VeniceEditResult;
    try{
      const requestedDirection=resolvePhotoDirection({requestText:request.generationIntent?.requestText,shotType:request.composition.shotType,seed:request.mediaId});
      const neutral={...request,contentLevel:'romance' as const,generationIntent:undefined,composition:{...request.composition,poseDirection:requestedDirection.poseDirection,faceDirection:requestedDirection.faceDirection,faceMayBeHidden:requestedDirection.faceMayBeHidden}};
      // Simple clothing edits keep a non-explicit identity base. Pose-rebuild
      // nudes return earlier through the uncensored identity edit.
      // Grok is currently published only on Venice's multi-edit contract, even
      // when Kivelle has a single identity reference.
      base=await runVeniceStage({client:this.client,attempts,stage:'canonical_base',routeId:route.id,model:stages[0]!.model,estimatedCost:stages[0]!.estimatedCostUsd,edit:optimizedVeniceEdit({model:stages[0]!.model,prompt:buildVeniceImagePrompt(neutral),images:references,aspectRatio:request.composition.aspectRatio,safeMode:stages[0]!.safeMode,forceMultiEdit:true})});
    }catch(error){
      // A request-shape or transient model failure in the neutral identity
      // pass must not strand an already-authorized request. Retry the same
      // scoped request against the configured Venice adult edit/fallback
      // models using the original identity reference. Policy/safety blocks are
      // deliberately excluded by isVeniceAdultFinalFallbackEligible().
      if(!isVeniceAdultFinalFallbackEligible(error))throw new MediaProviderPipelineError(error,attempts);
      try{
        const final=await runVeniceAdultFinal({client:this.client,attempts,routeId:route.id,primaryModel:stages[1]!.model,references,prompt:adultEditPrompt(request),aspectRatio:request.composition.aspectRatio});
        return{provider:'venice',providerRequestId:final.providerRequestId,model:final.model,status:'completed',result:{bytes:final.bytes,contentType:final.contentType,providerRequestId:final.providerRequestId,model:final.model,estimatedCost:attempts.reduce((sum,item)=>sum+Number(item.estimatedCost??0),0),generationMs:attempts.reduce((sum,item)=>sum+Number(item.generationMs??0),0),providerAttempts:attempts,providerMetadata:{pipeline:'direct_adult_fallback_after_base_rejection',stageCount:attempts.length,fallbackUsed:true}}};
      }catch(fallbackError){throw new MediaProviderPipelineError(fallbackError,attempts);}
    }
    try{
      const final=await runVeniceAdultFinal({client:this.client,attempts,routeId:route.id,primaryModel:stages[1]!.model,references:[uint8ToDataUrl(base.bytes,base.contentType)],prompt:adultEditPrompt(request),aspectRatio:request.composition.aspectRatio});
      return{provider:'venice',providerRequestId:final.providerRequestId,model:final.model,status:'completed',result:{bytes:final.bytes,contentType:final.contentType,providerRequestId:final.providerRequestId,model:final.model,estimatedCost:attempts.reduce((sum,item)=>sum+Number(item.estimatedCost??0),0),generationMs:attempts.reduce((sum,item)=>sum+Number(item.generationMs??0),0),providerAttempts:attempts,providerMetadata:{pipeline:'canonical_base_then_scoped_adult_edit',stageCount:attempts.length,fallbackUsed:attempts.some((item)=>item.stage==='final_adult_fallback')}}};
    }catch(error){
      throw new MediaProviderPipelineError(error,attempts);
    }
  }
}

export class MediaProviderPipelineError extends AppError{
  constructor(error:unknown,readonly providerAttempts:ProviderAttempt[]){const source=error instanceof AppError?error:new AppError('PROVIDER_UNAVAILABLE','The photo could not be created right now.',503,true);super(source.code,source.message,source.status,source.retryable);this.name='MediaProviderPipelineError';}
}
export function providerAttemptsFromError(error:unknown):ProviderAttempt[]{return error instanceof MediaProviderPipelineError?error.providerAttempts:[];}

export class WaveSpeedMediaProvider implements MediaGenerationProvider{
  id='wavespeed';asynchronous=true;
  constructor(private readonly client:WaveSpeedClient){}
  async submit(request:CanonicalMediaRequest,route:MediaRouteCapability):Promise<ProviderSubmission>{
    if(route.id===WAVESPEED_ADULT_COMPOSED_ROUTE_ID)return this.submitComposedAdultImage(request,route);
    const input=waveSpeedInput(request,route),submission=await this.client.submit(route.model,input);
    return{provider:'wavespeed',providerRequestId:submission.providerRequestId,model:submission.model,status:submission.status,...(submission.result?{result:predictionResult(submission.result,route.estimatedCost)}:{})};
  }
  async getResult(providerRequestId:string):Promise<ProviderResult>{const prediction=await this.client.getResult(providerRequestId);if(['created','processing'].includes(prediction.status))return{status:'processing'};if(prediction.status==='completed'&&prediction.outputs[0])return{status:'completed',result:predictionResult(prediction)};return{status:'failed',failureCode:`provider_${prediction.status}`,failureReasonSafe:'The media could not be created this time.'};}

  private async submitComposedAdultImage(request:CanonicalMediaRequest,route:MediaRouteCapability):Promise<ProviderSubmission>{
    if(request.mediaType!=='image'||!ADULT_CONTENT_LEVELS.includes(request.contentLevel)||request.adultPipelineAuthorized!==true)throw new AppError('PROVIDER_REQUEST_INVALID','The adult image route requires a currently authorized request.',403,false);
    if(request.generationKind==='photo_edit'||request.anonymousAdultPartner===true||requestRequiresIdentityPreservingAdultRoute(request.generationIntent?.requestText))throw new AppError('PROVIDER_REQUEST_INVALID','This photo needs the identity-preserving edit route.',422,false);
    const identity=request.referenceImages.find((item)=>item.role==='character_identity'&&item.signedUrl);
    if(!identity?.signedUrl)throw new AppError('CHARACTER_REFERENCE_REQUIRED','The companion reference photo could not be prepared.',409,true);
    const attempts:ProviderAttempt[]=[],sceneModel=route.model,identityModel=env('WAVESPEED_MODEL_ADULT_IDENTITY',WAVESPEED_ADULT_IDENTITY_MODEL),timeoutMs=Math.max(15_000,Math.min(90_000,envNumber('KIVELLE_WAVESPEED_ADULT_STAGE_TIMEOUT_MS',75_000)));
    try{
      const scene=await runWaveSpeedPipelineStage({client:this.client,attempts,attemptNumber:1,stage:'adult_photoreal_scene_generation',routeId:route.id,model:sceneModel,input:waveSpeedAdultSceneInput(request),estimatedCost:.025,timeoutMs});
      const final=await runWaveSpeedPipelineStage({client:this.client,attempts,attemptNumber:2,stage:'fictional_identity_face_swap',routeId:route.id,model:identityModel,input:waveSpeedAdultFaceSwapInput(scene.outputs[0]!,identity.signedUrl),estimatedCost:.01,timeoutMs});
      // The final prediction is already complete, but report it as submitted so
      // the durable poll/finalization path re-fetches it and always runs the
      // same identity, anatomy, adult-safety, and prompt-adherence gates. This
      // also prevents an immediate quality retry from accepting a synchronous
      // result without a second visual review.
      return{provider:'wavespeed',providerRequestId:final.id,model:final.model,status:'submitted',result:{outputUrl:final.outputs[0],providerRequestId:final.id,model:final.model,estimatedCost:attempts.reduce((sum,item)=>sum+Number(item.estimatedCost??0),0),generationMs:attempts.reduce((sum,item)=>sum+Number(item.generationMs??0),0),providerAttempts:attempts,providerMetadata:{pipeline:'wan22_photoreal_scene_then_fictional_identity_face_swap',stageCount:attempts.length,sceneModel,identityModel,sceneProviderRequestId:scene.id,finalPredictionCompleted:true}}};
    }catch(error){throw new MediaProviderPipelineError(error,attempts);}
  }
}

export function waveSpeedInput(request:CanonicalMediaRequest,route:MediaRouteCapability):Record<string,unknown>{
  const identity=request.referenceImages.find((item)=>item.role==='character_identity'&&item.signedUrl);
  if(request.mediaType==='image'&&request.generationKind!=='creator_identity'&&(!identity||!route.supportsCharacterReference||route.maxReferenceImages<1))throw new AppError('CHARACTER_REFERENCE_REQUIRED','This provider route cannot preserve the companion reference identity.',409,true);
  const refs=waveSpeedReferences(request,route,identity),size=dimensions(request.composition.aspectRatio,request.qualityTier),prompt=request.mediaType==='video'?buildVideoPrompt(request):route.id===WAVESPEED_GROUP_QWEN_ROUTE_ID?buildWaveSpeedGroupImagePrompt(request,refs):route.id===WAVESPEED_ADULT_QWEN_ROUTE_ID?buildWaveSpeedAdultImagePrompt(request,refs):route.id===WAVESPEED_ADULT_COMPOSED_ROUTE_ID?buildWaveSpeedAdultScenePrompt(request):buildImagePrompt(request);
  if(request.mediaType==='video'){
    const definition=configuredVideoRouteCatalog().find((item)=>item.id===route.id);
    if(!definition||!definition.enabled||request.videoRouteId!==definition.id)throw new AppError('PROVIDER_NOT_CONFIGURED','The selected video model is no longer available.',503);
    const sourceImageUrl=request.sourceImage?.signedUrl;
    if(!sourceImageUrl&&!definition.sourceModes.includes('canonical_references'))throw new AppError('VALIDATION_ERROR','A source image is required to create this video.',422);
    const canonicalReferences=request.referenceImages.filter((item)=>Boolean(item.signedUrl)&&['character_identity','location_environment','world_environment','outfit_continuity'].includes(item.role)).map((item)=>({url:String(item.signedUrl),role:item.role as 'character_identity'|'location_environment'|'world_environment'|'outfit_continuity'}));
    return buildVideoProviderPayload(definition,{sourceImageUrl,canonicalReferences,sourceAspectRatio:request.videoAspectRatio??'9:16',motionPreset:request.motionPreset??'subtle',duration:request.durationSeconds??definition.defaultDuration,resolution:request.videoResolution??definition.defaultResolution,sound:request.videoSound??false,userPrompt:request.generationIntent?.requestText,contentLevel:request.contentLevel,adultAuthorized:request.adultPipelineAuthorized===true,anonymousAdultPartner:request.anonymousAdultPartner===true,context:{companionName:request.companion.name,locationName:request.context.place?.location.name??request.context.location?.name,activity:request.context.activity}});
  }
  if(route.id===WAVESPEED_ADULT_QWEN_ROUTE_ID){
    if(!ADULT_CONTENT_LEVELS.includes(request.contentLevel)||request.adultPipelineAuthorized!==true)throw new AppError('PROVIDER_REQUEST_INVALID','The adult image route requires a currently authorized request.',403,false);
    return{prompt,images:refs.map((item)=>item.signedUrl),seed:-1,enable_safety_checker:false};
  }
  if(route.id===WAVESPEED_ADULT_COMPOSED_ROUTE_ID)return waveSpeedAdultSceneInput(request);
  if(route.id===WAVESPEED_GROUP_QWEN_ROUTE_ID)return{prompt,images:refs.map((item)=>item.signedUrl),seed:-1,enable_safety_checker:!ADULT_CONTENT_LEVELS.includes(request.contentLevel)};
  if(['wavespeed-kontext-pro-multiref','wavespeed-kontext-max-multiref'].includes(route.id))return{prompt,images:refs.map((item)=>item.signedUrl),seed:-1,guidance_scale:3.5,aspect_ratio:request.composition.aspectRatio==='4:5'?'3:4':request.composition.aspectRatio};
  const common={prompt,size:`${size.width}*${size.height}`,seed:-1,output_format:'jpeg',num_images:1};
  const loras=request.mediaProfile?.modelUrl&&route.supportsLoRA?[{path:request.mediaProfile.modelUrl,scale:.9}]:undefined;
  if(route.maxReferenceImages>1)return{...common,images:refs.map((item)=>item.signedUrl),num_inference_steps:28,guidance_scale:2.5,...(loras?{loras}:{})};
  if(route.supportsImageEditing&&refs[0])return{...common,image:refs.find((item)=>item.role==='location_environment')?.signedUrl??refs[0].signedUrl,...(loras?{loras}:{})};
  return{...common,...(loras?{loras}:{})};
}

function waveSpeedReferences(request:CanonicalMediaRequest,route:MediaRouteCapability,identity:MediaReferenceImage|undefined):MediaReferenceImage[]{
  const signed=request.referenceImages.filter((item)=>Boolean(item.signedUrl));
  if((request.subjects?.length??1)>1)return signed.slice(0,route.maxReferenceImages);
  if(route.id===WAVESPEED_ADULT_QWEN_ROUTE_ID&&request.generationKind==='photo_edit'){
    const source=request.sourceImage?.signedUrl?request.sourceImage:signed.find((item)=>item.role==='previous_media');
    if(!source)throw new AppError('PROVIDER_REQUEST_INVALID','The approved source photo could not be prepared for editing.',422,true);
    return uniqueSignedReferences([source,...(identity?[identity]:[]),...signed.filter((item)=>item!==source&&item!==identity)]).slice(0,route.maxReferenceImages);
  }
  if(route.id===WAVESPEED_ADULT_QWEN_ROUTE_ID&&requestRequiresIdentityPreservingAdultRoute(request.generationIntent?.requestText)){
    const location=signed.find((item)=>item.role==='location_environment')??signed.find((item)=>item.role==='world_environment');
    if(location&&identity)return uniqueSignedReferences([location,identity,...signed.filter((item)=>item!==location&&item!==identity)]).slice(0,route.maxReferenceImages);
  }
  return uniqueSignedReferences([...(identity?[identity]:[]),...signed.filter((item)=>item!==identity)]).slice(0,route.maxReferenceImages);
}

function uniqueSignedReferences(references:MediaReferenceImage[]):MediaReferenceImage[]{const seen=new Set<string>();return references.filter((reference)=>{const url=reference.signedUrl;if(!url||seen.has(url))return false;seen.add(url);return true;});}

export function waveSpeedAdultSceneInput(request:CanonicalMediaRequest):Record<string,unknown>{
  const size=adultSceneDimensions(request.composition.aspectRatio,request.qualityTier);
  return{prompt:buildWaveSpeedAdultScenePrompt(request),size:`${size.width}*${size.height}`,seed:-1,output_format:'jpeg'};
}

export function waveSpeedAdultFaceSwapInput(sceneUrl:string,identityUrl:string):Record<string,unknown>{
  if(!isHttpsUrl(sceneUrl)||!isHttpsUrl(identityUrl))throw new AppError('PROVIDER_REQUEST_INVALID','The fictional identity stage could not be prepared.',422,true);
  return{image:sceneUrl,face_image:identityUrl,target_index:0,target_gender:'all',output_format:'jpeg'};
}

export function buildWaveSpeedAdultScenePrompt(request:CanonicalMediaRequest):string{
  if(!ADULT_CONTENT_LEVELS.includes(request.contentLevel)||request.adultPipelineAuthorized!==true)throw new AppError('PROVIDER_REQUEST_INVALID','The adult image route requires a currently authorized request.',403,false);
  const intent=request.generationIntent?.requestText?.replace(/\s+/g,' ').trim();
  if(!intent)throw new AppError('PROVIDER_REQUEST_INVALID','The approved adult photo request was incomplete.',422,false);
  const direction=resolvePhotoDirection({requestText:intent,shotType:request.composition.shotType,seed:request.mediaId}),identity=request.visualIdentity,appearance=[identity.canonicalDescription,identity.hair&&`hair ${identity.hair}`,identity.eyes&&`eyes ${identity.eyes}`,identity.skinTone&&`skin ${identity.skinTone}`,identity.build&&`build ${identity.build}`,identity.identifyingFeatures?.length&&`features ${identity.identifyingFeatures.slice(0,3).join(', ')}`].filter(Boolean).join('; '),containment=request.context.worldContainment,location=request.context.place?.location??request.context.location,world=containment?`${containment.worldName}${containment.locationName?` at ${containment.locationName}`:''}. ${containment.worldDescription??''}`:[location?.name,location?.description].filter(Boolean).join('. '),captureLighting=mediaCaptureLightingForRequest(request),rearAnatomy=requestImpliesRearAdultAnatomy(intent),rearDirection=direction.poseDirection.includes('rear or rear-three-quarter');
  return clipWaveSpeedPrompt([
    `RAW documentary photograph captured with a full-frame professional camera of one real-looking fictional consenting adult, canonical age ${request.companion.age}.`,
    `MANDATORY TARGET: ${intent}.`,
    `POSE AND CAMERA: ${waveSpeedConciseDirection(direction.poseDirection)} ${rearAnatomy?direction.faceDirection:rearDirection?'Keep their face clearly visible in a natural over-the-shoulder glance for fictional identity matching.':direction.faceDirection}`,
    waveSpeedRequestedAnatomyGuidance(intent,true)||waveSpeedAdultNudityGuidance(resolveAdultNudityScope(intent),intent),
    appearance&&`APPEARANCE: ${appearance}.`,
    world&&`SETTING: ${world}.`,
    `TIME/LIGHT: ${captureLighting.instruction}`,
    request.composition.framing&&`FRAMING: ${request.composition.framing}.`,
    request.qualityRetry?`CORRECT THE PREVIOUS MISS: ${request.qualityRetry.reasonCodes.join(', ')}.`:'',
    'The result must look like a genuine unretouched camera photograph: fine pores and small skin imperfections, individual hair strands, physically plausible natural light, optical depth of field, subtle sensor grain, and realistic color response. Exactly one adult subject and no other person. Coherent hands, limbs, joints, torso, pelvis and complete adult anatomy. No beauty-filter smoothing, airbrushing, anime, cartoon, painting, illustration, 2D or 3D render, CGI, game art, doll, mannequin, plastic or wax skin, oversized stylized eyes, robe, strategic covering, censoring, blur, blank anatomy, text, watermark, or collage.',
  ].filter(Boolean).join(' '),2200);
}

async function runWaveSpeedPipelineStage(input:{client:WaveSpeedClient;attempts:ProviderAttempt[];attemptNumber:number;stage:string;routeId:string;model:string;input:Record<string,unknown>;estimatedCost:number;timeoutMs:number}):Promise<WaveSpeedPrediction>{
  const started=Date.now();let providerRequestId:string|undefined;
  try{
    const run=await input.client.runToCompletion(input.model,input.input,input.timeoutMs);providerRequestId=run.providerRequestId;
    if(run.timedOut)throw new AppError('PROVIDER_SUBMISSION_UNKNOWN','The provider did not finish this photo stage in time. No duplicate request was sent.',503,false);
    const prediction=run.prediction;
    if(!prediction||prediction.status!=='completed'||!prediction.outputs[0])throw new AppError('PROVIDER_UNAVAILABLE','The photo provider could not complete this stage.',503,false);
    input.attempts.push({attemptNumber:input.attemptNumber,stage:input.stage,provider:'wavespeed',model:input.model,routeId:input.routeId,estimatedCost:input.estimatedCost,generationMs:prediction.inferenceMs??Date.now()-started,success:true,providerRequestId:prediction.id});
    return prediction;
  }catch(error){
    input.attempts.push({attemptNumber:input.attemptNumber,stage:input.stage,provider:'wavespeed',model:input.model,routeId:input.routeId,estimatedCost:input.estimatedCost,generationMs:Date.now()-started,success:false,failureCode:error instanceof AppError?error.code:'provider_stage_failed',...(providerRequestId?{providerRequestId}:{})});
    throw error;
  }
}

function adultSceneDimensions(aspect:string,quality:string):{width:number;height:number}{const long=quality==='economy'?1024:1280;return aspect==='16:9'?{width:long,height:Math.round(long*9/16)}:aspect==='1:1'?{width:quality==='economy'?1024:1280,height:quality==='economy'?1024:1280}:{width:quality==='economy'?819:1024,height:long};}

/** Qwen Image 2.0 Pro Edit accepts one to six references and an 800-character instruction. */
export function buildWaveSpeedAdultImagePrompt(request:CanonicalMediaRequest,references:MediaReferenceImage[]=request.referenceImages.filter((item)=>item.signedUrl).slice(0,3)):string{
  if(!ADULT_CONTENT_LEVELS.includes(request.contentLevel)||request.adultPipelineAuthorized!==true)throw new AppError('PROVIDER_REQUEST_INVALID','The adult image route requires a currently authorized request.',403,false);
  const intent=request.generationIntent?.requestText?.replace(/\s+/g,' ').trim();
  if(!intent)throw new AppError('PROVIDER_REQUEST_INVALID','The approved adult photo request was incomplete.',422,false);
  const identityIndex=Math.max(0,references.findIndex((item)=>item.role==='character_identity'))+1,locationIndex=references.findIndex((item)=>item.role==='location_environment'||item.role==='world_environment')+1,direction=resolvePhotoDirection({requestText:intent,shotType:request.composition.shotType,seed:request.mediaId}),containment=request.context.worldContainment,worldLock=containment?`Only ${containment.worldName} at ${containment.locationName??'its canonical setting'}; never Earth.`:'Keep the canonical setting.',captureLighting=mediaCaptureLightingForRequest(request),scope=resolveAdultNudityScope(intent),nude=requestRequiresIdentityPreservingAdultRoute(intent),sceneInstruction=request.generationKind==='photo_edit'?'EDIT SOURCE: Edit the approved source photo; change pose, camera, or clothing when required.':nude?`NEW PHOTO in ${locationIndex>0?`Image ${locationIndex}`:'the canonical place'}. Image ${identityIndex} is face/hair/body identity ONLY. Do not copy its clothing, standing pose, crop, or background.`:`NEW SCENE: Image ${identityIndex} supplies identity only. Replace its pose, clothes/robe, crop, background, and camera; do not make a small edit.`,required=[
    sceneInstruction,
    `MANDATORY TARGET: ${clipWaveSpeedPrompt(intent,120)}.`,
    `POSE/CAMERA: ${waveSpeedConciseDirection(direction.poseDirection)} ${direction.faceMayBeHidden?'Face may remain away or out of frame.':'Keep the same recognizable face when visible.'}`,
    waveSpeedRequestedAnatomyGuidance(intent)||waveSpeedAdultNudityGuidance(scope,intent),
    `IDENTITY: Image ${identityIndex} = ${request.companion.name}, fictional consenting adult age ${request.companion.age}; match that exact face, hair, complexion, and adult identity.`,
    locationIndex>0?`SETTING: Image ${locationIndex} is the exact canonical place; keep that location. ${clipWaveSpeedPrompt(worldLock,40)}`:`SETTING: ${clipWaveSpeedPrompt(worldLock,48)}`,
    `TIME/LIGHT: ${clipWaveSpeedPrompt(captureLighting.instruction,120)}`,
    request.qualityRetry?`FIX: ${clipWaveSpeedPrompt(request.qualityRetry.reasonCodes.join(', '),40)}.`:'',
  ].filter(Boolean);
  const closer='Photoreal; complete coherent adult anatomy; no doll, plastic, blank/censored parts, CGI, text, or visible reference.';
  const core=required.join(' ');
  return core.length+1+closer.length<=800?`${core} ${closer}`:core.slice(0,800);
}

function waveSpeedAdultNudityGuidance(scope:ReturnType<typeof resolveAdultNudityScope>,intent:string):string{
  if(scope==='full_nude')return'Approved full adult nudity: no clothing or covering. complete uncovered external genitalia matching this adult body; no blur or blanking.';
  if(scope==='bottomless')return'Approved lower-body nudity: keep unrelated upper clothes; uncovered genitalia matching this adult body must stay visible.';
  if(scope==='topless')return'Approved upper-body nudity: keep lower clothes; render this adult’s chest/nipples completely.';
  if(scope==='specific_anatomy')return resolveSpecificAnatomyExposure(intent)==='covered'?'Keep the requested adult anatomy covered exactly as asked.':'Requested adult anatomy is uncovered and must be clearly visible and complete.';
  return'Honor only the approved adult scope; do not add unrequested nudity or participants.';
}

function waveSpeedRequestedAnatomyGuidance(intent:string,detailed=false):string{
  if(resolveSpecificAnatomyExposure(intent)==='covered')return'';
  const targets=visibleAdultAnatomyTargetLabels(intent);
  if(!targets.length)return'';
  const joined=targets.join(' plus ');
  const genitalAccuracy=!detailed?'':/vulva/.test(joined)?' Vulva/labia must be plausible, correctly placed, and integrated with the pelvis; no fused, blank, or doll-like geometry.':/penis/.test(joined)?' Penis/scrotum must be plausible, correctly placed, and integrated with the pelvis; no fused, blank, or doll-like structures.':/genitalia/.test(joined)?' External genitalia must be plausible, complete, and uncensored.':'';
  return`VISIBLE ANATOMY: ${joined}; uncovered, unobstructed, natural and clear; no robe, underwear, fabric, hand, hair, shadow, crop, or pose may hide it.${genitalAccuracy}`;
}

function waveSpeedConciseDirection(direction:string):string{
  if(direction.includes('body bent forward')&&direction.includes('rear or rear-three-quarter'))return'bend forward at the waist; camera behind and close; buttocks and genitals fill the center of the frame; no standing portrait.';
  return clipWaveSpeedPrompt(direction,145);
}

/** Qwen Image 2.0 edit accepts a short instruction and at most three images. */
export function buildWaveSpeedGroupImagePrompt(request:CanonicalMediaRequest,references:MediaReferenceImage[]=request.referenceImages.filter((item)=>item.signedUrl).slice(0,3)):string{
  const subjects=request.subjects??[];
  if(subjects.length!==2)throw new AppError('PROVIDER_REQUEST_INVALID','The WaveSpeed group route requires exactly two selected companions.',422);
  const adult=ADULT_CONTENT_LEVELS.includes(request.contentLevel),intent=request.generationIntent?.requestText?.replace(/\s+/g,' ').trim();
  if(adult&&!intent)throw new AppError('PROVIDER_REQUEST_INVALID','The approved adult group-photo request was incomplete.',422,false);
  const supportingFigureRoles=references.flatMap((reference,index)=>{
    if(reference.role==='previous_media')return`Figure ${index+1}=approved two-person source`;
    if(reference.role==='character_identity')return[];
    if(reference.role==='location_environment')return`Figure ${index+1}=setting only`;
    return[`Figure ${index+1}=continuity only`];
  }).join('; ');
  const identityLocks=subjects.map((subject,index)=>{
    const figureIndex=references.findIndex((reference)=>reference.role==='character_identity'&&reference.characterInstanceId===subject.characterInstanceId),identity=subject.visualIdentity,traits=[identity.canonicalDescription,identity.hair&&`hair ${identity.hair}`,identity.eyes&&`eyes ${identity.eyes}`,identity.skinTone&&`skin ${identity.skinTone}`,identity.identifyingFeatures?.length&&identity.identifyingFeatures[0]].filter(Boolean).join('; ');
    return`Figure ${figureIndex+1}→${index===0?'LEFT':'RIGHT'} ${subject.companion.name}, adult ${subject.companion.age} (${clipWaveSpeedPrompt(traits,85)})`;
  }).join('. ');
  const action=request.generationKind==='photo_edit'?'Edit the approved source into one coherent photorealistic camera photograph.':'Create one coherent photorealistic personal camera photograph.';
  const content=waveSpeedGroupContentGuidance(request.contentLevel),containment=request.context.worldContainment,worldLock=containment?clipWaveSpeedPrompt(`Only ${containment.worldName}; exact setting ${containment.locationName??'native setting'}; never Earth or another world; avoid ${Array.isArray(containment.worldVisualContext.avoid)?containment.worldVisualContext.avoid.slice(0,2).join(', '):'non-canonical scenery'}.`,115):'',captureLighting=mediaCaptureLightingForRequest(request);
  const approved=intent?`Approved request: ${clipVenicePrompt(intent,120)}.`:'';
  const composition=`${request.composition.shotType.replace('_',' ')}, ${request.composition.aspectRatio}; both subjects clearly readable.`;
  const qualityRetry=request.qualityRetry?`Correct: ${clipVenicePrompt(request.qualityRetry.reasonCodes.join(', '),70)}.`:'';
  return clipWaveSpeedPrompt([action,worldLock?`WORLD/SETTING LOCK: ${worldLock}`:'',`TIME/LIGHT: ${clipWaveSpeedPrompt(captureLighting.instruction,120)}`,supportingFigureRoles?`${supportingFigureRoles}.`:'',`IDENTITY LOCK: ${identityLocks}. Each side matches only its figure. Preserve face, facial structure, complexion, hair, and heritage. Two visibly different people; no copying, blending, swapping, averaging, duplication, or ethnic redesign.`,approved,content,composition,qualityRetry,'Photorealistic skin and anatomy. Exactly two people; no extra/missing/merged subject, text, watermark, collage, illustration, CGI, or visible reference.'].filter(Boolean).join(' '),800);
}

function waveSpeedGroupContentGuidance(level:CanonicalMediaRequest['contentLevel']):string{
  if(level==='standard')return'Non-explicit; naturally clothed.';
  if(level==='romance')return'Affectionate, romantic, non-explicit.';
  if(level==='suggestive')return'Approved suggestive adult tone only; no added sexual activity.';
  if(level==='mature')return'Approved mature adult sensuality and exact coverage only.';
  return'Explicit fictional-adult imagery is approved exactly as requested; no invented clothing, blur, blank anatomy, or sanitization.';
}

function clipWaveSpeedPrompt(value:string,max:number):string{const normalized=value.replace(/\s+/g,' ').trim();return normalized.length<=max?normalized:`${normalized.slice(0,Math.max(0,max-1)).trimEnd()}…`;}

export function buildVideoPrompt(request:CanonicalMediaRequest):string{return['Animate this exact approved Kivelle image without redesigning it.','Preserve the companion face, adult age, body proportions, hair, clothing, location, lighting, framing, and current scene.','Avoid morphing, identity drift, outfit changes, location changes, unexplained people or objects, warped hands, text, cuts, and sudden camera jumps.'].join('\n');}

function predictionResult(prediction:WaveSpeedPrediction,estimatedCost?:number):ProviderCompletedMedia{return{outputUrl:prediction.outputs[0],providerRequestId:prediction.id,model:prediction.model,estimatedCost,generationMs:prediction.inferenceMs};}
function syncResult(result:ImageGenerationResult):ProviderCompletedMedia{return{bytes:result.bytes,contentType:result.contentType,width:result.width,height:result.height,providerRequestId:result.providerRequestId,model:result.model,estimatedCost:result.estimatedCost};}
function completedVeniceSubmission(result:VeniceEditResult,routeId:string,attempts?:ProviderAttempt[],pipeline='single_edit'):ProviderSubmission{
  const recorded=attempts?.length?attempts:[veniceAttempt(1,'final_edit',routeId,result,true)];
  return{provider:'venice',providerRequestId:result.providerRequestId,model:result.model,status:'completed',result:{bytes:result.bytes,contentType:result.contentType,providerRequestId:result.providerRequestId,model:result.model,estimatedCost:recorded.reduce((sum,item)=>sum+Number(item.estimatedCost??0),0),generationMs:recorded.reduce((sum,item)=>sum+Number(item.generationMs??0),0),providerAttempts:recorded,providerMetadata:{pipeline,stageCount:recorded.length,fallbackUsed:pipeline==='primary_then_fallback'}}};
}
function veniceAttempt(attemptNumber:number,stage:string,routeId:string,result:VeniceEditResult,success:boolean):ProviderAttempt{return{attemptNumber,stage,routeId,provider:'venice',model:result.model,estimatedCost:result.estimatedCost,generationMs:result.generationMs,success,providerRequestId:result.providerRequestId};}
function failedVeniceAttempt(attemptNumber:number,stage:string,routeId:string,model:string,error:unknown,estimatedCost:number):ProviderAttempt{return{attemptNumber,stage,routeId,provider:'venice',model,estimatedCost,success:false,failureCode:error instanceof AppError?error.code:'provider_failure'};}
async function runVeniceStage(input:{client:VeniceImageClient;attempts:ProviderAttempt[];stage:string;routeId:string;model:string;estimatedCost:number;edit:Parameters<VeniceImageClient['edit']>[0]}):Promise<VeniceEditResult>{
  let lastError:unknown;
  for(let stageAttempt=0;stageAttempt<2;stageAttempt+=1){
    const attemptNumber=input.attempts.length+1;
    try{const result=await input.client.edit(input.edit);input.attempts.push(veniceAttempt(attemptNumber,input.stage,input.routeId,result,true));return result;}
    catch(error){lastError=error;input.attempts.push(failedVeniceAttempt(attemptNumber,input.stage,input.routeId,input.model,error,input.estimatedCost));if(!(error instanceof AppError)||!error.retryable||stageAttempt===1)throw error;await new Promise((resolve)=>setTimeout(resolve,600));}
  }
  throw lastError;
}
async function runVeniceSingleAttempt(input:{client:VeniceImageClient;attempts:ProviderAttempt[];stage:string;routeId:string;model:string;estimatedCost:number;edit:Parameters<VeniceImageClient['edit']>[0]}):Promise<VeniceEditResult>{
  const attemptNumber=input.attempts.length+1;
  try{const result=await input.client.edit(input.edit);input.attempts.push(veniceAttempt(attemptNumber,input.stage,input.routeId,result,true));return result;}
  catch(error){input.attempts.push(failedVeniceAttempt(attemptNumber,input.stage,input.routeId,input.model,error,input.estimatedCost));throw error;}
}
async function runVeniceAdultFinal(input:{client:VeniceImageClient;attempts:ProviderAttempt[];routeId:string;primaryModel:string;references:string[];prompt:string;aspectRatio:string;compactSingleEdit?:boolean}):Promise<VeniceEditResult>{
  const models=[input.primaryModel,env('KIVELLE_VENICE_ADULT_FALLBACK_MODEL',VENICE_ADULT_FALLBACK_EDIT_MODEL)].filter((model,index,all)=>Boolean(model)&&all.indexOf(model)===index);
  let lastError:unknown;
  for(let index=0;index<models.length;index+=1){
    const model=models[index]!,fallback=index>0;
    try{return await runVeniceSingleAttempt({client:input.client,attempts:input.attempts,stage:fallback?'final_adult_fallback':'final_adult_edit',routeId:input.routeId,model,estimatedCost:veniceModelCostUsd(model),edit:optimizedVeniceEdit({model,prompt:input.prompt,images:input.references,aspectRatio:input.aspectRatio,safeMode:false,forceMultiEdit:!input.compactSingleEdit,compactSingleEdit:input.compactSingleEdit===true})});}
    catch(error){lastError=error;if(!isVeniceAdultFinalFallbackEligible(error)||index===models.length-1)throw error;}
  }
  throw lastError;
}
function optimizedVeniceEdit(input:Parameters<VeniceImageClient['edit']>[0]):Parameters<VeniceImageClient['edit']>[0]{
  if(input.compactSingleEdit)return{model:input.model,prompt:input.prompt,images:input.images,aspectRatio:input.aspectRatio,safeMode:input.safeMode,compactSingleEdit:true};
  // Every Kivelle Venice route is a photographic multi-edit. Asking Venice for
  // the canonical 1K WebP directly avoids retaining multi-megabyte PNG output
  // while keeping enough detail for later continuity-preserving photo edits.
  return{...input,resolution:'1K',outputFormat:'webp'};
}
function isVeniceFallbackEligible(error:unknown):boolean{return error instanceof AppError&&error.retryable&&['PROVIDER_MODEL','PROVIDER_UNAVAILABLE','PROVIDER_TIMEOUT','PROVIDER_SUBMISSION_UNKNOWN','RATE_LIMITED'].includes(error.code);}
function isVeniceAdultFinalFallbackEligible(error:unknown):boolean{
  // An edit model can reject an otherwise valid scoped edit at its model boundary
  // after the canonical Grok stage has already succeeded. That is safe to
  // retry once through the configured Venice adult fallback because the same
  // validated request, reference image, content scope, and provider remain in
  // force. Do not broaden this behavior to standard media or other stages.
  return isVeniceFallbackEligible(error)||(error instanceof AppError&&error.code==='PROVIDER_REQUEST_INVALID');
}
function isVeniceStandardFallbackEligible(error:unknown):boolean{
  // A blurred result or request-shape rejection can be model-specific. For
  // standard/romance requests only, retry the same canonical request through
  // the configured safe-mode fallback. Explicit policy signals remain
  // non-retryable and never reach this branch.
  return isVeniceFallbackEligible(error)||(error instanceof AppError&&['PROVIDER_OUTPUT_BLURRED','PROVIDER_REQUEST_INVALID'].includes(error.code));
}
function veniceReferences(request:CanonicalMediaRequest,route:MediaRouteCapability):string[]{
  if(request.generationKind==='photo_edit'){
    const source=request.sourceImage??request.referenceImages.find((item)=>item.role==='previous_media');
    if(!source)throw new AppError('PROVIDER_REQUEST_INVALID','The source photo for this edit was unavailable.',422,true);
    return[referenceSource(source)];
  }
  const identity=request.referenceImages.find((item)=>item.role==='character_identity'&&(item.signedUrl||item.bytes));
  if(request.generationKind!=='creator_identity'&&!identity)throw new AppError('CHARACTER_REFERENCE_REQUIRED','The companion reference photo could not be prepared.',409,true);
  return[...(identity?[identity]:[]),...request.referenceImages.filter((item)=>item!==identity&&(item.signedUrl||item.bytes))].slice(0,Math.min(3,route.maxReferenceImages)).map(referenceSource);
}
function referenceSource(reference:MediaReferenceImage):string{if(reference.signedUrl)return reference.signedUrl;if(reference.bytes)return uint8ToBase64(reference.bytes);throw new AppError('CHARACTER_REFERENCE_REQUIRED','A required media reference could not be prepared.',409,true);}
function adultIdentityEditPrompt(request:CanonicalMediaRequest):string{
  const intent=request.generationIntent?.requestText?.replace(/\s+/g,' ').trim();if(!intent)throw new AppError('PROVIDER_REQUEST_INVALID','The approved adult photo request was incomplete.',422,false);
  const direction=resolvePhotoDirection({requestText:intent,shotType:request.composition.shotType,seed:request.mediaId}),scope=resolveAdultNudityScope(intent),nudity=scope==='full_nude'?'Full adult nudity: no clothes, covering, blur, or blank anatomy. Uncovered genitalia and buttocks must be complete and in frame.':adultNudityGuidance(scope,intent);
  const people=request.anonymousAdultPartner===true?'Exactly two consenting fictional adults 25+: this companion plus one anonymous original non-identifiable partner, not the user or any real person. Complete adult anatomy for both.':'One coherent adult body. No extra people.';
  return[`Create a NEW photograph of ${request.companion.name}, fictional consenting adult age ${request.companion.age}.`,'Use the input image only for face, hair, and body identity. Do not copy its clothing, standing pose, crop, or background.',`Approved request: ${clipVenicePrompt(intent,180)}.`,`Pose: ${clipVenicePrompt(waveSpeedConciseDirection(direction.poseDirection),180)}. ${direction.faceMayBeHidden?'Face may stay away or out of frame.':'Keep the same recognizable face when visible.'}`,nudity,people,'Photoreal. No text or watermark.'].join(' ').slice(0,800);
}
function adultEditPrompt(request:CanonicalMediaRequest):string{
  const intent=request.generationIntent?.requestText?.trim();if(!intent)throw new AppError('PROVIDER_REQUEST_INVALID','The approved adult photo request was incomplete.',422,false);
  const direction=resolvePhotoDirection({requestText:intent,shotType:request.composition.shotType,seed:request.mediaId}),faceGuidance=direction.faceMayBeHidden?'Keep the face hidden or away exactly as requested. No eye contact, camera-facing smile, over-shoulder glance, or inserted face; preserve identity through body and hair.':`Keep the same sharp, undistorted, recognizable face when visible. ${direction.faceDirection}`,nudityScope=resolveAdultNudityScope(intent),nudityGuidance=adultNudityGuidance(nudityScope,intent),preservationGuidance=adultPreservationGuidance(nudityScope,intent);
  const instruction=request.generationKind==='photo_edit'?buildMediaEditConstraint(intent,classifyMediaEditSemantics(intent)):requestRequiresIdentityPreservingAdultRoute(intent)?`Create a NEW photograph of this same adult. Do not keep the identity-reference standing pose, crop, or clothing. Approved request: ${clipVenicePrompt(intent,240)}.`:`Edit only this approved change: ${clipVenicePrompt(intent,300)}.`;
  const containment=request.context.worldContainment,worldLock=containment?`Only ${containment.worldName}; exact setting ${containment.locationName??'a native canonical setting'}; never Earth, another world, or generic real-world scenery.`:buildMediaWorldContainmentInstruction(undefined),captureLighting=mediaCaptureLightingForRequest(request);
  const people=request.anonymousAdultPartner===true?`${request.companion.name} is a fictional consenting adult age ${request.companion.age}, with one anonymous original fictional adult partner age 25 or older who is not the user or a real person.`:`${request.companion.name} is one fictional consenting adult age ${request.companion.age}.`;
  return[instruction,people,`WORLD/SETTING LOCK: ${clipVenicePrompt(worldLock,180)}`,request.generationKind==='photo_edit'?'Preserve the source photograph’s established capture time and lighting unless the approved edit explicitly changes it.':`TIME/LIGHT: ${clipVenicePrompt(captureLighting.instruction,320)}`,`Pose: ${clipVenicePrompt(direction.poseDirection,400)}. ${clipVenicePrompt(direction.faceDirection,140)}`,nudityGuidance,preservationGuidance,clipVenicePrompt(faceGuidance,180),request.anonymousAdultPartner===true?'Two coherent adult bodies, realistic skin and anatomy, natural joints, connected limbs, and five fingers per visible hand. No duplication, fusion, distortion, blank anatomy, censorship, collage, caption, watermark, or text.':'One coherent adult body, realistic skin and anatomy, natural joints, connected limbs, and five fingers per visible hand. No duplication, fusion, distortion, blank anatomy, censorship, collage, caption, watermark, or text.'].join('\n').slice(0,1_600);
}
function veniceAdultBaseWardrobe(intent:string|undefined,existing?:string):string{
  const scope=resolveAdultNudityScope(intent);
  if(scope==='full_nude')return'no clothing; fully nude adult body';
  if(scope==='bottomless')return existing?`${existing}; lower body fully nude with uncovered genitalia matching this adult`:'lower body fully nude with uncovered genitalia matching this adult; keep only unmentioned upper clothing';
  return existing?.trim()||'location-appropriate clothing except where the approved request requires uncovered adult anatomy';
}
function veniceAdultCanonicalBasePrompt(request:CanonicalMediaRequest):string{
  const intent=request.generationIntent?.requestText??'';
  return['Create a NEW photograph. Do not copy the identity-reference standing pose, crop, clothing, or camera.',buildVeniceImagePrompt(request),adultNudityGuidance(resolveAdultNudityScope(intent),intent)].filter(Boolean).join('\n').slice(0,2_000);
}
function adultPreservationGuidance(scope:ReturnType<typeof resolveAdultNudityScope>,intent:string):string{
  if(adultPoseMustRebuild(intent))return'Preserve the same adult face, hair, body identity, and canonical location. Do not preserve the identity-reference standing pose, crop, or clothing. Rebuild camera and body pose to match the approved request.';
  if(scope==='specific_anatomy'&&resolveSpecificAnatomyExposure(intent)==='uncovered')return'Preserve the same adult identity, hair, body proportions, lighting, background, location, activity, and all unrelated clothing. Preserve the camera direction and overall pose only where they keep the specifically requested anatomy clearly visible; minimally reframe, reposition, or adjust the crop when necessary to satisfy that visibility requirement.';
  return'Preserve the same adult identity, hair, body proportions, camera angle, crop, lighting, background, location, activity, and all clothing not explicitly changed.';
}
function adultNudityGuidance(scope:ReturnType<typeof resolveAdultNudityScope>,intent:string):string{
  if(scope==='full_nude')return'Approved scope: full adult nudity. Remove all clothing while preserving the same adult face and canonical location. External genitalia, buttocks, and chest matching this adult body must be uncovered, complete, and photographically detailed—not censored, covered, blurred, or blank. For a rear, bent-over, or all-fours pose, keep genitalia and buttocks fully in frame.';
  if(scope==='bottomless')return'Approved scope: lower-body nudity only. Preserve unmentioned upper clothing. Any external adult anatomy naturally visible from the requested camera angle must be complete, coherent, and photographically detailed rather than blank, blurred, or doll-like. Do not invent visibility through occlusion.';
  if(scope==='specific_anatomy'){
    if(resolveSpecificAnatomyExposure(intent)==='covered')return'Approved scope: the specifically requested adult anatomy with coverage explicitly retained. Keep the requested garment or fabric in place and do not expose anatomy through it. Preserve all other clothing and body details.';
    return'Approved scope: the specifically requested adult anatomy is uncovered by default. Remove or reposition only the garment or fabric that directly blocks the named anatomy, even when that garment was not separately named. Make the requested anatomy clearly visible, unobstructed, anatomically coherent, and large enough to read at a useful photographic scale. Do not preserve the base crop, pose occlusion, or blocking garment when it would hide or miniaturize the requested anatomy. Preserve all unrelated clothing and anatomy.';
  }
  if(scope==='topless')return'Approved scope: upper-body nudity only. Preserve lower-body clothing exactly and do not expose unrequested lower anatomy. Render visible requested upper anatomy naturally and completely.';
  return'Approved scope: do not add nudity or expose anatomy beyond the exact user wording.';
}
export function buildVeniceImagePrompt(request:CanonicalMediaRequest):string{
  if((request.subjects?.length??1)>1)return buildImagePrompt(request).slice(0,2_000);
  if(request.generationKind==='photo_edit')return buildImagePrompt(request).slice(0,2_000);
  const identity=request.visualIdentity,place=request.context.place,location=request.context.location,captureLighting=mediaCaptureLightingForRequest(request);
  const wardrobe=request.context.outfitDescription?.trim()||`natural ${String(identity.fashionStyle??'contemporary')} clothing appropriate to the place and activity`;
  const locationDescription=place?.location.visualContext.canonicalPrompt??place?.location.lore.summary??place?.location.description??location?.description??location?.name??'the canonical current location';
  const resolvedDirection=resolvePhotoDirection({requestText:request.generationIntent?.requestText,shotType:request.composition.shotType,seed:request.mediaId}),direction={poseDirection:request.composition.poseDirection??resolvedDirection.poseDirection,faceDirection:request.composition.faceDirection??resolvedDirection.faceDirection,faceMayBeHidden:request.composition.faceMayBeHidden??resolvedDirection.faceMayBeHidden},faceGuidance=direction.faceMayBeHidden?`${direction.faceDirection} The requested composition intentionally permits the face to be covered, turned away, cropped out, or outside the frame. Do not force a face into view. Preserve identity through body, hair, and visible identifying features; any visible face must remain natural and identity-consistent.`:`Keep the same face recognizable and identity-consistent whenever visible. ${direction.faceDirection}`;
  const prompt=[
    `Create one new photorealistic personal photograph of ${request.companion.name}, one fictional adult age ${request.companion.age}.`,
    'Use the input image only to preserve the exact same adult face, hair, eyes, skin tone, body identity, age, and identifying features. Do not copy its clothing, pose, crop, background, or lighting.',
    `Identity: ${clipVenicePrompt(identity.canonicalDescription,260)} Hair: ${clipVenicePrompt(identity.hair,100)}. Eyes: ${clipVenicePrompt(identity.eyes,70)}. Build: ${clipVenicePrompt(identity.build,100)}.`,
    `Scene: ${clipVenicePrompt(place?.path??location?.name??'the canonical current place',120)}. ${clipVenicePrompt(locationDescription,360)}`,
    `WORLD/SETTING LOCK: ${clipVenicePrompt(buildMediaWorldContainmentInstruction(request.context.worldContainment),380)}`,
    `Activity: ${clipVenicePrompt(request.context.activity,180)}. Mood: ${clipVenicePrompt(request.context.mood,100)}.`,
    `TIME/LIGHT: ${clipVenicePrompt(captureLighting.instruction,420)}`,
    `Wardrobe: ${clipVenicePrompt(wardrobe,240)}.`,
    `Composition: ${request.composition.shotType.replace('_',' ')} photo; ${clipVenicePrompt(request.composition.framing,180)}. Pose: ${direction.poseDirection}.`,
    ...(request.generationIntent?.requestText?[`Approved request: ${clipVenicePrompt(request.generationIntent.requestText,300)}`]:[]),
    `${faceGuidance} The input reference defines identity only; never copy its pose, straight-on head alignment, gaze, expression, crop, or camera angle.`,
    'Natural skin detail, realistic adult body proportions, coherent torso and limbs, plausible joints, and realistic lighting. Every visible hand has one palm, five distinct naturally arranged fingers, correct thumb placement, and believable nails. One person only. No fused or duplicated body parts, malformed hands, extra or missing digits, stretched limbs, melted anatomy, vague featureless skin regions, collage, inset reference, profile card, text, caption, watermark, illustration, CGI, duplicate face, or identity drift.',
  ].join('\n');
  // Venice edit models publish model-specific prompt limits and recommend short
  // edit instructions. Keep canonical facts while avoiding a provider-level
  // 400 from the much larger general Kivelle media prompt.
  return prompt.slice(0,2_000);
}
function clipVenicePrompt(value:unknown,max:number):string{const text=String(value??'').replace(/\s+/g,' ').trim();return text.length<=max?text:`${text.slice(0,Math.max(0,max-1)).trimEnd()}…`;}
function uint8ToBase64(bytes:Uint8Array):string{let binary='';for(let index=0;index<bytes.length;index+=32768)binary+=String.fromCharCode(...bytes.subarray(index,index+32768));return btoa(binary);}
function uint8ToDataUrl(bytes:Uint8Array,contentType:string):string{return`data:${contentType};base64,${uint8ToBase64(bytes)}`;}
function dimensions(aspect:string,quality:string){const long=quality==='economy'?768:1024;return aspect==='16:9'?{width:long,height:Math.round(long*9/16)}:aspect==='1:1'?{width:long,height:long}:{width:Math.round(long*4/5),height:long};}
function env(name:string,fallback:string){return Deno.env.get(name)??fallback;}
function isHttpsUrl(value:unknown):value is string{if(typeof value!=='string')return false;try{return new URL(value).protocol==='https:';}catch{return false;}}
function videoModelFamily(model:string){if(model.includes('seedance'))return'seedance';if(model.includes('minimax'))return'minimax';if(model.includes('ltx'))return'ltx';if(model.includes('vidu'))return'vidu';if(model.includes('wan-'))return'wan';return'video';}
function canaryWaveSpeed(seed:string){if(!envBoolean('KIVELLE_WAVESPEED_ENABLED'))return false;const percent=Math.max(0,Math.min(100,envNumber('KIVELLE_WAVESPEED_CANARY_PERCENT',0)));if(percent>=100)return true;let hash=0;for(const char of seed)hash=(hash*31+char.charCodeAt(0))>>>0;return hash%100<percent;}
function adultImageCanaryWaveSpeed(seed:string){if(!envBoolean('KIVELLE_WAVESPEED_ADULT_IMAGES_ENABLED')||!envBoolean('KIVELLE_WAVESPEED_ADULT_ROUTE_VALIDATED'))return false;const percent=Math.max(0,Math.min(100,envNumber('KIVELLE_WAVESPEED_ADULT_IMAGE_CANARY_PERCENT',0)));if(percent>=100)return true;let hash=0;for(const char of seed)hash=(hash*31+char.charCodeAt(0))>>>0;return hash%100<percent;}
function entry(id:string,provider:string,model:string,modelFamily:string,mediaTypes:Array<'image'|'video'|'lora'>,contentLevels:MediaRouteCapability['contentLevels'],input:{character?:boolean;location?:boolean;max?:number;lora?:boolean;loraFamilies?:string[];edit?:boolean;i2v?:boolean;cost?:number;priority:number;enabled:boolean;async?:boolean;userRequest?:boolean;qualityRetry?:boolean;requiresRefs?:boolean}):MediaRouteCapability{return{id,provider,model,modelFamily,mediaTypes,contentLevels,supportsCharacterReference:Boolean(input.character),supportsLocationReference:Boolean(input.location),maxReferenceImages:input.max??0,supportsLoRA:Boolean(input.lora),loraModelFamilies:input.loraFamilies??[],supportsImageEditing:Boolean(input.edit),supportsImageToVideo:Boolean(input.i2v),qualityTiers:['economy','standard','premium'],estimatedCost:input.cost,priority:input.priority,enabled:input.enabled,asynchronous:input.async??provider==='wavespeed',...(input.userRequest?{preferredForUserRequests:true}:{}),...(input.qualityRetry?{preferredForQualityRetry:true}:{}),...(input.requiresRefs?{requiresReferenceImages:true}:{})};}
