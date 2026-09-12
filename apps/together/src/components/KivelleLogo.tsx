import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

// The wordmark asset is cropped from the supplied transparent canvas at source resolution.
const WORDMARK = { width: 1173, height: 361 } as const;

export function KivelleLogo({ height = 32, style, id }: { height?: number; style?: StyleProp<ViewStyle>; id?: string }) {
  const scale = height / WORDMARK.height;
  return <View
    id={id}
    accessibilityRole="header"
    accessibilityLabel="Kivelle.AI"
    style={[styles.frame, { height, width: WORDMARK.width * scale }, style]}
  >
    <Image
      accessible={false}
      source={require('../../assets/kivelle-logo-wordmark.webp')}
      style={styles.image}
      contentFit="fill"
      transition={0}
    />
  </View>;
}

const styles = StyleSheet.create({
  frame: { flexGrow: 0, flexShrink: 0, overflow: 'hidden' },
  image: { ...StyleSheet.absoluteFill },
});
