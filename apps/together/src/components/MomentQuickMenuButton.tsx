import { useRef, useState, type ElementRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Camera, Film, ImagePlus, Plus } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MEDIA_MOMENT_OPTIONS, type MediaMomentMode } from '../lib/mediaMomentPicker';
import { colors, radius } from '../theme';
import { FrostedBackdrop, FrostedSurface } from './FrostedGlass';

type Props = {
  name: string;
  disabled: boolean;
  onSelect: (mode: MediaMomentMode) => void;
};

type Anchor = { x: number; y: number; width: number; height: number };

const MENU_WIDTH = 220;
const MENU_HEIGHT = 164;

const optionIcons = {
  share: ImagePlus,
  photo: Camera,
  video: Film,
} as const;

export function MomentQuickMenuButton({ name, disabled, onSelect }: Props) {
  const buttonRef = useRef<ElementRef<typeof Pressable>>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const open = () => {
    if (disabled) return;
    const node = buttonRef.current;
    if (node?.measureInWindow) {
      node.measureInWindow((x, y, measuredWidth, measuredHeight) => {
        setAnchor({ x, y, width: measuredWidth, height: measuredHeight });
      });
      return;
    }
    setAnchor({ x: 12, y: height - insets.bottom - 64, width: 42, height: 42 });
  };

  const menuWidth = Math.min(MENU_WIDTH, width - 24);
  const left = anchor ? Math.max(12, Math.min(anchor.x, width - menuWidth - 12)) : 12;
  const top = anchor
    ? Math.max(insets.top + 12, Math.min(anchor.y - MENU_HEIGHT - 8, height - insets.bottom - MENU_HEIGHT - 12))
    : insets.top + 12;

  return <>
    <Pressable
      ref={buttonRef}
      testID="chat-media-menu-button"
      accessibilityRole="button"
      accessibilityLabel={`Add a moment with ${name}`}
      accessibilityState={{ disabled, expanded: Boolean(anchor) }}
      onPress={open}
      disabled={disabled}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, disabled && styles.disabled]}
    >
      <Plus size={23} color="#E9DEFF" strokeWidth={2}/>
    </Pressable>
    <Modal visible={Boolean(anchor)} transparent animationType="fade" onRequestClose={() => setAnchor(null)} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.layer} accessibilityViewIsModal>
        <FrostedBackdrop intensity={20}/>
        <Pressable accessibilityRole="button" accessibilityLabel="Close moment menu" style={StyleSheet.absoluteFill} onPress={() => setAnchor(null)}/>
        <FrostedSurface intensity={86} style={[styles.menu, { width: menuWidth, left, top }]}>
          {MEDIA_MOMENT_OPTIONS.map((option) => {
            const Icon = optionIcons[option.mode];
            return <Pressable
              key={option.mode}
              testID={`chat-moment-option-${option.mode}`}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              onPress={() => {
                setAnchor(null);
                requestAnimationFrame(() => onSelect(option.mode));
              }}
              style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
            >
              <View style={styles.optionIcon}><Icon size={18} color="#D9C7FF" strokeWidth={1.8}/></View>
              <Text style={styles.optionText}>{option.label}</Text>
            </Pressable>;
          })}
        </FrostedSurface>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: 'rgba(100,61,167,.20)',
    borderWidth: 1,
    borderColor: 'rgba(203,168,255,.30)',
  },
  buttonPressed: { transform: [{ scale: .96 }], backgroundColor: 'rgba(117,69,245,.34)' },
  disabled: { opacity: .42 },
  layer: { flex: 1 },
  menu: {
    position: 'absolute',
    padding: 7,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(24,18,34,.97)',
    borderWidth: 1,
    borderColor: 'rgba(203,168,255,.28)',
    shadowColor: '#000',
    shadowOpacity: .42,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },
  option: {
    minHeight: 48,
    paddingHorizontal: 9,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionPressed: { backgroundColor: 'rgba(117,69,245,.22)' },
  optionIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(117,69,245,.16)',
  },
  optionText: { color: colors.text, fontSize: 14, fontWeight: '800' },
});
