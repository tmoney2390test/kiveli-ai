import { createElement, useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { defaultPlanTimeFields, localPlanDateValue, parseCustomPlanTime } from '../lib/plans';
import { colors, radius } from '../theme';

type Props = {
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
};

export function DateTimeFields({ date, time, onDateChange, onTimeChange }: Props) {
  useEffect(() => {
    if (date) return;
    const defaults = defaultPlanTimeFields();
    onDateChange(defaults.date);
    const proposed = parseCustomPlanTime(defaults.date, time);
    if (!proposed || proposed.getTime() < Date.now() + 10 * 60_000) onTimeChange(defaults.time);
  }, [date, time, onDateChange, onTimeChange]);

  const chooseDay = (offset: 0 | 1) => {
    const now = new Date();
    const selected = new Date(now);
    selected.setDate(selected.getDate() + offset);
    const nextDate = localPlanDateValue(selected);
    onDateChange(nextDate);
    if (offset === 0) {
      const proposed = parseCustomPlanTime(nextDate, time);
      if (!proposed || proposed.getTime() < now.getTime() + 10 * 60_000) onTimeChange(defaultPlanTimeFields(now).time);
    }
  };

  const fields = Platform.OS === 'web' ? <View style={styles.row}>
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>DATE</Text>
      {createElement('input' as never, {
        'aria-label': 'Plan date',
        min: localPlanDateValue(),
        onChange: (event: { target: { value: string } }) => onDateChange(event.target.value),
        style: webInput,
        type: 'date',
        value: date,
      } as never)}
    </View>
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>TIME</Text>
      {createElement('input' as never, {
        'aria-label': 'Plan time',
        onChange: (event: { target: { value: string } }) => onTimeChange(event.target.value),
        step: 900,
        style: webInput,
        type: 'time',
        value: time,
      } as never)}
    </View>
  </View> : <View style={styles.row}>
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>DATE</Text>
      <TextInput accessibilityLabel="Plan date" value={date} onChangeText={onDateChange} placeholder="YYYY-MM-DD" placeholderTextColor={colors.dimmed} inputMode="numeric" style={styles.field}/>
    </View>
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>TIME</Text>
      <TextInput accessibilityLabel="Plan time" value={time} onChangeText={onTimeChange} placeholder="19:30" placeholderTextColor={colors.dimmed} inputMode="numeric" style={styles.field}/>
    </View>
  </View>;

  return <View style={styles.wrapper}>
    <View style={styles.quickRow}>
      <Text style={styles.quickLabel}>QUICK DATE</Text>
      <Pressable accessibilityLabel="Plan for today" onPress={() => chooseDay(0)} style={[styles.quickChip, date === localPlanDateValue() && styles.quickChipActive]}><Text style={styles.quickChipText}>Today</Text></Pressable>
      <Pressable accessibilityLabel="Plan for tomorrow" onPress={() => chooseDay(1)} style={styles.quickChip}><Text style={styles.quickChipText}>Tomorrow</Text></Pressable>
    </View>
    {fields}
  </View>;
}

const webInput = {
  minHeight: 42,
  minWidth: 150,
  width: '100%',
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
  wrapper: { flex: 1, minWidth: 260, gap: 9 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  quickLabel: { color: colors.dimmed, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  quickChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  quickChipActive: { borderColor: colors.rose, backgroundColor: 'rgba(216,62,234,.10)' },
  quickChipText: { color: colors.text, fontSize: 10, fontWeight: '800' },
  row: { flex: 1, minWidth: 250, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8 },
  fieldWrap: { flex: 1, minWidth: 120, gap: 5 },
  label: { color: colors.dimmed, fontSize: 9, fontWeight: '900', letterSpacing: .9 },
  field: { minHeight: 42, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 12 },
});
