import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { FrostedSurface } from './FrostedGlass';

export function ChatComposerFrame({ floating, bottomInset, onLayout, style, children }: {
  floating: boolean;
  bottomInset: number;
  onLayout?: (event: LayoutChangeEvent) => void;
  style: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  if (!floating) return <View onLayout={onLayout} style={[style, { paddingBottom: Math.max(8, bottomInset) }]}>{children}</View>;

  // Keep the card in normal layout so the timeline always reserves its full
  // height, including an attachment or an expanded multiline draft.
  return <View nativeID="chat-composer-frame" onLayout={onLayout} style={[styles.slot, { paddingBottom: Math.max(10, bottomInset) }]}>
    <FrostedSurface intensity={78} style={styles.glass}>{children}</FrostedSurface>
  </View>;
}

const styles = StyleSheet.create({
  slot: { flexShrink: 0, paddingHorizontal: 12, paddingTop: 8, backgroundColor: 'transparent', zIndex: 2 },
  glass: {
    borderRadius: 28,
    borderCurve: 'continuous',
    borderColor: 'rgba(255,244,255,.20)',
    backgroundColor: 'rgba(27,22,36,.68)',
    shadowColor: '#000',
    shadowOpacity: .36,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 9,
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(30px) saturate(145%)' } as never) : {}),
  },
});
