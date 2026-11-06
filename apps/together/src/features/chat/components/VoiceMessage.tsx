import { styles } from '../../../styles/chatStyles';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { ChevronRight, Pause, Phone, Play, Volume2 } from 'lucide-react-native';
import { colors } from '../../../theme';
import type { GeneratedMedia } from '../../../types';
import { formatVoiceProgress } from '../../../lib/voiceTime';
import { useVoiceNotePlayback } from '../../../hooks/useVoiceNotePlayback';
import { type VoiceCallTimelineValue } from '../types';
export function VoiceNoteInline({ media, active, onActivate, onDeactivate, onRetry, onRefresh, pendingError, onPendingRetry, compact = false, showReadyHint = false }: {
  media: GeneratedMedia;
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onRetry: () => void;
  onRefresh: () => void;
  pendingError?: string | null;
  onPendingRetry?: () => void;
  compact?: boolean;
  showReadyHint?: boolean;
}) {
  const source = media.status === 'ready' && media.signed_url ? media.signed_url : null;
  const { status, play, pause, seekTo } = useVoiceNotePlayback(source);
  const [progressWidth, setProgressWidth] = useState(180);
  useEffect(() => {
    if (!active) {
      pause();
      return;
    }
    if (Platform.OS !== 'web' && source && status.isLoaded) {
      if (status.didJustFinish) {
        onDeactivate();
        return;
      }
      void play();
    }
  }, [active, pause, play, source, status.didJustFinish, status.isLoaded]);
  if (media.status === 'failed') {
    if (compact) return <Pressable accessibilityRole='button' accessibilityLabel='Retry companion voice note' onPress={onRetry} style={compactVoiceStyle}><Volume2 size={15} color={colors.rose}/></Pressable>;
    return (
      <View style={styles.voiceNote}>
        <Volume2 size={15} color={colors.muted} />
        <View style={styles.voiceProgressWrap}>
          <Text style={styles.voiceNoteText}>
            {media.failure_reason_safe ?? 'Voice note unavailable.'}
          </Text>
          <Pressable accessibilityRole='button' accessibilityLabel='Retry companion voice note' onPress={(event) => { event.stopPropagation(); onRetry(); }}>
            <Text style={styles.listenText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  if (!source) {
    if (compact) {
      if (pendingError || media.status === 'ready') return <Pressable accessibilityRole='button' accessibilityLabel={pendingError ? 'Check voice note again' : 'Reload voice note audio'} onPress={pendingError ? onPendingRetry ?? onRefresh : onRefresh} style={compactVoiceStyle}><Volume2 size={15} color={colors.rose}/></Pressable>;
      return <View accessibilityLabel='Generating voice note' style={compactVoiceStyle}><ActivityIndicator size='small' color={colors.rose}/></View>;
    }
    if (pendingError || media.status === 'ready') return <Pressable
      accessibilityRole='button'
      accessibilityLabel={pendingError ? 'Check voice note again' : 'Reload voice note audio'}
      onPress={(event) => { event.stopPropagation(); (pendingError ? onPendingRetry ?? onRefresh : onRefresh)(); }}
      style={styles.voiceNote}
    ><Volume2 size={15} color={colors.rose}/><Text style={styles.voiceNoteText}>{pendingError ?? 'Audio unavailable · tap to reload'}</Text></Pressable>;
    return <View style={styles.voiceNote}><ActivityIndicator size='small' color={colors.rose}/><Text accessibilityLiveRegion='polite' style={styles.voiceNoteText}>Generating voice…</Text></View>;
  }
  const duration = status.duration || Number(media.duration_ms ?? 0) / 1000;
  const current = Math.min(status.currentTime || 0, duration || 0);
  const progress = duration > 0 ? Math.min(1, current / duration) : 0;
  const toggle = () => {
    if (status.error) {
      onRefresh();
      return;
    }
    if (status.playing) {
      pause();
      onDeactivate();
      return;
    }
    // Calling play directly from the press handler preserves the browser user
    // gesture. Starting it later from a React effect is rejected by web
    // autoplay policy and expo-audio does not surface that rejected promise.
    onActivate();
    void play().then((started) => { if (!started) onDeactivate(); });
  };
  if (compact) return <View style={compactVoiceRowStyle}>
    <Pressable accessibilityRole='button' accessibilityLabel={status.error ? 'Reload companion voice note' : status.playing ? 'Pause companion voice note' : 'Play companion voice note'} onPress={toggle} hitSlop={8} style={compactVoiceStyle}>{status.error ? <Volume2 size={15} color={colors.rose}/> : status.playing ? <Pause size={15} color={colors.rose}/> : <Play size={15} color={colors.rose}/>}</Pressable>
    {duration > 0 ? <Text style={compactVoiceTimeStyle}>{formatVoiceProgress(current, duration)}</Text> : null}
    {status.error ? <Pressable accessibilityRole='button' accessibilityLabel='Refresh companion voice note' onPress={onRefresh} hitSlop={8}><Text accessibilityLiveRegion='polite' style={compactVoiceTimeStyle}>Voice unavailable · tap to retry</Text></Pressable> : showReadyHint && !status.playing ? <Pressable accessibilityRole='button' accessibilityLabel='Play companion voice note' onPress={toggle} hitSlop={8}><Text accessibilityLiveRegion='polite' style={compactVoiceTimeStyle}>Ready · tap to play</Text></Pressable> : null}
  </View>;
  return (
    <View style={styles.voiceNote}>
      <Pressable
        accessibilityLabel={status.playing
          ? 'Pause companion voice note'
          : 'Play companion voice note'}
        accessibilityRole='button'
        onPress={(event) => { event.stopPropagation(); toggle(); }}
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
          onLayout={(event) => setProgressWidth(event.nativeEvent.layout.width)}
          onPress={(event) => {
            event.stopPropagation();
            if (!duration) {
              return;
            }
            const width = event.nativeEvent.locationX;
            void seekTo(Math.max(0, Math.min(duration, (width / Math.max(1, progressWidth)) * duration)));
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
            : formatVoiceProgress(current, duration)}
        </Text>
      </View>
    </View>
  );
}
const compactVoiceStyle = { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(216,62,234,.38)', backgroundColor: 'rgba(216,62,234,.14)', alignItems: 'center' as const, justifyContent: 'center' as const };
const compactVoiceRowStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 };
const compactVoiceTimeStyle = { color: colors.textSecondary, fontSize: 11, fontVariant: ['tabular-nums'] as ['tabular-nums'] };
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
