import{isAnimatedChatPhoto,matchesChatPhotoSignature}from'./chat-photo-policy.ts';

Deno.test('chat photo signatures reject a forged MIME type',()=>{
  assert(matchesChatPhotoSignature(new Uint8Array([0xff,0xd8,0xff,0xd9]),'image/jpeg'));
  assert(!matchesChatPhotoSignature(new TextEncoder().encode('<svg><script/></svg>'),'image/png'));
  assert(!matchesChatPhotoSignature(new Uint8Array([0x4d,0x5a,0x90,0]),'image/jpeg'));
});

Deno.test('chat photo policy rejects APNG and animated WebP containers',()=>{
  const png=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0,0x61,0x63,0x54,0x4c,0,0,0,0]);
  const webp=new Uint8Array([0x52,0x49,0x46,0x46,12,0,0,0,0x57,0x45,0x42,0x50,0x41,0x4e,0x49,0x4d,0,0,0,0]);
  assert(isAnimatedChatPhoto(png,'image/png')&&isAnimatedChatPhoto(webp,'image/webp'));
});

function assert(value:unknown):asserts value{if(!value)throw new Error('assertion_failed');}
