import { messageCharacterState } from '@together/domain/src/message-limits';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export function MessageCharacterCounter({ value }: { value: string }) {
  const state = messageCharacterState(value);
  if (!state.showCounter) return null;

  const color = state.tone === 'danger'
    ? colors.danger
    : state.tone === 'warning'
      ? colors.warm
      : colors.muted;

  return <View style={styles.row}>
    <Text
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${state.length.toLocaleString()} of ${state.limit.toLocaleString()} characters used`}
      style={[styles.counter, { color }]}
    >
      {state.length.toLocaleString()} / {state.limit.toLocaleString()}
    </Text>
  </View>;
}

const styles = StyleSheet.create({
  row: { minHeight: 14, alignItems: 'flex-end', paddingHorizontal: 14, marginTop: -6 },
  counter: { fontSize: 9, lineHeight: 12, fontWeight: '800', letterSpacing: .25 },
});
