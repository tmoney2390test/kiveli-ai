import { setAudioModeAsync } from 'expo-audio';
import { File } from 'expo-file-system';
import type { ExpoPlayAudioStream as ExpoPlayAudioStreamClass, Pipeline as PipelineClass } from '@edkimmel/expo-audio-stream';
import type { RealtimeAudioEngine } from './engine.types';

type NativeAudioModule={ExpoPlayAudioStream:typeof ExpoPlayAudioStreamClass;Pipeline:typeof PipelineClass;PlaybackModes:{CONVERSATION:'conversation'}};
type EventSubscription={remove():void};

export class PlatformRealtimeAudioEngine implements RealtimeAudioEngine {
  readonly speakerControlAvailable=true;
  private microphoneSubscription:EventSubscription|null=null;
  private pipelineSubscriptions:Array<{remove():void}>=[];
  private muted=false;
  private microphoneActive=false;
  private nativeAudio:NativeAudioModule|null=null;

  async requestPermission():Promise<'granted'|'denied'>{const{ExpoPlayAudioStream}=await this.module();const result=await ExpoPlayAudioStream.requestPermissionsAsync();return result.granted?'granted':'denied';}
  async open(input:{sampleRate:number;onInput:(base64Pcm16:string)=>void;onError:(error:Error)=>void}){
    const{ExpoPlayAudioStream,Pipeline,PlaybackModes}=await this.module();
    await setAudioModeAsync({playsInSilentMode:true,allowsRecording:true,shouldPlayInBackground:false,allowsBackgroundRecording:false,interruptionMode:'doNotMix',shouldRouteThroughEarpiece:false});
    await Pipeline.connect({sampleRate:input.sampleRate,channelCount:1,targetBufferMs:80,playbackMode:PlaybackModes.CONVERSATION,audioMode:'doNotMix'});
    this.pipelineSubscriptions.push(Pipeline.onError(({message})=>input.onError(new Error(message))));
    const started=await ExpoPlayAudioStream.startMicrophone({sampleRate:24_000,channels:1,encoding:'pcm_16bit',interval:60,enableProcessing:true,onAudioStream:(event)=>{if(!this.muted&&typeof event.data==='string')input.onInput(event.data);return Promise.resolve();},onError:(event)=>{if(event.isFatal)input.onError(new Error(event.message));}});
    this.microphoneSubscription=started.subscription??null;this.microphoneActive=true;
  }
  async close(){
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
  async setSpeakerEnabled(enabled:boolean){await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true,interruptionMode:'doNotMix',shouldRouteThroughEarpiece:!enabled});}
  pushOutput(input:{audio:string;turnId:string;first:boolean}){this.nativeAudio?.Pipeline.pushAudioSync({audio:input.audio,turnId:input.turnId,isFirstChunk:input.first});}
  endOutput(turnId:string){this.nativeAudio?.Pipeline.pushAudioSync({audio:'',turnId,isLastChunk:true});}
  async interrupt(turnId:string){await this.nativeAudio?.Pipeline.invalidateTurn({turnId});}
  private async module():Promise<NativeAudioModule>{if(this.nativeAudio)return this.nativeAudio;try{this.nativeAudio=await import('@edkimmel/expo-audio-stream');return this.nativeAudio;}catch{throw new Error('Live calls require a Kivelle development build; Expo Go cannot access realtime microphone audio.');}}
}
