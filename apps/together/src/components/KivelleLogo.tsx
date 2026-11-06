import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

export function KivelleLogo({ height = 32, style, id }: { height?: number; style?: StyleProp<ViewStyle>; id?: string }) {
  return <View
    id={id}
    accessibilityRole="header"
    accessibilityLabel="Kivelli"
    style={[styles.frame, { height, gap: Math.max(5, height * .14) }, style]}
  >
    <Image
      accessible={false}
      source={require('../../assets/kivelle-icon-transparent.png')}
      style={{ width: height * 1.32, height }}
      contentFit="contain"
      transition={0}
    />
    <Text accessible={false} style={[styles.wordmark, { fontSize: height * .71, lineHeight: height }]}>Kivelli</Text>
  </View>;
}

const styles = StyleSheet.create({
  frame: { flexGrow: 0, flexShrink: 0, flexDirection: 'row', alignItems: 'center' },
  wordmark: { color: '#F7F2FF', fontWeight: '700', letterSpacing: -1.2, textShadowColor: 'rgba(169, 121, 245, .48)', textShadowRadius: 5, textShadowOffset: { width: 0, height: 0 } },
});
