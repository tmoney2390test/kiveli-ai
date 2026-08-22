import { describe,expect,it,vi } from 'vitest';
import type { RealtimeAudioEngine } from './engine.types';
import { shutdownRealtimeTransport } from './shutdown';

describe('realtime transport shutdown',()=>it('silences audio before closing the provider socket',async()=>{
  const order:string[]=[];
  const audio:RealtimeAudioEngine={
    speakerControlAvailable:true,
    requestPermission:vi.fn(()=>Promise.resolve('granted' as const)),open:vi.fn(()=>Promise.resolve()),
    close:vi.fn(()=>{order.push('audio:close');return Promise.resolve();}),setMuted:vi.fn(()=>Promise.resolve()),setSpeakerEnabled:vi.fn(()=>Promise.resolve()),
    pushOutput:vi.fn(),endOutput:vi.fn(),interrupt:vi.fn((turnId:string)=>{order.push(`audio:interrupt:${turnId}`);return Promise.resolve();}),
  };
  const sent:string[]=[];
  const socket={readyState:1,send:(data:string)=>{sent.push(data);order.push('socket:send');},close:()=>{order.push('socket:close');}};
  await shutdownRealtimeTransport({audio,socket,activeOutputTurn:'assistant-7',onSilenced:()=>order.push('ui:silent')});
  expect(order.slice(0,3)).toEqual(['ui:silent','audio:interrupt:assistant-7','audio:close']);
  expect(order.at(-1)).toBe('socket:close');
  expect(sent.map((item)=>JSON.parse(item))).toEqual([{type:'response.cancel'},{type:'input_audio_buffer.clear'}]);
}));
