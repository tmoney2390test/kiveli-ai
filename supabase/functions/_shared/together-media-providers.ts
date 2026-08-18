import{routeMediaGeneration,type MediaRoute,type MediaRouteCapability}from'../../../packages/together-domain/src/media-routing.ts';
import{AppError}from'./types.ts';
import{buildImagePrompt,configuredImageProvider,type CanonicalImageGenerationRequest,type ImageGenerationResult,type MediaReferenceImage}from'./together-media-base.ts';
import{configuredWaveSpeedClient,envBoolean,envNumber,type WaveSpeedClient,type WaveSpeedPrediction}from'./wavespeed.ts';

export type CanonicalMediaRequest=CanonicalImageGenerationRequest&{mediaType:'image'|'video';sourceImage?:MediaReferenceImage;motionPrompt?:string;durationSeconds?:number;mediaProfile?:{id:string;provider:string;modelFamily:string;modelUrl:string;triggerWord?:string;revision:number}};
export type ProviderCompletedMedia={bytes?:Uint8Array;outputUrl?:string;contentType?:string;width?:number;height?:number;durationMs?:number;providerRequestId?:string;model:string;estimatedCost?:number;generationMs?:number};
export type ProviderSubmission={provider:string;providerRequestId:string;model:string;status:'submitted'|'completed';result?:ProviderCompletedMedia};

export interface MediaGenerationProvider{id:string;asynchronous:boolean;submit(request:CanonicalMediaRequest,route:MediaRouteCapability):Promise<ProviderSubmission>;getResult?(providerRequestId:string):Promise<ProviderResult>}
export type ProviderResult={status:'processing'|'completed'|'failed';result?:ProviderCompletedMedia;failureCode?:string;failureReasonSafe?:string};
export type RoutedProvider={route:MediaRoute;provider:MediaGenerationProvider};

export function configuredMediaRegistry():MediaRouteCapability[]{
  const wave=envBoolean('KIVELLE_WAVESPEED_ENABLED')&&Boolean(Deno.env.get('WAVESPEED_API_KEY')),adult=envBoolean('KIVELLE_ADULT_MEDIA_ENABLED'),video=envBoolean('KIVELLE_VIDEO_ENABLED');
  const standard:MediaRouteCapability['contentLevels']=['standard','romance'];
  const registry:MediaRouteCapability[]=[
    entry('wavespeed-kontext-pro-multiref','wavespeed',env('WAVESPEED_MODEL_REQUESTED_MULTIREF','wavespeed-ai/flux-kontext-pro/multi'),'flux',['image'],standard,{character:true,location:true,max:5,edit:true,cost:.04,priority:118,enabled:wave,userRequest:true,requiresRefs:true}),
    entry('wavespeed-multiref','wavespeed',env('WAVESPEED_MODEL_MULTIREF','wavespeed-ai/flux-kontext-dev/multi-ultra-fast'),'flux',['image'],standard,{character:true,location:true,max:4,edit:true,cost:.025,priority:120,enabled:wave}),
    entry('wavespeed-zimage-lora','wavespeed',env('WAVESPEED_MODEL_STANDARD_LORA','wavespeed-ai/z-image/turbo-lora'),'z-image',['image'],standard,{lora:true,loraFamilies:['z-image'],priority:108,enabled:wave&&envBoolean('KIVELLE_WAVESPEED_LORA_ENABLED')}),
    entry('wavespeed-zimage-i2i-lora','wavespeed',env('WAVESPEED_MODEL_STANDARD_I2I_LORA','wavespeed-ai/z-image-turbo/image-to-image-lora'),'z-image',['image'],standard,{character:true,location:true,max:1,lora:true,loraFamilies:['z-image'],edit:true,priority:112,enabled:wave&&envBoolean('KIVELLE_WAVESPEED_LORA_ENABLED')}),
    entry('wavespeed-flux-edit-lora','wavespeed',env('WAVESPEED_MODEL_MULTIREF_LORA','wavespeed-ai/flux-2-klein-4b/edit-lora'),'flux',['image'],standard,{character:true,location:true,max:4,lora:true,loraFamilies:['flux'],edit:true,priority:114,enabled:wave&&envBoolean('KIVELLE_WAVESPEED_LORA_ENABLED')&&envBoolean('KIVELLE_WAVESPEED_EXPERIMENTAL_ROUTES')}),
    entry('wavespeed-chroma','wavespeed',env('WAVESPEED_MODEL_EXPLICIT','wavespeed-ai/chroma'),'chroma',['image'],adult?['suggestive','mature','explicit']:[],{priority:80,enabled:wave&&adult&&envBoolean('KIVELLE_WAVESPEED_ADULT_ROUTE_VALIDATED')}),
    entry('wavespeed-video','wavespeed',env('WAVESPEED_MODEL_VIDEO','wavespeed-ai/ltx-2.3-spicy/image-to-video'),'ltx',['video'],adult&&envBoolean('KIVELLE_WAVESPEED_ADULT_VIDEO_ROUTE_VALIDATED')?['standard','romance','suggestive','mature','explicit']:standard,{character:true,location:true,max:1,i2v:true,cost:.1,priority:120,enabled:wave&&video}),
    entry('wavespeed-video-lora','wavespeed',env('WAVESPEED_MODEL_VIDEO_LORA','wavespeed-ai/ltx-2.3-spicy/image-to-video-lora'),'ltx',['video'],standard,{character:true,location:true,max:1,lora:true,loraFamilies:['ltx'],i2v:true,priority:125,enabled:wave&&video&&envBoolean('KIVELLE_WAVESPEED_LORA_ENABLED')&&envBoolean('KIVELLE_WAVESPEED_VIDEO_LORA_VALIDATED')}),
  ];
  const sync=configuredImageProvider();if(sync)registry.push(entry(`${sync.id}-image`,sync.id,sync.id==='openai'?env('KIVELLE_IMAGE_MODEL','gpt-image-2'):env('KIVELLE_IMAGE_MODEL','gemini-3.1-flash-image'),sync.id==='openai'?'openai-image':'gemini-image',['image'],standard,{character:true,location:true,max:2,edit:true,priority:50,enabled:true,async:false}));
  return registry;
}

export function routeCanonicalMedia(request:CanonicalMediaRequest,input:{source:string;userTier:string;preferredProvider?:string}):RoutedProvider{
  const references=request.referenceImages;const profile=request.mediaProfile;
  const waveSelected=input.preferredProvider==='wavespeed'||env('KIVELLE_IMAGE_PROVIDER','').toLowerCase()==='wavespeed'||canaryWaveSpeed(request.mediaId),allRoutes=configuredMediaRegistry(),registry=waveSelected?allRoutes:allRoutes.filter((entry)=>entry.provider!=='wavespeed');
  const route=routeMediaGeneration({mediaType:request.mediaType,contentLevel:request.contentLevel,qualityTier:request.qualityTier,shotType:request.composition.shotType,characterIdentityAvailable:references.some((item)=>item.role==='character_identity'),characterLoRAAvailable:Boolean(profile?.modelUrl),characterLoRAModelFamily:profile?.modelFamily,locationReferenceAvailable:references.some((item)=>item.role==='location_environment'),worldReferenceAvailable:references.some((item)=>item.role==='world_environment'),outfitReferenceAvailable:references.some((item)=>item.role==='outfit_continuity'),source:input.source,userTier:input.userTier,preferredProvider:input.preferredProvider??(waveSelected?'wavespeed':undefined)},registry);
  if(!route)throw new AppError('PROVIDER_UNAVAILABLE','That kind of media is not available right now.',503);
  const provider=providerForCapability(route.capability);return{route,provider};
}

export function providerForCapability(route:MediaRouteCapability):MediaGenerationProvider{
  if(route.provider==='wavespeed'){const client=configuredWaveSpeedClient();if(!client)throw new AppError('PROVIDER_NOT_CONFIGURED','Photo generation is not connected yet.',503);return new WaveSpeedMediaProvider(client);}
  const provider=configuredImageProvider();if(!provider||provider.id!==route.provider)throw new AppError('PROVIDER_NOT_CONFIGURED','Photo generation is not connected yet.',503);
  return{id:provider.id,asynchronous:false,submit:async(request)=>{const result=await provider.generate(request);return{provider:provider.id,providerRequestId:result.providerRequestId??crypto.randomUUID(),model:result.model,status:'completed',result:syncResult(result)}}};
}

class WaveSpeedMediaProvider implements MediaGenerationProvider{
  id='wavespeed';asynchronous=true;
  constructor(private readonly client:WaveSpeedClient){}
  async submit(request:CanonicalMediaRequest,route:MediaRouteCapability):Promise<ProviderSubmission>{
    const input=waveSpeedInput(request,route),submission=await this.client.submit(route.model,input);
    return{provider:'wavespeed',providerRequestId:submission.providerRequestId,model:submission.model,status:submission.status,...(submission.result?{result:predictionResult(submission.result,route.estimatedCost)}:{})};
  }
  async getResult(providerRequestId:string):Promise<ProviderResult>{const prediction=await this.client.getResult(providerRequestId);if(['created','processing'].includes(prediction.status))return{status:'processing'};if(prediction.status==='completed'&&prediction.outputs[0])return{status:'completed',result:predictionResult(prediction)};return{status:'failed',failureCode:`provider_${prediction.status}`,failureReasonSafe:'The media could not be created this time.'};}
}

export function waveSpeedInput(request:CanonicalMediaRequest,route:MediaRouteCapability):Record<string,unknown>{
  const refs=request.referenceImages.filter((item)=>item.signedUrl).slice(0,route.maxReferenceImages),size=dimensions(request.composition.aspectRatio,request.qualityTier),prompt=request.mediaType==='video'?buildVideoPrompt(request):buildImagePrompt(request);
  if(request.mediaType==='video')return{image:request.sourceImage?.signedUrl??refs[0]?.signedUrl,prompt,preset:'tuned',resolution:request.qualityTier==='premium'?'720p':'480p',duration:Math.max(3,Math.min(10,request.durationSeconds??5)),seed:-1};
  if(route.preferredForUserRequests)return{prompt,images:refs.map((item)=>item.signedUrl),seed:-1,guidance_scale:3.5,aspect_ratio:request.composition.aspectRatio==='4:5'?'3:4':request.composition.aspectRatio};
  const common={prompt,size:`${size.width}*${size.height}`,seed:-1,output_format:'jpeg',num_images:1};
  const loras=request.mediaProfile?.modelUrl&&route.supportsLoRA?[{path:request.mediaProfile.modelUrl,scale:.9}]:undefined;
  if(route.maxReferenceImages>1)return{...common,images:refs.map((item)=>item.signedUrl),num_inference_steps:28,guidance_scale:2.5,...(loras?{loras}:{})};
  if(route.supportsImageEditing&&refs[0])return{...common,image:refs.find((item)=>item.role==='location_environment')?.signedUrl??refs[0].signedUrl,...(loras?{loras}:{})};
  return{...common,...(loras?{loras}:{})};
}

export function buildVideoPrompt(request:CanonicalMediaRequest):string{return['Animate this exact approved Kivelle image without redesigning it.',request.motionPrompt??'Subtle natural breathing, blinking, small expression and hair movement, with a gentle handheld camera drift.','Preserve the companion face, adult age, body proportions, hair, clothing, location, lighting, framing, and current scene.','Avoid morphing, identity drift, outfit changes, location changes, unexplained people or objects, warped hands, text, cuts, and sudden camera jumps.'].join('\n');}

function predictionResult(prediction:WaveSpeedPrediction,estimatedCost?:number):ProviderCompletedMedia{return{outputUrl:prediction.outputs[0],providerRequestId:prediction.id,model:prediction.model,estimatedCost,generationMs:prediction.inferenceMs};}
function syncResult(result:ImageGenerationResult):ProviderCompletedMedia{return{bytes:result.bytes,contentType:result.contentType,width:result.width,height:result.height,providerRequestId:result.providerRequestId,model:result.model,estimatedCost:result.estimatedCost};}
function dimensions(aspect:string,quality:string){const long=quality==='economy'?768:1024;return aspect==='16:9'?{width:long,height:Math.round(long*9/16)}:aspect==='1:1'?{width:long,height:long}:{width:Math.round(long*4/5),height:long};}
function env(name:string,fallback:string){return Deno.env.get(name)??fallback;}
function canaryWaveSpeed(seed:string){if(!envBoolean('KIVELLE_WAVESPEED_ENABLED'))return false;const percent=Math.max(0,Math.min(100,envNumber('KIVELLE_WAVESPEED_CANARY_PERCENT',0)));if(percent>=100)return true;let hash=0;for(const char of seed)hash=(hash*31+char.charCodeAt(0))>>>0;return hash%100<percent;}
function entry(id:string,provider:string,model:string,modelFamily:string,mediaTypes:Array<'image'|'video'|'lora'>,contentLevels:MediaRouteCapability['contentLevels'],input:{character?:boolean;location?:boolean;max?:number;lora?:boolean;loraFamilies?:string[];edit?:boolean;i2v?:boolean;cost?:number;priority:number;enabled:boolean;async?:boolean;userRequest?:boolean;requiresRefs?:boolean}):MediaRouteCapability{return{id,provider,model,modelFamily,mediaTypes,contentLevels,supportsCharacterReference:Boolean(input.character),supportsLocationReference:Boolean(input.location),maxReferenceImages:input.max??0,supportsLoRA:Boolean(input.lora),loraModelFamilies:input.loraFamilies??[],supportsImageEditing:Boolean(input.edit),supportsImageToVideo:Boolean(input.i2v),qualityTiers:['economy','standard','premium'],estimatedCost:input.cost,priority:input.priority,enabled:input.enabled,asynchronous:input.async??provider==='wavespeed',...(input.userRequest?{preferredForUserRequests:true}:{}),...(input.requiresRefs?{requiresReferenceImages:true}:{})};}
