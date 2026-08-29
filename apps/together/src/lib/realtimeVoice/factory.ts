import { XaiRealtimeVoiceClient } from './client';
import { XaiCascadedVoiceClient } from './cascadeClient';
import type { RealtimeVoiceCallbacks, RealtimeVoiceClient, VoiceCallRoute } from './types';

export function createRealtimeVoiceClient(route:VoiceCallRoute,callbacks:RealtimeVoiceCallbacks):RealtimeVoiceClient{
  return route==='standard'?new XaiCascadedVoiceClient(callbacks):new XaiRealtimeVoiceClient(callbacks);
}
