import { setAudioModeAsync } from 'expo-audio';
import { File } from 'expo-file-system';
import type { ExpoPlayAudioStream as ExpoPlayAudioStreamClass, Pipeline as PipelineClass } from '@edkimmel/expo-audio-stream';
import type { AudioEngineInput, RealtimeAudioEngine } from './engine.types';

type NativeAudioModule={ExpoPlayAudioStream:typeof ExpoPlayAudioStreamClass;Pipeline:typeof PipelineClass;PlaybackModes:{CONVERSATION:'conversation'}};
type EventSubscription={remove():void};

export class PlatformRealtimeAudioEngine implements RealtimeAudioEngine {
  readonly speakerControlAvailable=true;
  private playbackTimer:ReturnType<typeof setInterval>|null=null;private drainTimer:ReturnType<typeof setTimeout>|null=null;private onPlayback:AudioEngineInput['onPlayback'];private outputSampleRate=24000;private playingTurn='';private audioFocused=true;
  private microphoneSubscription:EventSubscription|null=null;
  private pipelineSubscriptions:Array<{remove():void}>=[];
  private muted=false;
  private microphoneActive=false;
  private nativeAudio:NativeAudioModule|null=null;

  async requestPermission():Promise<'granted'|'denied'>{const{ExpoPlayAudioStream}=await this.module();const result=await ExpoPlayAudioStream.requestPermissionsAsync();return result.granted?'granted':'denied';}
  async open(input:AudioEngineInput){
    this.onPlayback=input.onPlayback;this.outputSampleRate=input.sampleRate;this.audioFocused=true;
    const{ExpoPlayAudioStream,Pipeline,PlaybackModes}=await this.module();
    await setAudioModeAsync({playsInSilentMode:true,allowsRecording:true,shouldPlayInBackground:true,allowsBackgroundRecording:true,interruptionMode:'doNotMix',shouldRouteThroughEarpiece:false});
    await Pipeline.connect({sampleRate:input.sampleRate,channelCount:1,targetBufferMs:80,playbackMode:PlaybackModes.CONVERSATION,audioMode:'doNotMix'});
    this.pipelineSubscriptions.push(
      Pipeline.subscribe('PipelinePlaybackStarted',({turnId})=>{this.playingTurn=turnId;this.stopPlaybackTimer();this.playbackTimer=setInterval(()=>this.reportPlayback(),60);}),
      Pipeline.subscribe('PipelinePlaybackStopped',({turnId})=>{if(this.playingTurn===turnId){this.reportPlayback(true);this.stopPlaybackTimer();this.playingTurn='';}}),
      // Older native builds report drain but not the newer speaker-stop event.
      Pipeline.subscribe('PipelineDrained',({turnId})=>{if(this.playingTurn===turnId){this.drainTimer=setTimeout(()=>{if(this.playingTurn===turnId){this.reportPlayback(true);this.stopPlaybackTimer();this.playingTurn='';}},this.outputLatencyMs());}}),
      Pipeline.onAudioFocus(({focused})=>{this.audioFocused=focused;}),
    );
    this.pipelineSubscriptions.push(Pipeline.onError(({message})=>input.onError(new Error(message))));
    const started=await ExpoPlayAudioStream.startMicrophone({sampleRate:24_000,channels:1,encoding:'pcm_16bit',interval:60,enableProcessing:true,onAudioStream:(event)=>{if(!this.muted&&typeof event.data==='string')input.onInput(event.data);return Promise.resolve();},onError:(event)=>{if(event.isFatal)input.onError(new Error(event.message));}});
    this.microphoneSubscription=started.subscription??null;this.microphoneActive=true;
  }
  resetForReconnect(){return this.close();}
  async close(){this.stopPlaybackTimer();this.playingTurn='';
    const nativeAudio=this.nativeAudio;if(!nativeAudio)return;const{ExpoPlayAudioStream,Pipeline}=nativeAudio;
    this.microphoneSubscription?.remove();this.microphoneSubscription=null;
    for(const subscription of this.pipelineSubscriptions)subscription.remove();this.pipelineSubscriptions=[];
    const microphoneWasActive=this.microphoneActive;this.microphoneActive=false;
    // Disconnect playback before waiting for microphone finalization. Native
    // microphone shutdown may take long enough for queued companion speech to
    // remain audible after the user has already tapped Hang Up.
    const disconnecting=Pipeline.disconnect().catch(()=>undefined);
    const stoppingMicrophone=microphoneWasActive?ExpoPlayAudioStream.stopMicrophone().catch(()=>null):Promise.resolve(null);
    const[recording]=await Promise.all([stoppingMicrophone,disconnecting]);
    if(recording?.fileUri)try{const file=new File(recording.fileUri);if(file.exists)file.delete();}catch{/* Raw call capture is best-effort deleted; no Kivelle upload path exists. */}
    await setAudioModeAsync({allowsRecording:false,shouldPlayInBackground:false,allowsBackgroundRecording:false,shouldRouteThroughEarpiece:false,interruptionMode:'mixWithOthers'}).catch(()=>undefined);
  }
  setMuted(muted:boolean){this.muted=muted;this.nativeAudio?.ExpoPlayAudioStream.toggleSilence(muted);return Promise.resolve();}
  async setSpeakerEnabled(enabled:boolean){await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true,shouldPlayInBackground:true,allowsBackgroundRecording:true,interruptionMode:'doNotMix',shouldRouteThroughEarpiece:!enabled});}
  pushOutput(input:{audio:string;turnId:string;first:boolean}){this.nativeAudio?.Pipeline.pushAudioSync({audio:input.audio,turnId:input.turnId,isFirstChunk:input.first});}
  endOutput(turnId:string){this.nativeAudio?.Pipeline.pushAudioSync({audio:'',turnId,isLastChunk:true});}
  async interrupt(turnId:string){this.stopPlaybackTimer();this.playingTurn='';await this.nativeAudio?.Pipeline.invalidateTurn({turnId});}
  private reportPlayback(done=false){
    const pipeline=this.nativeAudio?.Pipeline;if(!pipeline||!this.playingTurn||!this.audioFocused)return;
    // Caption telemetry must never interrupt an otherwise healthy voice call.
    let telemetry;try{telemetry=pipeline.getTelemetry();}catch{return;}
    if(!telemetry||telemetry.turnId!==this.playingTurn||!Number.isFinite(telemetry.totalWritten)||!Number.isFinite(telemetry.totalRead)||telemetry.totalWritten<0||telemetry.totalRead<0)return;
    const totalMs=telemetry.totalWritten/this.outputSampleRate*1000;
    const playedMs=done?totalMs:Math.max(0,telemetry.totalRead/this.outputSampleRate*1000-this.outputLatencyMs());
    this.onPlayback?.({turnId:this.playingTurn,totalMs,playedMs:Math.min(totalMs,playedMs),done});
  }
  private outputLatencyMs(){try{const latency=this.nativeAudio?.Pipeline.getOutputLatencyMs();return Number.isFinite(latency)?Math.max(0,latency!):80;}catch{return 80;}}
  private stopPlaybackTimer(){if(this.playbackTimer)clearInterval(this.playbackTimer);if(this.drainTimer)clearTimeout(this.drainTimer);this.playbackTimer=null;this.drainTimer=null;}
  private async module():Promise<NativeAudioModule>{if(this.nativeAudio)return this.nativeAudio;try{this.nativeAudio=await import('@edkimmel/expo-audio-stream');return this.nativeAudio;}catch{throw new Error('Live calls require a Kivelle development build; Expo Go cannot access realtime microphone audio.');}}
}
