import { projectPlanHistoryMedia, projectPlanTranscript } from './together-plan-history.ts';

function assert(condition:unknown,message:string){if(!condition)throw new Error(message);}

Deno.test('plan transcript keeps only completed user and companion scene dialogue in order',()=>{
  const result=projectPlanTranscript([
    {id:'assistant',role:'assistant',content:'I like it here.',delivery_status:'complete',created_at:'2026-08-31T12:02:00Z',speaker_character_instance_id:'becka'},
    {id:'system',role:'system',content:'hidden lifecycle event',delivery_status:'complete',created_at:'2026-08-31T12:00:00Z'},
    {id:'user',role:'user',content:'This view is beautiful.',delivery_status:'complete',created_at:'2026-08-31T12:01:00Z'},
    {id:'failed',role:'assistant',content:'unfinished',delivery_status:'failed',created_at:'2026-08-31T12:03:00Z'},
  ]);
  assert(result.messages.length===2,'only visible completed dialogue should remain');
  assert(result.messages[0]?.id==='user'&&result.messages[1]?.id==='assistant','dialogue should be chronological');
  assert(result.messages[1]?.speaker_character_instance_id==='becka','group speaker attribution should be retained');
});

Deno.test('plan history media includes generated and unexpired shared photos without leaking private metadata',()=>{
  const messages=[{id:'message',together_conversation_attachments:[
    {id:'shared',kind:'image',upload_status:'uploaded',storage_path:'user/shared.webp',mime_type:'image/webp',created_at:'2026-08-31T12:01:00Z',content_rating:'safe',visibility_scope:'all',analysis_metadata:{description:'private vision detail'}},
    {id:'expired',kind:'image',upload_status:'uploaded',storage_path:'user/expired.webp',mime_type:'image/webp',expires_at:'2026-08-30T12:01:00Z',created_at:'2026-08-29T12:01:00Z',content_rating:'safe',visibility_scope:'all'},
  ]}];
  const result=projectPlanHistoryMedia({
    generated:[{id:'generated',media_type:'image',status:'ready',storage_path:'user/generated.webp',content_type:'image/webp',created_at:'2026-08-31T12:02:00Z',metadata:{providerSecret:'never return'}}],
    messages,
    signedUrls:new Map([['user/shared.webp','https://signed.test/shared'],['user/expired.webp','https://signed.test/expired'],['user/generated.webp','https://signed.test/generated']]),
    now:new Date('2026-08-31T13:00:00Z'),
  });
  assert(result.length===2,'expired shared photos should be omitted');
  assert(result[0]?.source==='shared'&&result[1]?.source==='generated','media should remain chronological');
  const serialized=JSON.stringify(result);
  assert(!serialized.includes('private vision detail')&&!serialized.includes('providerSecret')&&!serialized.includes('storage_path'),'sensitive analysis, provider metadata, and raw storage paths must not leave the server');
});
