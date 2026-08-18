import type { StyleProp, ViewStyle } from 'react-native';
import { Platform, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

// The supplied source is intentionally kept untouched. This frame crops only the
// empty canvas around the horizontal mark at render time.
const SOURCE_SIZE = 1254;
const CROP = { left: 74, top: 500, width: 1100, height: 285 } as const;

export function KivelleLogo({ height = 32, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  const scale = height / CROP.height;
  const sourceSize = SOURCE_SIZE * scale;
  return <View
    accessibilityRole="header"
    accessibilityLabel="Kivelle.AI"
    style={[styles.frame, { height, width: CROP.width * scale }, style]}
  >
    <Image
      accessible={false}
      source={require('../../assets/kivelle-logo.png')}
      style={[
        styles.image,
        { width: sourceSize, height: sourceSize, left: -CROP.left * scale, top: -CROP.top * scale },
        Platform.OS === 'web' && styles.webImage,
      ]}
      contentFit="fill"
      transition={0}
    />
  </View>;
}

const styles = StyleSheet.create({
  frame: { flexGrow: 0, flexShrink: 0, overflow: 'hidden' },
  image: { position: 'absolute' },
  webImage: { mixBlendMode: 'screen' } as never,
});
