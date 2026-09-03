import { assert, assertEquals, assertNotEquals, assertRejects } from 'jsr:@std/assert@1';
import {
  buildVideoProviderPayload,
  buildVideoMotionPrompt,
  canSelectVideoRoute,
  configuredVideoRouteCatalog,
  defaultVideoRouteId,
  publicVideoRoutes,
  resolveVideoRoute,
  sourceVideoAspectRatio,
  validateVideoSettings,
  videoCreditCost,
  videoProviderBaselineCostUsd,
  VIDEO_ROUTE_IDS,
  VIDEO_SUBMISSION_ATTEMPT_RATE_LIMIT,
} from './kivelle-video-routes.ts';
import { findQuoteAmount } from './wavespeed.ts';

const modelEnv=(id:string)=>`KIVELLE_VIDEO_MODEL_${id.replaceAll('-','_').toUpperCase()}_ENABLED`;
function catalog(expose=true){
  const names=['KIVELLE_VIDEO_ENABLED','KIVELLE_WAVESPEED_ENABLED','WAVESPEED_API_KEY','EXPOSE_VIDEO_MODEL_PICKER','KIVELLE_VIDEO_MODEL_SELECTOR_MODE','KIVELLE_VIDEO_DEFAULT_ROUTE_ID','KIVELLE_VIDEO_CREDITS_PER_USD','KIVELLE_VIDEO_MINIMUM_CREDITS',...VIDEO_ROUTE_IDS.map(modelEnv)];
  const before=Object.fromEntries(names.map((name)=>[name,Deno.env.get(name)]));
  Deno.env.set('KIVELLE_VIDEO_ENABLED','true');Deno.env.set('KIVELLE_WAVESPEED_ENABLED','true');Deno.env.set('WAVESPEED_API_KEY','test');Deno.env.set('EXPOSE_VIDEO_MODEL_PICKER',String(expose));Deno.env.set('KIVELLE_VIDEO_MODEL_SELECTOR_MODE','all');Deno.env.set('KIVELLE_VIDEO_CREDITS_PER_USD','250');Deno.env.set('KIVELLE_VIDEO_MINIMUM_CREDITS','25');
  for(const id of VIDEO_ROUTE_IDS)Deno.env.set(modelEnv(id),'true');
  return{routes:configuredVideoRouteCatalog(),restore:()=>{for(const[name,value]of Object.entries(before))value===undefined?Deno.env.delete(name):Deno.env.set(name,value);}};
}

Deno.test('video attempt limiter stays separate from successful-video allowance',()=>{
  assertNotEquals(VIDEO_SUBMISSION_ATTEMPT_RATE_LIMIT.action,'together_video_submit');
  assert(VIDEO_SUBMISSION_ATTEMPT_RATE_LIMIT.limit>20);
  assertEquals(VIDEO_SUBMISSION_ATTEMPT_RATE_LIMIT.windowSeconds,15*60);
});

Deno.test('exact model registry exposes every enabled testing endpoint and capability quote',()=>{
  const state=catalog();try{
    assertEquals([...state.routes.map((route)=>route.id)].sort(),[...VIDEO_ROUTE_IDS].sort());
    const options=publicVideoRoutes(state.routes,{includeAdultCapable:true});
    assertEquals(options.length,VIDEO_ROUTE_IDS.length);
    for(const option of options){
      assert(option.modelEndpoint?.includes('/'));
      assert(option.rawModelNamesExposed);
      assert(['sfw','adult_capable'].includes(option.contentClass));
      assert(option.allowedDurations.length>0);
      assert(option.supportedResolutions.length>0);
      for(const resolution of option.supportedResolutions)for(const duration of option.allowedDurations){
        assert(Number.isFinite(option.creditQuotes[`${resolution}:${duration}:silent`]));
        assert(Number.isFinite(option.providerCostQuotes[`${resolution}:${duration}:silent`]));
        if(!['none','reference_only'].includes(option.audioMode))assert(Number.isFinite(option.creditQuotes[`${resolution}:${duration}:sound`]));
        if(!['none','reference_only'].includes(option.audioMode))assert(Number.isFinite(option.providerCostQuotes[`${resolution}:${duration}:sound`]));
      }
    }
  }finally{state.restore();}
});

Deno.test('standard sessions receive only explicit Safe for work video options',()=>{
  const state=catalog();try{
    const options=publicVideoRoutes(state.routes);
    assertEquals(options.length,VIDEO_ROUTE_IDS.length/2);
    assert(options.every((option)=>option.contentClass==='sfw'&&option.contentLabel==='Safe for work'));
    assert(options.every((option)=>!option.displayName.includes('Spicy')&&!option.modelEndpoint?.includes('-spicy')));
    const adultOptions=publicVideoRoutes(state.routes,{includeAdultCapable:true});
    assert(adultOptions.some((option)=>option.contentClass==='adult_capable'&&option.modelEndpoint?.includes('-spicy')));
  }finally{state.restore();}
});

Deno.test('model payload builders preserve exact endpoint-specific audio fields',()=>{
  const state=catalog();try{
    const payload=(id:typeof VIDEO_ROUTE_IDS[number],sound=false)=>{const route=state.routes.find((item)=>item.id===id)!;return buildVideoProviderPayload(route,{sourceImageUrl:'https://example.test/source.jpg',lastImageUrl:'https://example.test/last.jpg',sourceAspectRatio:'9:16',motionPreset:'subtle',resolution:route.defaultResolution,duration:route.defaultDuration,sound});};
    assertEquals(payload('ltx-2-3-spicy').preset,'tuned');
    assertEquals(payload('ltx-2-3-sfw').preset,'tuned');
    const vidu=payload('vidu-q3-spicy',true);assertEquals(vidu.generate_audio,true);assertEquals(vidu.bgm,false);assertEquals(vidu.movement_amplitude,'auto');
    const seedance=payload('seedance-1-5-pro-spicy',true);assertEquals(seedance.generate_audio,true);
    const minimax=payload('minimax-h3-spicy');assertEquals(minimax.last_image,'https://example.test/last.jpg');assertEquals('generate_audio'in minimax,false);
    for(const id of ['wan-2-7-spicy','wan-2-6-spicy','wan-2-2-spicy'] as const)assertEquals('generate_audio'in payload(id),false);
  }finally{state.restore();}
});

Deno.test('video prompts preserve coverage and reject doll-like or unstable anatomy',()=>{
  const prompt=buildVideoMotionPrompt('playful','Give a small wave',{locationName:'Aurora Spa'});
  assert(prompt.includes('Keep every originally covered body area covered'));
  assert(prompt.includes('doll-like'));
  assert(prompt.includes('missing, fused, duplicated, or morphing'));
});

Deno.test('authorized adult video prompts preserve requested composition without silent SFW substitution',()=>{
  const prompt=buildVideoMotionPrompt('cinematic','A consenting fictional adult couple shares an explicit intimate moment',{companionName:'Elena',locationName:'Snowcrest'},{contentLevel:'explicit',adultAuthorized:true,anonymousAdultPartner:true});
  assert(prompt.includes('approved fictional-adult clothing state, intimate composition'));
  assert(prompt.includes('exactly the companion and the one anonymous fictional adult partner'));
  assert(prompt.includes('age 25 or older'));
  assert(prompt.includes('without adding censorship'));
  assert(!prompt.includes('Keep every originally covered body area covered'));
});

Deno.test('pricing follows model, resolution, duration, and toggleable sound',()=>{
  const state=catalog();try{
    const seedance=state.routes.find((item)=>item.id==='seedance-1-5-pro-spicy')!;
    assertEquals(videoProviderBaselineCostUsd(seedance,{resolution:'720p',duration:5,sound:false}),.13);
    assertEquals(videoProviderBaselineCostUsd(seedance,{resolution:'720p',duration:5,sound:true}),.26);
    assertEquals(videoCreditCost(seedance,{resolution:'720p',duration:5,sound:false}),33);
    const ltx=state.routes.find((item)=>item.id==='ltx-2-3-spicy')!;
    assertEquals(videoProviderBaselineCostUsd(ltx,{resolution:'480p',duration:20,sound:false}),.4);
    assertEquals(videoProviderBaselineCostUsd(ltx,{resolution:'480p',duration:20,sound:true}),.4);
  }finally{state.restore();}
});

Deno.test('unsupported settings and arbitrary or disabled model identifiers fail closed',async()=>{
  const state=catalog();try{
    const route=state.routes.find((item)=>item.id==='wan-2-2-spicy')!;
    await assertRejects(async()=>validateVideoSettings(route,{resolution:'1080p',duration:5,sound:false}));
    await assertRejects(async()=>validateVideoSettings(route,{resolution:'720p',duration:5,sound:true}));
    await assertRejects(async()=>resolveVideoRoute('wavespeed/fake-model','user'));
    Deno.env.set(modelEnv('wan-2-2-spicy'),'false');
    await assertRejects(async()=>resolveVideoRoute('wan-2-2-spicy','user'));
  }finally{state.restore();}
});

Deno.test('selector flag and tester allowlist are enforced server-side',()=>{
  const state=catalog(false),previousUsers=Deno.env.get('KIVELLE_VIDEO_TESTER_USER_IDS');try{
    Deno.env.set('KIVELLE_VIDEO_MODEL_SELECTOR_MODE','testers');Deno.env.set('KIVELLE_VIDEO_TESTER_USER_IDS','tester-id, tester@example.test');
    assertEquals(canSelectVideoRoute('other-id','other@example.test'),false);
    assertEquals(canSelectVideoRoute('tester-id',null),true);
    assertEquals(canSelectVideoRoute('other-id','TESTER@example.test'),true);
    Deno.env.set('EXPOSE_VIDEO_MODEL_PICKER','true');assertEquals(canSelectVideoRoute('other-id',null),true);
  }finally{previousUsers===undefined?Deno.env.delete('KIVELLE_VIDEO_TESTER_USER_IDS'):Deno.env.set('KIVELLE_VIDEO_TESTER_USER_IDS',previousUsers);state.restore();}
});

Deno.test('hidden model names resolve through future consumer tiers without changing backend registry',()=>{
  const state=catalog(false);try{
    const options=publicVideoRoutes(state.routes);
    assert(options.length>=3);
    assert(options.every((option)=>!option.modelEndpoint&&!option.modelKey&&!option.rawModelNamesExposed));
    assert(options.some((option)=>option.id==='tier:standard'));
    assertEquals(resolveVideoRoute('tier:standard','user').futureConsumerTier,'standard');
  }finally{state.restore();}
});

Deno.test('Seedance 1.5 remains the safe-cost default and source orientation is normalized',()=>{
  const state=catalog();try{
    Deno.env.delete('KIVELLE_VIDEO_DEFAULT_ROUTE_ID');assertEquals(defaultVideoRouteId(),'seedance-1-5-pro-sfw');
    assertEquals(sourceVideoAspectRatio(800,1200),'9:16');assertEquals(sourceVideoAspectRatio(1600,900),'16:9');assertEquals(sourceVideoAspectRatio(null,null),'9:16');
  }finally{state.restore();}
});

Deno.test('WaveSpeed price responses require a finite authoritative quote',()=>{
  assertEquals(findQuoteAmount({data:{price:.7}}),.7);
  assertEquals(findQuoteAmount({result:{total_price:'$0.80'}}),.8);
  assertEquals(Number.isNaN(findQuoteAmount({data:{message:'unknown'}})),true);
});
