import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

const steps = ['Name', 'About you', 'World', 'Companion'];

export function OnboardingProgress({ step }: { step: 1 | 2 | 3 | 4 }) {
  return <View style={styles.root} accessible accessibilityLabel={`Step ${step} of 4: ${steps[step - 1]}`}>
    <Text style={styles.caption}>STEP {step} OF 4</Text>
    <View style={styles.row}>{steps.map((label, index) => <View key={label} style={styles.item}>
      <View style={[styles.bar, index < step && styles.active]} />
      <Text numberOfLines={1} style={[styles.label, index === step - 1 && styles.current]}>{label}</Text>
    </View>)}</View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 8, minWidth: 0 },
  caption: { color: colors.muted, fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8 },
  item: { flex: 1, minWidth: 0, gap: 7 },
  bar: { height: 4, borderRadius: 2, backgroundColor: colors.borderBright },
  active: { backgroundColor: colors.rose },
  label: { color: colors.muted, fontSize: 10 },
  current: { color: colors.text, fontWeight: '700' },
});
