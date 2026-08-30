import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { colors, radius, spacing } from '../theme';
import { FrostedBackdrop, FrostedSurface } from './FrostedGlass';

export type MessageActionDefinition = {
  key: string;
  label: string;
  icon: ReactNode;
  onPress: () => unknown;
  disabled?: boolean;
  selected?: boolean;
  destructive?: boolean;
};

export function MessageActionSheet({
  visible,
  message,
  senderName,
  sentAt,
  userMessage,
  actions,
  onClose,
}: {
  visible: boolean;
  message: string;
  senderName: string;
  sentAt: string;
  userMessage: boolean;
  actions: MessageActionDefinition[];
  onClose: () => void;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) setBusyKey(null);
  }, [visible]);
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [onClose, visible]);

  if (!visible) return null;

  const run = (action: MessageActionDefinition) => {
    if (action.disabled || busyKey) return;
    setBusyKey(action.key);
    let task: unknown;
    try { task = action.onPress(); } catch { task = undefined; }
    onClose();
    Promise.resolve(task).catch(() => undefined).finally(() => setBusyKey(null));
  };

  return <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
    <View style={styles.root}>
      <Pressable accessibilityLabel="Close message actions" style={StyleSheet.absoluteFill} onPress={onClose}>
        <FrostedBackdrop intensity={34}/>
      </Pressable>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => undefined} style={styles.frame}>
          <FrostedSurface intensity={82} style={styles.panel}>
            <Pressable accessibilityLabel="Close message actions" onPress={onClose} hitSlop={10} style={styles.close}>
              <X size={18} color={colors.muted}/>
            </Pressable>
            <Text style={styles.date}>{new Date(sentAt).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text>
            <Text style={styles.sender}>{userMessage ? 'Sent by you' : `Sent by ${senderName}`}</Text>
            <View style={styles.grid}>
              {actions.map((action) => <Pressable
                key={action.key}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                accessibilityState={{ disabled: action.disabled, selected: action.selected }}
                disabled={action.disabled || Boolean(busyKey)}
                onPress={() => run(action)}
                style={({ pressed }) => [styles.action, action.selected && styles.actionSelected, action.destructive&&styles.actionDestructive, (pressed || busyKey === action.key) && styles.actionPressed, action.disabled && styles.actionDisabled]}
              >
                <View style={styles.actionIcon}>{busyKey === action.key ? <ActivityIndicator color={colors.rose} size="small"/> : action.icon}</View>
                <Text numberOfLines={2} style={[styles.actionLabel, action.selected && styles.actionLabelSelected,action.destructive&&styles.actionLabelDestructive]}>{action.label}</Text>
              </Pressable>)}
            </View>
          </FrostedSurface>
          <View style={[styles.preview, userMessage ? styles.userPreview : styles.assistantPreview]}>
            <Text style={styles.previewText} numberOfLines={8}>{message}</Text>
          </View>
        </Pressable>
      </ScrollView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.xl },
  frame: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: spacing.md },
  panel: { borderRadius: radius.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md, backgroundColor: 'rgba(25,18,31,.70)' },
  close: { position: 'absolute', right: 16, top: 14, zIndex: 2, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  date: { color: colors.text, fontSize: 13, fontWeight: '800', textAlign: 'center', paddingRight: 28 },
  sender: { color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 5, marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: { width: '22%', minWidth: 70, minHeight: 92, flexGrow: 1, flexBasis: 70, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,255,255,.12)', backgroundColor: 'rgba(14,12,20,.34)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 12 },
  actionSelected: { borderColor: 'rgba(216,62,234,.58)', backgroundColor: 'rgba(116,36,128,.26)' },
  actionDestructive:{borderColor:'rgba(255,113,129,.25)',backgroundColor:'rgba(255,113,129,.055)'},
  actionPressed: { opacity: .72, transform: [{ scale: .98 }] },
  actionDisabled: { opacity: .38 },
  actionIcon: { height: 30, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { color: colors.textSecondary, fontSize: 13, lineHeight: 16, fontWeight: '700', textAlign: 'center' },
  actionLabelSelected: { color: colors.text },
  actionLabelDestructive:{color:colors.danger},
  preview: { maxWidth: 450, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.border },
  assistantPreview: { alignSelf: 'flex-start', backgroundColor: 'rgba(19,17,27,.94)' },
  userPreview: { alignSelf: 'flex-end', backgroundColor: 'rgba(154,35,177,.88)' },
  previewText: { color: colors.text, fontSize: 16, lineHeight: 22 },
});
