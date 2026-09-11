import{createElement,useEffect,useRef,useState,type ChangeEvent}from'react';

type AudioBehavior='has_audio'|'silent'|'unknown'|null;
type Props={uri:string|null;posterUri?:string|null;accessibilityLabel:string;active?:boolean;autoPlay?:boolean;muted?:boolean;loop?:boolean;allowFullscreen?:boolean;audioBehavior?:AudioBehavior;onReady?:()=>void;onError?:()=>void;onRetry?:()=>void|Promise<void>;onPlay?:()=>void;};

export function webVideoElementAttributes({uri,posterUri,active=true,autoPlay=false,muted=true,loop=true}:Pick<Props,'uri'|'posterUri'|'active'|'autoPlay'|'muted'|'loop'>){return{src:uri??undefined,poster:posterUri??undefined,controls:false,autoPlay:autoPlay&&active,muted,defaultMuted:muted,loop,playsInline:true,preload:'auto' as const,'webkit-playsinline':'true',style:videoStyle};}
export function formatVideoTime(value:number):string{if(!Number.isFinite(value)||value<0)return'0:00';const seconds=Math.floor(value),minutes=Math.floor(seconds/60);return`${minutes}:${String(seconds%60).padStart(2,'0')}`;}
function videoControlIcon(name:'play'|'pause'|'volume'|'muted'|'expand'|'collapse'){
  const common={fill:'none',stroke:'currentColor',strokeWidth:2,strokeLinecap:'round',strokeLinejoin:'round'};
  const children=name==='play'
    ?[createElement('path',{key:'play',d:'m9 6 9 6-9 6Z',...common})]
    :name==='pause'
      ?[createElement('path',{key:'left',d:'M9 5v14',...common}),createElement('path',{key:'right',d:'M15 5v14',...common})]
      :name==='expand'
        ?[createElement('path',{key:'top-left',d:'M8 3H3v5',...common}),createElement('path',{key:'top-right',d:'M16 3h5v5',...common}),createElement('path',{key:'bottom-left',d:'M8 21H3v-5',...common}),createElement('path',{key:'bottom-right',d:'M16 21h5v-5',...common})]
        :name==='collapse'
          ?[createElement('path',{key:'top-left',d:'M3 8h5V3',...common}),createElement('path',{key:'top-right',d:'M21 8h-5V3',...common}),createElement('path',{key:'bottom-left',d:'M3 16h5v5',...common}),createElement('path',{key:'bottom-right',d:'M21 16h-5v5',...common})]
          :[createElement('path',{key:'speaker',d:'M11 5 6 9H3v6h3l5 4Z',...common}),...(name==='muted'?[createElement('path',{key:'mute',d:'m17 9 5 5m0-5-5 5',...common})]:[createElement('path',{key:'wave',d:'M15.5 8.5a5 5 0 0 1 0 7',...common}),createElement('path',{key:'outer-wave',d:'M18.5 5.5a9 9 0 0 1 0 13',...common})])];
  return createElement('svg',{width:24,height:24,viewBox:'0 0 24 24','aria-hidden':true,focusable:false},...children);
}

export function WebVideoSurface({uri,posterUri,accessibilityLabel,active=true,autoPlay=false,muted=true,loop=true,allowFullscreen=false,audioBehavior='unknown',onReady,onError,onRetry,onPlay}:Props){
  const rootRef=useRef<HTMLDivElement|null>(null),videoRef=useRef<HTMLVideoElement|null>(null);
  const[playing,setPlaying]=useState(false),[mutedState,setMutedState]=useState(muted),[failed,setFailed]=useState(false),[ready,setReady]=useState(false),[buffering,setBuffering]=useState(false),[currentTime,setCurrentTime]=useState(0),[duration,setDuration]=useState(0),[retrying,setRetrying]=useState(false),[fullscreen,setFullscreen]=useState(false);
  useEffect(()=>{const video=videoRef.current;setPlaying(false);setMutedState(muted);setFailed(false);setReady(false);setBuffering(Boolean(uri));setCurrentTime(0);setDuration(0);if(!video)return;video.muted=muted;if(!active){video.pause();return;}video.load();if(autoPlay&&uri)void video.play().catch(()=>undefined);},[active,autoPlay,muted,uri]);
  useEffect(()=>{if(!active||!uri||ready||failed)return;const timer=setTimeout(()=>{setFailed(true);setBuffering(false);onError?.();},15_000);return()=>clearTimeout(timer);},[active,failed,onError,ready,uri]);
  useEffect(()=>{if(!allowFullscreen||typeof document==='undefined')return;const webkitDocument=document as Document&{webkitFullscreenElement?:Element|null},update=()=>setFullscreen(document.fullscreenElement===rootRef.current||webkitDocument.webkitFullscreenElement===rootRef.current);document.addEventListener('fullscreenchange',update);document.addEventListener('webkitfullscreenchange',update);return()=>{document.removeEventListener('fullscreenchange',update);document.removeEventListener('webkitfullscreenchange',update);};},[allowFullscreen]);
  const markReady=()=>{const video=videoRef.current;if(video&&Number.isFinite(video.duration))setDuration(video.duration);setReady(true);setBuffering(false);setFailed(false);onReady?.();};
  const markFailed=()=>{setReady(false);setBuffering(false);setFailed(true);onError?.();};
  const togglePlayback=async()=>{const video=videoRef.current;if(!video||!uri)return;if(!video.paused){video.pause();return;}try{setFailed(false);setBuffering(true);await video.play();}catch{markFailed();}};
  const retry=async()=>{if(retrying)return;setRetrying(true);setFailed(false);setReady(false);setBuffering(true);try{await onRetry?.();videoRef.current?.load();}catch{markFailed();}finally{setRetrying(false);}};
  const toggleMuted=()=>{const video=videoRef.current;if(!video||audioBehavior==='silent')return;const next=!video.muted;video.muted=next;setMutedState(next);};
  const toggleFullscreen=async()=>{const root=rootRef.current as(HTMLDivElement&{webkitRequestFullscreen?:()=>void|Promise<void>})|null,video=videoRef.current as(HTMLVideoElement&{webkitEnterFullscreen?:()=>void})|null;if(typeof document==='undefined'||!root)return;if(document.fullscreenElement){try{await document.exitFullscreen();}catch{/* Playback continues if the browser declines the request. */}return;}try{if(root.requestFullscreen){await root.requestFullscreen();return;}}catch{/* Try the Safari paths below. */}try{if(root.webkitRequestFullscreen){await root.webkitRequestFullscreen();return;}video?.webkitEnterFullscreen?.();}catch{/* Playback continues if full screen is unavailable. */}};
  const seek=(event:ChangeEvent<HTMLInputElement>)=>{const video=videoRef.current,next=Number(event.currentTarget.value);if(!video||!duration||!Number.isFinite(next))return;video.currentTime=Math.max(0,Math.min(duration,next));setCurrentTime(video.currentTime);};
  const playLabel=playing?'Pause video':failed?'Try playing again':'Play video',soundLabel=audioBehavior==='silent'?'Silent video':mutedState?'Turn video sound on':'Mute video';
  return createElement('div',{ref:rootRef,style:rootStyle,'data-kivelli-video-player':'6'},
    createElement('div',{style:visualRegionStyle},
      createElement('video',{key:uri??'empty-video',ref:videoRef,...webVideoElementAttributes({uri,posterUri,active,autoPlay,muted:mutedState,loop}),'aria-label':accessibilityLabel,onLoadStart:()=>{setReady(false);setBuffering(Boolean(uri));},onLoadedMetadata:markReady,onCanPlay:markReady,onLoadedData:markReady,onError:markFailed,onPlay:()=>{setPlaying(true);setBuffering(false);onPlay?.();},onPlaying:()=>{setPlaying(true);setBuffering(false);},onPause:()=>setPlaying(false),onEnded:()=>setPlaying(false),onWaiting:()=>setBuffering(true),onTimeUpdate:(event)=>setCurrentTime(event.currentTarget.currentTime),onDurationChange:(event)=>setDuration(Number.isFinite(event.currentTarget.duration)?event.currentTarget.duration:0)}),
      failed?createElement('div',{role:'alert',style:statusOverlayStyle},createElement('strong',{style:statusTitleStyle},'Video needs another try'),createElement('span',{style:statusCopyStyle},'Refresh the secure link and reload playback.'),createElement('button',{type:'button','aria-label':'Try loading video again',disabled:retrying,onClick:()=>void retry(),style:retryButtonStyle},retrying?'Refreshing…':'Try again')):(!ready||buffering)?createElement('div',{'aria-live':'polite','aria-label':ready?'Video is buffering':'Video is loading',style:statusOverlayStyle},createElement('span',{style:loaderShellStyle},createElement('span',{style:loaderGlowStyle}),createElement('span',{style:webVideoLoaderStyle})),createElement('strong',{style:loadingTitleStyle},ready?'Just a moment':'Starting your video'),createElement('span',{style:statusCopyStyle},uri?(ready?'Buffering playback…':'Loading the moment…'):'Preparing secure video…')):null,
      allowFullscreen&&ready&&!failed?createElement('button',{type:'button','aria-label':fullscreen?'Exit full-screen video':'Open full-screen video',title:fullscreen?'Exit full screen':'Full screen',onClick:()=>void toggleFullscreen(),style:fullscreenButtonStyle},videoControlIcon(fullscreen?'collapse':'expand')):null),
    createElement('div',{style:controlBarStyle},
      createElement('button',{type:'button','aria-label':playLabel,title:playLabel,disabled:!uri||failed,onClick:()=>void togglePlayback(),style:{...webVideoControlButtonStyle,opacity:(!uri||failed)?0.35:1}},videoControlIcon(playing?'pause':'play')),
      createElement('button',{type:'button','aria-label':soundLabel,title:soundLabel,disabled:!uri||audioBehavior==='silent',onClick:toggleMuted,style:{...webVideoControlButtonStyle,opacity:(!uri||audioBehavior==='silent')?0.35:1}},videoControlIcon(mutedState||audioBehavior==='silent'?'muted':'volume')),
      createElement('div',{style:timelineStyle},createElement('input',{type:'range','aria-label':'Video progress',min:0,max:duration||1,step:.1,value:Math.min(currentTime,duration||1),disabled:!ready||!duration,onChange:seek,style:rangeStyle}),createElement('span',{style:timeStyle},`${formatVideoTime(currentTime)} / ${formatVideoTime(duration)}`))));
}

const rootStyle={position:'absolute' as const,inset:0,width:'100%',height:'100%',display:'flex',flexDirection:'column' as const,overflow:'hidden',backgroundColor:'#000'};
const visualRegionStyle={position:'relative' as const,flex:1,minHeight:0,overflow:'hidden',backgroundColor:'#000'};
const videoStyle={position:'absolute' as const,inset:0,width:'100%',height:'100%',display:'block',objectFit:'contain' as const,backgroundColor:'#000'};
const statusOverlayStyle={position:'absolute' as const,inset:0,zIndex:4,display:'flex',flexDirection:'column' as const,alignItems:'center',justifyContent:'center',gap:9,padding:20,background:'rgba(5,5,10,.82)',color:'#fff',textAlign:'center' as const};
const statusTitleStyle={fontSize:18,fontFamily:'Georgia,serif'};
const statusCopyStyle={maxWidth:360,color:'#BDB4C1',fontSize:12,lineHeight:1.45};
const loaderShellStyle={position:'relative' as const,width:52,height:52,display:'flex',alignItems:'center',justifyContent:'center'};
const loaderGlowStyle={position:'absolute' as const,inset:5,borderRadius:999,background:'radial-gradient(circle,rgba(231,90,145,.24),rgba(146,92,255,.08) 58%,transparent 72%)',boxShadow:'0 0 28px rgba(216,62,234,.28)'};
export const webVideoLoaderStyle={position:'absolute' as const,inset:3,borderRadius:999,border:'3px solid rgba(255,255,255,.14)',borderTopColor:'#F06A9D',borderRightColor:'#A676FF',animation:'kivelli-route-spin .78s linear infinite',boxShadow:'0 0 18px rgba(216,62,234,.18)'};
const loadingTitleStyle={fontSize:14,fontWeight:800,color:'#F8F2FA',letterSpacing:.1};
const retryButtonStyle={minWidth:118,minHeight:44,padding:'8px 16px',border:'1px solid rgba(255,255,255,.25)',borderRadius:999,background:'#D63D78',color:'#fff',fontSize:13,fontWeight:800,cursor:'pointer'};
const fullscreenButtonStyle={position:'absolute' as const,zIndex:7,right:10,top:10,width:48,height:48,padding:0,border:'1px solid rgba(255,255,255,.22)',borderRadius:24,background:'rgba(10,8,16,.78)',color:'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:'pointer',touchAction:'manipulation',WebkitTapHighlightColor:'transparent'};
const controlBarStyle={position:'relative' as const,zIndex:6,minHeight:64,flexShrink:0,display:'flex',flexDirection:'row' as const,flexWrap:'wrap' as const,alignItems:'center',justifyContent:'center',gap:10,padding:'9px 12px',background:'rgba(10,7,15,.98)',borderTop:'1px solid rgba(255,255,255,.22)'};
export const webVideoControlButtonStyle={width:44,height:44,minWidth:44,minHeight:44,padding:0,border:'none',borderRadius:0,background:'transparent',color:'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:'pointer',touchAction:'manipulation',WebkitTapHighlightColor:'transparent',appearance:'none' as const};
const timelineStyle={minWidth:0,flex:'1 1 220px',maxWidth:520,display:'flex',alignItems:'center',gap:7};
const rangeStyle={width:'100%',minHeight:24,accentColor:'#E75A91',cursor:'pointer'};
const timeStyle={color:'#BDB4C1',fontSize:10,fontVariantNumeric:'tabular-nums'};
