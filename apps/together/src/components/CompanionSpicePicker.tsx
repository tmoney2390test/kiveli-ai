import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronDown, Flame } from 'lucide-react-native';
import { CreatorModal } from './CreatorPicker';
import { colors, radius } from '../theme';
import type { SpiceLevel } from '../types';

export type CompanionSpiceFilter = 'any' | SpiceLevel;
const choices: Array<{ value: CompanionSpiceFilter; label: string }> = [
  { value: 'any', label: 'Any spiciness' }, { value: 1, label: 'Mild' }, { value: 2, label: 'Flirty' }, { value: 3, label: 'Bold' },
];

export function CompanionSpicePicker({ value, onChange }: { value: CompanionSpiceFilter; onChange: (value: CompanionSpiceFilter) => void }) {
  const [open, setOpen] = useState(false);
  const label = choices.find((choice) => choice.value === value)!.label;
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Spiciness: ${label}`} aria-expanded={open} accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} style={styles.trigger}><Flame size={16} color={colors.rose} /><Text style={styles.label}>{label}</Text><ChevronDown size={14} color={colors.muted} /></Pressable>
    <CreatorModal visible={open} title="Choose spiciness" onClose={() => setOpen(false)}>{choices.map((choice) => <Pressable key={choice.value} accessibilityRole="radio" accessibilityLabel={choice.label} aria-checked={value === choice.value} accessibilityState={{ checked: value === choice.value }} onPress={() => { onChange(choice.value); setOpen(false); }} style={[styles.option, value === choice.value && styles.selected]}><Text style={styles.optionText}>{choice.label}</Text>{value === choice.value ? <Check size={18} color={colors.rose} /> : null}</Pressable>)}</CreatorModal>
  </View>;
}

const styles = StyleSheet.create({
  trigger: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,225,244,.26)', backgroundColor: colors.surface }, label: { color: colors.text, fontSize: 11, fontWeight: '800' }, option: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }, selected: { borderColor: colors.rose }, optionText: { flex: 1, color: colors.text, fontSize: 15 },
});
