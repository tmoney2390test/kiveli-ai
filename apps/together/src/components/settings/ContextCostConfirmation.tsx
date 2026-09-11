import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { contextPreferenceLabel } from '@together/domain/src/chat-context';
import type { useContextQuote } from '../../hooks/useContextQuote';
import { colors, radius } from '../../theme';
import { FrostedBackdrop, FrostedSurface } from '../FrostedGlass';

export function ContextCostConfirmation({ pricing }: { pricing: ReturnType<typeof useContextQuote> }) {
  const insets = useSafeAreaInsets();
  const prompt = pricing.prompt;
  if (!prompt) return null;
  const cancel = () => pricing.respond('cancel');
  const confirming = prompt.kind === 'confirm', photo = prompt.kind === 'photo';
  const title = confirming ? 'Memory setting applied' : photo ? 'Send with Included memory?' : 'Could not price this message';
  const message = confirming
    ? `${contextPreferenceLabel(pricing.selected)} memory is enabled. Replies can use additional Kivelli credits while this setting is on. The cost varies by message. Proceed?`
    : photo ? 'This photo message needs Included memory. Your selected memory setting will stay on for other messages.' : prompt.message;
  return <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={cancel}>
    <FrostedBackdrop intensity={38} />
    <Pressable accessibilityLabel="Cancel memory confirmation" onPress={cancel} style={StyleSheet.absoluteFill} />
    <View pointerEvents="box-none" style={[styles.backdrop, { paddingTop: Math.max(20, insets.top), paddingBottom: Math.max(20, insets.bottom) }]}>
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll}>
        <FrostedSurface intensity={88} style={styles.card}>
          <View accessibilityViewIsModal>
            <View style={styles.header}><Text accessibilityRole="header" style={styles.title}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close memory confirmation" onPress={cancel} style={styles.close}><X size={20} color={colors.textSecondary}/></Pressable></View>
            <Text style={styles.copy}>{message}</Text>
            <Pressable accessibilityRole="button" onPress={() => pricing.respond(confirming ? 'proceed' : photo ? 'included' : 'retry')} style={styles.confirm}><Text style={styles.buttonText}>{confirming ? 'Proceed' : photo ? 'Use Included' : 'Try again'}</Text></Pressable>
            {!confirming && !photo ? <Pressable accessibilityRole="button" onPress={() => pricing.respond('included')} style={styles.secondary}><Text style={styles.buttonText}>Use Included for this message</Text></Pressable> : null}
            <Pressable accessibilityRole="button" onPress={cancel} style={styles.secondary}><Text style={styles.buttonText}>Not now</Text></Pressable>
          </View>
        </FrostedSurface>
      </ScrollView>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }, scroll: { width: '100%', maxWidth: 440, maxHeight: '100%', flexGrow: 0 },
  card: { padding: 22, borderRadius: radius.xl }, header: { flexDirection: 'row', alignItems: 'center', gap: 8 }, title: { flex: 1, fontSize: 22, fontWeight: '700', color: colors.text },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, copy: { fontSize: 15, lineHeight: 22, color: colors.textSecondary, marginVertical: 16 },
  confirm: { minHeight: 48, borderWidth: 1, borderColor: colors.violet, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  secondary: { minHeight: 44, marginTop: 6, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: colors.text, fontSize: 14, fontWeight: '700' },
});
