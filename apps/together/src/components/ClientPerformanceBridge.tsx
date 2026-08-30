import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { usePathname } from 'expo-router';
import { queueClientPerformance } from '../lib/api';
import { consumeRouteIntent, routePath } from '../lib/routeWarmup';
import { useTogether } from '../store/useTogether';

const appStartedAt=Date.now();

export function ClientPerformanceBridge(){
  const pathname=usePathname();
  const snapshot=useTogether((state)=>state.snapshot);
  const analyticsEnabled=snapshot?.profile?.privacy_settings?.analytics!==false;
  const appReadySent=useRef(false);
  useEffect(()=>{
    if(!snapshot||!analyticsEnabled||appReadySent.current)return;
    appReadySent.current=true;
    queueClientPerformance({surface:'client-navigation',operation:'app_ready',durationMs:Math.max(0,Date.now()-appStartedAt),success:true,metadata:{route:routePath(pathname),cache:'memory_or_network'}});
  },[analyticsEnabled,pathname,snapshot]);
  useEffect(()=>{
    if(!snapshot||!analyticsEnabled)return;
    let first=0,second=0,timer:ReturnType<typeof setTimeout>|null=null,cancelled=false;
    const settled=()=>{
      if(cancelled)return;
      const duration=consumeRouteIntent(pathname);
      if(duration!==null)queueClientPerformance({surface:'client-navigation',operation:'route_settled',durationMs:duration,success:true,metadata:{route:routePath(pathname)}});
    };
    if(Platform.OS==='web'&&typeof requestAnimationFrame==='function')first=requestAnimationFrame(()=>{second=requestAnimationFrame(settled);});
    else timer=setTimeout(settled,0);
    return()=>{cancelled=true;if(first)cancelAnimationFrame(first);if(second)cancelAnimationFrame(second);if(timer)clearTimeout(timer);};
  },[analyticsEnabled,pathname,snapshot]);
  return null;
}

export function useSurfaceReadyTiming(surface:string,operation:string,enabled=true){
  const started=useRef(Date.now()),sent=useRef(false);
  return useCallback(()=>{
    if(sent.current||!enabled)return;
    sent.current=true;
    queueClientPerformance({surface,operation,durationMs:Math.max(0,Date.now()-started.current),success:true,metadata:{kind:'primary_visual'}});
  },[enabled,operation,surface]);
}
