import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Check, ChevronDown, Plus, X } from 'lucide-react-native';
import { CharacterAvatar } from './ui';
import { FrostedBackdrop, FrostedSurface } from './FrostedGlass';
import { colors, radius, spacing } from '../theme';
import { setActiveCompanion } from '../lib/api';
import { useTogether } from '../store/useTogether';
import type { CharacterInstance } from '../types';

type Variant = 'default' | 'overlay';

export function CompanionSwitcher({ active, variant = 'default' }: { active: CharacterInstance; variant?: Variant }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const { snapshot, setSnapshot } = useTogether();
  const selectableIds = new Set(snapshot?.discoverableCharacters?.map((item) => item.id) ?? []);
  const companions = (snapshot?.characters ?? []).filter((item) =>
    (item.together_character_templates.can_be_selected || selectableIds.has(item.character_template_id)) &&
    (item.contact_added_at || item.introduced_at),
  );
  const overlay = variant === 'overlay';

  const choose = async (item: CharacterInstance) => {
    if (item.id === active.id) {
      setOpen(false);
      return;
    }
    setBusy(item.id);
    try {
      setSnapshot(await setActiveCompanion(item.id));
      setOpen(false);
    } finally {
      setBusy('');
    }
  };

  return <>
    <Pressable
      accessibilityLabel="Switch active companion"
      onPress={() => setOpen(true)}
      style={({ pressed }) => [styles.trigger, overlay && styles.triggerOverlay, pressed && styles.triggerPressed]}
    >
      <CharacterAvatar slug={active.together_character_templates.slug} name={active.together_character_templates.name} size={overlay ? 30 : 38} />
      <View style={{ flexShrink: 1 }}>
        {!overlay ? <Text style={styles.label}>WITH</Text> : null}
        <Text numberOfLines={1} style={[styles.name, overlay && styles.nameOverlay]}>{active.together_character_templates.name}</Text>
      </View>
      <ChevronDown size={overlay ? 15 : 17} color={overlay ? '#F8F1EA' : colors.muted} />
    </Pressable>

    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
        <FrostedBackdrop />
        <Pressable style={styles.sheetFrame} onPress={() => undefined}>
        <FrostedSurface style={styles.sheet}>
          <View style={styles.heading}>
            <View><Text style={styles.title}>Your companions</Text><Text style={styles.copy}>Choose whose relationship is in focus.</Text></View>
            <Pressable onPress={() => setOpen(false)} style={styles.close}><X size={20} color={colors.text} /></Pressable>
          </View>
          {companions.map((item) => <Pressable key={item.id} disabled={Boolean(busy)} onPress={() => void choose(item)} style={styles.row}>
            <View style={styles.avatar}><CharacterAvatar slug={item.together_character_templates.slug} name={item.together_character_templates.name} size={50} /></View>
            <View style={{ flex: 1 }}><Text style={styles.rowName}>{item.together_character_templates.name}</Text><Text style={styles.meta}>{busy === item.id ? 'Switching…' : item.current_activity}</Text></View>
            {item.id === active.id ? <Check color={colors.rose} /> : null}
          </Pressable>)}
          <Pressable onPress={() => { setOpen(false); router.push('/(tabs)/singles'); }} style={styles.discover}><Plus size={18} color={colors.rose} /><Text style={styles.discoverText}>Discover someone new</Text></Pressable>
        </FrostedSurface>
        </Pressable>
      </Pressable>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  triggerOverlay: { maxWidth: 174, paddingHorizontal: 8, paddingVertical: 6, gap: 7, borderColor: 'rgba(255,255,255,.18)', backgroundColor: 'rgba(8,8,14,.58)', shadowColor: '#000', shadowOpacity: .22, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  triggerPressed: { opacity: .86, transform: [{ scale: .98 }] },
  label: { fontSize: 8, color: colors.dimmed, fontWeight: '900', letterSpacing: 1.1 },
  name: { fontSize: 14, color: colors.text, fontWeight: '800' },
  nameOverlay: { color: '#fff', fontSize: 13 },
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  sheetFrame: { width: '100%', maxWidth: 500 },
  sheet: { width: '100%', gap: 8, padding: spacing.lg, borderRadius: radius.xl, borderColor: colors.borderBright },
  heading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontFamily: 'Georgia', fontSize: 26, color: colors.text },
  copy: { color: colors.muted, fontSize: 12, marginTop: 4 },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.elevated, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.md, backgroundColor: colors.elevated },
  avatar: { width: 50, height: 50, position: 'relative' },
  rowName: { color: colors.text, fontSize: 16, fontWeight: '800' },
  meta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  discover: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, marginTop: 6, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  discoverText: { color: colors.rose, fontWeight: '800' },
});
