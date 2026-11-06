import { describe,expect,it,vi } from 'vitest';

vi.mock('./engine',()=>({PlatformRealtimeAudioEngine:class{}}));

import { XaiCascadedVoiceClient } from './cascadeClient';
import { XaiRealtimeVoiceClient } from './client';
import type { RealtimeAudioEngine } from './engine.types';
import type { RealtimeVoiceCallbacks,RealtimeVoiceCredentials } from './types';

class FakeWebSocket{
  static OPEN=1;static last:FakeWebSocket|null=null;
  readyState=0;onopen:(()=>void)|null=null;onmessage:((event:{data:string})=>void)|null=null;onerror:(()=>void)|null=null;onclose:(()=>void)|null=null;
  constructor(public readonly url:string){FakeWebSocket.last=this;}
  send=vi.fn();
  close=vi.fn(()=>{this.readyState=3;this.onclose?.();});
  open(){this.readyState=1;this.onopen?.();}
  message(value:unknown){this.onmessage?.({data:JSON.stringify(value)});}
}

function audioEngine():RealtimeAudioEngine{return{
  speakerControlAvailable:true,requestPermission:vi.fn(()=>Promise.resolve('granted' as const)),open:vi.fn(()=>Promise.resolve()),
  resetForReconnect:vi.fn(()=>Promise.resolve()),close:vi.fn(()=>Promise.resolve()),setMuted:vi.fn(()=>Promise.resolve()),setSpeakerEnabled:vi.fn(()=>Promise.resolve()),
  pushOutput:vi.fn(),endOutput:vi.fn(),interrupt:vi.fn(()=>Promise.resolve()),
};}
const credentials:RealtimeVoiceCredentials={
  clientSecret:'short-lived',expiresAt:new Date(Date.now()+60_000).toISOString(),
  clientConfiguration:{transport:'xai_cascade',route:'standard',url:'wss://voice.example.test/v1/call',model:'grok-4.3',voice:'ara',sampleRate:24_000,session:{},relayEnvelope:'sealed'},
};

describe('Essential voice audio lifecycle',()=>{
  it('preserves the Call-button-authorized audio context until the first connection is ready',async()=>{
    const audio=audioEngine(),callbacks:RealtimeVoiceCallbacks={onConnected:vi.fn(),onClosed:vi.fn(),onTranscript:vi.fn(),onPartialTranscript:vi.fn(),onSpeaking:vi.fn(),onError:vi.fn()};
    const original=globalThis.WebSocket;Object.assign(globalThis,{WebSocket:FakeWebSocket});
    try{
      const client=new XaiCascadedVoiceClient(callbacks,audio);await client.requestMicrophonePermission();
      const connecting=client.connect(credentials);await Promise.resolve();await Promise.resolve();
      expect(audio.open).toHaveBeenCalledOnce();
      expect(callbacks.onConnected).not.toHaveBeenCalled();
      FakeWebSocket.last!.open();await Promise.resolve();FakeWebSocket.last!.message({type:'session.updated'});await connecting;
      expect(audio.close).not.toHaveBeenCalled();expect(callbacks.onConnected).toHaveBeenCalledOnce();
      await client.disconnect();expect(audio.close).toHaveBeenCalledOnce();
    }finally{Object.assign(globalThis,{WebSocket:original});}
  });
});

describe.each([XaiCascadedVoiceClient,XaiRealtimeVoiceClient])('voice client playback captions', Client => {
  it('keeps generated transcript out of captions until audio plays and cancels interrupted captions',async()=>{
    const audio=audioEngine(),callbacks:RealtimeVoiceCallbacks={onCaption:vi.fn(),onConnected:vi.fn(),onClosed:vi.fn(),onTranscript:vi.fn(),onPartialTranscript:vi.fn(),onSpeaking:vi.fn(),onError:vi.fn()};
    const original=globalThis.WebSocket;Object.assign(globalThis,{WebSocket:FakeWebSocket});
    try{
      const client=new Client(callbacks,audio),connecting=client.connect(credentials);await Promise.resolve();await Promise.resolve();
      FakeWebSocket.last!.open();await Promise.resolve();FakeWebSocket.last!.message({type:'session.updated'});await connecting;
      const socket=FakeWebSocket.last!,playback=vi.mocked(audio.open).mock.calls[0]![0].onPlayback!;
      vi.mocked(callbacks.onCaption!).mockClear();
      socket.message({type:'response.output_audio_transcript.delta',delta:'Hello there.',response_id:'a'});
      socket.message({type:'response.output_audio.delta',delta:'AAAA',response_id:'a',audio_timestamps:{graph_chars:[...'Hello there.'],graph_times:[...'Hello there.'].map((_,i)=>[i/10,(i+1)/10])}});
      socket.message({type:'response.output_audio_transcript.done',transcript:'Hello there.',response_id:'a',item_id:'item-a'});
      expect(callbacks.onCaption).not.toHaveBeenCalled();expect(callbacks.onTranscript).toHaveBeenCalledOnce();
      socket.message({type:'response.output_audio.done',response_id:'a'});
      playback({turnId:'a',playedMs:500,totalMs:1200,done:false});
      expect(callbacks.onCaption).toHaveBeenLastCalledWith({role:'assistant',content:'Hello'});
      expect(callbacks.onSpeaking).toHaveBeenLastCalledWith('assistant',true);
      socket.message({type:'input_audio_buffer.speech_started'});
      expect(callbacks.onCaption).toHaveBeenLastCalledWith(null);
      playback({turnId:'a',playedMs:1200,totalMs:1200,done:true});
      expect(callbacks.onCaption).toHaveBeenLastCalledWith(null);
      await client.disconnect();
    }finally{Object.assign(globalThis,{WebSocket:original});}
  });
});
