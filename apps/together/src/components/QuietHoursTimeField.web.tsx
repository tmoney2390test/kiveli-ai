import type {MouseEvent} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors, radius} from '../theme';

type Props = {label: string; value: string; onChange: (value: string) => void};

export function QuietHoursTimeField({label, value, onChange}: Props) {
  const openPicker = (event: MouseEvent<HTMLInputElement>) => {
    try {event.currentTarget.showPicker?.();} catch {/* Input click remains the browser fallback. */}
  };
  return <View style={styles.wrapper}>
    <Text style={styles.label}>{label}</Text>
    <input aria-label={`${label} quiet hours`} onClick={openPicker} onChange={(event) => {
      const next = event.currentTarget.value;
      if (/^([01]\d|2[0-3]):[0-5]\d$/.test(next)) onChange(next);
    }} type="time" step={60} value={value} style={inputStyle}/>
  </View>;
}

const inputStyle = {
  width: '100%', minHeight: 52, boxSizing: 'border-box' as const,
  border: `1px solid ${colors.border}`, borderRadius: radius.md,
  background: colors.surface, color: colors.text, colorScheme: 'dark' as const,
  padding: '0 13px', fontFamily: 'system-ui, sans-serif', fontSize: 16, cursor: 'pointer',
};

const styles = StyleSheet.create({
  wrapper: {flex: 1, minWidth: 135, gap: 7},
  label: {color: colors.textSecondary, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: .7},
});
