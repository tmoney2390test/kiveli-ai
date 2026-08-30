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

export function webVideoElementAttributes({uri,posterUri,active=true,autoPlay=true,muted=true,loop=true}:Pick<Props,'uri'|'posterUri'|'active'|'autoPlay'|'muted'|'loop'>){
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

export function WebVideoSurface({uri,posterUri,accessibilityLabel,active=true,autoPlay=true,muted=true,loop=true,onReady,onError,onPlay}:Props){
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
  const failedLabel=failed?'Try playing again':'Play video';

  return createElement('div',{style:rootStyle},
    createElement('video',{
      key:uri??'empty-video',ref:videoRef,
      ...webVideoElementAttributes({uri,posterUri,active,autoPlay,muted:mutedState,loop}),
      'aria-label':accessibilityLabel,
      onLoadedMetadata:ready,onCanPlay:ready,onLoadedData:ready,
      onError:()=>{setFailed(true);onError?.();},
      onPlay:()=>{setPlaying(true);onPlay?.();},
      onPlaying:()=>setPlaying(true),onPause:()=>setPlaying(false),onEnded:()=>setPlaying(false),
    }),
    !playing&&uri?createElement('button',{
      type:'button','aria-label':failedLabel,onClick:()=>void togglePlayback(),style:centerPlayStyle,
    },createElement('span',{'aria-hidden':true,style:playGlyphStyle},'▶'),createElement('span',null,failedLabel)):null,
    playing?createElement('div',{style:controlBarStyle},
      createElement('button',{type:'button','aria-label':'Pause video',onClick:()=>void togglePlayback(),style:controlButtonStyle},'Pause'),
      createElement('button',{type:'button','aria-label':mutedState?'Turn video sound on':'Mute video',onClick:toggleMuted,style:controlButtonStyle},mutedState?'Sound on':'Mute'),
    ):null,
  );
}

const rootStyle={position:'absolute' as const,inset:0,width:'100%',height:'100%',display:'block',overflow:'hidden',backgroundColor:'#000'};
const videoStyle={position:'absolute' as const,inset:0,width:'100%',height:'100%',display:'block',objectFit:'contain' as const,backgroundColor:'#000'};
const centerPlayStyle={position:'absolute' as const,zIndex:5,left:'50%',top:'50%',transform:'translate(-50%, -50%)',minWidth:136,minHeight:52,padding:'12px 18px',display:'flex',alignItems:'center',justifyContent:'center',gap:9,border:'1px solid rgba(255,255,255,.32)',borderRadius:999,background:'rgba(20,12,27,.90)',boxShadow:'0 12px 34px rgba(0,0,0,.48)',color:'#fff',fontSize:15,fontWeight:800,cursor:'pointer',touchAction:'manipulation',WebkitTapHighlightColor:'transparent'};
const playGlyphStyle={fontSize:18,lineHeight:1,color:'#fff'};
const controlBarStyle={position:'absolute' as const,zIndex:5,left:12,bottom:12,display:'flex',gap:8,padding:6,borderRadius:999,background:'rgba(10,7,15,.78)',border:'1px solid rgba(255,255,255,.18)'};
const controlButtonStyle={minWidth:62,minHeight:44,padding:'8px 12px',border:0,borderRadius:999,background:'rgba(255,255,255,.12)',color:'#fff',fontSize:12,fontWeight:800,cursor:'pointer',touchAction:'manipulation',WebkitTapHighlightColor:'transparent'};
