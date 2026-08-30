import { describe, expect, it } from 'vitest';
import type { VideoRouteOption } from '../types';
import { canSubmitVideoSelection, preferredVideoRouteId, validVideoFeedback, videoDurationRangeLabel, videoOutputLabel, videoWaitLabel } from './videoGeneration';

const route:VideoRouteOption={id:'wavespeed-p-video-i2v',provider:'wavespeed',displayName:'P-Video',description:'Lowest-cost video',badge:'Default · lowest cost',mediaMode:'image_to_video',sourceModes:['existing_photo','generated_first_frame'],durationSeconds:10,allowedDurations:[10,15,20],resolution:'720p',supportedAspectRatios:['9:16','16:9'],referenceImageRequirements:{source:1,canonicalCharacterMin:0,canonicalCharacterMax:0},audioBehavior:'silent',audioLabel:'Silent · lowest cost',estimatedProviderCostUsd:.04,estimatedWaitSeconds:{min:30,max:150,median:62},creditCost:250,creditCostPerSecond:25,testingOnly:true};

describe('video generation confirmation helpers',()=>{
  it('shows the exact selected source orientation and output settings',()=>{
    expect(videoOutputLabel(route,'16:9')).toBe('10-second 16:9 MP4 · 720p · playback starts muted');
    expect(videoOutputLabel(route,'9:16',20)).toBe('20-second 9:16 MP4 · 720p · playback starts muted');
    expect(videoWaitLabel(route)).toBe('About 30–150 sec');
  });

  it('blocks submission while loading, active, or underfunded',()=>{
    expect(canSubmitVideoSelection({route,durationSeconds:10,balance:250,loading:false,submitting:false,hasActiveVideo:false})).toBe(true);
    expect(canSubmitVideoSelection({route,durationSeconds:20,balance:499,loading:false,submitting:false,hasActiveVideo:false})).toBe(false);
    expect(canSubmitVideoSelection({route,durationSeconds:10,balance:250,loading:false,submitting:false,hasActiveVideo:true})).toBe(false);
    expect(canSubmitVideoSelection({route,durationSeconds:10,balance:250,loading:true,submitting:false,hasActiveVideo:false})).toBe(false);
  });

  it('requires a reason only for negative tester feedback',()=>{
    expect(validVideoFeedback('looks_good',[])).toBe(true);
    expect(validVideoFeedback('looks_good',['audio_problem'])).toBe(false);
    expect(validVideoFeedback('needs_work',[])).toBe(false);
    expect(validVideoFeedback('needs_work',['audio_problem'])).toBe(true);
  });

  it('defaults to P-Video and clearly presents its 10–20 second range',()=>{
    const slower={...route,id:'cinematic-v2',displayName:'Cinematic',badge:'High fidelity'};
    expect(preferredVideoRouteId({routes:[slower,route],defaultRouteId:slower.id})).toBe(route.id);
    expect(preferredVideoRouteId({routes:[slower,route],defaultRouteId:slower.id},slower.id)).toBe(slower.id);
    expect(videoDurationRangeLabel(route)).toBe('10–20 seconds');
  });
});
