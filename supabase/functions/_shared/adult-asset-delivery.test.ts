import { assertEquals } from 'jsr:@std/assert';
import { adultAssetCorsHeaders,adultVideoResponseHeaders,adultVoiceResponseHeaders,adultVoiceResponseSizeValid,resolveAdultVideoAsset,resolveAdultVoiceAsset,safeVideoRange } from './adult-asset-delivery.ts';

Deno.test('accepts a finalized private MP4 and rejects disguised or oversized video assets',()=>{
  assertEquals(resolveAdultVideoAsset({media_type:'video',storage_path:'user/media/video.mp4',content_type:'video/mp4',byte_size:7_010_050}),{storagePath:'user/media/video.mp4',byteSize:7_010_050});
  assertEquals(resolveAdultVideoAsset({media_type:'video',storage_path:'user/media/video.jpg',content_type:'video/mp4',byte_size:100}),null);
  assertEquals(resolveAdultVideoAsset({media_type:'video',storage_path:'user/media/video.mp4',content_type:'text/html',byte_size:100}),null);
  assertEquals(resolveAdultVideoAsset({media_type:'video',storage_path:'user/media/video.mp4',content_type:'video/mp4',byte_size:300*1024*1024}),null);
});

Deno.test('accepts only bounded private voice-note audio with a matching extension',()=>{
  assertEquals(resolveAdultVoiceAsset({media_type:'voice_note',storage_path:'user/voice-notes/note.mp3',content_type:'audio/mpeg',byte_size:1024}),{storagePath:'user/voice-notes/note.mp3',contentType:'audio/mpeg'});
  assertEquals(resolveAdultVoiceAsset({media_type:'voice_note',storage_path:'user/voice-notes/note.mp3',content_type:'audio/mpeg',byte_size:null}),{storagePath:'user/voice-notes/note.mp3',contentType:'audio/mpeg'});
  assertEquals(resolveAdultVoiceAsset({media_type:'voice_note',storage_path:'user/voice-notes/note.mp3',content_type:'text/html',byte_size:1024}),null);
  assertEquals(resolveAdultVoiceAsset({media_type:'voice_note',storage_path:'user/voice-notes/note.jpg',content_type:'audio/mpeg',byte_size:1024}),null);
  assertEquals(resolveAdultVoiceAsset({media_type:'voice_note',storage_path:'user/voice-notes/note.mp3',content_type:'audio/mpeg',byte_size:30*1024*1024}),null);
});

Deno.test('bounds legacy voice notes with an unset database size using storage response headers',()=>{
  assertEquals(adultVoiceResponseSizeValid(new Headers({'content-length':'1024'})),true);
  assertEquals(adultVoiceResponseSizeValid(new Headers({'content-range':'bytes 0-1023/4096','content-length':'1024'})),true);
  assertEquals(adultVoiceResponseSizeValid(new Headers({'content-range':'bytes 0-1023/30000000','content-length':'1024'})),false);
  assertEquals(adultVoiceResponseSizeValid(new Headers({'content-length':'30000000'})),false);
  assertEquals(adultVoiceResponseSizeValid(new Headers()),false);
});

Deno.test('allows only a single well-formed HTTP byte range',()=>{
  assertEquals(safeVideoRange('bytes=0-1023'),'bytes=0-1023');
  assertEquals(safeVideoRange('bytes=1024-'),'bytes=1024-');
  assertEquals(safeVideoRange('bytes=-1024'),'bytes=-1024');
  assertEquals(safeVideoRange('bytes=0-10,20-30'),null);
  assertEquals(safeVideoRange('items=0-10'),null);
});

Deno.test('exposes range response headers only to approved website origins',()=>{
  const request=new Request('https://kivelli.app/supabase/functions/v1/together-adult-asset',{headers:{origin:'https://kivelli.app'}});
  assertEquals(adultAssetCorsHeaders(request)['Access-Control-Allow-Headers'],'Content-Type, Range');
  const upstream=new Headers({'content-length':'1024','content-range':'bytes 0-1023/7010050','accept-ranges':'bytes'});
  const response=adultVideoResponseHeaders(upstream,request);
  assertEquals(response.get('content-type'),'video/mp4');
  assertEquals(response.get('content-range'),'bytes 0-1023/7010050');
  assertEquals(response.get('access-control-allow-origin'),'https://kivelli.app');
  assertEquals(adultVoiceResponseHeaders(upstream,request,'audio/mpeg').get('content-type'),'audio/mpeg');
  assertEquals(adultAssetCorsHeaders(new Request('https://kivelli.app',{headers:{origin:'https://attacker.example'}})),{});
});
