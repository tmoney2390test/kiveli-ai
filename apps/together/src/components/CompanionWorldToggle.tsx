import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronDown, Globe2 } from 'lucide-react-native';
import { radius } from '../theme';
import type { World } from '../types';
import { FrostedSurface } from './FrostedGlass';

export function CompanionWorldToggle({ worlds, value, onChange }: {
  worlds: World[];
  value: string;
  onChange: (worldId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = worlds.filter((world) => world.published).sort((left, right) => left.sort_order - right.sort_order);
  const selected = options.find((world) => world.id === value) ?? options[0];

  if (!selected || options.length < 2) return null;

  return <View accessibilityLabel="Featured companion world filter" style={[styles.container, open && styles.containerOpen]}>
    <FrostedSurface intensity={82} style={styles.triggerShell}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Showing companions in ${selected.name}. Change world.`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
      >
        <View style={styles.selectedIcon}><Globe2 size={14} strokeWidth={2.2} color="#FFF5FB" /></View>
        <Text numberOfLines={1} style={styles.selectedText}>{selected.name}</Text>
        <ChevronDown size={14} strokeWidth={2.2} color="#D7C4D4" style={open ? styles.chevronOpen : undefined} />
      </Pressable>
    </FrostedSurface>
    {open ? <FrostedSurface intensity={88} style={styles.menu}>
      {options.map((world) => {
        const active = world.id === selected.id;
        return <Pressable
          key={world.id}
          accessibilityRole="button"
          accessibilityState={{ selected: active }}
          accessibilityLabel={`Show companions in ${world.name}`}
          onPress={() => { onChange(world.id); setOpen(false); }}
          style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && styles.optionPressed]}
        >
          <Globe2 size={14} strokeWidth={2.1} color={active ? '#FFF7FC' : '#BCAEB9'} />
          <Text numberOfLines={1} style={[styles.optionText, active && styles.optionTextActive]}>{world.name}</Text>
          {active ? <Check size={14} strokeWidth={2.5} color="#FFD7EE" /> : null}
        </Pressable>;
      })}
    </FrostedSurface> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { position: 'relative', alignSelf: 'flex-start', zIndex: 19 },
  containerOpen: { zIndex: 79, elevation: 19 },
  triggerShell: { width: 146, minHeight: 42, borderRadius: radius.pill, borderColor: 'rgba(255,225,244,.26)', shadowColor: '#000', shadowOpacity: .34, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 8, ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(135deg, rgba(111,57,119,.72), rgba(31,22,39,.86) 56%, rgba(86,42,91,.64))' } as never) : {}) },
  trigger: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, overflow: 'hidden' },
  triggerPressed: { opacity: .82 },
  selectedIcon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.09)', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)' },
  selectedText: { flex: 1, color: '#FFF7FC', fontSize: 11, fontWeight: '900' },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  menu: { position: 'absolute', top: 48, left: 0, width: 190, gap: 2, padding: 5, borderRadius: 17, borderColor: 'rgba(255,224,244,.26)', shadowColor: '#000', shadowOpacity: .46, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 22, ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(145deg, rgba(95,53,108,.86), rgba(21,16,29,.94) 58%, rgba(76,36,72,.82))' } as never) : {}) },
  option: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
  optionActive: { backgroundColor: 'rgba(174,67,139,.36)', borderColor: 'rgba(255,213,238,.2)' },
  optionPressed: { opacity: .78, transform: [{ scale: .97 }] },
  optionText: { flex: 1, color: '#BCAEB9', fontSize: 11, fontWeight: '800' },
  optionTextActive: { color: '#FFF7FC' },
});
