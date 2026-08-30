import { createElement, useEffect, useRef } from 'react';

type Props={
  uri:string|null;
  accessibilityLabel:string;
  active?:boolean;
  autoPlay?:boolean;
  muted?:boolean;
  loop?:boolean;
  onReady?:()=>void;
  onError?:()=>void;
  onPlay?:()=>void;
};

export function webVideoElementAttributes({uri,active=true,autoPlay=true,muted=true,loop=true}:Pick<Props,'uri'|'active'|'autoPlay'|'muted'|'loop'>){
  return{
    src:uri??undefined,
    controls:true,
    autoPlay:autoPlay&&active,
    muted,
    loop,
    playsInline:true,
    preload:'auto' as const,
    style:{position:'absolute' as const,inset:0,width:'100%',height:'100%',display:'block',objectFit:'contain' as const,backgroundColor:'#000'},
  };
}

export function WebVideoSurface({uri,accessibilityLabel,active=true,autoPlay=true,muted=true,loop=true,onReady,onError,onPlay}:Props){
  const videoRef=useRef<HTMLVideoElement|null>(null);

  useEffect(()=>{
    const video=videoRef.current;
    if(!video)return;
    if(!active){video.pause();return;}
    video.load();
    if(autoPlay&&uri)void video.play().catch(()=>undefined);
  },[active,autoPlay,uri]);

  return createElement('video',{
    key:uri??'empty-video',
    ref:videoRef,
    ...webVideoElementAttributes({uri,active,autoPlay,muted,loop}),
    'aria-label':accessibilityLabel,
    onCanPlay:onReady,
    onLoadedData:onReady,
    onError,
    onPlay,
  });
}
