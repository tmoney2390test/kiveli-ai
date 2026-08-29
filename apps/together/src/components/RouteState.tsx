import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, typography } from '../theme';

export function LoadingSkeleton({ label = 'Loading your world…' }: { label?: string }) {
  return <View style={styles.state}>
    <ActivityIndicator color={colors.rose} size="large" />
    <Text style={styles.meta}>{label}</Text>
  </View>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <View style={styles.state}>
    <Text style={styles.title}>Something shifted</Text>
    <Text style={styles.message}>{message}</Text>
    {onRetry ? <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Text style={styles.buttonText}>Try again</Text>
    </Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({
  state: { minHeight: 320, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 30, backgroundColor: colors.background },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 21, fontWeight: '600' },
  message: { maxWidth: 460, color: colors.text, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  meta: { color: colors.muted, fontSize: 12 },
  button: { minHeight: 48, minWidth: 136, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: colors.rose },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  pressed: { opacity: .86, transform: [{ scale: .985 }] },
});
