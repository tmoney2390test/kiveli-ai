import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { privateMediaPlaybackUrl } from '../lib/privateMediaUrl';
import { supabaseUrl } from '../lib/supabase';
import { playBrowserVoice } from '../lib/webVoicePlayback';

type WebVoiceStatus = {
  currentTime: number;
  duration: number;
  playing: boolean;
  isLoaded: boolean;
  isBuffering: boolean;
  didJustFinish: boolean;
  error: string | null;
};

const emptyStatus: WebVoiceStatus = {
  currentTime: 0, duration: 0, playing: false, isLoaded: false,
  isBuffering: false, didJustFinish: false, error: null,
};

function browserStatus(audio: HTMLAudioElement, error: string | null = null): WebVoiceStatus {
  return {
    currentTime: audio.currentTime || 0,
    duration: Number.isFinite(audio.duration) ? audio.duration : 0,
    playing: !audio.paused && !audio.ended,
    isLoaded: audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
    isBuffering: !audio.paused && audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA,
    didJustFinish: audio.ended,
    error,
  };
}

export function useVoiceNotePlayback(source: string | null) {
  // Native keeps Expo's audio session. On web, own the HTMLAudioElement so a
  // rejected play() promise cannot silently leave the button looking ready.
  const nativePlayer = useAudioPlayer(Platform.OS === 'web' ? null : source, { updateInterval: 250 });
  const nativeStatus = useAudioPlayerStatus(nativePlayer);
  const webAudio = useRef<HTMLAudioElement | null>(null);
  const [webStatus, setWebStatus] = useState<WebVoiceStatus>(emptyStatus);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!source) {
      webAudio.current = null;
      setWebStatus(emptyStatus);
      return;
    }
    const audio = new Audio(privateMediaPlaybackUrl(source, 'web', supabaseUrl) ?? source);
    audio.preload = 'auto';
    webAudio.current = audio;
    setWebStatus(emptyStatus);
    const update = () => setWebStatus(browserStatus(audio));
    audio.onloadeddata = update;
    audio.onloadedmetadata = update;
    audio.ontimeupdate = update;
    audio.onplay = update;
    audio.onplaying = update;
    audio.onpause = update;
    audio.onwaiting = update;
    audio.onended = update;
    audio.onerror = () => setWebStatus(browserStatus(audio, 'Audio could not load. Tap to refresh it.'));
    return () => {
      audio.pause();
      audio.onloadeddata = audio.onloadedmetadata = audio.ontimeupdate = null;
      audio.onplay = audio.onplaying = audio.onpause = null;
      audio.onwaiting = audio.onended = audio.onerror = null;
      audio.removeAttribute('src');
      if (webAudio.current === audio) webAudio.current = null;
    };
  }, [source]);

  const play = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'web') {
      nativePlayer.play();
      return true;
    }
    const audio = webAudio.current;
    if (!audio) return false;
    try {
      const started = await playBrowserVoice(audio);
      if (!started) throw new Error('Playback was rejected');
      setWebStatus(browserStatus(audio));
      return true;
    } catch {
      setWebStatus(browserStatus(audio, 'Audio could not play. Tap to try again.'));
      return false;
    }
  }, [nativePlayer]);
  const pause = useCallback(() => {
    if (Platform.OS === 'web') webAudio.current?.pause();
    else nativePlayer.pause();
  }, [nativePlayer]);
  const seekTo = useCallback((seconds: number): Promise<void> => {
    if (Platform.OS === 'web') {
      const audio = webAudio.current;
      if (audio) audio.currentTime = seconds;
      return Promise.resolve();
    }
    return nativePlayer.seekTo(seconds);
  }, [nativePlayer]);

  return { status: Platform.OS === 'web' ? webStatus : nativeStatus, play, pause, seekTo };
}
