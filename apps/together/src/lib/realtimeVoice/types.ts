export type RealtimeCallState =
  | 'idle'
  | 'creating_session'
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'ending'
  | 'ended'
  | 'failed';

export type RealtimeVoiceConfiguration = {
  transport: 'xai_realtime' | 'xai_cascade';
  route: VoiceCallRoute;
  url: string;
  model: string;
  voice: string;
  sampleRate: number;
  greeting?: string;
  session: Record<string, unknown>;
  relayEnvelope?: string;
};

export type VoiceCallRoute = 'standard' | 'express';

export type RealtimeVoiceCredentials = {
  clientSecret: string;
  expiresAt: string;
  clientConfiguration: RealtimeVoiceConfiguration;
  resumeConversationId?: string;
  greet?: boolean;
};

export type FinalVoiceTranscript = {
  sequence: number;
  providerEventId?: string;
  role: 'user' | 'assistant';
  content: string;
  occurredAt: string;
  final: true;
};

export type RealtimeVoiceUsage = {
  connectedDurationMs: number;
  inputAudioDurationMs: number;
  outputAudioDurationMs: number;
  reconnectCount: number;
};

export type RealtimeVoiceCallbacks = {
  onConnected(providerConversationId?: string): void;
  onClosed(): void;
  onTranscript(event: FinalVoiceTranscript): void;
  onPartialTranscript(role: 'user' | 'assistant', content: string): void;
  onSpeaking(speaker: 'user' | 'assistant', speaking: boolean): void;
  onError(error: Error, recoverable: boolean): void;
  onPipelineUsage?(event: VoicePipelineUsageEvent): void;
};

export type VoicePipelineUsageEvent={
  proof:string;
  sequence:number;
  sttBillableMs:number;
  inputSpeechMs:number;
  dialogueInputTokens:number;
  dialogueCachedInputTokens:number;
  dialogueOutputTokens:number;
  ttsCharacters:number;
  outputAudioMs:number;
  discardedOutputAudioMs:number;
  sttFinalLatencyMs?:number;
  dialogueFirstTokenLatencyMs?:number;
  ttsFirstAudioLatencyMs?:number;
  status:'success'|'interrupted'|'failure';
  failureCode?:string;
};

export interface RealtimeVoiceClient {
  readonly speakerControlAvailable: boolean;
  requestMicrophonePermission(): Promise<'granted' | 'denied'>;
  connect(credentials: RealtimeVoiceCredentials): Promise<void>;
  disconnect(): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  setSpeakerEnabled(enabled: boolean): Promise<void>;
  usage(): Omit<RealtimeVoiceUsage, 'reconnectCount'>;
}

export type ParsedXaiRealtimeEvent =
  | { kind:'conversation'; conversationId:string }
  | { kind:'session_ready' }
  | { kind:'audio'; audio:string; turnId:string; first:boolean }
  | { kind:'audio_done'; turnId:string }
  | { kind:'transcript_final'; role:'user'|'assistant'; content:string; providerEventId?:string }
  | { kind:'transcript_partial'; role:'user'|'assistant'; content:string }
  | { kind:'speaking'; speaker:'user'|'assistant'; speaking:boolean }
  | { kind:'interruption' }
  | { kind:'error'; message:string; recoverable:boolean }
  | { kind:'ignored' };
