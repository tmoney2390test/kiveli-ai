import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

export function KivelleCreditIcon({ size = 18, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return <View
    accessible={false}
    pointerEvents="none"
    style={[styles.frame, { width: size, height: size, borderRadius: size / 2 }, style]}
  >
    <Image
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      alt=""
      source={require('../../assets/brand/kivelle-credit.jpg')}
      contentFit="cover"
      transition={0}
      style={StyleSheet.absoluteFill}
    />
  </View>;
}

const styles = StyleSheet.create({
  frame: {
    flexGrow: 0,
    flexShrink: 0,
    overflow: 'hidden',
    backgroundColor: '#16000D',
  },
});
