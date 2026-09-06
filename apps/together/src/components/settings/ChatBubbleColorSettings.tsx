import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Check, ChevronRight, RotateCcw, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chatBubbleColorHex, chatBubbleColorOptions, chatBubbleTextColor, type ChatBubbleColor } from '@together/domain/src/chat-appearance';
import { colors, radius, spacing, typography } from '../../theme';
import { FrostedSurface } from '../FrostedGlass';

type BubbleOwner = 'user' | 'companion';

type Props = {
  userColor: ChatBubbleColor;
  companionColor: ChatBubbleColor;
  companionName?: string;
  disabled?: boolean;
  onUserColorChange: (value: ChatBubbleColor) => void;
  onCompanionColorChange: (value: ChatBubbleColor) => void;
};

export function ChatBubbleColorSettings({ userColor, companionColor, companionName, disabled = false, onUserColorChange, onCompanionColorChange }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [owner, setOwner] = useState<BubbleOwner | null>(null);
  const [draft, setDraft] = useState<ChatBubbleColor>('default');
  const compact = width < 700;
  const shortName = companionName?.trim().split(/\s+/)[0];
  const companionLabel = shortName ? `${shortName}'s messages` : 'Companion messages';

  const open = (nextOwner: BubbleOwner) => {
    setOwner(nextOwner);
    setDraft(nextOwner === 'user' ? userColor : companionColor);
  };
  const close = () => setOwner(null);
  const apply = () => {
    if (owner === 'user') onUserColorChange(draft);
    if (owner === 'companion') onCompanionColorChange(draft);
    close();
  };
  const editorTitle = owner === 'user' ? 'Your message color' : `${shortName ?? 'Companion'} message color`;
  const activeHex = chatBubbleColorHex(draft) ?? (owner === 'user' ? colors.roseSoft : colors.surface);
  const activeText = chatBubbleTextColor(draft);

  return <>
    <View style={styles.rows}>
      <ColorRow label="Your messages" value={userColor} fallback={colors.roseSoft} disabled={disabled} onPress={() => open('user')} />
      <View style={styles.divider} />
      <ColorRow label={companionLabel} value={companionColor} fallback={colors.surface} disabled={disabled} onPress={() => open('companion')} />
    </View>

    <Modal transparent visible={owner !== null} animationType={compact ? 'slide' : 'fade'} onRequestClose={close}>
      <View style={[styles.overlay, compact ? styles.overlayCompact : styles.overlayWide]}>
        <Pressable accessibilityLabel="Close message color picker" onPress={close} style={StyleSheet.absoluteFill} />
        <FrostedSurface intensity={96} style={[styles.sheet, compact && styles.sheetCompact, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          {compact ? <View style={styles.handle} /> : null}
          <View style={styles.header}>
            <Text style={styles.title}>{editorTitle}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={styles.close}><X size={20} color={colors.muted} /></Pressable>
          </View>

          <View style={styles.preview}>
            <View style={[styles.previewBubble, owner === 'user' ? styles.previewUser : styles.previewCompanion, { backgroundColor: activeHex }]}>
              <Text style={[styles.previewText, { color: activeText }]}>{owner === 'user' ? 'This feels like me.' : 'I like this one.'}</Text>
            </View>
          </View>

          <View accessibilityRole="radiogroup" style={styles.palette}>
            {chatBubbleColorOptions.map((option) => {
              const selected = option.value === draft;
              const swatch = option.color ?? (owner === 'user' ? colors.roseSoft : colors.surface);
              return <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityLabel={`${option.label} message color`}
                accessibilityState={{ checked: selected }}
                onPress={() => setDraft(option.value)}
                style={({ pressed }) => [styles.swatchButton, selected && styles.swatchButtonSelected, pressed && styles.pressed]}
              >
                <View style={[styles.swatch, { backgroundColor: swatch }]}>{selected ? <Check size={18} color={chatBubbleTextColor(option.value)} strokeWidth={3} /> : null}</View>
                <Text style={[styles.swatchLabel, selected && styles.swatchLabelSelected]}>{option.label}</Text>
              </Pressable>;
            })}
          </View>

          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Reset to default message color" onPress={() => setDraft('default')} style={({ pressed }) => [styles.reset, pressed && styles.pressed]}><RotateCcw size={15} color={colors.textSecondary} /><Text style={styles.resetText}>Reset</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={apply} style={({ pressed }) => [styles.done, pressed && styles.pressed]}><Text style={styles.doneText}>Done</Text></Pressable>
          </View>
        </FrostedSurface>
      </View>
    </Modal>
  </>;
}

function ColorRow({ label, value, fallback, disabled, onPress }: { label: string; value: ChatBubbleColor; fallback: string; disabled: boolean; onPress: () => void }) {
  const backgroundColor = chatBubbleColorHex(value) ?? fallback;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label} color`} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.row, disabled && styles.disabled, pressed && styles.pressed]}>
    <Text numberOfLines={1} style={styles.rowLabel}>{label}</Text>
    <View style={[styles.rowPreview, { backgroundColor }]}><Text style={[styles.rowPreviewText, { color: chatBubbleTextColor(value) }]}>Aa</Text></View>
    <ChevronRight size={17} color={colors.muted} />
  </Pressable>;
}

const styles = StyleSheet.create({
  rows: { overflow: 'hidden', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,.025)' },
  row: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  rowLabel: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '800' },
  rowPreview: { width: 48, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,.10)' },
  rowPreviewText: { fontSize: 13, fontWeight: '900' },
  divider: { height: 1, marginLeft: 14, backgroundColor: colors.border },
  overlay: { flex: 1, backgroundColor: 'rgba(3,2,7,.72)' },
  overlayCompact: { justifyContent: 'flex-end' },
  overlayWide: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  sheet: { width: '100%', maxWidth: 460, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: 'rgba(28,21,39,.99)', borderWidth: 1, borderColor: 'rgba(199,120,255,.32)', shadowColor: '#000', shadowOpacity: .55, shadowRadius: 28, shadowOffset: { width: 0, height: 15 } },
  sheetCompact: { maxWidth: undefined, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  handle: { width: 42, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: 'rgba(255,255,255,.22)', marginTop: -7, marginBottom: 13 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, color: colors.text, fontFamily: typography.display, fontSize: 23, fontWeight: '700' },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.045)' },
  preview: { minHeight: 128, justifyContent: 'center', marginTop: 14, marginBottom: 18, padding: 18, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,.035)', borderWidth: 1, borderColor: colors.border },
  previewBubble: { maxWidth: '86%', paddingHorizontal: 16, paddingVertical: 13, borderRadius: radius.md },
  previewUser: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  previewCompanion: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  previewText: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  palette: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 13 },
  swatchButton: { width: '30%', minHeight: 69, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.md, borderWidth: 1, borderColor: 'transparent' },
  swatchButtonSelected: { borderColor: 'rgba(199,120,255,.55)', backgroundColor: 'rgba(157,66,228,.12)' },
  swatch: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,.16)' },
  swatchLabel: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  swatchLabelSelected: { color: colors.text },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  reset: { minHeight: 48, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderBright },
  resetText: { color: colors.textSecondary, fontSize: 13, fontWeight: '800' },
  done: { minHeight: 48, flex: 1.55, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.violet },
  doneText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  pressed: { opacity: .72 },
  disabled: { opacity: .5 },
});
