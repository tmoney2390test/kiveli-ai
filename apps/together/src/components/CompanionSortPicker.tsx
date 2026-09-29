import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronDown, ListFilter } from 'lucide-react-native';
import { CreatorModal } from './CreatorPicker';
import { colors, radius } from '../theme';
import type { CompanionSortMode } from '../lib/companionSort';

const choices: Array<{ value: CompanionSortMode; label: string }> = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'age-asc', label: 'Youngest first' },
  { value: 'age-desc', label: 'Oldest first' },
  { value: 'spice-desc', label: 'Boldest first' },
  { value: 'spice-asc', label: 'Mildest first' },
];

export function CompanionSortPicker({ value, onChange }: { value: CompanionSortMode; onChange: (value: CompanionSortMode) => void }) {
  const [open, setOpen] = useState(false);
  const label = choices.find((choice) => choice.value === value)?.label ?? choices[0]!.label;
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Sort people: ${label}`} accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} style={styles.trigger}>
      <ListFilter size={16} color={colors.rose} /><Text style={styles.label}>{label}</Text><ChevronDown size={14} color={colors.muted} />
    </Pressable>
    <CreatorModal visible={open} title="Sort people" onClose={() => setOpen(false)}>
      {choices.map((choice) => <Pressable key={choice.value} accessibilityRole="radio" accessibilityLabel={choice.label} accessibilityState={{ checked: value === choice.value }} onPress={() => { onChange(choice.value); setOpen(false); }} style={[styles.option, value === choice.value && styles.selected]}>
        <Text style={styles.optionText}>{choice.label}</Text>{value === choice.value ? <Check size={18} color={colors.rose} /> : null}
      </Pressable>)}
    </CreatorModal>
  </View>;
}

const styles = StyleSheet.create({
  trigger: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,225,244,.26)', backgroundColor: colors.surface },
  label: { color: colors.text, fontSize: 11, fontWeight: '800' },
  option: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  selected: { borderColor: colors.rose },
  optionText: { flex: 1, color: colors.text, fontSize: 15 },
});
