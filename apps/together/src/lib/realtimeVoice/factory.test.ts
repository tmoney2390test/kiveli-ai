import { describe, expect, it, vi } from 'vitest';

vi.mock('./engine',()=>({PlatformRealtimeAudioEngine:class{readonly speakerControlAvailable=true;}}));

import { XaiCascadedVoiceClient } from './cascadeClient';
import { XaiRealtimeVoiceClient } from './client';
import { createRealtimeVoiceClient } from './factory';
import type { RealtimeVoiceCallbacks } from './types';

const callbacks:RealtimeVoiceCallbacks={
  onConnected:vi.fn(),onClosed:vi.fn(),onTranscript:vi.fn(),onPartialTranscript:vi.fn(),onSpeaking:vi.fn(),onError:vi.fn(),
};

describe('realtime voice route factory',()=>{
  it('keeps Essential on the cascaded relay and Immersive on native Grok Voice',()=>{
    expect(createRealtimeVoiceClient('standard',callbacks)).toBeInstanceOf(XaiCascadedVoiceClient);
    expect(createRealtimeVoiceClient('express',callbacks)).toBeInstanceOf(XaiRealtimeVoiceClient);
  });
});
