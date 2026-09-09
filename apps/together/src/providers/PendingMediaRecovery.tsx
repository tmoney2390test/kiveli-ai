import { useEffect } from 'react';
import { usePathname } from 'expo-router';
import { AppState } from 'react-native';
import type { GeneratedMedia } from '../types';
import { loadMediaLibrary, manageMedia } from '../lib/api';
import { missingMediaIds, pendingMediaIds } from '../lib/mediaReconciliation';
import { subscribeToWebPageResume } from '../lib/webPageLifecycle';
import { useTogether } from '../store/useTogether';
import { useNetworkStatus } from './NetworkStatusProvider';

const BASE_POLL_MS=4_000;
const MAX_POLL_MS=24_000;

/**
 * Keeps generated media moving when the user leaves the originating chat.
 * Chat screens already reconcile their own richer timeline, so the global
 * bridge handles every other surface without issuing duplicate polls.
 */
export function PendingMediaRecovery(){
  const pathname=usePathname(),{online,phase}=useNetworkStatus();
  const snapshot=useTogether((state)=>state.snapshot),upsertMedia=useTogether((state)=>state.upsertMedia),removeMedia=useTogether((state)=>state.removeMedia);
  const ids=pendingMediaIds(snapshot?.generatedMedia),scope=ids.join(',');
  const chatOwnsPolling=pathname==='/chat'||pathname==='/group-chat',snapshotReady=Boolean(snapshot);

  useEffect(()=>{
    if(!online||!snapshotReady||chatOwnsPolling||pathname==='/moments')return;
    let stopped=false,running=false;
    const reconcile=async()=>{
      if(stopped||running)return;running=true;
      try{
        const result=await loadMediaLibrary({limit:40});
        if(stopped)return;
        for(const media of result.media??[])upsertMedia(media);
      }catch{/* A pending-ID poll or the next foreground pass can recover it. */}
      finally{running=false;}
    };
    void reconcile();
    const appState=AppState.addEventListener('change',(state)=>{if(state==='active')void reconcile();});
    const unsubscribeWeb=subscribeToWebPageResume(()=>void reconcile());
    return()=>{stopped=true;appState.remove();unsubscribeWeb();};
  },[chatOwnsPolling,online,pathname,snapshotReady,upsertMedia]);

  useEffect(()=>{
    if(!online||chatOwnsPolling||!scope)return;
    let stopped=false,timer:ReturnType<typeof setTimeout>|undefined,failures=0;
    const poll=async()=>{
      if(stopped)return;
      if(typeof document!=='undefined'&&document.visibilityState==='hidden'){timer=setTimeout(poll,BASE_POLL_MS);return;}
      const requested=scope.split(',').filter(Boolean);
      try{
        const result=await manageMedia<{media:GeneratedMedia[]}>({action:'batch_status',mediaIds:requested});
        if(stopped)return;
        failures=0;
        result.media.forEach(upsertMedia);
        missingMediaIds(requested,result.media).forEach(removeMedia);
      }catch{failures+=1;}
      if(!stopped)timer=setTimeout(poll,Math.min(MAX_POLL_MS,BASE_POLL_MS*2**failures));
    };
    timer=setTimeout(poll,phase==='reconnected'?100:800);
    return()=>{stopped=true;if(timer)clearTimeout(timer);};
  },[chatOwnsPolling,online,phase,removeMedia,scope,upsertMedia]);
  return null;
}
