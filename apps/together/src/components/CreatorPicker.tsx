import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { ArrowLeft, Check, ChevronDown, X } from 'lucide-react-native';
import { colors } from '../theme';

export const creatorGenders = [{ value: 'woman', label: 'Woman' }, { value: 'man', label: 'Man' }, { value: 'nonbinary', label: 'Nonbinary' }];
export const creatorPronouns = ['she/her', 'he/him', 'they/them', 'she/they', 'he/they'].map((value) => ({ value, label: value }));

export function CreatorModal({ visible, title, onClose, children, large = false }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; large?: boolean }) {
  const { width, height } = useWindowDimensions();
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const previous = document.activeElement as HTMLElement | null;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close.current(); } };
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('keydown', escape); previous?.focus?.(); };
  }, [visible]);
  if (!visible) return null;
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Close ${title}`} onPress={onClose} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={[styles.modal, { width: Math.min(width - 24, large ? 1200 : 640), maxHeight: height - 32 }, width < 600 && styles.mobile]}>
        <View style={styles.header}>{large ? <Pressable accessibilityRole="button" accessibilityLabel="Back to portrait" onPress={onClose} style={styles.close}><ArrowLeft size={23} color={colors.text} /></Pressable> : null}<Text accessibilityRole="header" style={[styles.title, large && { textAlign: 'center' }]}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Close ${title}`} onPress={onClose} style={styles.close}><X size={23} color={colors.text} /></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>{children}</ScrollView>
      </View>
    </View>
  </Modal>;
}

export function CreatorPicker({ label, title, value, options, onChange, custom = false }: { label: string; title?: string; value: string; options: Array<{ value: string; label: string; image?: ImageSource }>; onChange: (value: string) => void; custom?: boolean }) {
  const [open, setOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const selected = options.find((option) => option.value === value);
  const visual = options.some((option) => option.image);
  const choose = (next: string) => { onChange(next); setOpen(false); };
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${selected?.label || value || 'Choose'}`} accessibilityState={{ expanded: open }} aria-expanded={open} onPress={() => { setCustomValue(selected ? '' : value); setOpen(true); }} style={styles.trigger}>
      {selected?.image ? <Image source={selected.image} style={styles.thumbnail} contentFit="cover" /> : null}<Text style={styles.value}>{selected?.label || value || 'Choose'}</Text><ChevronDown size={18} color={colors.muted} />
    </Pressable>
    <CreatorModal visible={open} title={title || `Choose ${label.toLowerCase().replace(' *', '')}`} onClose={() => setOpen(false)}>
      <View style={visual ? styles.grid : styles.list}>{options.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: value === option.value }} aria-checked={value === option.value} onPress={() => choose(option.value)} style={[styles.option, visual && styles.world, value === option.value && styles.selected]}>
        {option.image ? <><Image source={option.image} style={StyleSheet.absoluteFill} contentFit="cover" /><View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,.24)' }]} /></> : null}<Text style={[styles.value, visual && styles.worldName]}>{option.label}</Text>{value === option.value ? <Check size={20} color={visual ? '#fff' : colors.rose} /> : null}
      </Pressable>)}</View>
      {custom ? <View style={styles.custom}><Text style={styles.label}>Or use your own</Text><TextInput accessibilityLabel={`Custom ${label.toLowerCase().replace(' *', '')}`} value={customValue} onChangeText={setCustomValue} maxLength={40} placeholder="Type here" placeholderTextColor={colors.muted} style={styles.input} onSubmitEditing={() => { if (customValue.trim()) choose(customValue.trim()); }} /><Pressable accessibilityRole="button" disabled={!customValue.trim()} onPress={() => choose(customValue.trim())} style={[styles.apply, !customValue.trim() && { opacity: .4 }]}><Text style={styles.applyText}>Use this</Text></Pressable></View> : null}
    </CreatorModal>
  </View>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.72)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  modal: { backgroundColor: '#191919', borderRadius: 32, padding: 24, flexShrink: 1 }, mobile: { padding: 16, borderRadius: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 }, title: { flex: 1, color: colors.text, fontSize: 23, fontWeight: '700' }, close: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#282828', alignItems: 'center', justifyContent: 'center' }, content: { gap: 20, paddingBottom: 4 },
  field: { flexGrow: 1, flexShrink: 0, minWidth: 120, gap: 8 }, label: { color: colors.text, fontSize: 13, fontWeight: '700' }, trigger: { minHeight: 56, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, flexDirection: 'row', alignItems: 'center', gap: 12 }, thumbnail: { width: 48, height: 36, borderRadius: 8 }, value: { flex: 1, color: colors.text, fontSize: 15 },
  list: { gap: 8 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, option: { padding: 18, minHeight: 58, borderRadius: 16, borderWidth: 2, borderColor: 'transparent', backgroundColor: '#282828', flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden' }, selected: { borderColor: colors.rose }, world: { flexBasis: '47%', flexGrow: 1, minHeight: 158, alignItems: 'flex-end' }, worldName: { color: '#fff', fontSize: 18, fontWeight: '800' }, custom: { gap: 12, marginTop: 4 }, input: { minHeight: 54, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, color: colors.text }, apply: { padding: 15, borderRadius: 14, alignItems: 'center', backgroundColor: colors.rose }, applyText: { color: '#fff', fontWeight: '800' },
});
