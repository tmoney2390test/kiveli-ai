import type { PlaybackProgress } from './playbackCaptions';
export type AudioEngineInput = {sampleRate:number;onInput:(base64Pcm16:string)=>void;onError:(error:Error)=>void;onPlayback?:(event:PlaybackProgress)=>void};
export interface RealtimeAudioEngine {
  readonly speakerControlAvailable:boolean;
  requestPermission():Promise<'granted'|'denied'>;
  open(input:AudioEngineInput):Promise<void>;
  resetForReconnect():Promise<void>;
  close():Promise<void>;
  setMuted(muted:boolean):Promise<void>;
  setSpeakerEnabled(enabled:boolean):Promise<void>;
  pushOutput(input:{audio:string;turnId:string;first:boolean}):void;
  endOutput(turnId:string):void;
  interrupt(turnId:string):Promise<void>;
}
