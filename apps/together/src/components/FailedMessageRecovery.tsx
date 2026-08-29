import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Pencil, RotateCw, X } from 'lucide-react-native';
import { colors, radius } from '../theme';

/** Recovery controls stay attached to the failed user message in both chat modes. */
export function FailedMessageRecovery({ onRetry, onEdit, onDiscard }: { onRetry: () => void; onEdit: () => void; onDiscard: () => void }) {
  return <View accessibilityRole="toolbar" accessibilityLabel="Message not sent" style={styles.root}>
    <Text style={styles.label}>Not sent</Text>
    <RecoveryAction label="Retry" icon={<RotateCw size={12} color={colors.rose} />} onPress={onRetry} />
    <RecoveryAction label="Edit" icon={<Pencil size={12} color={colors.textSecondary} />} onPress={onEdit} />
    <RecoveryAction label="Discard" icon={<X size={13} color={colors.muted} />} onPress={onDiscard} />
  </View>;
}

function RecoveryAction({ label, icon, onPress }: { label: string; icon: React.ReactNode; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label} failed message`} onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>{icon}<Text style={styles.actionText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  root: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, padding: 3, borderRadius: radius.pill, backgroundColor: 'rgba(20,16,29,.88)', borderWidth: 1, borderColor: 'rgba(255,111,125,.22)' },
  label: { color: colors.danger, fontSize: 9, fontWeight: '900', paddingHorizontal: 6 },
  action: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, borderRadius: radius.pill },
  actionText: { color: colors.textSecondary, fontSize: 9, fontWeight: '800' },
  pressed: { backgroundColor: 'rgba(168,69,242,.14)' },
});
