import type { FinalVoiceTranscript, ParsedXaiRealtimeEvent } from './types';

export function parseXaiRealtimeEvent(value: unknown, firstAudioForTurn: boolean): ParsedXaiRealtimeEvent {
  const event=record(value),type=String(event.type??'');
  if(type==='conversation.created'){
    const conversation=record(event.conversation),id=String(conversation.id??event.conversation_id??'');
    return id?{kind:'conversation',conversationId:id}:{kind:'ignored'};
  }
  if(type==='session.updated')return{kind:'session_ready'};
  if(type==='response.output_audio.delta'||type==='response.audio.delta'){
    const audio=String(event.delta??event.audio??''),turnId=String(event.response_id??event.item_id??event.event_id??'assistant-turn');
    return audio?{kind:'audio',audio,turnId,first:firstAudioForTurn}:{kind:'ignored'};
  }
  if(type==='response.output_audio.done'||type==='response.audio.done')return{kind:'audio_done',turnId:String(event.response_id??event.item_id??'assistant-turn')};
  if(type==='conversation.item.input_audio_transcription.completed')return transcript('user',event.transcript??event.text,event.item_id??event.event_id);
  if(type==='response.output_audio_transcript.done'||type==='response.audio_transcript.done')return transcript('assistant',event.transcript??event.text,event.item_id??event.response_id??event.event_id);
  if(type==='conversation.item.input_audio_transcription.updated')return partial('user',event.transcript??event.text);
  if(type==='response.output_audio_transcript.delta'||type==='response.audio_transcript.delta')return partial('assistant',event.delta??event.transcript??event.text);
  if(type==='input_audio_buffer.speech_started')return{kind:'interruption'};
  if(type==='input_audio_buffer.speech_stopped')return{kind:'speaking',speaker:'user',speaking:false};
  if(type==='response.output_audio.started'||type==='response.output_audio_transcript.delta'||type==='response.audio_transcript.delta')return{kind:'speaking',speaker:'assistant',speaking:true};
  if(type==='response.done'||type==='response.output_audio.done'||type==='response.audio.done')return{kind:'speaking',speaker:'assistant',speaking:false};
  if(type==='error')return{kind:'error',message:safeProviderError(event),recoverable:providerErrorRecoverable(event)};
  return{kind:'ignored'};
}

export function makeFinalTranscript(input:{sequence:number;role:'user'|'assistant';content:string;providerEventId?:string;now?:Date}):FinalVoiceTranscript{return{
  sequence:input.sequence,role:input.role,content:input.content.trim().slice(0,4_000),
  ...(input.providerEventId?{providerEventId:input.providerEventId}:{}),occurredAt:(input.now??new Date()).toISOString(),final:true,
};}

export function approximatePcm16DurationMs(base64:string,sampleRate=24_000):number{
  const padding=base64.endsWith('==')?2:base64.endsWith('=')?1:0;
  const bytes=Math.max(0,Math.floor(base64.length*3/4)-padding);
  return Math.round(bytes/2/sampleRate*1_000);
}

export function connectionTimeoutMessage(input:{socketOpen:boolean;audioReady:boolean;sessionReady:boolean}):string{
  if(!input.socketOpen)return'The live voice service could not be reached.';
  if(!input.sessionReady)return'The live voice service did not finish connecting.';
  if(!input.audioReady)return'The microphone audio did not start. Tap Call again and allow microphone access.';
  return'The voice connection timed out.';
}

export function xaiForcedGreetingEvent(greeting:string):Record<string,unknown>{return{
  type:'conversation.item.create',
  item:{type:'force_message',role:'assistant',interruptible:true,content:[{type:'output_text',text:greeting.trim().slice(0,160)}]},
};}

function transcript(role:'user'|'assistant',content:unknown,id:unknown):ParsedXaiRealtimeEvent{const text=String(content??'').trim();return text?{kind:'transcript_final',role,content:text,providerEventId:typeof id==='string'&&id?id:undefined}:{kind:'ignored'};}
function partial(role:'user'|'assistant',content:unknown):ParsedXaiRealtimeEvent{const text=String(content??'').trim();return text?{kind:'transcript_partial',role,content:text}:{kind:'ignored'};}
function safeProviderError(event:Record<string,unknown>):string{
  const error=record(event.error),code=String(error.code??event.code??'').toLowerCase();
  if(code.startsWith('stt_'))return'Essential Voice could not start transcription. Please try again.';
  if(code.startsWith('tts_'))return'Essential Voice could not start audio. Please try again.';
  if(code==='relay_request_failed')return'Essential Voice could not finish connecting. Please try again.';
  if(code==='relay_session_conflict')return'That call is already active. End it before starting another.';
  return'The voice provider reported an error.';
}
function providerErrorRecoverable(event:Record<string,unknown>):boolean{const error=record(event.error),code=String(error.code??event.code??'').toLowerCase(),type=String(error.type??event.error_type??'').toLowerCase();return !['authentication','permission','invalid_request','unsupported','session_expired'].some((fatal)=>code.includes(fatal)||type.includes(fatal));}
function record(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
