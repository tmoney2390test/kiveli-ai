import { PlatformRealtimeAudioEngine } from './engine';
import { approximatePcm16DurationMs, connectionTimeoutMessage, makeFinalTranscript, parseXaiRealtimeEvent } from './events';
import { shutdownRealtimeTransport } from './shutdown';
import type { RealtimeAudioEngine } from './engine.types';
import type { RealtimeVoiceCallbacks, RealtimeVoiceClient, RealtimeVoiceCredentials, VoicePipelineUsageEvent } from './types';

export class XaiCascadedVoiceClient implements RealtimeVoiceClient {
  readonly speakerControlAvailable:boolean;
  private readonly audio:RealtimeAudioEngine;private socket:WebSocket|null=null;private intentionalClose=false;private audioReset:Promise<void>=Promise.resolve();
  private inputAudioMs=0;private outputAudioMs=0;private connectedAt=0;private sequence=0;private conversationId='';
  private activeOutputTurn='assistant-turn';private outputTurns=new Set<string>();private finalTranscriptIds=new Set<string>();
  constructor(private readonly callbacks:RealtimeVoiceCallbacks,audio?:RealtimeAudioEngine){this.audio=audio??new PlatformRealtimeAudioEngine();this.speakerControlAvailable=this.audio.speakerControlAvailable;}
  requestMicrophonePermission(){return this.audio.requestPermission();}
  async connect(credentials:RealtimeVoiceCredentials):Promise<void>{
    // The Call-button permission step deliberately primes a browser AudioContext.
    // Do not tear it down before the first connection or audio playback loses
    // its user-gesture authorization. Reconnects wait for their input reset.
    if(this.socket)await this.disconnect();await this.audioReset;this.intentionalClose=false;
    if(credentials.clientConfiguration.transport!=='xai_cascade')throw new Error('The Essential Voice route returned an incompatible connection.');
    if(new Date(credentials.expiresAt).getTime()<=Date.now()+5_000)throw new Error('The call credential expired before the connection opened.');
    const socket=new WebSocket(credentials.clientConfiguration.url);this.socket=socket;
    let settled=false,audioReady=false,sessionReady=false;
    return await new Promise<void>((resolve,reject)=>{
      const timeout=setTimeout(()=>{if(!settled){const message=connectionTimeoutMessage({socketOpen:socket.readyState===WebSocket.OPEN,audioReady,sessionReady});settled=true;this.callbacks.onError(new Error(message),false);reject(new Error(message));void this.disconnect();}},20_000);
      const fail=(error:Error,recoverable:boolean)=>{this.callbacks.onError(error,recoverable);if(!settled){settled=true;clearTimeout(timeout);reject(error);}if(socket.readyState<2&&(!recoverable||settled))socket.close(1011,recoverable?'retry_voice_connection':'voice_audio_failed');};
      const ready=()=>{if(settled||!audioReady||!sessionReady||socket.readyState!==WebSocket.OPEN)return;settled=true;clearTimeout(timeout);this.connectedAt=this.connectedAt||Date.now();resolve();this.callbacks.onConnected(this.conversationId||undefined);};
      void this.audio.open({sampleRate:credentials.clientConfiguration.sampleRate,onInput:(audio)=>{if(!sessionReady||socket.readyState!==WebSocket.OPEN)return;this.inputAudioMs+=approximatePcm16DurationMs(audio,credentials.clientConfiguration.sampleRate);socket.send(JSON.stringify({type:'input_audio_buffer.append',audio}));},onError:(error)=>fail(error,true)}).then(()=>{audioReady=true;ready();}).catch((error)=>fail(error instanceof Error?error:new Error('Audio setup failed.'),false));
      socket.onopen=()=>{
        socket.send(JSON.stringify({type:'kivelle.auth',token:credentials.clientSecret,configuration:credentials.clientConfiguration,resumeConversationId:credentials.resumeConversationId,greet:credentials.greet!==false}));
      };
      socket.onmessage=(message)=>{if(this.socket!==socket)return;let raw:unknown;try{raw=JSON.parse(String(message.data));}catch{return;}const rawRecord=record(raw);if(rawRecord.type==='kivelle.usage'){const usage=parsePipelineUsage(rawRecord.event,rawRecord.proof);if(usage)this.callbacks.onPipelineUsage?.(usage);return;}const event=parseXaiRealtimeEvent(raw,!this.outputTurns.has(String(rawRecord.response_id??rawRecord.item_id??'assistant-turn')));switch(event.kind){
        case'conversation':this.conversationId=event.conversationId;break;
        case'session_ready':sessionReady=true;ready();break;
        case'audio':this.activeOutputTurn=event.turnId;this.outputTurns.add(event.turnId);this.outputAudioMs+=approximatePcm16DurationMs(event.audio,credentials.clientConfiguration.sampleRate);this.audio.pushOutput(event);this.callbacks.onSpeaking('assistant',true);break;
        case'audio_done':this.audio.endOutput(event.turnId);this.callbacks.onSpeaking('assistant',false);break;
        case'interruption':this.callbacks.onSpeaking('user',true);this.callbacks.onSpeaking('assistant',false);void this.audio.interrupt(this.activeOutputTurn);break;
        case'speaking':this.callbacks.onSpeaking(event.speaker,event.speaking);break;
        case'transcript_partial':this.callbacks.onPartialTranscript(event.role,event.content);break;
        case'transcript_final':if(event.providerEventId&&this.finalTranscriptIds.has(event.providerEventId))break;if(event.providerEventId)this.finalTranscriptIds.add(event.providerEventId);this.sequence+=1;this.callbacks.onTranscript(makeFinalTranscript({sequence:this.sequence,role:event.role,content:event.content,providerEventId:event.providerEventId}));break;
        case'error':fail(new Error(event.message),event.recoverable);break;default:break;
      }};
      socket.onerror=()=>{if(this.socket===socket)fail(new Error('The Essential Voice connection failed.'),true);};
      socket.onclose=()=>{clearTimeout(timeout);const current=this.socket===socket;if(current){this.socket=null;this.audioReset=this.audio.resetForReconnect().catch(()=>undefined);}if(current&&!this.intentionalClose){if(!settled){settled=true;reject(new Error('The Essential Voice connection closed.'));}this.callbacks.onClosed();}};
    });
  }
  async disconnect(){this.intentionalClose=true;const socket=this.socket;this.socket=null;const closing=shutdownRealtimeTransport({audio:this.audio,socket,activeOutputTurn:this.activeOutputTurn,onSilenced:()=>{this.callbacks.onSpeaking('assistant',false);this.callbacks.onSpeaking('user',false);}});this.audioReset=closing;await closing;}
  setMuted(muted:boolean){return this.audio.setMuted(muted);}
  setSpeakerEnabled(enabled:boolean){return this.audio.setSpeakerEnabled(enabled);}
  usage(){return{connectedDurationMs:this.connectedAt?Math.max(0,Date.now()-this.connectedAt):0,inputAudioDurationMs:this.inputAudioMs,outputAudioDurationMs:this.outputAudioMs};}
}

function parsePipelineUsage(value:unknown,proofValue:unknown):VoicePipelineUsageEvent|null{
  const row=record(value),status=row.status;
  if(!Number.isInteger(row.sequence)||!['success','interrupted','failure'].includes(String(status))||typeof proofValue!=='string'||proofValue.length>200)return null;
  const number=(key:string)=>Math.max(0,Math.round(Number(row[key]??0)));
  return{proof:proofValue,sequence:number('sequence'),sttBillableMs:number('sttBillableMs'),inputSpeechMs:number('inputSpeechMs'),dialogueInputTokens:number('dialogueInputTokens'),dialogueCachedInputTokens:number('dialogueCachedInputTokens'),dialogueOutputTokens:number('dialogueOutputTokens'),ttsCharacters:number('ttsCharacters'),outputAudioMs:number('outputAudioMs'),discardedOutputAudioMs:number('discardedOutputAudioMs'),...(row.sttFinalLatencyMs==null?{}:{sttFinalLatencyMs:number('sttFinalLatencyMs')}),...(row.dialogueFirstTokenLatencyMs==null?{}:{dialogueFirstTokenLatencyMs:number('dialogueFirstTokenLatencyMs')}),...(row.ttsFirstAudioLatencyMs==null?{}:{ttsFirstAudioLatencyMs:number('ttsFirstAudioLatencyMs')}),status:status as VoicePipelineUsageEvent['status'],...(typeof row.failureCode==='string'?{failureCode:row.failureCode.slice(0,80)}:{})};
}
function record(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
