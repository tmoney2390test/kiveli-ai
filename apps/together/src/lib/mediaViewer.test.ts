import{describe,expect,it}from'vitest';
import type{GeneratedMedia,VideoGenerationOptions}from'../types';
import{containedMediaFrame,mediaAspectRatio,resolveAssociatedVideoAction,shouldPollVideoAvailability}from'./mediaViewer';

const media=(value:Partial<GeneratedMedia>):GeneratedMedia=>({id:'video-1',user_id:'user-1',continuity_id:'continuity-1',character_instance_id:'character-1',media_type:'video',status:'queued',created_at:new Date(0).toISOString(),updated_at:new Date(0).toISOString(),metadata:{},...value}as GeneratedMedia);
const options=(value:Partial<VideoGenerationOptions>):VideoGenerationOptions=>({available:true,routes:[],motionPresets:[],creditBalance:1000,...value}as VideoGenerationOptions);

describe('responsive media viewer',()=>{
  it('contains portrait video in a mobile viewport without cropping',()=>{
    expect(containedMediaFrame({width:390,height:640},9/16,12)).toEqual({width:346.5,height:616});
  });
  it('contains landscape video in portrait and landscape viewports',()=>{
    expect(containedMediaFrame({width:390,height:640},16/9,12)).toEqual({width:366,height:205.875});
    expect(containedMediaFrame({width:844,height:390},16/9,12)).toEqual({width:650.6666666666666,height:366});
  });
  it('uses delivered dimensions before the requested aspect ratio',()=>{
    expect(mediaAspectRatio(media({width:1920,height:1080,source_aspect_ratio:'9:16'}))).toBeCloseTo(16/9);
    expect(mediaAspectRatio(media({width:null,height:null,source_aspect_ratio:'9:16'}))).toBeCloseTo(9/16);
  });
});

describe('associated video discovery',()=>{
  it('shows a progress action from fresh options before the snapshot catches up',()=>{
    expect(resolveAssociatedVideoAction(undefined,options({activeVideoId:'active-1',activeVideoStatus:'generating'}))).toEqual({mediaId:'active-1',status:'generating',label:'View video progress'});
  });
  it('prefers the associated snapshot and presents terminal states',()=>{
    expect(resolveAssociatedVideoAction(media({status:'ready'}),options({activeVideoId:'active-1'}))?.label).toBe('View video');
    expect(resolveAssociatedVideoAction(undefined,options({latestVideoId:'latest-1',latestVideoStatus:'failed'}))?.label).toBe('View video result');
  });
  it('polls until a video is discovered and while it is active',()=>{
    expect(shouldPollVideoAvailability(null)).toBe(true);
    expect(shouldPollVideoAvailability(options({}))).toBe(true);
    expect(shouldPollVideoAvailability(options({activeVideoId:'active-1',activeVideoStatus:'generating'}))).toBe(true);
    expect(shouldPollVideoAvailability(options({latestVideoId:'latest-1',latestVideoStatus:'ready'}))).toBe(false);
  });
});
