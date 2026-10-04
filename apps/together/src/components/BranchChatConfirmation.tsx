import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { GitBranch } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FrostedBackdrop, FrostedSurface } from './FrostedGlass';
import { colors, radius } from '../theme';

export function BranchChatConfirmation({ name, busy, error, onConfirm, onClose }: {
  name: string;
  busy: boolean;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const close = () => { if (!busy) onClose(); };
  return <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
    <View style={[styles.root, { paddingTop: Math.max(20, insets.top), paddingBottom: Math.max(20, insets.bottom) }]}>
      <FrostedBackdrop intensity={38} />
      <Pressable accessibilityLabel="Cancel branching" style={StyleSheet.absoluteFill} onPress={close} />
      <FrostedSurface intensity={88} style={styles.card}>
        <View accessibilityViewIsModal>
          <View style={styles.icon}><GitBranch size={23} color={colors.rose} /></View>
          <Text accessibilityRole="header" style={styles.title}>Branch from this reply?</Text>
          <Text style={styles.copy}>Create an alternate path with {name}. Your original chat stays intact; the memories and relationship you built up to this reply carry into the new path.</Text>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityState={{ busy, disabled: busy }} disabled={busy} onPress={onConfirm} style={[styles.confirm, busy && styles.disabled]}>
            {busy ? <ActivityIndicator color={colors.text} size="small" /> : <GitBranch size={17} color={colors.text} />}
            <Text style={styles.confirmText}>{busy ? 'Creating path…' : 'Create branch'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={close} style={styles.cancel}><Text style={styles.cancelText}>Keep current chat</Text></Pressable>
        </View>
      </FrostedSurface>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  card: { width: '100%', maxWidth: 440, borderRadius: radius.xl, padding: 24, backgroundColor: 'rgba(25,18,31,.82)' },
  icon: { width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(193,125,231,.16)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontFamily: 'Georgia', fontSize: 27, lineHeight: 33, color: colors.text },
  copy: { color: colors.textSecondary, fontSize: 15, lineHeight: 22, marginTop: 12, marginBottom: 22 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  confirm: { minHeight: 50, borderRadius: radius.md, backgroundColor: colors.violet, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  confirmText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  cancel: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  cancelText: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: .65 },
});
