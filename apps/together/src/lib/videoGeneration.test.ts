import { describe, expect, it } from 'vitest';
import type { VideoRouteOption } from '../types';
import { canSubmitVideoSelection, validVideoFeedback, videoOutputLabel, videoWaitLabel } from './videoGeneration';

const route:VideoRouteOption={id:'wavespeed-p-video-i2v',provider:'wavespeed',displayName:'P-Video',description:'Fast preview',badge:'Fast',mediaMode:'image_to_video',durationSeconds:5,resolution:'720p',supportedAspectRatios:['9:16','16:9'],referenceImageRequirements:{source:1,canonicalCharacterMin:0,canonicalCharacterMax:0},audioBehavior:'silent',audioLabel:'Silent video',estimatedProviderCostUsd:.02,estimatedWaitSeconds:{min:15,max:75,median:31},creditCost:125,testingOnly:true};

describe('video generation confirmation helpers',()=>{
  it('shows the exact selected source orientation and output settings',()=>{
    expect(videoOutputLabel(route,'16:9')).toBe('5-second 16:9 MP4 · 720p · playback starts muted');
    expect(videoWaitLabel(route)).toBe('About 15–75 sec');
  });

  it('blocks submission while loading, active, or underfunded',()=>{
    expect(canSubmitVideoSelection({route,balance:125,loading:false,submitting:false,hasActiveVideo:false})).toBe(true);
    expect(canSubmitVideoSelection({route,balance:124,loading:false,submitting:false,hasActiveVideo:false})).toBe(false);
    expect(canSubmitVideoSelection({route,balance:125,loading:false,submitting:false,hasActiveVideo:true})).toBe(false);
    expect(canSubmitVideoSelection({route,balance:125,loading:true,submitting:false,hasActiveVideo:false})).toBe(false);
  });

  it('requires a reason only for negative tester feedback',()=>{
    expect(validVideoFeedback('looks_good',[])).toBe(true);
    expect(validVideoFeedback('looks_good',['audio_problem'])).toBe(false);
    expect(validVideoFeedback('needs_work',[])).toBe(false);
    expect(validVideoFeedback('needs_work',['audio_problem'])).toBe(true);
  });
});
