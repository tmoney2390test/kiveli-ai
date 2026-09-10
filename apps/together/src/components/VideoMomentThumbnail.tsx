import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

export function VideoMomentThumbnail({uri,contentFit='cover',onReady}:{uri:string;posterUri?:string|null;contentFit?:'cover'|'contain';onReady?:()=>void}){
  const[ready,setReady]=useState(false);
  const player=useVideoPlayer(uri,(instance)=>{instance.loop=false;instance.muted=true;instance.pause();});
  useEffect(()=>{setReady(false);player.muted=true;player.pause();player.currentTime=0;},[player,uri]);
  return <VideoView player={player} style={[StyleSheet.absoluteFill,{opacity:ready?1:0}]} contentFit={contentFit} nativeControls={false} playsInline onFirstFrameRender={()=>{setReady(true);onReady?.();}}/>;
}
