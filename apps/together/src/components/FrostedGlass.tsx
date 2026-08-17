import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView, type BlurTint } from 'expo-blur';

type FrostedSurfaceProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  tint?: BlurTint;
};

/**
 * Shared translucent surface for menus, sheets, and popovers. Native builds use
 * the platform blur implementation; web receives the same translucent material
 * with a backdrop-filter fallback.
 */
export function FrostedSurface({ children, style, intensity = 72, tint = 'systemMaterialDark' }: FrostedSurfaceProps) {
  return <BlurView
    tint={tint}
    intensity={intensity}
    blurMethod="dimezisBlurViewSdk31Plus"
    style={[styles.surface, style]}
  >
    <View pointerEvents="none" style={styles.surfaceWash} />
    {children}
  </BlurView>;
}

export function FrostedBackdrop({ intensity = 28 }: { intensity?: number }) {
  return <>
    <BlurView
      pointerEvents="none"
      tint="systemUltraThinMaterialDark"
      intensity={intensity}
      blurMethod="dimezisBlurViewSdk31Plus"
      style={StyleSheet.absoluteFill}
    />
    <View pointerEvents="none" style={styles.backdropWash} />
  </>;
}

const styles = StyleSheet.create({
  surface: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'rgba(20,17,27,.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.16)',
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(28px) saturate(135%)' } as never) : {}),
  },
  surfaceWash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(123,72,153,.055)',
  },
  backdropWash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(4,3,8,.58)',
  },
});
