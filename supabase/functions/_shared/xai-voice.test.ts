import type { CompanionVoiceProfile } from '../../../packages/together-domain/src/multimodal.ts';
import { configuredRealtimeVoiceProvider, configuredTextToSpeechProvider } from './kivelle-multimodal.ts';
import { XaiRealtimeVoiceProvider, XaiTextToSpeechProvider, voiceRolloutEligible, xaiVoiceId } from './xai-voice.ts';

const voice:CompanionVoiceProfile={characterTemplateId:'template-brooke',voiceKey:'brooke-default',characteristics:{warmth:.8,energy:.6,pace:.55,expressiveness:.7,softness:.6}};

Deno.test('xAI TTS sends the official REST contract and validates timed audio', async () => {
  let url='',body:Record<string,unknown>={};
  const provider=new XaiTextToSpeechProvider('server-secret','https://xai.test/v1',1_000,async(input,init)=>{
    url=String(input);body=JSON.parse(String(init?.body));
    return new Response(JSON.stringify({audio:btoa('mp3-bytes'),content_type:'audio/mpeg',duration:1.25,audio_timestamps:{graph_chars:['H'],graph_times:[[0,1.25]]}}),{status:200,headers:{'content-type':'application/json','x-request-id':'tts-1'}});
  });
  const result=await provider.synthesize({text:'Hello.',voice,outputFormat:'mp3',delivery:{speed:.95}});
  assert(url==='https://xai.test/v1/tts');
  assert(body.voice_id===xaiVoiceId(voice)&&body.language==='auto'&&body.with_timestamps===true&&body.speed===.95);
  assert(result.contentType==='audio/mpeg'&&result.durationMs===1250&&result.providerRequestId==='tts-1'&&result.bytes.length>0);
  assert(result.characterCount===6&&Number(result.estimatedCostUsd)>0);
});

Deno.test('xAI stable voice mapping honors authored provider ids', () => {
  assert(xaiVoiceId({...voice,providerMappings:{xai:'CustomVoice'}})==='CustomVoice');
  assert(xaiVoiceId({...voice,providerMappings:{xai:'EVE'}})==='eve');
  assert(['ara','eve','sal'].includes(xaiVoiceId({...voice,providerMappings:{xai:'luna'}})));
  assert(xaiVoiceId(voice)===xaiVoiceId(voice));
  assert(xaiVoiceId({...voice,voiceKey:'different-key'})!=='' );
});

Deno.test('xAI TTS does not retry malformed requests', async () => {
  let calls=0;
  const provider=new XaiTextToSpeechProvider('secret','https://xai.test/v1',500,async()=>{calls+=1;return new Response('{}',{status:422});});
  let rejected=false;
  try{await provider.synthesize({text:'Hello',voice});}catch{rejected=true;}
  assert(rejected&&calls===1);
});

Deno.test('xAI realtime provider mints only an ephemeral secret and client config',async()=>{
  let captured:Record<string,unknown>={};
  const provider=new XaiRealtimeVoiceProvider('permanent-secret','grok-voice-think-fast-2.0','https://xai.test/v1',1_000,async(_input,init)=>{
    captured=JSON.parse(String(init?.body));
    return new Response(JSON.stringify({value:'ephemeral-only',expires_at:Math.floor(Date.now()/1000)+300}),{status:200});
  });
  const result=await provider.createSession({callSessionId:'call-1',voice,context:{character:{name:'Brooke',age:25},persona:{display_name:'Tim'},currentScene:{locationName:'Glassline Gallery'},currentWorld:{name:'Juniper City'},contentMode:'romance'}});
  assert((captured.expires_after as Record<string,unknown>).seconds===300);
  assert(result.clientSecret==='ephemeral-only'&&result.clientConfiguration?.model==='grok-voice-think-fast-2.0');
  assert(result.clientConfiguration?.greeting.includes('Brooke'));
  assert(!JSON.stringify(result).includes('permanent-secret'));
  const session=result.clientConfiguration?.session as Record<string,unknown>;
  assert(String(session.instructions).includes('Kivelle is authoritative'));
  const audio=session.audio as {input:{format:{type:string;rate:number};transcription:{model:string;keyterms:string[]}};output:{format:{type:string;rate:number}}};
  const turnDetection=session.turn_detection as {type:string};
  assert(audio.input.format.type==='audio/pcm'&&audio.input.format.rate===24_000&&audio.input.transcription.model==='grok-transcribe');
  assert(['Kivelle','Brooke','Tim','Glassline Gallery','Juniper City'].every((term)=>audio.input.transcription.keyterms.includes(term)));
  assert(audio.output.format.type==='audio/pcm'&&audio.output.format.rate===24_000&&turnDetection.type==='server_vad');
  assert((session.resumption as {enabled:boolean}).enabled===true);
});

Deno.test('configured xAI voice providers fail closed without flags and credentials',()=>{
  const names=['XAI_API_KEY','KIVELLE_TTS_PROVIDER','KIVELLE_REALTIME_VOICE_PROVIDER','KIVELLE_XAI_TTS_ENABLED','KIVELLE_XAI_REALTIME_VOICE_ENABLED'] as const;
  const previous=Object.fromEntries(names.map((name)=>[name,Deno.env.get(name)]));
  try{
    Deno.env.set('KIVELLE_TTS_PROVIDER','xai');Deno.env.set('KIVELLE_REALTIME_VOICE_PROVIDER','xai');
    Deno.env.delete('XAI_API_KEY');Deno.env.set('KIVELLE_XAI_TTS_ENABLED','true');Deno.env.set('KIVELLE_XAI_REALTIME_VOICE_ENABLED','true');
    assert(configuredTextToSpeechProvider()===null&&configuredRealtimeVoiceProvider()===null);
    Deno.env.set('XAI_API_KEY','secret');Deno.env.set('KIVELLE_XAI_TTS_ENABLED','false');Deno.env.set('KIVELLE_XAI_REALTIME_VOICE_ENABLED','false');
    assert(configuredTextToSpeechProvider()===null&&configuredRealtimeVoiceProvider()===null);
    Deno.env.set('KIVELLE_XAI_TTS_ENABLED','true');Deno.env.set('KIVELLE_XAI_REALTIME_VOICE_ENABLED','true');
    assert(configuredTextToSpeechProvider()?.id==='xai'&&configuredRealtimeVoiceProvider()?.id==='xai');
  }finally{for(const name of names)restore(name,previous[name]);}
});

Deno.test('xAI voice canary defaults closed and opens only configured cohorts',()=>{
  const previous=Deno.env.get('KIVELLE_XAI_VOICE_CANARY_PERCENT');
  try{Deno.env.delete('KIVELLE_XAI_VOICE_CANARY_PERCENT');assert(!voiceRolloutEligible('user-1'));Deno.env.set('KIVELLE_XAI_VOICE_CANARY_PERCENT','100');assert(voiceRolloutEligible('user-1'));}finally{restore('KIVELLE_XAI_VOICE_CANARY_PERCENT',previous);}
});

function assert(value:unknown):asserts value{if(!value)throw new Error('assertion_failed');}
function restore(name:string,value:string|undefined){if(value==null)Deno.env.delete(name);else Deno.env.set(name,value);}
