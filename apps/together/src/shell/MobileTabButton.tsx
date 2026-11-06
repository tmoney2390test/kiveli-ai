import type { ComponentProps } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { PlatformPressable } from 'expo-router/react-navigation';
import { IosLiquidGlass, supportsIosLiquidGlass } from './IosLiquidGlass';

type MobileTabButtonProps = ComponentProps<typeof PlatformPressable> & { reduceTransparency?: boolean };

export function MobileTabButton({ style, children, reduceTransparency = false, ...props }: MobileTabButtonProps) {
  const selected = props['aria-selected'] === true || props.accessibilityState?.selected === true;
  const liquidGlass = !reduceTransparency && supportsIosLiquidGlass();

  // The navigator rounds the item container but resets the inner button to 0.
  // Style the actual button so its fill, border, and press feedback share a shape.
  return <PlatformPressable
    {...props}
    pressOpacity={.86}
    android_ripple={{ ...props.android_ripple, borderless: false }}
    style={[style, styles.button, Platform.OS === 'ios' && styles.iosButton, selected && (liquidGlass ? styles.selectedGlass : Platform.OS === 'ios' ? styles.iosSelected : styles.selected)]}
  >
    {selected && liquidGlass
      ? <IosLiquidGlass pointerEvents="none" glassEffectStyle="regular" style={styles.glassFill} />
      : null}
    {children}
  </PlatformPressable>;
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  iosButton: {
    borderRadius: 26,
    borderCurve: 'continuous',
  },
  selected: {
    backgroundColor: 'rgba(239,82,137,.14)',
    borderColor: 'rgba(255,164,199,.22)',
    ...(Platform.OS === 'web' ? ({
      backgroundImage: 'linear-gradient(145deg, rgba(239,82,137,.15), rgba(161,97,224,.09))',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05)',
    } as never) : {}),
  },
  iosSelected: {
    backgroundColor: 'rgba(239,82,137,.16)',
    borderColor: 'rgba(255,184,212,.27)',
  },
  selectedGlass: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,.16)',
  },
  glassFill: {
    ...StyleSheet.absoluteFill,
    borderRadius: 26,
    borderCurve: 'continuous',
  },
});
