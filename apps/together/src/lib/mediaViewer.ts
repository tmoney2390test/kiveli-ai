import type { GeneratedMedia, VideoGenerationOptions } from '../types';

export type MediaViewport={width:number;height:number};
export type MediaFrame={width:number;height:number};

export function mediaAspectRatio(media:Pick<GeneratedMedia,'width'|'height'|'source_aspect_ratio'>):number{
  const width=Number(media.width),height=Number(media.height);
  if(width>0&&height>0)return width/height;
  return media.source_aspect_ratio==='16:9'?16/9:9/16;
}

export function containedMediaFrame(viewport:MediaViewport,ratio:number,padding=0,maxWidth=Number.POSITIVE_INFINITY):MediaFrame{
  const availableWidth=Math.max(0,viewport.width-padding*2),availableHeight=Math.max(0,viewport.height-padding*2);
  if(!availableWidth||!availableHeight||!Number.isFinite(ratio)||ratio<=0)return{width:0,height:0};
  const width=Math.min(availableWidth,maxWidth,availableHeight*ratio);
  return{width,height:width/ratio};
}

export function fixedMediaFrameStyle(frame:MediaFrame){
  if(!frame.width||!frame.height)return undefined;
  return{width:frame.width,height:frame.height,flexGrow:0,flexShrink:0,flexBasis:'auto' as const};
}

export type VideoAction={mediaId:string;label:'View video'|'View video progress'|'View video result';status:string};

export function resolveAssociatedVideoAction(associated:GeneratedMedia|undefined,options:VideoGenerationOptions|null):VideoAction|null{
  if(associated)return{mediaId:associated.id,status:associated.status,label:associated.status==='ready'?'View video':associated.status==='failed'?'View video result':'View video progress'};
  if(options?.activeVideoId)return{mediaId:options.activeVideoId,status:options.activeVideoStatus??'queued',label:'View video progress'};
  if(options?.latestVideoId)return{mediaId:options.latestVideoId,status:options.latestVideoStatus??'failed',label:options.latestVideoStatus==='ready'?'View video':'View video result'};
  return null;
}

export function shouldPollVideoAvailability(options:VideoGenerationOptions|null):boolean{
  if(!options)return true;
  return Boolean(options.activeVideoId&&!['ready','failed'].includes(String(options.activeVideoStatus)));
}

export function shouldRefreshReadyVideo(media:Pick<GeneratedMedia,'media_type'|'status'>|null|undefined):boolean{
  return media?.media_type==='video'&&media.status==='ready';
}
