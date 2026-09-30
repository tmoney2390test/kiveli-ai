import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { GeneratedMedia, MediaOffer } from '../../types';
import { mediaFailurePresentation } from '../../lib/mediaProgressPresentation';
import { styles } from '../../styles/mediaStyles';

export function MediaRecoveryActions({ media, offer, checking, busy, notice, onCheck, onRetry, failed = false }: {
  media?: GeneratedMedia; offer?: MediaOffer; checking: boolean; busy?: boolean; notice: string;
  onCheck: () => void; onRetry?: () => void; failed?: boolean;
}) {
  const [confirmRetry, setConfirmRetry] = useState(false);
  const failure = mediaFailurePresentation(media, offer);
  const support = () => router.push({ pathname: '/support', params: { topic: 'media',
    ...(media?.id ? { mediaId: media.id } : {}),
    ...(media?.conversation_id ?? offer?.conversation_id ? { conversationId: media?.conversation_id ?? offer?.conversation_id } : {}),
  } });
  return <View style={styles.recoveryActions}>
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.chatPhotoFailureCopy}>{notice}</Text> : null}
    {failed && failure.refund ? <Text style={styles.chatPhotoFailureCopy}>{failure.refund}</Text> : null}
    {failed && failure.retryable && onRetry ? <>
      {confirmRetry ? <Text style={styles.chatPhotoFailureCopy}>{failure.retryNotice}</Text> : null}
      <Pressable accessibilityRole="button" disabled={busy || checking} onPress={() => {
        if (!confirmRetry) { setConfirmRetry(true); return; }
        setConfirmRetry(false); onRetry();
      }} style={styles.chatPhotoRetry}>
        {busy ? <ActivityIndicator size="small" color="#fff" /> : null}
        <Text style={styles.chatPhotoRetryText}>{busy ? 'Retrying…' : confirmRetry ? failure.retryLabel : 'Try again'}</Text>
      </Pressable>
      {confirmRetry ? <Pressable accessibilityRole="button" onPress={() => setConfirmRetry(false)} style={styles.recoveryLink}><Text style={styles.chatPhotoFailureCopy}>Cancel</Text></Pressable> : null}
    </> : null}
    <View style={styles.recoveryLinks}>
      <Pressable accessibilityRole="button" accessibilityLabel="Check existing request status without another charge" disabled={checking || busy} onPress={onCheck} style={styles.recoveryLink}>
        <Text style={styles.chatPhotoRetryText}>{checking ? 'Checking…' : 'Check status'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={support} style={styles.recoveryLink}><Text style={styles.chatPhotoFailureCopy}>Get help</Text></Pressable>
    </View>
  </View>;
}
