import { useEffect } from 'react';
import { usePathname } from 'expo-router';
import type { GeneratedMedia } from '../types';
import { manageMedia } from '../lib/api';
import { missingMediaIds, pendingMediaIds } from '../lib/mediaReconciliation';
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
  const chatOwnsPolling=pathname==='/chat'||pathname==='/group-chat';

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
