import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { ArrowLeft, Check, ChevronDown, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

const modalStack: symbol[] = [];

export const creatorGenders = [{ value: 'woman', label: 'Woman' }, { value: 'man', label: 'Man' }, { value: 'nonbinary', label: 'Nonbinary' }];
export const creatorPronouns = ['she/her', 'he/him', 'they/them', 'she/they', 'he/they'].map((value) => ({ value, label: value }));

export function CreatorModal({ visible, title, onClose, onDismiss, children, footer, large = false, cardChooser = false }: { visible: boolean; title: string; onClose: () => void; onDismiss?: () => void; children: ReactNode; footer?: ReactNode; large?: boolean; cardChooser?: boolean }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const safeTop = Platform.OS === 'ios' ? insets.top : 0;
  const safeBottom = Platform.OS === 'ios' ? insets.bottom : 0;
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const previous = document.activeElement as HTMLElement | null;
    const token = Symbol(); modalStack.push(token);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && modalStack[modalStack.length - 1] === token) { event.preventDefault(); close.current(); } };
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('keydown', escape); modalStack.splice(modalStack.indexOf(token), 1); previous?.focus?.(); };
  }, [visible]);
  // Keep the native modal mounted until dismissal finishes before presenting
  // another creation sheet on iOS.
  if (!visible && !onDismiss) return null;
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onDismiss={onDismiss}>
    <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':Platform.OS==='android'?'height':undefined} style={[styles.backdrop, { paddingTop: safeTop + 12, paddingBottom: safeBottom + 12 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Close ${title}`} onPress={onClose} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={[styles.modal, cardChooser && styles.cardChooserModal, { width: Math.min(width - (cardChooser && width < 600 ? 32 : 24), large ? 1200 : cardChooser ? 860 : 640), maxHeight: height - safeTop - safeBottom - 24 }, width < 600 && styles.mobile]}>
        <View style={[styles.header, cardChooser && styles.cardChooserHeader]}>{large ? <Pressable accessibilityRole="button" accessibilityLabel="Back to portrait" onPress={onClose} style={styles.close}><ArrowLeft size={23} color={colors.text} /></Pressable> : cardChooser && width >= 600 ? <View style={styles.headerSpacer} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" /> : null}<Text accessibilityRole="header" style={[styles.title, (large || cardChooser) && { textAlign: 'center' }, cardChooser && styles.cardChooserTitle, cardChooser && width < 600 && styles.cardChooserMobileTitle]}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Close ${title}`} onPress={onClose} style={styles.close}><X size={23} color={colors.text} /></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>{children}{footer?<View style={{gap:12,paddingTop:20}}>{footer}</View>:null}</ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

export function CreatorPicker({ label, title, value, options, onChange, custom = false }: { label: string; title?: string; value: string; options: Array<{ value: string; label: string; image?: ImageSource; disabled?: boolean }>; onChange: (value: string) => void; custom?: boolean }) {
  const [open, setOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const selected = options.find((option) => option.value === value);
  const visual = options.some((option) => option.image);
  const choose = (next: string) => { if (options.find((option) => option.value === next)?.disabled) return; onChange(next); setOpen(false); };
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${selected?.label || value || 'Choose'}`} accessibilityState={{ expanded: open }} aria-expanded={open} onPress={() => { setCustomValue(selected ? '' : value); setOpen(true); }} style={styles.trigger}>
      {selected?.image ? <Image source={selected.image} style={styles.thumbnail} contentFit="cover" /> : null}<Text style={styles.value}>{selected?.label || value || 'Choose'}</Text><ChevronDown size={18} color={colors.muted} />
    </Pressable>
    <CreatorModal visible={open} title={title || `Choose ${label.toLowerCase().replace(' *', '')}`} onClose={() => setOpen(false)}>
      <View style={visual ? styles.grid : styles.list}>{options.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={`${option.label}${option.disabled ? ", coming soon" : ""}`} disabled={option.disabled} accessibilityState={{ checked: value === option.value, disabled: option.disabled }} aria-checked={value === option.value} onPress={() => choose(option.value)} style={[styles.option, visual && styles.world, value === option.value && styles.selected]}>
        {option.image ? <><Image source={option.image} style={StyleSheet.absoluteFill} contentFit="cover" /><View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,.24)' }]} /></> : null}<Text style={[styles.value, visual && styles.worldName]}>{option.label}{option.disabled ? "\nComing soon" : ""}</Text>{value === option.value ? <Check size={20} color={visual ? '#fff' : colors.rose} /> : null}
      </Pressable>)}</View>
      {custom ? <View style={styles.custom}><Text style={styles.label}>Or use your own</Text><TextInput accessibilityLabel={`Custom ${label.toLowerCase().replace(' *', '')}`} value={customValue} onChangeText={setCustomValue} maxLength={40} placeholder="Type here" placeholderTextColor={colors.muted} style={styles.input} onSubmitEditing={() => { if (customValue.trim()) choose(customValue.trim()); }} /><Pressable accessibilityRole="button" disabled={!customValue.trim()} onPress={() => choose(customValue.trim())} style={[styles.apply, !customValue.trim() && { opacity: .4 }]}><Text style={styles.applyText}>Use this</Text></Pressable></View> : null}
    </CreatorModal>
  </View>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.72)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  modal: { backgroundColor: '#191919', borderRadius: 32, padding: 24, flexShrink: 1 }, mobile: { padding: 16, borderRadius: 24 },
  cardChooserModal: { backgroundColor: '#17121D', borderColor: 'rgba(207,166,227,.22)', borderWidth: 1, borderRadius: 24, padding: 26, shadowColor: '#000', shadowOpacity: .5, shadowRadius: 32, shadowOffset: { width: 0, height: 18 } },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 }, title: { flex: 1, color: colors.text, fontSize: 23, fontWeight: '700' }, close: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#282828', alignItems: 'center', justifyContent: 'center' }, content: { gap: 20, paddingBottom: 4 },
  cardChooserHeader: { marginBottom: 22 }, cardChooserTitle: { fontFamily: 'Georgia', fontSize: 30, fontWeight: '700', color: '#FFF8FE' }, headerSpacer: { width: 48, height: 48 },
  cardChooserMobileTitle: { fontSize: 24, textAlign: 'left' },
  field: { flexGrow: 1, flexShrink: 0, minWidth: 120, gap: 8 }, label: { color: colors.text, fontSize: 13, fontWeight: '700' }, trigger: { minHeight: 56, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, flexDirection: 'row', alignItems: 'center', gap: 12 }, thumbnail: { width: 48, height: 36, borderRadius: 8 }, value: { flex: 1, color: colors.text, fontSize: 15 },
  list: { gap: 8 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, option: { padding: 18, minHeight: 58, borderRadius: 16, borderWidth: 2, borderColor: 'transparent', backgroundColor: '#282828', flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden' }, selected: { borderColor: colors.rose }, world: { flexBasis: '47%', flexGrow: 1, minHeight: 158, alignItems: 'flex-end' }, worldName: { color: '#fff', fontSize: 18, fontWeight: '800' }, custom: { gap: 12, marginTop: 4 }, input: { minHeight: 54, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, color: colors.text }, apply: { padding: 15, borderRadius: 14, alignItems: 'center', backgroundColor: colors.rose }, applyText: { color: '#fff', fontWeight: '800' },
});
