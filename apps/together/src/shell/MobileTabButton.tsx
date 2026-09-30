import type { ComponentProps } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { PlatformPressable } from 'expo-router/react-navigation';

export function MobileTabButton({ style, ...props }: ComponentProps<typeof PlatformPressable>) {
  const selected = props['aria-selected'] === true || props.accessibilityState?.selected === true;

  // The navigator rounds the item container but resets the inner button to 0.
  // Style the actual button so its fill, border, and press feedback share a shape.
  return <PlatformPressable
    {...props}
    pressOpacity={.86}
    android_ripple={{ ...props.android_ripple, borderless: false }}
    style={[style, styles.button, selected && styles.selected]}
  />;
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
  selected: {
    backgroundColor: 'rgba(239,82,137,.14)',
    borderColor: 'rgba(255,164,199,.22)',
    ...(Platform.OS === 'web' ? ({
      backgroundImage: 'linear-gradient(145deg, rgba(239,82,137,.15), rgba(161,97,224,.09))',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05)',
    } as never) : {}),
  },
});
