import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { chatErrorPresentation } from '../lib/chatErrorPresentation';
import { colors } from '../theme';

/** Render an actual recovery action instead of making inert error copy tappable. */
export function ChatRecoveryNotice({ error, onRetry, onDismiss }: { error: unknown; onRetry?: () => void; onDismiss: () => void }) {
  const presentation = chatErrorPresentation(error);
  const target = presentation.action === 'credits' ? '/subscription?intent=credits' : presentation.action === 'privacy' ? '/privacy' : presentation.action === 'signin' ? '/auth' : null;
  const label = presentation.action === 'credits' ? 'View credits' : presentation.action === 'privacy' ? 'Privacy settings' : presentation.action === 'signin' ? 'Sign in' : 'Try again';
  return <View accessibilityLiveRegion="polite" style={s.root}>
    <Text style={s.title}>{presentation.title}</Text>
    <Text style={s.body}>{presentation.message}</Text>
    <View style={s.actions}>
      {target || onRetry && presentation.retryable ? <Pressable accessibilityRole="button" onPress={() => target ? router.push(target as never) : onRetry?.()} style={s.action}><Text style={s.link}>{label}</Text></Pressable> : null}
      <Pressable accessibilityRole="button" onPress={() => router.push('/support')} style={s.action}><Text style={s.link}>Get help</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={onDismiss} style={s.action}><Text style={s.body}>Dismiss</Text></Pressable>
    </View>
  </View>;
}

const s = StyleSheet.create({
  root: { padding: 14, gap: 5, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  title: { color: colors.text, fontSize: 14, fontWeight: '800' },
  body: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  action: { minHeight: 44, justifyContent: 'center' },
  link: { color: colors.rose, fontSize: 13, fontWeight: '700' },
});
