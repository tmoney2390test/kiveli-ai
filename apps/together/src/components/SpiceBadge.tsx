import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import { normalizeSpiceLevel, spiceLabel } from '../lib/spice';

export function SpiceBadge({
  level,
  overlay = false,
  compact = false,
  style,
}: {
  level?: number | null;
  overlay?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const normalized = normalizeSpiceLevel(level);
  return <View
    accessible
    accessibilityRole="text"
    accessibilityLabel={`${spiceLabel(normalized)}. ${normalized} of 3 peppers.`}
    pointerEvents="none"
    style={[styles.badge, overlay && styles.overlay, compact && styles.compact, style]}
  >
    <Text maxFontSizeMultiplier={1.15} style={[styles.peppers, compact && styles.peppersCompact]}>{'🌶️'.repeat(normalized)}</Text>
  </View>;
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', minHeight: 25, minWidth: 31, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 14, backgroundColor: 'rgba(8,11,19,.86)', borderWidth: 1, borderColor: 'rgba(255,255,255,.22)', shadowColor: '#000', shadowOpacity: .28, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  overlay: { position: 'absolute', zIndex: 4, top: 12, right: 12 },
  compact: { minHeight: 21, minWidth: 25, paddingHorizontal: 5, paddingVertical: 3 },
  peppers: { color: '#fff', fontSize: 11, lineHeight: 15, letterSpacing: -2 },
  peppersCompact: { fontSize: 9, lineHeight: 12, letterSpacing: -2.5 },
});
