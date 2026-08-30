import{createElement,useEffect,useRef,useState}from'react';

type Props={
  uri:string|null;
  posterUri?:string|null;
  accessibilityLabel:string;
  active?:boolean;
  autoPlay?:boolean;
  muted?:boolean;
  loop?:boolean;
  onReady?:()=>void;
  onError?:()=>void;
  onPlay?:()=>void;
};

export function webVideoElementAttributes({uri,posterUri,active=true,autoPlay=false,muted=true,loop=true}:Pick<Props,'uri'|'posterUri'|'active'|'autoPlay'|'muted'|'loop'>){
  return{
    src:uri??undefined,
    poster:posterUri??undefined,
    controls:false,
    autoPlay:autoPlay&&active,
    muted,
    defaultMuted:muted,
    loop,
    playsInline:true,
    preload:'metadata' as const,
    'webkit-playsinline':'true',
    style:videoStyle,
  };
}

export function WebVideoSurface({uri,posterUri,accessibilityLabel,active=true,autoPlay=false,muted=true,loop=true,onReady,onError,onPlay}:Props){
  const videoRef=useRef<HTMLVideoElement|null>(null);
  const[playing,setPlaying]=useState(false),[mutedState,setMutedState]=useState(muted),[failed,setFailed]=useState(false);

  useEffect(()=>{
    const video=videoRef.current;
    setPlaying(false);setMutedState(muted);setFailed(false);
    if(!video)return;
    video.muted=muted;
    if(!active){video.pause();return;}
    video.load();
    if(autoPlay&&uri)void video.play().catch(()=>undefined);
  },[active,autoPlay,muted,uri]);

  const togglePlayback=async()=>{
    const video=videoRef.current;
    if(!video||!uri)return;
    if(!video.paused){video.pause();return;}
    try{setFailed(false);await video.play();}
    catch{setFailed(true);onError?.();}
  };
  const toggleMuted=()=>{
    const video=videoRef.current;
    if(!video)return;
    const next=!video.muted;video.muted=next;setMutedState(next);
  };
  const ready=()=>onReady?.();
  const playLabel=playing?'Pause video':failed?'Try playing again':'Play video';

  return createElement('div',{style:rootStyle,'data-kivelli-video-player':'4'},
    createElement('div',{style:visualRegionStyle},
      createElement('video',{
        key:uri??'empty-video',ref:videoRef,
        ...webVideoElementAttributes({uri,posterUri,active,autoPlay,muted:mutedState,loop}),
        'aria-label':accessibilityLabel,
        onLoadedMetadata:ready,onCanPlay:ready,onLoadedData:ready,
        onError:()=>{setFailed(true);onError?.();},
        onPlay:()=>{setPlaying(true);onPlay?.();},
        onPlaying:()=>setPlaying(true),onPause:()=>setPlaying(false),onEnded:()=>setPlaying(false),
      }),
    ),
    createElement('div',{style:controlBarStyle},
      createElement('button',{type:'button','aria-label':playLabel,disabled:!uri,onClick:()=>void togglePlayback(),style:controlButtonStyle},playing?'Pause':failed?'Try again':'Play video'),
      createElement('button',{type:'button','aria-label':mutedState?'Turn video sound on':'Mute video',disabled:!uri,onClick:toggleMuted,style:controlButtonStyle},mutedState?'Sound on':'Mute'),
    ),
  );
}

const rootStyle={position:'absolute' as const,inset:0,width:'100%',height:'100%',display:'flex',flexDirection:'column' as const,overflow:'hidden',backgroundColor:'#000'};
const visualRegionStyle={position:'relative' as const,flex:1,minHeight:0,overflow:'hidden',backgroundColor:'#000'};
const videoStyle={position:'absolute' as const,inset:0,width:'100%',height:'100%',display:'block',objectFit:'contain' as const,backgroundColor:'#000'};
const controlBarStyle={position:'relative' as const,zIndex:6,minHeight:62,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',gap:10,padding:'9px 12px',background:'rgba(10,7,15,.98)',borderTop:'1px solid rgba(255,255,255,.22)'};
const controlButtonStyle={minWidth:110,minHeight:44,padding:'8px 16px',border:'1px solid rgba(255,255,255,.22)',borderRadius:999,background:'rgba(255,255,255,.11)',color:'#fff',fontSize:14,fontWeight:800,cursor:'pointer',touchAction:'manipulation',WebkitTapHighlightColor:'transparent'};
