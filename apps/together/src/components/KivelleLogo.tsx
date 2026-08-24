import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

// Keep the supplied source untouched and crop only its transparent canvas at render time.
const SOURCE_SIZE = 1254;
const CROP = { left: 53, top: 467, width: 1173, height: 361 } as const;

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
      ]}
      contentFit="fill"
      transition={0}
    />
  </View>;
}

const styles = StyleSheet.create({
  frame: { flexGrow: 0, flexShrink: 0, overflow: 'hidden' },
  image: { position: 'absolute' },
});
