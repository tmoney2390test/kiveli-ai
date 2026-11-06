import type { GeneratedMedia, Message } from '../../types';
export type Feedback = {
  kind: 'memory' | 'moment' | 'plan';
  title: string;
  body: string;
  id?: string;
};
export type VoiceNoteRequestResult = {
  status?: string;
  providerStatus?: string;
  message?: string;
  media?: GeneratedMedia;
};
export type VoiceCallTimelineValue = {
  id: string;
  messages: Message[];
  at: string;
  durationMs: number;
};
