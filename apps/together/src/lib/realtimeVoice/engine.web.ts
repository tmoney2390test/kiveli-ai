import type { RealtimeAudioEngine } from './engine.types';

type BrowserAudioContext=AudioContext;
export class PlatformRealtimeAudioEngine implements RealtimeAudioEngine {
  readonly speakerControlAvailable=true;
  private context:BrowserAudioContext|null=null;private stream:MediaStream|null=null;private primedStream:MediaStream|null=null;private processor:ScriptProcessorNode|null=null;
  private inputSource:MediaStreamAudioSourceNode|null=null;private keepAlive:GainNode|null=null;private output:GainNode|null=null;
  private sources=new Set<AudioBufferSourceNode>();private nextOutputAt=0;private muted=false;private closing=false;
  async requestPermission():Promise<'granted'|'denied'>{
    try{
      // Create and resume the audio context while this method is still being
      // called from the user's Call-button gesture. Mobile browsers can leave
      // a context created later (after the session fetch) suspended forever.
      if(this.primedStream?.getAudioTracks().some((track)=>track.readyState==='live'))return'granted';
      const context=this.ensureContext(),resume=context.resume();
      this.primedStream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      await settleAudioContext(resume,context);
      return'granted';
    }catch{await this.close().catch(()=>undefined);return'denied';}
  }
  async open(input:{sampleRate:number;onInput:(base64Pcm16:string)=>void;onError:(error:Error)=>void}){
    try{
      this.closing=false;
      this.stream=this.primedStream??await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});this.primedStream=null;
      this.context=this.ensureContext();await settleAudioContext(this.context.resume(),this.context);
      this.output=this.context.createGain();this.output.gain.value=1;this.output.connect(this.context.destination);
      this.inputSource=this.context.createMediaStreamSource(this.stream);this.processor=this.context.createScriptProcessor(4096,1,1);this.keepAlive=this.context.createGain();this.keepAlive.gain.value=0;
      this.processor.onaudioprocess=(event)=>{if(this.muted)return;const samples=resample(event.inputBuffer.getChannelData(0),this.context?.sampleRate??48_000,input.sampleRate);if(samples.length)input.onInput(floatToBase64Pcm16(samples));};
      this.inputSource.connect(this.processor);this.processor.connect(this.keepAlive);this.keepAlive.connect(this.context.destination);
    }catch(error){input.onError(error instanceof Error?error:new Error('Microphone setup failed.'));throw error;}
  }
  resetForReconnect(){return this.teardown(false);}
  close(){return this.teardown(true);}
  private async teardown(closeContext:boolean){
    this.closing=true;
    const context=this.context,stream=this.stream,primedStream=this.primedStream,processor=this.processor,inputSource=this.inputSource,keepAlive=this.keepAlive,output=this.output;
    // Muting the gain node is synchronous, so Hang Up is silent even while the
    // browser finishes closing its AudioContext asynchronously.
    if(output)output.gain.value=0;
    if(processor)processor.onaudioprocess=null;
    for(const source of this.sources)try{source.stop();}catch{/* A source may already have ended. */}
    this.sources.clear();if(closeContext)this.context=null;this.stream=null;this.primedStream=null;this.processor=null;this.inputSource=null;this.keepAlive=null;this.output=null;this.nextOutputAt=0;
    processor?.disconnect();inputSource?.disconnect();keepAlive?.disconnect();output?.disconnect();stream?.getTracks().forEach((track)=>track.stop());primedStream?.getTracks().forEach((track)=>track.stop());
    if(closeContext)await context?.close().catch(()=>undefined);
  }
  setMuted(muted:boolean){this.muted=muted;this.stream?.getAudioTracks().forEach((track)=>{track.enabled=!muted;});return Promise.resolve();}
  setSpeakerEnabled(enabled:boolean){if(this.output)this.output.gain.value=enabled?1:0;return Promise.resolve();}
  pushOutput(input:{audio:string;turnId:string;first:boolean}){const context=this.context,output=this.output;if(this.closing||!context||!output)return;const pcm=base64Pcm16ToFloat(input.audio),buffer=context.createBuffer(1,pcm.length,24_000);buffer.getChannelData(0).set(pcm);const source=context.createBufferSource();source.buffer=buffer;source.connect(output);source.onended=()=>this.sources.delete(source);this.sources.add(source);const start=Math.max(context.currentTime,this.nextOutputAt);source.start(start);this.nextOutputAt=start+buffer.duration;}
  endOutput(){}
  interrupt(){for(const source of this.sources)try{source.stop();}catch{/* A source may already have ended. */}this.sources.clear();this.nextOutputAt=this.context?.currentTime??0;return Promise.resolve();}
  private ensureContext():BrowserAudioContext{
    if(this.context&&this.context.state!=='closed')return this.context;
    const AudioContextConstructor=window.AudioContext??(window as typeof window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
    if(!AudioContextConstructor)throw new Error('Live audio is not supported in this browser.');
    this.closing=false;this.context=new AudioContextConstructor();return this.context;
  }
}

async function settleAudioContext(resume:Promise<void>,context:BrowserAudioContext):Promise<void>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([resume,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Tap Call to enable live audio in this browser.')),6_000);})]);}
  finally{if(timer)clearTimeout(timer);}
  if(context.state!=='running')throw new Error('Tap Call to enable live audio in this browser.');
}

function resample(input:Float32Array,inputRate:number,outputRate:number):Float32Array{if(inputRate===outputRate)return input;const ratio=inputRate/outputRate,length=Math.max(1,Math.round(input.length/ratio)),output=new Float32Array(length);for(let index=0;index<length;index+=1){const position=index*ratio,left=Math.floor(position),right=Math.min(input.length-1,left+1),mix=position-left;output[index]=(input[left]??0)*(1-mix)+(input[right]??0)*mix;}return output;}
function floatToBase64Pcm16(input:Float32Array):string{const bytes=new Uint8Array(input.length*2),view=new DataView(bytes.buffer);for(let index=0;index<input.length;index+=1){const sample=Math.max(-1,Math.min(1,input[index]??0));view.setInt16(index*2,sample<0?sample*0x8000:sample*0x7fff,true);}let binary='';for(let start=0;start<bytes.length;start+=0x8000)binary+=String.fromCharCode(...bytes.subarray(start,Math.min(bytes.length,start+0x8000)));return btoa(binary);}
function base64Pcm16ToFloat(value:string):Float32Array{const binary=atob(value),bytes=new Uint8Array(binary.length);for(let index=0;index<binary.length;index+=1)bytes[index]=binary.charCodeAt(index);const view=new DataView(bytes.buffer),output=new Float32Array(Math.floor(bytes.length/2));for(let index=0;index<output.length;index+=1)output[index]=view.getInt16(index*2,true)/0x8000;return output;}
