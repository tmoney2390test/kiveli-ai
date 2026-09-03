import { describe, expect, it } from 'vitest';
import type { VideoRouteOption } from '../types';
import { canSubmitVideoSelection, normalizeVideoGenerationOptions, preferredVideoRouteId, validVideoFeedback, videoComparisonQuote, videoDurationRangeLabel, videoOutputLabel, videoProviderCostLabel, videoWaitLabel } from './videoGeneration';

const creditQuotes=Object.fromEntries(['480p','720p','1080p'].flatMap((resolution)=>[5,10].flatMap((duration)=>[false,true].map((sound)=>[`${resolution}:${duration}:${sound?'sound':'silent'}`,resolution==='720p'&&duration===5?sound?65:33:resolution==='720p'&&duration===10?sound?130:65:100]))));
const providerCostQuotes=Object.fromEntries(['480p','720p','1080p'].flatMap((resolution)=>[5,10].flatMap((duration)=>[false,true].map((sound)=>[`${resolution}:${duration}:${sound?'sound':'silent'}`,resolution==='720p'&&duration===5?(sound ? .26 : .13):resolution==='720p'&&duration===10?(sound ? .52 : .26):.4]))));
const route:VideoRouteOption={id:'seedance-1-5-pro-sfw',modelKey:'seedance-1-5-pro-sfw',modelEndpoint:'bytedance/seedance-v1.5-pro/image-to-video',provider:'wavespeed',displayName:'Seedance 1.5 Pro',description:'Recommended balance for safe-for-work scenes',contentClass:'sfw',contentLabel:'Safe for work',modelFamily:'seedance-1-5-pro',badge:'SFW',badges:['Safe for work','Sound','1080p'],uiGroup:'recommended',mediaMode:'image_to_video',sourceModes:['existing_photo','generated_first_frame'],durationSeconds:5,allowedDurations:[5,10],resolution:'720p',supportedResolutions:['480p','720p','1080p'],supportedAspectRatios:['9:16','16:9'],aspectRatioBehavior:'source',referenceImageRequirements:{source:1,canonicalCharacterMin:0,canonicalCharacterMax:0},audioMode:'toggleable',audioLabel:'Sound can be included or disabled.',lastFrameSupport:false,estimatedWaitSeconds:{min:25,max:180,median:70},creditQuotes,providerCostQuotes,rawModelNamesExposed:true,experimental:false,testingOnly:true,futureConsumerTier:'standard'};

describe('video generation confirmation helpers',()=>{
  it('shows the exact selected source orientation and output settings',()=>{
    expect(videoOutputLabel(route,'16:9')).toBe('5-second 16:9 MP4 · 720p · silent');
    expect(videoOutputLabel(route,'9:16',10)).toBe('10-second 9:16 MP4 · 720p · silent');
    expect(videoWaitLabel(route)).toBe('About 25–180 sec');
  });

  it('blocks submission while loading, active, or underfunded',()=>{
    expect(canSubmitVideoSelection({route,durationSeconds:5,balance:33,loading:false,submitting:false,hasActiveVideo:false})).toBe(true);
    expect(canSubmitVideoSelection({route,durationSeconds:10,balance:64,loading:false,submitting:false,hasActiveVideo:false})).toBe(false);
    expect(canSubmitVideoSelection({route,durationSeconds:5,balance:33,loading:false,submitting:false,hasActiveVideo:true})).toBe(false);
    expect(canSubmitVideoSelection({route,durationSeconds:5,balance:33,loading:true,submitting:false,hasActiveVideo:false})).toBe(false);
  });

  it('requires a reason only for negative tester feedback',()=>{
    expect(validVideoFeedback('looks_good',[])).toBe(true);
    expect(validVideoFeedback('looks_good',['audio_problem'])).toBe(false);
    expect(validVideoFeedback('needs_work',[])).toBe(false);
    expect(validVideoFeedback('needs_work',['audio_problem'])).toBe(true);
  });

  it('uses the server default and clearly presents its supported range',()=>{
    const slower={...route,id:'cinematic-v2',displayName:'Cinematic',badge:'Recommended'};
    expect(preferredVideoRouteId({routes:[slower,route],defaultRouteId:slower.id})).toBe(slower.id);
    expect(preferredVideoRouteId({routes:[slower,route],defaultRouteId:slower.id},slower.id)).toBe(slower.id);
    expect(videoDurationRangeLabel(route)).toBe('5–10 seconds');
  });

  it('quotes every model using the current settings when supported',()=>{
    expect(videoComparisonQuote(route,{resolution:'720p',duration:10,sound:true})).toEqual({resolution:'720p',duration:10,sound:true,credits:130,providerCostUsd:.52});
    expect(videoProviderCostLabel(.52)).toBe('$0.52');
  });

  it('falls back to a model default for incompatible comparison settings',()=>{
    const silent={...route,resolution:'480p' as const,durationSeconds:5,audioMode:'none' as const,supportedResolutions:['480p'] as const,allowedDurations:[5]};
    expect(videoComparisonQuote(silent,{resolution:'4k',duration:15,sound:true})).toEqual({resolution:'480p',duration:5,sound:false,credits:100,providerCostUsd:.4});
  });

  it('rejects an older route payload without authoritative quote tables instead of crashing during render',()=>{
    expect(()=>normalizeVideoGenerationOptions({available:true,selectorMode:'all',routes:[{...route,creditQuotes:undefined}],motionPresets:[],creditBalance:1000})).toThrow('Video models are updating. Try again in a moment.');
  });

  it('normalizes stale saved defaults and incomplete optional presentation fields safely',()=>{
    const options=normalizeVideoGenerationOptions({available:true,selectorMode:'all',defaultRouteId:'retired-model',routes:[{...route,badges:undefined,supportedAspectRatios:undefined,estimatedWaitSeconds:undefined}],motionPresets:[],creditBalance:'4652'});
    expect(options.defaultRouteId).toBe(route.id);
    expect(options.routes[0]?.badges).toEqual(['SFW']);
    expect(options.routes[0]?.supportedAspectRatios).toEqual(['9:16','16:9']);
    expect(options.creditBalance).toBe(4652);
  });
});
