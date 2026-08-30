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

export function webVideoElementStyle(started:boolean){
  return started?videoStyle:preloadVideoStyle;
}

export function webVideoElementAttributes({uri,posterUri,active=true,autoPlay=false,muted=true,loop=true,started=true}:Pick<Props,'uri'|'posterUri'|'active'|'autoPlay'|'muted'|'loop'>&{started?:boolean}){
  return{
    src:uri??undefined,
    poster:started?posterUri??undefined:undefined,
    controls:false,
    autoPlay:autoPlay&&active,
    muted,
    defaultMuted:muted,
    loop,
    playsInline:true,
    preload:'metadata' as const,
    'webkit-playsinline':'true',
    style:webVideoElementStyle(started),
  };
}

export function WebVideoSurface({uri,posterUri,accessibilityLabel,active=true,autoPlay=false,muted=true,loop=true,onReady,onError,onPlay}:Props){
  const videoRef=useRef<HTMLVideoElement|null>(null);
  const[started,setStarted]=useState(false),[playing,setPlaying]=useState(false),[mutedState,setMutedState]=useState(muted),[failed,setFailed]=useState(false);

  useEffect(()=>{
    const video=videoRef.current;
    setStarted(false);setPlaying(false);setMutedState(muted);setFailed(false);
    if(!video)return;
    video.muted=muted;
    if(!active){video.pause();return;}
    video.load();
    if(autoPlay&&uri){
      const playAttempt=video.play();
      setStarted(true);
      void playAttempt.catch(()=>setStarted(false));
    }
  },[active,autoPlay,muted,uri]);

  const togglePlayback=async()=>{
    const video=videoRef.current;
    if(!video||!uri)return;
    if(!video.paused){video.pause();return;}
    try{
      setFailed(false);
      const playAttempt=video.play();
      setStarted(true);
      await playAttempt;
    }catch{
      setStarted(false);setFailed(true);onError?.();
    }
  };
  const toggleMuted=()=>{
    const video=videoRef.current;
    if(!video)return;
    const next=!video.muted;video.muted=next;setMutedState(next);
  };
  const ready=()=>onReady?.();
  const playLabel=failed?'Try playing again':'Play video';

  return createElement('div',{style:rootStyle,'data-kivelli-video-player':'3'},
    createElement('div',{style:visualRegionStyle},
      !started&&posterUri?createElement('img',{src:posterUri,alt:'','aria-hidden':'true',draggable:false,style:posterStyle}):null,
      createElement('video',{
        key:uri??'empty-video',ref:videoRef,
        ...webVideoElementAttributes({uri,posterUri,active,autoPlay,muted:mutedState,loop,started}),
        'aria-label':accessibilityLabel,
        onLoadedMetadata:ready,onCanPlay:ready,onLoadedData:ready,
        onError:()=>{setStarted(false);setFailed(true);onError?.();},
        onPlay:()=>{setStarted(true);setPlaying(true);onPlay?.();},
        onPlaying:()=>{setStarted(true);setPlaying(true);},
        onPause:()=>setPlaying(false),onEnded:()=>setPlaying(false),
      }),
      !started&&uri?createElement('button',{
        type:'button','aria-label':playLabel,onClick:()=>void togglePlayback(),style:centerPlayStyle,
      },createElement('span',{'aria-hidden':true,style:playGlyphStyle},'▶'),createElement('span',null,playLabel)):null,
    ),
    started?createElement('div',{style:controlBarStyle},
      createElement('button',{type:'button','aria-label':playing?'Pause video':'Resume video',onClick:()=>void togglePlayback(),style:controlButtonStyle},playing?'Pause':'Play'),
      createElement('button',{type:'button','aria-label':mutedState?'Turn video sound on':'Mute video',onClick:toggleMuted,style:controlButtonStyle},mutedState?'Sound on':'Mute'),
    ):null,
  );
}

const rootStyle={position:'absolute' as const,inset:0,width:'100%',height:'100%',display:'flex',flexDirection:'column' as const,overflow:'hidden',backgroundColor:'#000'};
const visualRegionStyle={position:'relative' as const,flex:1,minHeight:0,overflow:'hidden',backgroundColor:'#000'};
const videoStyle={position:'absolute' as const,inset:0,width:'100%',height:'100%',display:'block',objectFit:'contain' as const,backgroundColor:'#000'};
const preloadVideoStyle={position:'absolute' as const,left:0,top:0,width:1,height:1,opacity:0,pointerEvents:'none' as const};
const posterStyle={position:'absolute' as const,inset:0,width:'100%',height:'100%',display:'block',objectFit:'contain' as const,backgroundColor:'#000'};
const centerPlayStyle={position:'absolute' as const,zIndex:5,left:'50%',top:'50%',transform:'translate(-50%, -50%)',minWidth:152,minHeight:56,padding:'12px 20px',display:'flex',alignItems:'center',justifyContent:'center',gap:9,border:'1px solid rgba(255,255,255,.42)',borderRadius:999,background:'rgba(20,12,27,.94)',boxShadow:'0 12px 34px rgba(0,0,0,.52)',color:'#fff',fontSize:16,fontWeight:800,cursor:'pointer',touchAction:'manipulation',WebkitTapHighlightColor:'transparent'};
const playGlyphStyle={fontSize:19,lineHeight:1,color:'#fff'};
const controlBarStyle={position:'relative' as const,zIndex:6,minHeight:58,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',gap:10,padding:'7px 12px',background:'rgba(10,7,15,.96)',borderTop:'1px solid rgba(255,255,255,.18)'};
const controlButtonStyle={minWidth:96,minHeight:44,padding:'8px 16px',border:'1px solid rgba(255,255,255,.18)',borderRadius:999,background:'rgba(255,255,255,.10)',color:'#fff',fontSize:13,fontWeight:800,cursor:'pointer',touchAction:'manipulation',WebkitTapHighlightColor:'transparent'};
