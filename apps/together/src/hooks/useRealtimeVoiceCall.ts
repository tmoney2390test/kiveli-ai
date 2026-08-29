import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, manageCall, type ManageCallResult, type VoiceCallBilling, type VoiceRouteOption } from '../lib/api';
import { createClientRequestId } from '../lib/requestId';
import { createRealtimeVoiceClient, resolvePreferredVoiceRoute, transitionRealtimeCall, voiceRouteShellOptions, type FinalVoiceTranscript, type RealtimeCallEvent, type RealtimeCallState, type RealtimeVoiceCallbacks, type RealtimeVoiceClient, type VoiceCallRoute } from '../lib/realtimeVoice';
import type { VoiceCallSession } from '../types';

type UseRealtimeVoiceCallInput={characterInstanceId?:string;conversationId?:string};
type EndReason='user_ended'|'route_unmounted'|'app_backgrounded'|'token_expired'|'provider_closed'|'connection_failed'|'credits_exhausted';
const ROUTE_STORAGE_KEY='kivelle:preferred_voice_call_route';
const IMMEDIATE_ROUTE_OPTIONS:VoiceRouteOption[]=voiceRouteShellOptions.map((option)=>({
  ...option,
  description:'',
  includedMinutes:0,
  available:true,
  billing:{route:option.route,creditsPerMinute:option.creditsPerMinute,creditBalance:0,chargedMinutes:0,remainingMinutes:0,includedMinutes:0,includedMinutesUsed:0,includedMinutesRemaining:0},
}));

export function useRealtimeVoiceCall(input:UseRealtimeVoiceCallInput){
  const[state,dispatch]=useReducer((current:RealtimeCallState,event:RealtimeCallEvent)=>transitionRealtimeCall(current,event),'idle');
  const[call,setCall]=useState<VoiceCallSession|null>(null),[error,setError]=useState(''),[unavailable,setUnavailable]=useState('');
  const[muted,setMutedState]=useState(false),[speaker,setSpeakerState]=useState(true),[speaking,setSpeaking]=useState<'user'|'assistant'|null>(null),[partialTranscript,setPartialTranscript]=useState(''),[partialTranscriptRole,setPartialTranscriptRole]=useState<'user'|'assistant'|null>(null);
  const[billing,setBilling]=useState<VoiceCallBilling|null>(null),[routeOptions,setRouteOptions]=useState<VoiceRouteOption[]>(IMMEDIATE_ROUTE_OPTIONS),[route,setRouteState]=useState<VoiceCallRoute>('standard');
  const[elapsed,setElapsed]=useState(0);
  const requestId=useRef(createClientRequestId()),clientRef=useRef<RealtimeVoiceClient|null>(null),callRef=useRef<VoiceCallSession|null>(null),startingRef=useRef(false),callbacksRef=useRef<RealtimeVoiceCallbacks|null>(null);
  const stateRef=useRef<RealtimeCallState>('idle'),routeRef=useRef<VoiceCallRoute>('standard'),conversationProviderId=useRef(''),reconnectCount=useRef(0),firstConnectedAt=useRef(0),ending=useRef(false),mounted=useRef(true);
  const partialTranscriptRef=useRef<{role:'user'|'assistant';content:string}|null>(null),pendingEventsRef=useRef(new Map<string,FinalVoiceTranscript>()),transcriptUploadRef=useRef<Promise<void>>(Promise.resolve()),usageUploadRef=useRef<Promise<void>>(Promise.resolve()),billedMinuteRef=useRef(0),billingStartedAtRef=useRef(0),meteringRef=useRef(false);
  const reconnectRef=useRef<(reason?:string)=>Promise<void>>(()=>Promise.resolve()),endRef=useRef<(reason?:EndReason)=>Promise<void>>(()=>Promise.resolve());
  useEffect(()=>{stateRef.current=state;},[state]);
  useEffect(()=>{callRef.current=call;},[call]);
  useEffect(()=>{routeRef.current=route;},[route]);

  const flushTranscriptOutbox=useCallback(async()=>{
    const active=callRef.current;if(!active)return;
    while(pendingEventsRef.current.size){
      const batch=[...pendingEventsRef.current.values()].sort((a,b)=>a.sequence-b.sequence).slice(0,50);
      const result=await manageCall({action:'transcript',callSessionId:active.id,events:batch});
      if(result.call){callRef.current=result.call;if(mounted.current)setCall(result.call);const startedAt=Date.parse(result.call.billing_started_at??'');if(Number.isFinite(startedAt))billingStartedAtRef.current=startedAt;}
      if(result.billing){billedMinuteRef.current=result.billing.chargedMinutes;if(mounted.current)setBilling(result.billing);}
      for(const event of batch)pendingEventsRef.current.delete(event.providerEventId??`sequence:${event.sequence}:${event.role}`);
    }
  },[]);

  const connect=useCallback(async(result:ManageCallResult,greet:boolean)=>{
    if(!result.clientSecret||!result.expiresAt||!result.clientConfiguration)throw new Error("The call provider didn't return a usable connection.");
    const configuredRoute=result.clientConfiguration.route;
    if(!clientRef.current||configuredRoute!==routeRef.current){await clientRef.current?.disconnect().catch(()=>undefined);clientRef.current=createRealtimeVoiceClient(configuredRoute,callbacksRef.current!);routeRef.current=configuredRoute;setRouteState(configuredRoute);}
    dispatch('CONNECT');
    await clientRef.current.connect({clientSecret:result.clientSecret,expiresAt:result.expiresAt,clientConfiguration:result.clientConfiguration,resumeConversationId:conversationProviderId.current||undefined,greet});
  },[]);

  useEffect(()=>{
    mounted.current=true;ending.current=false;
    if(!input.characterInstanceId||!input.conversationId)return;
    callbacksRef.current={
      onConnected:(providerConversationId?:string)=>{if(providerConversationId)conversationProviderId.current=providerConversationId;if(!firstConnectedAt.current)firstConnectedAt.current=Date.now();dispatch('CONNECTED');setError('');const active=callRef.current;if(active)void manageCall({action:'connected',callSessionId:active.id,providerSessionId:providerConversationId}).then((result)=>{if(result.call&&mounted.current)setCall(result.call);}).catch(()=>undefined);},
      onClosed:()=>{if(!ending.current)void reconnectRef.current('provider_closed');},
      onTranscript:(event:FinalVoiceTranscript)=>{const key=event.providerEventId??`sequence:${event.sequence}:${event.role}`;pendingEventsRef.current.set(key,event);partialTranscriptRef.current=null;setPartialTranscript('');setPartialTranscriptRole(null);transcriptUploadRef.current=transcriptUploadRef.current.catch(()=>undefined).then(flushTranscriptOutbox).catch((caught)=>{if(!mounted.current)return;setError(caught instanceof Error?caught.message:'The call transcript could not be saved.');if(caught instanceof ApiError&&caught.code==='INSUFFICIENT_CREDITS')void endRef.current('credits_exhausted');});},
      onPartialTranscript:(role:'user'|'assistant',content:string)=>{const previous=partialTranscriptRef.current,next={role,content:role==='assistant'&&previous?.role==='assistant'?`${previous.content}${content}`:content};partialTranscriptRef.current=next;setPartialTranscript(next.content);setPartialTranscriptRole(role);},
      onSpeaking:(who:'user'|'assistant',active:boolean)=>setSpeaking(active?who:(current)=>current===who?null:current),
      onPipelineUsage:(event)=>{const active=callRef.current;if(active)usageUploadRef.current=usageUploadRef.current.catch(()=>undefined).then(()=>manageCall({action:'pipeline_usage',callSessionId:active.id,event}).then(()=>undefined));},
      onError:(caught:Error,recoverable:boolean)=>{setError(caught.message);if(!recoverable){dispatch('FAIL');void endRef.current('connection_failed');}},
    };
    void Promise.all([AsyncStorage.getItem(ROUTE_STORAGE_KEY),manageCall({action:'options'})]).then(([stored,result])=>{
      if(!mounted.current)return;const routes=result.routes?.length?result.routes:IMMEDIATE_ROUTE_OPTIONS;setRouteOptions(routes);const preferred=resolvePreferredVoiceRoute(routes,stored);routeRef.current=preferred;setRouteState(preferred);
    }).catch(()=>undefined);
    return()=>{mounted.current=false;void endRef.current('route_unmounted');};
  },[flushTranscriptOutbox,input.characterInstanceId,input.conversationId]);

  const selectRoute=useCallback((next:VoiceCallRoute)=>{if(stateRef.current!=='idle'&&stateRef.current!=='failed')return;const option=routeOptions.find((item)=>item.route===next);if(option&&!option.available){setUnavailable(option.unavailableReason??`${option.displayName} Voice is unavailable.`);return;}setUnavailable('');routeRef.current=next;setRouteState(next);void AsyncStorage.setItem(ROUTE_STORAGE_KEY,next);},[routeOptions]);

  const startCall=useCallback(async()=>{
    const characterInstanceId=input.characterInstanceId,conversationId=input.conversationId;
    if(!characterInstanceId||!conversationId||startingRef.current||ending.current||!callbacksRef.current)return;
    const selectedOption=routeOptions.find((option)=>option.route===routeRef.current);
    if(!selectedOption?.available){setError(selectedOption?.unavailableReason??'Voice call options are still loading.');return;}
    startingRef.current=true;requestId.current=createClientRequestId();const attemptId=requestId.current;let serverCreateStarted=false;setError('');setUnavailable('');dispatch('CREATE');
    try{
      const routeToUse=routeRef.current,client=createRealtimeVoiceClient(routeToUse,callbacksRef.current);clientRef.current=client;
      serverCreateStarted=true;
      const createPromise=manageCall({action:'create',characterInstanceId,conversationId,requestId:attemptId,route:routeToUse}).then((result)=>({result})).catch((createError:unknown)=>({createError}));
      const permission=await client.requestMicrophonePermission();
      if(permission!=='granted'){
        void createPromise.then(async(created)=>{if('result' in created&&created.result.call)await manageCall({action:'end',callSessionId:created.result.call.id,endedReason:'user_ended'}).catch(()=>undefined);else await manageCall({action:'abandon',requestId:attemptId}).catch(()=>undefined);});
        serverCreateStarted=false;
        throw new Error('Microphone permission and live audio are required. Tap Call and allow microphone access.');
      }
      const created=await createPromise;
      if('createError' in created)throw created.createError;
      const result=created.result;
      if(!mounted.current){await client.disconnect().catch(()=>undefined);if(result.call)await manageCall({action:'end',callSessionId:result.call.id,endedReason:'route_unmounted'}).catch(()=>manageCall({action:'abandon',requestId:attemptId}).catch(()=>undefined));return;}
      if(result.status==='not_configured'){await client.disconnect().catch(()=>undefined);setUnavailable(result.message??"Live voice calls aren't connected yet.");dispatch('FAIL');return;}
      if(!result.call)throw new Error("The call couldn't be created.");
      setCall(result.call);callRef.current=result.call;const billingStartedAt=Date.parse(result.call.billing_started_at??'');billingStartedAtRef.current=Number.isFinite(billingStartedAt)?billingStartedAt:0;if(result.billing){setBilling(result.billing);billedMinuteRef.current=result.billing.chargedMinutes;}dispatch('SESSION_CREATED');await connect(result,true);
    }catch(caught){if(serverCreateStarted&&!callRef.current)await manageCall({action:'abandon',requestId:attemptId}).catch(()=>undefined);if(!callRef.current)await clientRef.current?.disconnect().catch(()=>undefined);if(!mounted.current)return;const message=caught instanceof Error?caught.message:"The call couldn't connect.";setError(message);dispatch('FAIL');if(callRef.current)await endRef.current('connection_failed');}
    finally{startingRef.current=false;}
  },[connect,input.characterInstanceId,input.conversationId,routeOptions]);

  const reconnect=useCallback(async()=>{
    const active=callRef.current;if(!active||ending.current||terminal(stateRef.current))return;
    if(reconnectCount.current>=2){setError('The call connection could not be restored.');dispatch('FAIL');await endRef.current('connection_failed');return;}
    reconnectCount.current+=1;dispatch('CONNECTION_LOST');
    try{await usageUploadRef.current.catch(()=>undefined);await manageCall({action:'reconnecting',callSessionId:active.id,reconnectCount:reconnectCount.current});const refreshed=await manageCall({action:'refresh_token',callSessionId:active.id});dispatch('RETRY');await connect(refreshed,false);}
    catch(caught){setError(caught instanceof Error?caught.message:'Reconnecting failed.');setTimeout(()=>{if(!ending.current)void reconnectRef.current('retry_failed');},700);}
  },[connect]);
  reconnectRef.current=reconnect;

  const endCall=useCallback(async(reason:EndReason='user_ended')=>{
    const client=clientRef.current,stoppingLocalAudio=client?.disconnect().catch(()=>undefined);
    if(mounted.current){setSpeaking(null);setPartialTranscript('');setPartialTranscriptRole(null);}
    if(ending.current){await stoppingLocalAudio;return;}
    ending.current=true;if(mounted.current)dispatch('END');
    const active=callRef.current,clientUsage=client?.usage()??{connectedDurationMs:0,inputAudioDurationMs:0,outputAudioDurationMs:0};
    const usage={...clientUsage,connectedDurationMs:firstConnectedAt.current?Date.now()-firstConnectedAt.current:0,reconnectCount:reconnectCount.current};
    await stoppingLocalAudio;await transcriptUploadRef.current.catch(()=>undefined);await flushTranscriptOutbox().catch(()=>undefined);await usageUploadRef.current.catch(()=>undefined);
    try{if(active){const action=reason==='connection_failed'?'fail':'end';const payload=action==='fail'?{action,callSessionId:active.id,failureCode:'connection_failed',reason:'The realtime connection could not be restored.',usage,events:[]}:{action,callSessionId:active.id,endedReason:reason,usage,events:[]};const result=await manageCall(payload);if(result.call&&mounted.current)setCall(result.call);}}catch(caught){if(mounted.current)setError(caught instanceof Error?caught.message:'The call ended, but its history is still being finalized.');}
    if(mounted.current)dispatch('ENDED');
  },[flushTranscriptOutbox]);
  endRef.current=endCall;

  useEffect(()=>{const callSessionId=call?.id;if(!callSessionId||!['connected','reconnecting'].includes(state))return;let stopped=false,busy=false;const heartbeat=()=>{if(stopped||busy)return;busy=true;void manageCall({action:'heartbeat',callSessionId}).then((result)=>{if(!stopped&&result.call){setCall(result.call);callRef.current=result.call;const startedAt=Date.parse(result.call.billing_started_at??'');if(Number.isFinite(startedAt))billingStartedAtRef.current=startedAt;}return flushTranscriptOutbox();}).catch(()=>undefined).finally(()=>{busy=false;});};heartbeat();const timer=setInterval(heartbeat,20_000);return()=>{stopped=true;clearInterval(timer);};},[call?.id,flushTranscriptOutbox,state]);
  useEffect(()=>{if(state!=='connected'){if(state==='ended'||state==='failed')setElapsed(firstConnectedAt.current?Math.floor((Date.now()-firstConnectedAt.current)/1_000):0);return;}const timer=setInterval(()=>setElapsed(firstConnectedAt.current?Math.floor((Date.now()-firstConnectedAt.current)/1_000):0),1_000);return()=>clearInterval(timer);},[state]);
  useEffect(()=>{const active=callRef.current,billingStartedAt=billingStartedAtRef.current;if(state!=='connected'||!active||!billingStartedAt||ending.current||meteringRef.current)return;const startedMinute=Math.max(1,Math.ceil(Math.max(0,Date.now()-billingStartedAt)/60_000));if(startedMinute<=billedMinuteRef.current)return;meteringRef.current=true;void manageCall({action:'meter',callSessionId:active.id,minute:startedMinute}).then((result)=>{if(result.billing){billedMinuteRef.current=result.billing.chargedMinutes;if(mounted.current)setBilling(result.billing);}}).catch((caught)=>{if(!mounted.current)return;const message=caught instanceof Error?caught.message:'The next voice minute could not be started.';setError(message);if(caught instanceof ApiError&&caught.code==='INSUFFICIENT_CREDITS')void endRef.current('credits_exhausted');}).finally(()=>{meteringRef.current=false;});},[elapsed,state]);

  const setMuted=useCallback(async(value:boolean)=>{await clientRef.current?.setMuted(value);setMutedState(value);},[]);
  const setSpeakerEnabled=useCallback(async(value:boolean)=>{await clientRef.current?.setSpeakerEnabled(value);setSpeakerState(value);},[]);
  return{state,call,error,unavailable,muted,speaker,speaking,partialTranscript,partialTranscriptRole,elapsed,billing,route,routeOptions,routeOptionsReady:routeOptions.length>0,selectRoute,speakerControlAvailable:clientRef.current?.speakerControlAvailable??true,startCall,setMuted,setSpeakerEnabled,endCall};
}

function terminal(state:RealtimeCallState){return state==='ending'||state==='ended'||state==='failed';}
