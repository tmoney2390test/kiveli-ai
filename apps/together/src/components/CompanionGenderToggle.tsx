import { useEffect, useState, useSyncExternalStore } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronDown, Mars, Venus, VenusAndMars } from 'lucide-react-native';
import { radius } from '../theme';
import { FrostedSurface } from './FrostedGlass';
import type { FeaturedGenderFilter } from '../lib/featuredCompanions';
import { getCompanionGenderPreference, hydrateCompanionGenderPreference, setCompanionGenderPreference, subscribeCompanionGenderPreference } from '../lib/companionGenderPreference';

const options: Array<{ value: FeaturedGenderFilter; label: string }> = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'any', label: 'Any' },
];

export function useCompanionGenderPreference() {
  const value = useSyncExternalStore(subscribeCompanionGenderPreference, getCompanionGenderPreference, getCompanionGenderPreference);
  useEffect(() => { void hydrateCompanionGenderPreference(); }, []);
  return [value, setCompanionGenderPreference] as const;
}

export function CompanionGenderToggle({ value, onChange }: { value: FeaturedGenderFilter; onChange: (value: FeaturedGenderFilter) => void }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0]!;
  return <View accessibilityLabel="Companion gender filter" style={[styles.container, open && styles.containerOpen]}>
    <FrostedSurface intensity={82} style={styles.triggerShell}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Showing ${selected.label.toLowerCase()} companions. Change filter.`} accessibilityState={{ expanded: open }} onPress={() => setOpen((current) => !current)} style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}>
        <View style={styles.selectedIcon}>{genderIcon(selected.value, '#FFF5FB', 14)}</View>
        <Text style={styles.selectedText}>{selected.label}</Text>
        <ChevronDown size={14} strokeWidth={2.2} color="#D7C4D4" style={open ? styles.chevronOpen : undefined} />
      </Pressable>
    </FrostedSurface>
    {open ? <FrostedSurface intensity={88} style={styles.menu}>
      {options.map((option) => {
        const active = value === option.value;
        return <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`Show ${option.label.toLowerCase()} companions`} onPress={() => { onChange(option.value); setOpen(false); }} style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && styles.optionPressed]}>
          {genderIcon(option.value, active ? '#FFF7FC' : '#BCAEB9', 14)}
          <Text style={[styles.optionText, active && styles.optionTextActive]}>{option.label}</Text>
          {active ? <Check size={14} strokeWidth={2.5} color="#FFD7EE" /> : null}
        </Pressable>;
      })}
    </FrostedSurface> : null}
  </View>;
}

function genderIcon(value: FeaturedGenderFilter, color: string, size: number) {
  if (value === 'female') return <Venus size={size} strokeWidth={2.2} color={color} />;
  if (value === 'male') return <Mars size={size} strokeWidth={2.2} color={color} />;
  return <VenusAndMars size={size} strokeWidth={2.1} color={color} />;
}

const styles = StyleSheet.create({
  container: { position: 'relative', alignSelf: 'flex-start', zIndex: 20 },
  containerOpen: { zIndex: 80, elevation: 20 },
  triggerShell: { width: 138, minHeight: 42, borderRadius: radius.pill, borderColor: 'rgba(255,225,244,.26)', shadowColor: '#000', shadowOpacity: .34, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 8, ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(135deg, rgba(111,57,119,.72), rgba(31,22,39,.86) 56%, rgba(86,42,91,.64))' } as never) : {}) },
  trigger: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, overflow: 'hidden' },
  triggerPressed: { opacity: .82 },
  selectedIcon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.09)', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)' },
  selectedText: { flex: 1, color: '#FFF7FC', fontSize: 11, fontWeight: '900' },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  menu: { position: 'absolute', top: 48, left: 0, width: 158, gap: 2, padding: 5, borderRadius: 17, borderColor: 'rgba(255,224,244,.26)', shadowColor: '#000', shadowOpacity: .46, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 22, ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(145deg, rgba(95,53,108,.86), rgba(21,16,29,.94) 58%, rgba(76,36,72,.82))' } as never) : {}) },
  option: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
  optionActive: { backgroundColor: 'rgba(174,67,139,.36)', borderColor: 'rgba(255,213,238,.2)' },
  optionPressed: { opacity: .78, transform: [{ scale: .97 }] },
  optionText: { flex: 1, color: '#BCAEB9', fontSize: 11, fontWeight: '800' },
  optionTextActive: { color: '#FFF7FC' },
});
