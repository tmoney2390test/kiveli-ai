import { describe,expect,it } from 'vitest';
import { approximatePcm16DurationMs, connectionTimeoutMessage, parseXaiRealtimeEvent, xaiForcedGreetingEvent } from './events';
import { transitionRealtimeCall } from './stateMachine';

describe('xAI realtime events',()=>{
  it('preserves final provider transcript IDs and ignores unstable shapes',()=>{
    expect(parseXaiRealtimeEvent({type:'conversation.item.input_audio_transcription.completed',transcript:' hello ',item_id:'user-item-1',event_id:'evt-1'},false)).toEqual({kind:'transcript_final',role:'user',content:'hello',providerEventId:'user-item-1'});
    expect(parseXaiRealtimeEvent({type:'conversation.item.input_audio_transcription.updated',transcript:'hel'},false)).toEqual({kind:'transcript_partial',role:'user',content:'hel'});
  });
  it('accepts both documented xAI JSON audio event names',()=>{
    expect(parseXaiRealtimeEvent({type:'response.output_audio.delta',delta:'AAAA',response_id:'response-1',item_id:'item-1'},true)).toEqual({kind:'audio',audio:'AAAA',turnId:'response-1',first:true});
    expect(parseXaiRealtimeEvent({type:'response.audio.delta',audio:'BBBB',response_id:'response-2'},false)).toEqual({kind:'audio',audio:'BBBB',turnId:'response-2',first:false});
    expect(parseXaiRealtimeEvent({type:'response.audio.done',response_id:'response-2'},false)).toEqual({kind:'audio_done',turnId:'response-2'});
  });
  it('keeps provider errors private while identifying fatal session failures',()=>{
    expect(parseXaiRealtimeEvent({type:'error',error:{type:'authentication_error',message:'secret provider detail'}},false)).toEqual({kind:'error',message:'The voice provider reported an error.',recoverable:false});
    expect(parseXaiRealtimeEvent({type:'error',error:{type:'server_error'}},false)).toEqual({kind:'error',message:'The voice provider reported an error.',recoverable:true});
  });
  it('calculates PCM16 duration without decoding content',()=>expect(approximatePcm16DurationMs('A'.repeat(3200),24_000)).toBe(50));
});
describe('realtime call state machine',()=>it('cannot form impossible boolean combinations',()=>{
  let state=transitionRealtimeCall('idle','CREATE');state=transitionRealtimeCall(state,'SESSION_CREATED');state=transitionRealtimeCall(state,'CONNECT');state=transitionRealtimeCall(state,'CONNECTED');
  expect(state).toBe('connected');expect(transitionRealtimeCall(state,'CONNECTION_LOST')).toBe('reconnecting');expect(transitionRealtimeCall('ended','CONNECTED')).toBe('ended');
}));
describe('realtime connection diagnostics',()=>it('identifies the unfinished part of the connection',()=>{
  expect(connectionTimeoutMessage({socketOpen:false,audioReady:false,sessionReady:false})).toContain('could not be reached');
  expect(connectionTimeoutMessage({socketOpen:true,audioReady:true,sessionReady:false})).toContain('did not finish connecting');
  expect(connectionTimeoutMessage({socketOpen:true,audioReady:false,sessionReady:true})).toContain('microphone audio');
}));
describe('realtime call greeting',()=>it('uses xAI force_message so the introduction is spoken verbatim',()=>{
  expect(xaiForcedGreetingEvent('Hey, this is Brooke.')).toEqual({type:'conversation.item.create',item:{type:'force_message',role:'assistant',interruptible:true,content:[{type:'output_text',text:'Hey, this is Brooke.'}]}});
}));
