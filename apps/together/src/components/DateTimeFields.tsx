import { createElement } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { colors, radius } from '../theme';

type Props = {
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
};

export function DateTimeFields({ date, time, onDateChange, onTimeChange }: Props) {
  if (Platform.OS === 'web') {
    return <View style={styles.row}>
      {createElement('input' as never, {
        'aria-label': 'Plan date',
        min: new Date().toISOString().slice(0, 10),
        onChange: (event: { target: { value: string } }) => onDateChange(event.target.value),
        style: webInput,
        type: 'date',
        value: date,
      } as never)}
      {createElement('input' as never, {
        'aria-label': 'Plan time',
        onChange: (event: { target: { value: string } }) => onTimeChange(event.target.value),
        step: 900,
        style: webInput,
        type: 'time',
        value: time,
      } as never)}
    </View>;
  }

  return <View style={styles.row}>
    <TextInput accessibilityLabel="Plan date" value={date} onChangeText={onDateChange} placeholder="YYYY-MM-DD" placeholderTextColor={colors.dimmed} inputMode="numeric" style={styles.field}/>
    <TextInput accessibilityLabel="Plan time" value={time} onChangeText={onTimeChange} placeholder="19:30" placeholderTextColor={colors.dimmed} inputMode="numeric" style={styles.field}/>
  </View>;
}

const webInput = {
  minHeight: 42,
  minWidth: 150,
  flex: 1,
  borderRadius: radius.md,
  border: `1px solid ${colors.border}`,
  background: colors.surface,
  color: colors.text,
  colorScheme: 'dark',
  padding: '0 12px',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 14,
};

const styles = StyleSheet.create({
  row: { flex: 1, minWidth: 250, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  field: { flex: 1, minWidth: 120, minHeight: 42, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 12 },
});
