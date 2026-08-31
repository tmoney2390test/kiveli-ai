import { createElement, useEffect, useRef, useState, type SyntheticEvent } from 'react';

export function VideoMomentThumbnail({uri,posterUri,onReady}:{uri:string;posterUri?:string|null;onReady?:()=>void}){
  const rootRef=useRef<HTMLDivElement|null>(null),readyReported=useRef(false);
  const[visible,setVisible]=useState(false),[ready,setReady]=useState(false);
  useEffect(()=>{
    setReady(false);readyReported.current=false;
    const root=rootRef.current;
    if(!root||typeof IntersectionObserver==='undefined'){setVisible(true);return;}
    const observer=new IntersectionObserver((entries)=>{if(entries.some((entry)=>entry.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'180px'});
    observer.observe(root);return()=>observer.disconnect();
  },[uri]);
  const markReady=()=>{setReady(true);if(!readyReported.current){readyReported.current=true;onReady?.();}};
  return createElement('div',{ref:rootRef,style:rootStyle},createElement('video',{
    src:visible?uri:undefined,poster:posterUri??undefined,muted:true,defaultMuted:true,controls:false,playsInline:true,preload:'metadata','webkit-playsinline':'true','aria-hidden':true,tabIndex:-1,
    onLoadedData:(event:SyntheticEvent<HTMLVideoElement>)=>{event.currentTarget.pause();event.currentTarget.currentTime=0;markReady();},onCanPlay:markReady,onError:()=>setReady(false),
    style:{...videoStyle,opacity:ready?1:0},
  }));
}

const rootStyle={position:'absolute' as const,inset:0,overflow:'hidden',pointerEvents:'none' as const};
const videoStyle={position:'absolute' as const,inset:0,width:'100%',height:'100%',display:'block',objectFit:'cover' as const,objectPosition:'center top',backgroundColor:'transparent',transition:'opacity 160ms ease'};
