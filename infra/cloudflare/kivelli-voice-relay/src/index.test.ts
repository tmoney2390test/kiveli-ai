import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  buildSttUrl,
  buildTtsUrl,
  isVoiceClientConfiguration,
  isVoiceConfiguration,
  openRelayConfiguration,
  pcmDuration,
  providerWebSocketFetchUrl,
  relayFailureCode,
  verifyRelayToken,
  type VoiceConfiguration,
} from './index';

const configuration:VoiceConfiguration={
  transport:'xai_cascade',route:'standard',url:'wss://voice.example.test/v1/call',model:'grok-4.3',voice:'eve',sampleRate:24_000,
  session:{instructions:'Speak only as the configured Kivelle companion.',voice:'eve',sttModel:'grok-transcribe',dialogueModel:'grok-4.3',ttsModel:'xai-text-to-speech',promptCacheKey:'voice:call-1'},
};

describe('voice relay boundary',()=>{
  it('permits one active session and permanently rejects token replay',async()=>{
    const guard=env.VOICE_CALL_GUARD.getByName(`guard-${crypto.randomUUID()}`);
    expect(await guard.claim('jti-1',Math.floor(Date.now()/1_000)+120)).toBe(true);
    expect(await guard.claim('jti-1',Math.floor(Date.now()/1_000)+120)).toBe(false);
    expect(await guard.claim('jti-2',Math.floor(Date.now()/1_000)+120)).toBe(false);
    expect(await guard.touch('jti-1')).toBe(true);
    expect(await guard.touch('jti-2')).toBe(false);
    await guard.release('jti-1');
    expect(await guard.claim('jti-1',Math.floor(Date.now()/1_000)+120)).toBe(false);
    expect(await guard.claim('jti-2',Math.floor(Date.now()/1_000)+120)).toBe(true);
  });

  it('accepts only the expected sanitized Standard configuration',()=>{
    expect(isVoiceConfiguration(configuration)).toBe(true);
    expect(isVoiceConfiguration({...configuration,route:'express'})).toBe(false);
    expect(isVoiceConfiguration({...configuration,sampleRate:48_000})).toBe(false);
    expect(isVoiceConfiguration({...configuration,session:{...configuration.session,instructions:'x'.repeat(50_001)}})).toBe(false);
  });

  it('uses the current xAI streaming STT and TTS wire contract',()=>{
    const stt=buildSttUrl('wss://api.x.ai/v1/stt',configuration);
    expect(stt.searchParams.get('encoding')).toBe('pcm');
    expect(stt.searchParams.get('interim_results')).toBe('true');
    expect(stt.searchParams.get('sample_rate')).toBe('24000');
    expect(stt.searchParams.has('audio_format')).toBe(false);
    const tts=buildTtsUrl('wss://api.x.ai/v1/tts',configuration);
    expect(tts.searchParams.get('language')).toBe('auto');
    expect(tts.searchParams.get('voice')).toBe('eve');
    expect(tts.searchParams.get('codec')).toBe('pcm');
    expect(tts.searchParams.get('sample_rate')).toBe('24000');
    expect(tts.searchParams.get('with_timestamps')).toBe('true');
    expect(tts.searchParams.has('optimize_streaming_latency')).toBe(false);
    expect(tts.searchParams.has('text_normalization')).toBe(false);
  });

  it('passes provider-compatible language codes through the cascaded route',()=>{
    const localized={...configuration,session:{...configuration.session,language:'es-MX',transcriptionLanguage:'es'}};
    expect(buildSttUrl('wss://api.x.ai/v1/stt',localized).searchParams.get('language')).toBe('es');
    expect(buildTtsUrl('wss://api.x.ai/v1/tts',localized).searchParams.get('language')).toBe('es-MX');
  });

  it('reports the failed provider stage without exposing arbitrary errors',()=>{
    expect(relayFailureCode(new Error('tts_websocket_rejected'))).toBe('tts_websocket_rejected');
    expect(relayFailureCode(new Error('provider included private detail'))).toBe('relay_request_failed');
  });

  it('uses HTTPS for Cloudflare outbound WebSocket upgrade fetches',()=>{
    const url=providerWebSocketFetchUrl('wss://api.x.ai/v1/tts?voice=ara&codec=pcm');
    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe('api.x.ai');
    expect(url.searchParams.get('voice')).toBe('ara');
    expect(providerWebSocketFetchUrl('ws://example.test/socket').protocol).toBe('http:');
  });

  it('validates signed, call-bound, configuration-bound credentials',async()=>{
    const secret='relay-test-secret';
    const token=await signClaims({
      sub:'user-1',callSessionId:'call-1',route:'standard',jti:'relay-1',
      configHash:await sha256(JSON.stringify(configuration)),iat:now(),exp:now()+120,
    },secret);
    await expect(verifyRelayToken(token,secret,configuration)).resolves.toMatchObject({sub:'user-1',callSessionId:'call-1'});
    await expect(verifyRelayToken(token,'wrong-secret',configuration)).rejects.toThrow('invalid_signature');
    await expect(verifyRelayToken(token,secret,{...configuration,voice:'ara'})).rejects.toThrow('configuration_mismatch');
  });

  it('decrypts the private server configuration only with the relay secret',async()=>{
    const secret='relay-test-secret';
    const relayEnvelope=await sealConfiguration(configuration,secret);
    const clientConfiguration={
      transport:'xai_cascade' as const,route:'standard' as const,
      url:'wss://voice.example.test/v1/call',model:'grok-4.3',voice:'eve',sampleRate:24_000,
      session:{},relayEnvelope,
    };
    expect(isVoiceClientConfiguration(clientConfiguration)).toBe(true);
    await expect(openRelayConfiguration(relayEnvelope,secret)).resolves.toEqual(configuration);
    await expect(openRelayConfiguration(relayEnvelope,'wrong-secret')).rejects.toThrow('invalid_envelope');
    expect(JSON.stringify(clientConfiguration)).not.toContain(configuration.session.instructions);
  });

  it('rejects expired relay credentials',async()=>{
    const secret='relay-test-secret';
    const token=await signClaims({sub:'user-1',callSessionId:'call-1',route:'standard',jti:'relay-1',configHash:await sha256(JSON.stringify(configuration)),iat:now()-180,exp:now()-60},secret);
    await expect(verifyRelayToken(token,secret,configuration)).rejects.toThrow('invalid_claims');
  });

  it('accounts PCM16 duration without storing audio',()=>{
    const bytes=new Uint8Array(48_000); // one second: 24 kHz, mono, 16-bit
    expect(pcmDuration(toBase64(bytes),24_000)).toBe(1_000);
  });
});

async function signClaims(claims:Record<string,unknown>,secret:string):Promise<string>{
  const header=toBase64Url(new TextEncoder().encode(JSON.stringify({alg:'HS256',typ:'JWT'})));
  const payload=toBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const unsigned=`${header}.${payload}`;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return `${unsigned}.${toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(unsigned))))}`;
}
async function sha256(value:string):Promise<string>{return toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));}
async function sealConfiguration(value:unknown,secret:string):Promise<string>{
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const material=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`kivelle-voice-relay-encryption-v1\0${secret}`));
  const key=await crypto.subtle.importKey('raw',material,'AES-GCM',false,['encrypt']);
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('kivelle-voice-relay-config-v1')},key,new TextEncoder().encode(JSON.stringify(value))));
  return `${toBase64Url(iv)}.${toBase64Url(ciphertext)}`;
}
function toBase64(bytes:Uint8Array):string{let value='';for(const byte of bytes)value+=String.fromCharCode(byte);return btoa(value);}
function toBase64Url(bytes:Uint8Array):string{return toBase64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');}
function now():number{return Math.floor(Date.now()/1_000);}
