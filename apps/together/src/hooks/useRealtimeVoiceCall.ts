import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { ApiError, manageCall, type ManageCallResult, type VoiceCallBilling } from '../lib/api';
import { createClientRequestId } from '../lib/requestId';
import { transitionRealtimeCall, XaiRealtimeVoiceClient, type FinalVoiceTranscript, type RealtimeCallEvent, type RealtimeCallState, type RealtimeVoiceClient } from '../lib/realtimeVoice';
import type { VoiceCallSession } from '../types';

type UseRealtimeVoiceCallInput={characterInstanceId?:string;conversationId?:string};
type EndReason='user_ended'|'route_unmounted'|'app_backgrounded'|'token_expired'|'provider_closed'|'connection_failed'|'credits_exhausted';

export function useRealtimeVoiceCall(input:UseRealtimeVoiceCallInput){
  const[state,dispatch]=useReducer((current:RealtimeCallState,event:RealtimeCallEvent)=>transitionRealtimeCall(current,event),'idle');
  const[call,setCall]=useState<VoiceCallSession|null>(null),[error,setError]=useState(''),[unavailable,setUnavailable]=useState('');
  const[muted,setMutedState]=useState(false),[speaker,setSpeakerState]=useState(true),[speaking,setSpeaking]=useState<'user'|'assistant'|null>(null),[partialTranscript,setPartialTranscript]=useState(''),[partialTranscriptRole,setPartialTranscriptRole]=useState<'user'|'assistant'|null>(null);
  const[billing,setBilling]=useState<VoiceCallBilling|null>(null);
  const[elapsed,setElapsed]=useState(0);
  const requestId=useRef(createClientRequestId()),clientRef=useRef<RealtimeVoiceClient|null>(null),callRef=useRef<VoiceCallSession|null>(null),startingRef=useRef(false);
  const stateRef=useRef<RealtimeCallState>('idle'),eventsRef=useRef<FinalVoiceTranscript[]>([]),conversationProviderId=useRef(''),reconnectCount=useRef(0),firstConnectedAt=useRef(0),ending=useRef(false),mounted=useRef(true);
  const partialTranscriptRef=useRef<{role:'user'|'assistant';content:string}|null>(null),transcriptUploadRef=useRef<Promise<void>>(Promise.resolve()),billedMinuteRef=useRef(0),meteringRef=useRef(false);
  const reconnectRef=useRef<(reason?:string)=>Promise<void>>(()=>Promise.resolve()),endRef=useRef<(reason?:EndReason)=>Promise<void>>(()=>Promise.resolve()),startRef=useRef<()=>Promise<void>>(()=>Promise.resolve());
  useEffect(()=>{stateRef.current=state;},[state]);
  useEffect(()=>{callRef.current=call;},[call]);

  const connect=useCallback(async(result:ManageCallResult,greet:boolean)=>{
    if(!result.clientSecret||!result.expiresAt||!result.clientConfiguration)throw new Error("The call provider didn't return a usable connection.");
    dispatch('CONNECT');
    await clientRef.current?.connect({clientSecret:result.clientSecret,expiresAt:result.expiresAt,clientConfiguration:result.clientConfiguration,resumeConversationId:conversationProviderId.current||undefined,greet});
  },[]);

  useEffect(()=>{
    mounted.current=true;ending.current=false;
    if(!input.characterInstanceId||!input.conversationId)return;
    const callbacks={
      onConnected:(providerConversationId?:string)=>{if(providerConversationId)conversationProviderId.current=providerConversationId;if(!firstConnectedAt.current)firstConnectedAt.current=Date.now();dispatch('CONNECTED');setError('');const active=callRef.current;if(active)void manageCall({action:'connected',callSessionId:active.id,providerSessionId:providerConversationId}).then((result)=>{if(result.call&&mounted.current)setCall(result.call);}).catch(()=>undefined);},
      onClosed:()=>{if(!ending.current)void reconnectRef.current('provider_closed');},
      onTranscript:(event:FinalVoiceTranscript)=>{eventsRef.current=[...eventsRef.current,event].slice(-100);partialTranscriptRef.current=null;setPartialTranscript('');setPartialTranscriptRole(null);const active=callRef.current;if(active)transcriptUploadRef.current=transcriptUploadRef.current.catch(()=>undefined).then(async()=>{await manageCall({action:'transcript',callSessionId:active.id,events:[event]});});},
      onPartialTranscript:(role:'user'|'assistant',content:string)=>{const previous=partialTranscriptRef.current,next={role,content:role==='assistant'&&previous?.role==='assistant'?`${previous.content}${content}`:content};partialTranscriptRef.current=next;setPartialTranscript(next.content);setPartialTranscriptRole(role);},
      onSpeaking:(who:'user'|'assistant',active:boolean)=>setSpeaking(active?who:(current)=>current===who?null:current),
      onError:(caught:Error,recoverable:boolean)=>{setError(caught.message);if(!recoverable){dispatch('FAIL');void endRef.current('connection_failed');}},
    };
    const client=new XaiRealtimeVoiceClient(callbacks);clientRef.current=client;
    if(Platform.OS!=='web')void startRef.current();
    return()=>{mounted.current=false;void endRef.current('route_unmounted');};
  },[connect,input.characterInstanceId,input.conversationId]);

  const startCall=useCallback(async()=>{
    const characterInstanceId=input.characterInstanceId,conversationId=input.conversationId,client=clientRef.current;
    if(!characterInstanceId||!conversationId||!client||startingRef.current||ending.current)return;
    startingRef.current=true;requestId.current=createClientRequestId();const attemptId=requestId.current;let serverCreateStarted=false;setError('');setUnavailable('');dispatch('CREATE');
    try{
      const permission=await client.requestMicrophonePermission();
      if(permission!=='granted')throw new Error('Microphone permission and live audio are required. Tap Call and allow microphone access.');
      serverCreateStarted=true;
      const result=await manageCall({action:'create',characterInstanceId,conversationId,requestId:attemptId});
      if(!mounted.current){if(result.call)await manageCall({action:'end',callSessionId:result.call.id,endedReason:'route_unmounted'}).catch(()=>manageCall({action:'abandon',requestId:attemptId}).catch(()=>undefined));return;}
      if(result.status==='not_configured'){setUnavailable(result.message??"Live voice calls aren't connected yet.");dispatch('FAIL');return;}
      if(!result.call)throw new Error("The call couldn't be created.");
      setCall(result.call);callRef.current=result.call;if(result.billing){setBilling(result.billing);billedMinuteRef.current=result.billing.chargedMinutes;}dispatch('SESSION_CREATED');await connect(result,true);
    }catch(caught){if(serverCreateStarted&&!callRef.current)await manageCall({action:'abandon',requestId:attemptId}).catch(()=>undefined);if(!mounted.current)return;const message=caught instanceof Error?caught.message:"The call couldn't connect.";setError(message);dispatch('FAIL');if(callRef.current)await endRef.current('connection_failed');}
    finally{startingRef.current=false;}
  },[connect,input.characterInstanceId,input.conversationId]);
  startRef.current=startCall;

  const reconnect=useCallback(async()=>{
    const active=callRef.current;if(!active||ending.current||terminal(stateRef.current))return;
    if(reconnectCount.current>=2){setError('The call connection could not be restored.');dispatch('FAIL');await endRef.current('connection_failed');return;}
    reconnectCount.current+=1;dispatch('CONNECTION_LOST');
    try{
      await manageCall({action:'reconnecting',callSessionId:active.id,reconnectCount:reconnectCount.current});
      const refreshed=await manageCall({action:'refresh_token',callSessionId:active.id});dispatch('RETRY');await connect(refreshed,false);
    }catch(caught){setError(caught instanceof Error?caught.message:'Reconnecting failed.');setTimeout(()=>{if(!ending.current)void reconnectRef.current('retry_failed');},700);}
  },[connect]);
  reconnectRef.current=reconnect;

  const endCall=useCallback(async(reason:EndReason='user_ended')=>{
    const client=clientRef.current,stoppingLocalAudio=client?.disconnect().catch(()=>undefined);
    if(mounted.current){setSpeaking(null);setPartialTranscript('');setPartialTranscriptRole(null);}
    // A second end signal (route teardown, app backgrounding, or a repeated
    // tap) must still retry local silence even though server finalization is
    // already in progress.
    if(ending.current){await stoppingLocalAudio;return;}
    ending.current=true;if(mounted.current)dispatch('END');
    const active=callRef.current,clientUsage=client?.usage()??{connectedDurationMs:0,inputAudioDurationMs:0,outputAudioDurationMs:0};
    const usage={...clientUsage,connectedDurationMs:firstConnectedAt.current?Date.now()-firstConnectedAt.current:0,reconnectCount:reconnectCount.current};
    await stoppingLocalAudio;await transcriptUploadRef.current.catch(()=>undefined);
    try{if(active){const action=reason==='connection_failed'?'fail':'end';const result=await manageCall(action==='fail'?{action,callSessionId:active.id,failureCode:'connection_failed',reason:'The realtime connection could not be restored.',usage,events:eventsRef.current}:{action,callSessionId:active.id,endedReason:reason,usage,events:eventsRef.current});if(result.call&&mounted.current)setCall(result.call);}}catch(caught){if(mounted.current)setError(caught instanceof Error?caught.message:'The call ended, but its history is still being finalized.');}
    if(mounted.current)dispatch('ENDED');
  },[]);
  endRef.current=endCall;

  useEffect(()=>{const subscription=AppState.addEventListener('change',(next)=>{if(next!=='active'&&!terminal(stateRef.current))void endRef.current('app_backgrounded');});return()=>subscription.remove();},[]);
  useEffect(()=>{
    const callSessionId=call?.id;
    if(!callSessionId||!['connected','reconnecting'].includes(state))return;
    let stopped=false,busy=false;
    const heartbeat=()=>{if(stopped||busy)return;busy=true;void manageCall({action:'heartbeat',callSessionId}).then((result)=>{if(!stopped&&result.call){setCall(result.call);callRef.current=result.call;}}).catch(()=>undefined).finally(()=>{busy=false;});};
    heartbeat();const timer=setInterval(heartbeat,20_000);
    return()=>{stopped=true;clearInterval(timer);};
  },[call?.id,state]);
  useEffect(()=>{if(state!=='connected'){if(state==='ended'||state==='failed')setElapsed(firstConnectedAt.current?Math.floor((Date.now()-firstConnectedAt.current)/1_000):0);return;}const timer=setInterval(()=>setElapsed(firstConnectedAt.current?Math.floor((Date.now()-firstConnectedAt.current)/1_000):0),1_000);return()=>clearInterval(timer);},[state]);
  useEffect(()=>{
    const active=callRef.current;
    if(state!=='connected'||!active||ending.current||meteringRef.current)return;
    const startedMinute=Math.floor(elapsed/60)+1;
    if(startedMinute<=billedMinuteRef.current)return;
    meteringRef.current=true;
    void manageCall({action:'meter',callSessionId:active.id,minute:startedMinute}).then((result)=>{
      if(result.billing){billedMinuteRef.current=result.billing.chargedMinutes;if(mounted.current)setBilling(result.billing);}
    }).catch((caught)=>{
      if(!mounted.current)return;
      const message=caught instanceof Error?caught.message:'The next voice minute could not be started.';
      setError(message);
      if(caught instanceof ApiError&&caught.code==='INSUFFICIENT_CREDITS')void endRef.current('credits_exhausted');
    }).finally(()=>{meteringRef.current=false;});
  },[elapsed,state]);

  const setMuted=useCallback(async(value:boolean)=>{await clientRef.current?.setMuted(value);setMutedState(value);},[]);
  const setSpeakerEnabled=useCallback(async(value:boolean)=>{await clientRef.current?.setSpeakerEnabled(value);setSpeakerState(value);},[]);
  return{state,call,error,unavailable,muted,speaker,speaking,partialTranscript,partialTranscriptRole,elapsed,billing,speakerControlAvailable:clientRef.current?.speakerControlAvailable??true,startCall,setMuted,setSpeakerEnabled,endCall};
}

function terminal(state:RealtimeCallState){return state==='ending'||state==='ended'||state==='failed';}
