import type { RealtimeAudioEngine } from './engine.types';

type RealtimeSocket={readyState:number;send(data:string):void;close(code?:number,reason?:string):void};

export async function shutdownRealtimeTransport(input:{audio:RealtimeAudioEngine;socket:RealtimeSocket|null;activeOutputTurn:string;onSilenced():void}){
  input.onSilenced();
  // Both operations begin synchronously. interrupt() drops the active turn,
  // while close() tears down every queued buffer and the microphone pipeline.
  const interrupting=input.audio.interrupt(input.activeOutputTurn).catch(()=>undefined);
  const closingAudio=input.audio.close().catch(()=>undefined);
  const socket=input.socket;
  if(socket?.readyState===1){
    try{socket.send(JSON.stringify({type:'response.cancel'}));}catch{/* The provider may have already completed its response. */}
    try{socket.send(JSON.stringify({type:'input_audio_buffer.clear'}));}catch{/* The socket may close between the two sends. */}
  }
  if(socket&&socket.readyState<2)try{socket.close(1000,'kivelle_call_end');}catch{/* Local audio shutdown remains authoritative. */}
  await Promise.all([interrupting,closingAudio]);
}
