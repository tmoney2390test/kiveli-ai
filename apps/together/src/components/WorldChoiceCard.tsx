import { Image, type ImageSource } from 'expo-image';
import { Check } from 'lucide-react-native';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';

export function WorldChoiceCard({ name, image, selected, home, width, onPress }: { name: string; image: ImageSource; selected: boolean; home?: boolean; width?: number; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={`${name}${home ? ', home world' : ''}`} accessibilityState={{ checked: selected }} onPress={onPress} style={({ pressed }) => [styles.card, width ? { width } : styles.flex, selected && styles.selected, pressed && styles.pressed]}>
    <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" />
    <View pointerEvents="none" style={styles.shade} />
    <View style={styles.top}>{home ? <Text style={styles.home}>HOME WORLD</Text> : <View />}{selected ? <View style={styles.check}><Check size={16} color="#281527" strokeWidth={3}/></View> : null}</View>
    <Text numberOfLines={2} style={styles.name}>{name}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  card: { height: 158, overflow: 'hidden', justifyContent: 'space-between', borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  flex: { flexBasis: '46%', flexGrow: 1, minWidth: 120 }, selected: { borderColor: colors.rose }, pressed: { opacity: .9 },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 75, backgroundColor: Platform.OS === 'web' ? 'transparent' : 'rgba(7,5,12,.48)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(180deg, transparent, rgba(7,5,12,.75))' } as never) : {}) },
  top: { minHeight: 42, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 8 },
  home: { color: '#fff', fontSize: 8, fontWeight: '800', padding: 7, borderRadius: 12, backgroundColor: 'rgba(8,7,13,.76)' },
  check: { width: 27, height: 27, borderRadius: 14, backgroundColor: colors.rose, alignItems: 'center', justifyContent: 'center' },
  name: { color: '#fff', fontFamily: 'Georgia', fontSize: 19, lineHeight: 23, padding: 12, textShadowColor: '#000', textShadowRadius: 8 },
});
