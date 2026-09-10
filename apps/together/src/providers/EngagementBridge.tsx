import {useEffect} from 'react';
import {AppState,Platform} from 'react-native';
import {usePathname} from 'expo-router';
import {useAuth} from '../hooks/useAuth';
import {useTogether} from '../store/useTogether';
import {invoke} from '../lib/api';
import {createClientRequestId} from '../lib/requestId';
import {engagementSurface,type EngagementSurface} from '../lib/engagement';

let visit:{user:string;id:string;last:number}|null=null;
function record(user:string,event:'page_view'|'foreground_ping'|'onboarding_step',surface:EngagementSurface,seconds=0,step?:'world'|'companion'|'scenario'){
 const now=Date.now();if(!visit||visit.user!==user||now-visit.last>30*60000)visit={user,id:createClientRequestId(),last:now};visit.last=now;
 void invoke('together-ops',{action:'engagement_event',id:createClientRequestId(),sessionId:visit.id,event,surface,seconds,step:step??null,platform:Platform.OS==='web'||Platform.OS==='ios'||Platform.OS==='android'?Platform.OS:'other'}).catch(()=>undefined);
}
export function useOnboardingEngagement(step:'world'|'companion'|'scenario'){
 const {session}=useAuth();const ready=useTogether(s=>!!s.snapshot&&s.snapshot.profile?.privacy_settings?.analytics!==false);
 useEffect(()=>{if(session?.user.id&&ready)record(session.user.id,'onboarding_step','onboarding',0,step);},[session?.user.id,ready,step]);
}
export function EngagementBridge(){
 const {session}=useAuth(),path=usePathname();const allowed=useTogether(s=>!!s.snapshot&&s.snapshot.profile?.privacy_settings?.analytics!==false);
 useEffect(()=>{
  const user=session?.user.id,surface=engagementSurface(path);if(!user||!allowed||!surface){if(!user||!allowed)visit=null;return;}
  const visible=()=>Platform.OS==='web'?typeof document!=='undefined'&&document.visibilityState==='visible':AppState.currentState==='active';
  let tick=Date.now(),wasVisible=visible();if(wasVisible)record(user,'page_view',surface);
  const visibility=()=>{const active=visible();tick=Date.now();if(active&&!wasVisible)record(user,'page_view',surface);wasVisible=active;};
  const sub=AppState.addEventListener('change',visibility);
  if(Platform.OS==='web'&&typeof document!=='undefined')document.addEventListener('visibilitychange',visibility);
  const timer=setInterval(()=>{const now=Date.now(),elapsed=now-tick;tick=now;if(visible()&&wasVisible&&elapsed>=1000&&elapsed<=65000)record(user,'foreground_ping',surface,Math.min(60,Math.floor(elapsed/1000)));wasVisible=visible();},60000);
  return()=>{const seconds=Math.floor((Date.now()-tick)/1000);if(visible()&&wasVisible&&seconds>0&&seconds<=60&&useTogether.getState().snapshot?.profile?.privacy_settings?.analytics!==false)record(user,'foreground_ping',surface,seconds);clearInterval(timer);sub.remove();if(Platform.OS==='web'&&typeof document!=='undefined')document.removeEventListener('visibilitychange',visibility);};
 },[session?.user.id,allowed,path]);
 return null;
}
