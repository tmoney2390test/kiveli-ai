import{assertEquals}from'jsr:@std/assert';
import{detectActualVideoAudioBehavior}from'./together-video-inspection.ts';

function mp4Handler(handler:string){
  const bytes=new Uint8Array(28);bytes.set([0x68,0x64,0x6c,0x72],4);
  bytes.set(Array.from(handler).map((value)=>value.charCodeAt(0)),16);
  return bytes;
}

Deno.test('detects a delivered MP4 audio track from its handler atom',()=>{
  assertEquals(detectActualVideoAudioBehavior(mp4Handler('soun'),'video/mp4'),'has_audio');
});

Deno.test('marks a parsed MP4 without an audio handler silent',()=>{
  assertEquals(detectActualVideoAudioBehavior(mp4Handler('vide'),'video/mp4'),'silent');
});

Deno.test('does not make claims about an unsupported video container',()=>{
  assertEquals(detectActualVideoAudioBehavior(new Uint8Array([1,2,3]),'video/webm'),'unknown');
});
