import { styles } from '../../../styles/chatStyles';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { ChevronRight, Pause, Phone, Play, Volume2 } from 'lucide-react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { colors } from '../../../theme';
import type { GeneratedMedia } from '../../../types';
import { type VoiceCallTimelineValue } from '../types';
export function VoiceNoteInline({ media, active, onActivate, onRetry, onRefresh }: {
  media: GeneratedMedia;
  active: boolean;
  onActivate: () => void;
  onRetry: () => void;
  onRefresh: () => void;
}) {
  const source = media.status === 'ready' && media.signed_url ? media.signed_url : null;
  const player = useAudioPlayer(source, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const refreshAttempted = useRef(false);
  useEffect(() => {
    if (!active) {
      player.pause();
      return;
    }
    if (Platform.OS !== 'web' && source) {
      if (status.didJustFinish) {
        void player.seekTo(0);
      }
      player.play();
    }
  }, [active, player, source, status.didJustFinish]);
  useEffect(() => {
    if (!active || !source || status.isLoaded || refreshAttempted.current) {
      return;
    }
    const timer = setTimeout(() => {
      if (!status.isLoaded) {
        refreshAttempted.current = true;
        onRefresh();
      }
    }, 1800);
    return () => clearTimeout(timer);
  }, [active, source, status.isLoaded, onRefresh]);
  if (media.status === 'failed') {
    return (
      <View style={styles.voiceNote}>
        <Volume2 size={15} color={colors.muted} />
        <View style={styles.voiceProgressWrap}>
          <Text style={styles.voiceNoteText}>
            {media.failure_reason_safe ?? 'Voice note unavailable.'}
          </Text>
          <Pressable accessibilityLabel='Retry companion voice note' onPress={onRetry}>
            <Text style={styles.listenText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  if (!source) {
    return (
      <View style={styles.voiceNote}>
        <ActivityIndicator size='small' color={colors.rose} />
        <Text accessibilityLiveRegion='polite' style={styles.voiceNoteText}>Generating voice…</Text>
      </View>
    );
  }
  const duration = status.duration || Number(media.duration_ms ?? 0) / 1000;
  const current = Math.min(status.currentTime || 0, duration || 0);
  const progress = duration > 0 ? Math.min(1, current / duration) : 0;
  const toggle = () => {
    if (status.playing) {
      player.pause();
      onActivate();
      return;
    }
    // Calling play directly from the press handler preserves the browser user
    // gesture. Starting it later from a React effect is rejected by web
    // autoplay policy and expo-audio does not surface that rejected promise.
    if (status.didJustFinish) {
      void player.seekTo(0);
    }
    onActivate();
    player.play();
  };
  return (
    <View style={styles.voiceNote}>
      <Pressable
        accessibilityLabel={status.playing
          ? 'Pause companion voice note'
          : 'Play companion voice note'}
        accessibilityRole='button'
        onPress={toggle}
        style={styles.voicePlayButton}
      >
        {status.playing
          ? <Pause size={14} color='#fff' fill='#fff' />
          : <Play size={14} color='#fff' fill='#fff' />}
      </Pressable>
      <View style={styles.voiceProgressWrap}>
        <Pressable
          accessibilityLabel='Seek voice note'
          accessibilityRole='adjustable'
          onPress={(event) => {
            if (!duration) {
              return;
            }
            const width = event.nativeEvent.locationX;
            void player.seekTo(Math.max(0, Math.min(duration, (width / 180) * duration)));
          }}
          style={styles.voiceProgress}
        >
          <View style={[styles.voiceProgressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </Pressable>
        <Text accessibilityLiveRegion='polite' style={styles.voiceDuration}>
          {status.error
            ? 'Audio could not load · tap again'
            : status.isBuffering
            ? 'Loading…'
            : !status.isLoaded
            ? 'Ready · tap play'
            : `${formatVoiceTime(current)} / ${formatVoiceTime(duration)}`}
        </Text>
      </View>
    </View>
  );
}
export function VoiceCallEventRow({ value }: {
  value: VoiceCallTimelineValue;
}) {
  const [expanded, setExpanded] = useState(false),
    first = value.messages[0],
    last = value.messages.at(-1),
    fallbackMs = new Date(last?.created_at ?? value.at).getTime() -
      new Date(first?.created_at ?? value.at).getTime(),
    duration = Math.max(0, Math.round((value.durationMs || fallbackMs) / 60000)),
    hasTranscript = value.messages.length > 0;
  return (
    <View style={styles.voiceCallEvent}>
      <Pressable
        accessibilityRole='button'
        accessibilityState={{ expanded }}
        accessibilityLabel={`Voice call, ${duration || 1} minutes.${
          hasTranscript ? ` ${expanded ? 'Hide' : 'Show'} transcript` : ''
        }`}
        onPress={() => hasTranscript && setExpanded((current) => !current)}
        style={styles.voiceCallEventHeader}
      >
        <View style={styles.voiceCallEventIcon}>
          <Phone size={15} color={colors.rose} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.voiceCallEventTitle}>Voice call · {duration || 1} min</Text>
          <Text style={styles.voiceCallEventMeta}>
            {hasTranscript ? `${value.messages.length} transcript turns` : 'No transcript turns'} ·
            {' '}
            {new Date(value.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </View>
        {hasTranscript
          ? (
            <ChevronRight
              size={16}
              color={colors.muted}
              style={expanded ? { transform: [{ rotate: '90deg' }] } : undefined}
            />
          )
          : null}
      </Pressable>
      {expanded
        ? (
          <View style={styles.voiceCallTranscript}>
            {value.messages.map((message) => (
              <View key={message.id} style={styles.voiceCallTurn}>
                <Text style={styles.voiceCallSpeaker}>
                  {message.role === 'assistant' ? 'COMPANION' : 'YOU'}
                </Text>
                <Text style={styles.voiceCallText}>{message.content}</Text>
              </View>
            ))}
          </View>
        )
        : null}
    </View>
  );
}
function formatVoiceTime(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}
