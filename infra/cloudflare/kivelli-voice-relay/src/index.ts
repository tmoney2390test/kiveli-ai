import { DurableObject } from 'cloudflare:workers';

export type VoiceConfiguration={transport:'xai_cascade';route:'standard';url:string;model:string;voice:string;sampleRate:number;greeting?:string;session:{instructions:string;voice:string;sttModel:string;dialogueModel:string;ttsModel:string;language?:string;transcriptionLanguage?:string|null;keyterms?:string[];promptCacheKey:string;usageSequenceStart?:number;turnDetection?:{threshold?:number;silenceDurationMs?:number;smartTurn?:boolean;smartTurnTimeoutMs?:number}}};
export type VoiceClientConfiguration={transport:'xai_cascade';route:'standard';url:string;model:string;voice:string;sampleRate:number;greeting?:string;session:Record<string,never>;relayEnvelope:string};
type RelayClaims={sub:string;callSessionId:string;route:'standard';jti:string;configHash:string;iat:number;exp:number};
type PipelineUsage={sequence:number;sttBillableMs:number;inputSpeechMs:number;dialogueInputTokens:number;dialogueCachedInputTokens:number;dialogueOutputTokens:number;ttsCharacters:number;outputAudioMs:number;discardedOutputAudioMs:number;sttFinalLatencyMs?:number;dialogueFirstTokenLatencyMs?:number;ttsFirstAudioLatencyMs?:number;status:'success'|'interrupted'|'failure';failureCode?:string};
type TurnState={id:string;sequence:number;userText:string;assistantText:string;sentText:string;startedAt:number;sttFinalAt:number;firstTokenAt?:number;firstAudioAt?:number;inputSpeechMs:number;outputAudioMs:number;usage:PipelineUsage;dialogueDone:boolean;audioDone:boolean;interrupted:boolean};
type QueuedTtsTurn={id:string;text:string;greeting:boolean;sequence:number;startedAt:number;firstAudioAt?:number;outputAudioMs:number};
type VoiceRelayEnv=Env&Readonly<{XAI_API_KEY:string;KIVELLE_VOICE_RELAY_VERIFY_SECRET:string;VOICE_CALL_GUARD:DurableObjectNamespace<VoiceCallGuard>}>;

/** One coordination atom per Kivelle call; no transcript or audio is stored. */
export class VoiceCallGuard extends DurableObject<VoiceRelayEnv>{
  constructor(ctx:DurableObjectState,env:VoiceRelayEnv){
    super(ctx,env);
    void ctx.blockConcurrencyWhile(()=>{
      ctx.storage.sql.exec(`
        create table if not exists used_tokens(jti text primary key,expires_at integer not null);
        create table if not exists active_session(singleton integer primary key check(singleton=1),jti text not null,lease_expires_at integer not null);
      `);
      return Promise.resolve();
    });
  }
  claim(jti:string,tokenExpiresAt:number,now=Date.now()):boolean{
    const boundedJti=jti.slice(0,120),nowSeconds=Math.floor(now/1_000),leaseExpiresAt=now+30_000;
    this.ctx.storage.sql.exec('delete from used_tokens where expires_at<?',nowSeconds);
    this.ctx.storage.sql.exec('delete from active_session where lease_expires_at<?',now);
    const used=this.ctx.storage.sql.exec<{jti:string}>('select jti from used_tokens where jti=?',boundedJti).toArray();
    const active=this.ctx.storage.sql.exec<{jti:string}>('select jti from active_session where singleton=1').toArray();
    if(used.length||active.length)return false;
    this.ctx.storage.sql.exec('insert into used_tokens(jti,expires_at) values(?,?)',boundedJti,tokenExpiresAt);
    this.ctx.storage.sql.exec('insert into active_session(singleton,jti,lease_expires_at) values(1,?,?)',boundedJti,leaseExpiresAt);
    return true;
  }
  touch(jti:string,now=Date.now()):boolean{
    const result=this.ctx.storage.sql.exec('update active_session set lease_expires_at=? where singleton=1 and jti=?',now+30_000,jti.slice(0,120));
    return result.rowsWritten===1;
  }
  release(jti:string):void{this.ctx.storage.sql.exec('delete from active_session where singleton=1 and jti=?',jti.slice(0,120));}
}

export default {
  fetch(request:Request,env:VoiceRelayEnv,ctx:ExecutionContext):Response{
    const url=new URL(request.url);
    if(url.pathname==='/health')return Response.json({ok:true,service:'kivelli-voice-relay'});
    if(url.pathname!=='/v1/call'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('Not found',{status:404});
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];server.accept();
    const session=new CascadeSession(server,env);ctx.waitUntil(session.closed);
    return new Response(null,{status:101,webSocket:client});
  },
} satisfies ExportedHandler<VoiceRelayEnv>;

class CascadeSession{
  readonly closed:Promise<void>;
  private closeResolve!:()=>void;private authenticated=false;private closing=false;private configuration:VoiceConfiguration|null=null;private claims:RelayClaims|null=null;
  private failureLogged=false;
  private stt:WebSocket|null=null;private tts:WebSocket|null=null;private sttReady=false;private ttsReady=false;private inputAudioMs=0;private inputAtLastTurn=0;private history:Array<{role:'user'|'assistant';content:string}>=[];
  private activeTurn:TurnState|null=null;private turnSequence=0;private abort:AbortController|null=null;private ttsTurnQueue:QueuedTtsTurn[]=[];
  private usageSequence=0;private userSpeaking=false;private userSpeechStartedAt=0;
  private guard:DurableObjectStub<VoiceCallGuard>|null=null;private guardTimer:ReturnType<typeof setInterval>|null=null;
  constructor(private readonly client:WebSocket,private readonly env:VoiceRelayEnv){
    this.closed=new Promise<void>((resolve)=>{this.closeResolve=resolve;});
    client.addEventListener('message',(event)=>{if(typeof event.data!=='string'){this.fail('invalid_message',false);return;}void this.onClientMessage(event.data).catch((error)=>this.fail(relayFailureCode(error),false));});
    client.addEventListener('close',()=>this.close());client.addEventListener('error',()=>this.close());
    setTimeout(()=>{if(!this.authenticated)this.fail('authentication_timeout',false);},10_000);
  }
  private async onClientMessage(data:string|ArrayBuffer){
    if(typeof data!=='string'||data.length>1_000_000){this.fail('invalid_message',false);return;}
    const message=record(JSON.parse(data));
    if(!this.authenticated){if(message.type!=='kivelle.auth')throw new Error('auth_required');await this.authenticate(message);return;}
    if(message.type==='input_audio_buffer.append'&&typeof message.audio==='string'){
      if(message.audio.length>350_000)throw new Error('audio_frame_too_large');
      const bytes=decodeBase64(message.audio);this.inputAudioMs+=Math.round(bytes.byteLength/2/(this.configuration?.sampleRate??24_000)*1_000);if(this.stt?.readyState===WebSocket.OPEN)this.stt.send(bytes.buffer);
    }
  }
  private async authenticate(message:Record<string,unknown>){
    const token=text(message.token),clientConfiguration=message.configuration;
    if(!isVoiceClientConfiguration(clientConfiguration))throw new Error('invalid_client_configuration');
    const claims=await verifyRelayToken(token,this.env.KIVELLE_VOICE_RELAY_VERIFY_SECRET,clientConfiguration);
    const configuration=await openRelayConfiguration(clientConfiguration.relayEnvelope,this.env.KIVELLE_VOICE_RELAY_VERIFY_SECRET);
    if(!isVoiceConfiguration(configuration)||configuration.voice!==clientConfiguration.voice||configuration.model!==clientConfiguration.model||configuration.sampleRate!==clientConfiguration.sampleRate)throw new Error('invalid_relay_configuration');
    const guard=this.env.VOICE_CALL_GUARD.getByName(claims.callSessionId);
    if(!await guard.claim(claims.jti,claims.exp)){
      this.safeSend({type:'error',error:{type:'server_error',code:'relay_session_conflict'}});this.close();return;
    }
    this.guard=guard;this.guardTimer=setInterval(()=>{if(this.claims)void guard.touch(this.claims.jti);},10_000);
    this.authenticated=true;this.configuration=configuration;this.claims=claims;this.usageSequence=boundedNumber(configuration.session.usageSequenceStart,999_000);
    await Promise.all([this.connectStt(),this.connectTts()]);
    this.safeSend({type:'conversation.created',conversation:{id:`relay-${claims.callSessionId}`}});
    this.safeSend({type:'session.updated',session:{route:'standard'}});
    if(message.greet!==false&&configuration.greeting?.trim())this.speak(configuration.greeting.trim(),`greeting-${claims.jti}`,true);
    this.log('voice_relay_connected',{callSessionId:claims.callSessionId,route:'standard'});
  }
  private async connectStt(){
    const url=buildSttUrl(this.env.XAI_STT_URL||'wss://api.x.ai/v1/stt',this.configuration!);
    const socket=await openProviderWebSocket(url,this.env.XAI_API_KEY,'stt');socket.accept();this.stt=socket;
    await new Promise<void>((resolve,reject)=>{
      let settled=false;const timeout=setTimeout(()=>{if(!settled){settled=true;reject(new Error('stt_ready_timeout'));}},10_000);
      socket.addEventListener('message',(event)=>{if(typeof event.data!=='string')return;let value:Record<string,unknown>;try{value=record(JSON.parse(event.data));}catch{return;}if(value.type==='transcript.created'&&!settled){settled=true;clearTimeout(timeout);this.sttReady=true;resolve();return;}this.onSttEvent(value);});
      socket.addEventListener('close',()=>{if(!settled){settled=true;clearTimeout(timeout);reject(new Error('stt_closed_before_ready'));}else if(!this.closing)this.fail('stt_closed',true);});
      socket.addEventListener('error',()=>{if(!settled){settled=true;clearTimeout(timeout);reject(new Error('stt_failed_before_ready'));}else this.fail('stt_failed',true);});
    });
  }
  private async connectTts(){
    const url=buildTtsUrl(this.env.XAI_TTS_URL||'wss://api.x.ai/v1/tts',this.configuration!);
    const socket=await openProviderWebSocket(url,this.env.XAI_API_KEY,'tts');socket.accept();this.tts=socket;
    socket.addEventListener('message',(event)=>{if(typeof event.data==='string')this.onTtsMessage(event.data);});socket.addEventListener('close',()=>{if(!this.closing)this.fail('tts_closed',true);});socket.addEventListener('error',()=>this.fail('tts_failed',true));
    this.ttsReady=true;
  }
  private onSttEvent(event:Record<string,unknown>){
    const type=text(event.type),transcript=firstText(event.transcript,event.text,event.delta).trim();
    if(type==='transcript.created'){this.sttReady=true;return;}
    if(type==='transcript.partial'&&transcript){
      if(!this.userSpeaking){this.userSpeaking=true;this.userSpeechStartedAt=Date.now();this.interrupt();this.safeSend({type:'input_audio_buffer.speech_started'});}
      if(event.speech_final===true){
        this.userSpeaking=false;this.safeSend({type:'input_audio_buffer.speech_stopped'});const providerId=firstText(event.id,event.event_id)||`stt-${crypto.randomUUID()}`;this.safeSend({type:'conversation.item.input_audio_transcription.completed',transcript,item_id:providerId});const speechDurationMs=Math.max(0,Math.round(Number(event.duration??0)*1_000));void this.generateTurn(transcript,speechDurationMs,this.userSpeechStartedAt);
      }else this.safeSend({type:'conversation.item.input_audio_transcription.updated',transcript});
      return;
    }
    if(type==='transcript.done'&&transcript&&this.userSpeaking){
      this.userSpeaking=false;this.safeSend({type:'input_audio_buffer.speech_stopped'});const providerId=firstText(event.id,event.event_id)||`stt-${crypto.randomUUID()}`;this.safeSend({type:'conversation.item.input_audio_transcription.completed',transcript,item_id:providerId});const speechDurationMs=Math.max(0,Math.round(Number(event.duration??0)*1_000));void this.generateTurn(transcript,speechDurationMs,this.userSpeechStartedAt);
    }
    if(type==='error')this.fail('stt_provider_error',true);
  }
  private async generateTurn(userText:string,speechDurationMs:number,speechStartedAt:number){
    if(this.activeTurn&&!this.activeTurn.interrupted)return;this.turnSequence+=1;const now=Date.now(),sttBillableMs=Math.max(0,this.inputAudioMs-this.inputAtLastTurn);this.inputAtLastTurn=this.inputAudioMs;const sequence=++this.usageSequence;
    const inputSpeechMs=speechDurationMs||sttBillableMs,sttFinalLatencyMs=Math.max(0,now-speechStartedAt);
    const turn:TurnState={id:`turn-${this.claims!.callSessionId}-${this.turnSequence}`,sequence,userText,assistantText:'',sentText:'',startedAt:speechStartedAt,sttFinalAt:now,inputSpeechMs,outputAudioMs:0,usage:{sequence,sttBillableMs,inputSpeechMs,dialogueInputTokens:0,dialogueCachedInputTokens:0,dialogueOutputTokens:0,ttsCharacters:0,outputAudioMs:0,discardedOutputAudioMs:0,sttFinalLatencyMs,status:'success'},dialogueDone:false,audioDone:false,interrupted:false};
    this.activeTurn=turn;this.history.push({role:'user',content:userText});this.history=this.history.slice(-40);this.abort=new AbortController();
    try{
      const response=await fetch(this.env.XAI_RESPONSES_URL||'https://api.x.ai/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${this.env.XAI_API_KEY}`,'Content-Type':'application/json',Accept:'text/event-stream'},body:JSON.stringify({model:this.configuration!.session.dialogueModel,instructions:this.configuration!.session.instructions,input:this.history,stream:true,store:false,reasoning:{effort:'low'},prompt_cache_key:this.configuration!.session.promptCacheKey,max_output_tokens:700}),signal:this.abort.signal});
      if(!response.ok||!response.body)throw new Error(`dialogue_${response.status}`);await this.readDialogueStream(response,turn);if(turn.interrupted)return;turn.dialogueDone=true;const remainder=turn.assistantText.slice(turn.sentText.length);if(remainder.trim())this.sendTtsText(remainder);this.tts?.send(JSON.stringify({type:'text.done'}));
    }catch{if(turn.interrupted||this.abort?.signal.aborted)return;turn.usage.status='failure';turn.usage.failureCode='dialogue_failed';this.emitUsage(turn);this.fail('dialogue_failed',true);}
  }
  private async readDialogueStream(response:Response,turn:TurnState){
    const reader=response.body!.getReader(),decoder=new TextDecoder();let buffer='';
    while(true){const{value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const frames=buffer.split('\n\n');buffer=frames.pop()??'';for(const frame of frames)this.consumeDialogueFrame(frame,turn);if(turn.interrupted)break;}
    if(buffer.trim())this.consumeDialogueFrame(buffer,turn);
  }
  private consumeDialogueFrame(frame:string,turn:TurnState){
    const data=frame.split('\n').find((line)=>line.startsWith('data: '))?.slice(6);if(!data||data==='[DONE]')return;let event:Record<string,unknown>;try{event=record(JSON.parse(data));}catch{return;}const type=text(event.type);
    if(type==='response.output_text.delta'&&typeof event.delta==='string'){
      if(!turn.firstTokenAt){turn.firstTokenAt=Date.now();turn.usage.dialogueFirstTokenLatencyMs=turn.firstTokenAt-turn.sttFinalAt;}turn.assistantText+=event.delta;this.safeSend({type:'response.output_audio_transcript.delta',delta:event.delta,response_id:turn.id});this.flushSpeakableText(turn);
    }
    if(type==='response.completed'){
      const responseRecord=record(event.response),usage=record(responseRecord.usage??event.usage),inputDetails=record(usage.input_tokens_details);
      turn.usage.dialogueInputTokens=boundedNumber(usage.input_tokens,2_000_000);turn.usage.dialogueCachedInputTokens=boundedNumber(inputDetails.cached_tokens,2_000_000);turn.usage.dialogueOutputTokens=boundedNumber(usage.output_tokens,100_000);
    }
    if(type==='error')throw new Error('dialogue_provider_error');
  }
  private flushSpeakableText(turn:TurnState){
    const unsent=turn.assistantText.slice(turn.sentText.length),match=/^([\s\S]{40,220}?[.!?](?:\s+|$))/.exec(unsent);if(!match)return;turn.sentText+=match[1];this.sendTtsText(match[1]);
  }
  private sendTtsText(text:string){if(!text||this.tts?.readyState!==WebSocket.OPEN)return;this.activeTurn!.usage.ttsCharacters+=text.length;this.tts.send(JSON.stringify({type:'text.delta',delta:text}));}
  private speak(text:string,turnId:string,greeting=false){
    if(!this.ttsReady||!this.tts)throw new Error('tts_not_ready');this.ttsTurnQueue.push({id:turnId,text,greeting,sequence:++this.usageSequence,startedAt:Date.now(),outputAudioMs:0});this.tts.send(JSON.stringify({type:'text.delta',delta:text}));this.tts.send(JSON.stringify({type:'text.done'}));if(greeting)this.history.push({role:'assistant',content:text});
  }
  private onTtsMessage(data:string|ArrayBuffer){
    if(typeof data!=='string')return;let event:Record<string,unknown>;try{event=record(JSON.parse(data));}catch{return;}const type=text(event.type);
    if(['session.created','session.updated'].includes(type)){this.ttsReady=true;return;}
    if(type==='audio.delta'){
      const audio=firstText(event.audio,event.delta);if(!audio)return;const turn=this.activeTurn,queued=this.ttsTurnQueue[0],turnId=turn?.id??queued?.id??'assistant-turn',now=Date.now();if(turn&&!turn.firstAudioAt){turn.firstAudioAt=now;turn.usage.ttsFirstAudioLatencyMs=turn.firstAudioAt-(turn.firstTokenAt??turn.sttFinalAt);}if(!turn&&queued&&!queued.firstAudioAt)queued.firstAudioAt=now;const duration=pcmDuration(audio,this.configuration?.sampleRate??24_000);if(turn)turn.outputAudioMs+=duration;else if(queued)queued.outputAudioMs+=duration;this.safeSend({type:'response.output_audio.delta',delta:audio,response_id:turnId});return;
    }
    if(['audio.done','turn.done'].includes(type)){
      const turn=this.activeTurn,queued=turn?undefined:this.ttsTurnQueue.shift(),turnId=turn?.id??queued?.id??'assistant-turn';this.safeSend({type:'response.output_audio.done',response_id:turnId});if(turn&&!turn.interrupted&&turn.dialogueDone){turn.audioDone=true;turn.usage.outputAudioMs=turn.outputAudioMs;this.safeSend({type:'response.output_audio_transcript.done',transcript:turn.assistantText,item_id:turn.id});this.history.push({role:'assistant',content:turn.assistantText});this.history=this.history.slice(-40);this.emitUsage(turn);this.activeTurn=null;}else if(queued?.greeting){this.safeSend({type:'response.output_audio_transcript.done',transcript:queued.text,item_id:queued.id});this.emitQueuedUsage(queued,'success');}return;
    }
    if(type==='audio.clear')return;
    if(type==='error')this.fail('tts_provider_error',true);
  }
  private interrupt(){const turn=this.activeTurn;if(!turn){if(this.ttsTurnQueue.length){this.tts?.send(JSON.stringify({type:'text.clear'}));for(const queued of this.ttsTurnQueue)this.emitQueuedUsage(queued,'interrupted');this.ttsTurnQueue=[];}return;}if(turn.interrupted)return;turn.interrupted=true;this.abort?.abort();this.tts?.send(JSON.stringify({type:'text.clear'}));turn.usage.status='interrupted';turn.usage.discardedOutputAudioMs=Math.max(0,turn.outputAudioMs);this.emitUsage(turn);this.activeTurn=null;}
  private emitUsage(turn:TurnState){void this.sendSignedUsage(turn.usage);}
  private emitQueuedUsage(turn:QueuedTtsTurn,status:'success'|'interrupted'){void this.sendSignedUsage({sequence:turn.sequence,sttBillableMs:0,inputSpeechMs:0,dialogueInputTokens:0,dialogueCachedInputTokens:0,dialogueOutputTokens:0,ttsCharacters:turn.text.length,outputAudioMs:turn.outputAudioMs,discardedOutputAudioMs:status==='interrupted'?turn.outputAudioMs:0,ttsFirstAudioLatencyMs:turn.firstAudioAt==null?undefined:Math.max(0,turn.firstAudioAt-turn.startedAt),status});}
  private async sendSignedUsage(event:PipelineUsage){if(!this.claims)return;const proof=await signUsageProof(this.claims.callSessionId,event,this.env.KIVELLE_VOICE_RELAY_VERIFY_SECRET);this.safeSend({type:'kivelle.usage',event,proof});}
  private fail(code:string,recoverable:boolean){
    if(!this.failureLogged){
      this.failureLogged=true;
      this.log('voice_relay_failed',{callSessionId:this.claims?.callSessionId??null,code,recoverable,authenticated:this.authenticated,sttReady:this.sttReady,ttsReady:this.ttsReady});
    }
    this.safeSend({type:'error',error:{type:recoverable?'server_error':'authentication_error',code}});if(!recoverable)this.close();
  }
  private safeSend(value:unknown){if(this.client.readyState===WebSocket.OPEN)this.client.send(JSON.stringify(value));}
  private close(){if(this.closing)return;this.closing=true;this.abort?.abort();if(this.guardTimer)clearInterval(this.guardTimer);this.guardTimer=null;if(this.guard&&this.claims)void this.guard.release(this.claims.jti);closeSocket(this.stt,'client_closed');closeSocket(this.tts,'client_closed');closeSocket(this.client,'closed');this.log('voice_relay_ended',{callSessionId:this.claims?.callSessionId??null,turnCount:this.turnSequence});this.closeResolve();}
  private log(event:string,fields:Record<string,unknown>){console.log(JSON.stringify({event,...fields}));}
}

export async function verifyRelayToken(token:string,secret:string,configuration:unknown):Promise<RelayClaims>{
  if(!secret||token.length>20_000)throw new Error('relay_secret_missing');const parts=token.split('.');if(parts.length!==3)throw new Error('invalid_token');const unsigned=`${parts[0]}.${parts[1]}`;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);const valid=await crypto.subtle.verify('HMAC',key,decodeBase64Url(parts[2]),new TextEncoder().encode(unsigned));if(!valid)throw new Error('invalid_signature');
  const claimsValue:unknown=JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));if(!isRelayClaims(claimsValue)||claimsValue.route!=='standard'||claimsValue.exp<=Math.floor(Date.now()/1000)||claimsValue.iat>Math.floor(Date.now()/1000)+30)throw new Error('invalid_claims');const configHash=await sha256Base64Url(JSON.stringify(configuration));if(configHash!==claimsValue.configHash)throw new Error('configuration_mismatch');return claimsValue;
}
export async function openRelayConfiguration(envelope:string,secret:string):Promise<unknown>{
  const parts=envelope.split('.');if(parts.length!==2)throw new Error('invalid_envelope');const iv=decodeBase64Url(parts[0]),ciphertext=decodeBase64Url(parts[1]);if(iv.byteLength!==12||ciphertext.byteLength>100_000)throw new Error('invalid_envelope');
  const material=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`kivelle-voice-relay-encryption-v1\0${secret}`));const key=await crypto.subtle.importKey('raw',material,'AES-GCM',false,['decrypt']);
  try{const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('kivelle-voice-relay-config-v1')},key,ciphertext);return JSON.parse(new TextDecoder().decode(plaintext));}catch{throw new Error('invalid_envelope');}
}
export function isVoiceClientConfiguration(value:unknown):value is VoiceClientConfiguration{const row=record(value),session=record(row.session);return row.transport==='xai_cascade'&&row.route==='standard'&&typeof row.url==='string'&&/^wss:\/\//i.test(row.url)&&typeof row.model==='string'&&typeof row.voice==='string'&&Number(row.sampleRate)===24_000&&Object.keys(session).length===0&&typeof row.relayEnvelope==='string'&&row.relayEnvelope.length<100_000;}
export function isVoiceConfiguration(value:unknown):value is VoiceConfiguration{const row=record(value),session=record(row.session),usageSequenceStart=Number(session.usageSequenceStart??0);return row.transport==='xai_cascade'&&row.route==='standard'&&typeof row.url==='string'&&/^wss:\/\//i.test(row.url)&&typeof row.model==='string'&&row.model===session.dialogueModel&&typeof row.voice==='string'&&row.voice===session.voice&&Number(row.sampleRate)===24_000&&typeof session.instructions==='string'&&session.instructions.length<=50_000&&typeof session.dialogueModel==='string'&&typeof session.sttModel==='string'&&typeof session.ttsModel==='string'&&typeof session.promptCacheKey==='string'&&Number.isInteger(usageSequenceStart)&&usageSequenceStart>=0&&usageSequenceStart<=999_000;}
export function buildSttUrl(endpoint:string,configuration:VoiceConfiguration):URL{const url=new URL(endpoint),turn=configuration.session.turnDetection;url.searchParams.set('sample_rate',String(configuration.sampleRate));url.searchParams.set('encoding','pcm');url.searchParams.set('interim_results','true');url.searchParams.set('endpointing',String(boundedNumber(turn?.silenceDurationMs??680,5_000)));if(configuration.session.transcriptionLanguage)url.searchParams.set('language',configuration.session.transcriptionLanguage);if(turn?.smartTurn!==false){url.searchParams.set('smart_turn',String(Math.max(0,Math.min(1,turn?.threshold??.72))));url.searchParams.set('smart_turn_timeout',String(Math.max(1,Math.min(5_000,Math.round(turn?.smartTurnTimeoutMs??3_000)))));}for(const keyterm of (configuration.session.keyterms??[]).slice(0,100))url.searchParams.append('keyterm',keyterm.slice(0,50));return url;}
export function buildTtsUrl(endpoint:string,configuration:VoiceConfiguration):URL{const url=new URL(endpoint);url.searchParams.set('language',configuration.session.language||'auto');url.searchParams.set('voice',configuration.voice);url.searchParams.set('codec','pcm');url.searchParams.set('sample_rate',String(configuration.sampleRate));url.searchParams.set('with_timestamps','true');return url;}
export function relayFailureCode(error:unknown):string{
  const code=error instanceof Error?error.message:'';
  return new Set([
    'stt_websocket_request_failed','stt_websocket_rejected','stt_ready_timeout','stt_closed_before_ready','stt_failed_before_ready',
    'tts_websocket_request_failed','tts_websocket_rejected','tts_closed_before_ready','tts_failed_before_ready',
  ]).has(code)?code:'relay_request_failed';
}
export function providerWebSocketFetchUrl(endpoint:URL|string):URL{
  const url=new URL(endpoint);
  if(url.protocol==='wss:')url.protocol='https:';
  else if(url.protocol==='ws:')url.protocol='http:';
  return url;
}
async function openProviderWebSocket(url:URL,apiKey:string,stage:'stt'|'tts'):Promise<WebSocket>{
  let response:Response;
  try{response=await fetch(providerWebSocketFetchUrl(url),{headers:{Authorization:`Bearer ${apiKey}`,Upgrade:'websocket'}});}
  catch{throw new Error(`${stage}_websocket_request_failed`);}
  if(!response.webSocket)throw new Error(`${stage}_websocket_rejected`);
  return response.webSocket;
}
function record(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function text(value:unknown):string{return typeof value==='string'?value:'';}
function firstText(...values:unknown[]):string{for(const value of values)if(typeof value==='string')return value;return'';}
function isRelayClaims(value:unknown):value is RelayClaims{const row=record(value);return typeof row.sub==='string'&&row.sub.length>0&&typeof row.callSessionId==='string'&&row.callSessionId.length>0&&row.route==='standard'&&typeof row.jti==='string'&&row.jti.length>0&&typeof row.configHash==='string'&&typeof row.iat==='number'&&typeof row.exp==='number';}
function closeSocket(socket:WebSocket|null,reason:string):void{try{socket?.close(1000,reason);}catch{/* Best-effort shutdown after a transport failure. */}}
function decodeBase64(value:string):Uint8Array<ArrayBuffer>{const binary=atob(value),output=new Uint8Array(new ArrayBuffer(binary.length));for(let index=0;index<binary.length;index+=1)output[index]=binary.charCodeAt(index);return output;}
function decodeBase64Url(value:string):Uint8Array<ArrayBuffer>{const normalized=value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=');return decodeBase64(normalized);}
async function sha256Base64Url(value:string):Promise<string>{const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');}
export function pcmDuration(base64:string,sampleRate:number):number{const padding=base64.endsWith('==')?2:base64.endsWith('=')?1:0,bytes=Math.max(0,Math.floor(base64.length*3/4)-padding);return Math.round(bytes/2/sampleRate*1000);}
function boundedNumber(value:unknown,max:number):number{const number=Number(value);return Number.isFinite(number)?Math.max(0,Math.min(max,Math.round(number))):0;}
function usageProofPayload(callSessionId:string,event:PipelineUsage):string{const number=(key:keyof PipelineUsage)=>Math.max(0,Math.round(Number(event[key]??0)));return `kivelle.voice.usage.v1\0${callSessionId}\0${JSON.stringify({sequence:number('sequence'),sttBillableMs:number('sttBillableMs'),inputSpeechMs:number('inputSpeechMs'),dialogueInputTokens:number('dialogueInputTokens'),dialogueCachedInputTokens:number('dialogueCachedInputTokens'),dialogueOutputTokens:number('dialogueOutputTokens'),ttsCharacters:number('ttsCharacters'),outputAudioMs:number('outputAudioMs'),discardedOutputAudioMs:number('discardedOutputAudioMs'),sttFinalLatencyMs:event.sttFinalLatencyMs==null?null:number('sttFinalLatencyMs'),dialogueFirstTokenLatencyMs:event.dialogueFirstTokenLatencyMs==null?null:number('dialogueFirstTokenLatencyMs'),ttsFirstAudioLatencyMs:event.ttsFirstAudioLatencyMs==null?null:number('ttsFirstAudioLatencyMs'),status:event.status,failureCode:event.failureCode??null})}`;}
async function signUsageProof(callSessionId:string,event:PipelineUsage,secret:string):Promise<string>{const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(usageProofPayload(callSessionId,event))));let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');}
