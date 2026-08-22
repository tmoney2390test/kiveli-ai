import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { transcribeChatAudio } from '../lib/api';
import { dictationAudioMetadata, MAX_CHAT_DICTATION_MS } from '../lib/dictation';

export type ChatDictationPhase = 'idle'|'recording'|'transcribing';

type ChatDictationOptions = {
  conversationId: string;
  characterInstanceId: string;
  disabled?: boolean;
  onBeforeStart?: () => void;
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
};

export function useChatDictation(options: ChatDictationOptions) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 150);
  const [phase, setPhaseState] = useState<ChatDictationPhase>('idle');
  const phaseRef = useRef<ChatDictationPhase>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const finalizingRef = useRef(false);
  const mountedRef = useRef(true);
  const callbacksRef = useRef(options);
  const finishRef = useRef<() => Promise<void>>(() => Promise.resolve());
  callbacksRef.current = options;

  const setPhase = useCallback((next: ChatDictationPhase) => {
    phaseRef.current = next;
    if (mountedRef.current) setPhaseState(next);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const finish = useCallback(async () => {
    if (phaseRef.current !== 'recording' || finalizingRef.current) return;
    finalizingRef.current = true;
    clearTimer();
    setPhase('transcribing');
    let uri: string|null = null;
    try {
      const beforeStop = recorder.getStatus();
      if (beforeStop.isRecording) await recorder.stop();
      const finished = recorder.getStatus();
      uri = recorder.uri ?? finished.url;
      const durationMs = Math.max(beforeStop.durationMillis, finished.durationMillis);
      if (!uri || durationMs < 450) throw new Error('Speak for a moment before stopping.');
      const metadata = dictationAudioMetadata(uri, Platform.OS === 'web');
      const result = await transcribeChatAudio({
        conversationId: callbacksRef.current.conversationId,
        characterInstanceId: callbacksRef.current.characterInstanceId,
        uri,
        durationMs,
        ...metadata,
      });
      if (mountedRef.current) callbacksRef.current.onTranscript(result.text);
    } catch (caught) {
      if (mountedRef.current) callbacksRef.current.onError(caught instanceof Error ? caught.message : 'That recording could not be transcribed.');
    } finally {
      if (uri) removeLocalRecording(uri);
      await restorePlaybackMode();
      finalizingRef.current = false;
      setPhase('idle');
    }
  }, [clearTimer, recorder, setPhase]);
  finishRef.current = finish;

  const toggle = useCallback(async () => {
    if (phaseRef.current === 'recording') {
      await finishRef.current();
      return;
    }
    if (phaseRef.current !== 'idle' || callbacksRef.current.disabled) return;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        callbacksRef.current.onError('Microphone access is needed for voice-to-text.');
        return;
      }
      callbacksRef.current.onBeforeStart?.();
      callbacksRef.current.onError('');
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        allowsBackgroundRecording: false,
        interruptionMode: 'doNotMix',
        shouldRouteThroughEarpiece: false,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('recording');
      timerRef.current = setTimeout(() => void finishRef.current(), MAX_CHAT_DICTATION_MS);
    } catch (caught) {
      await restorePlaybackMode();
      setPhase('idle');
      callbacksRef.current.onError(caught instanceof Error ? caught.message : 'The microphone could not start.');
    }
  }, [recorder, setPhase]);

  useEffect(() => () => {
    mountedRef.current = false;
    clearTimer();
    const status = recorder.getStatus();
    const stopping = status.isRecording ? recorder.stop().catch(() => undefined) : Promise.resolve();
    void stopping.then(() => {
      const uri = recorder.uri ?? recorder.getStatus().url;
      if (uri) removeLocalRecording(uri);
      return restorePlaybackMode();
    });
  }, [clearTimer, recorder]);

  return { phase, elapsedMs: recorderState.durationMillis, toggle };
}

async function restorePlaybackMode(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: false,
    shouldPlayInBackground: false,
    allowsBackgroundRecording: false,
    shouldRouteThroughEarpiece: false,
    interruptionMode: 'mixWithOthers',
  }).catch(() => undefined);
}

function removeLocalRecording(uri: string): void {
  try {
    if (Platform.OS === 'web') {
      if (uri.startsWith('blob:')) URL.revokeObjectURL(uri);
      return;
    }
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Dictation is transient; cache cleanup remains best effort on unsupported runtimes.
  }
}
