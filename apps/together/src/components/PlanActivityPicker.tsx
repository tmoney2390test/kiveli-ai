import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, Sparkles, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cleanPlanActivity, PLAN_ACTIVITY_MAX_LENGTH, planActivityOptions } from '../lib/planActivity';
import { colors, radius } from '../theme';
import { FrostedBackdrop, FrostedSurface } from './FrostedGlass';

/** Mount only while open and key by conversation + plan to discard stale drafts. */
export function PlanActivityPicker({ currentActivity, locationName, options, disabled, onSave, onClose }: {
  currentActivity: string;
  locationName: string;
  options: string[];
  disabled?: boolean;
  onSave: (activity: string) => Promise<void>;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState('');
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const choices = planActivityOptions(options, currentActivity);
  const activity = cleanPlanActivity(custom || selected);
  const unchanged = activity.toLowerCase() === cleanPlanActivity(currentActivity.replace(/_/g, ' ')).toLowerCase();
  const save = async () => {
    if (saving.current || disabled || !activity || unchanged || activity.length > PLAN_ACTIVITY_MAX_LENGTH) return;
    saving.current = true; setBusy(true); setError('');
    try { await onSave(activity); onClose(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The activity could not be changed. Try again.'); }
    finally { saving.current = false; setBusy(false); }
  };
  return <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={busy ? undefined : onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.layer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <FrostedBackdrop intensity={34}/>
      <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close activity picker" disabled={busy} onPress={onClose}/>
      <FrostedSurface intensity={88} style={styles.panel}>
        <View style={styles.header}><View style={styles.titleCopy}><Text style={styles.title}>Do an Activity</Text><Text numberOfLines={2} style={styles.subtitle}>{locationName}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close activity picker" disabled={busy} onPress={onClose} style={styles.close}><X size={20} color={colors.textSecondary}/></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll} contentContainerStyle={styles.content}>
          <Text style={styles.hint}>Pick something to do together, or add your own.</Text>
          <View style={styles.grid}>{choices.map((label) => <Pressable key={label} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected === label && !custom, disabled: busy }} disabled={busy} onPress={() => { setSelected(label); setCustom(''); setError(''); }} style={[styles.option, selected === label && !custom && styles.chosen]}><Sparkles size={18} color={colors.violet}/><Text style={styles.optionText}>{label}</Text>{selected === label && !custom ? <Check size={16} color={colors.rose}/> : null}</Pressable>)}</View>
          <Text style={styles.fieldLabel}>Something else?</Text>
          <TextInput accessibilityLabel="Your own activity" placeholder="Make pancakes, play a card game…" placeholderTextColor={colors.dimmed} value={custom} onChangeText={(value) => { setCustom(value); setSelected(''); setError(''); }} editable={!busy} maxLength={PLAN_ACTIVITY_MAX_LENGTH} multiline style={styles.input}/>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {disabled ? <Text style={styles.hint}>Available when the current reply finishes.</Text> : null}
        </ScrollView>
        <Pressable accessibilityRole="button" disabled={busy || disabled || !activity || unchanged} onPress={() => void save()} style={[styles.submit, (busy || disabled || !activity || unchanged) && styles.disabled]}>{busy ? <ActivityIndicator color="#fff"/> : <Sparkles size={18} color="#fff"/>}<Text style={styles.submitText}>{busy ? 'Updating…' : 'Do this activity'}</Text></Pressable>
      </FrostedSurface>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  layer: { flex: 1, justifyContent: 'center', paddingHorizontal: 18 },
  panel: { width: '100%', maxWidth: 480, maxHeight: '100%', alignSelf: 'center', borderRadius: radius.xl, padding: 20, backgroundColor: 'rgba(28,21,40,.78)', borderColor: 'rgba(226,202,255,.3)', shadowColor: '#000', shadowOpacity: .35, shadowRadius: 28, shadowOffset: { width: 0, height: 16 } },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }, titleCopy: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontFamily: 'Georgia', fontSize: 27 }, subtitle: { color: colors.muted, fontSize: 13, marginTop: 5 }, close: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,.06)', alignItems: 'center', justifyContent: 'center' },
  scroll: { flexShrink: 1 }, content: { gap: 12, paddingBottom: 8 }, hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 }, grid: { gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 49, padding: 12, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)' }, chosen: { backgroundColor: 'rgba(155,99,215,.18)', borderColor: colors.violet }, optionText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
  fieldLabel: { color: colors.textSecondary, fontWeight: '700', fontSize: 13, marginTop: 8 }, input: { minHeight: 78, padding: 13, borderWidth: 1, borderColor: 'rgba(203,168,255,.25)', borderRadius: radius.md, color: colors.text, fontSize: 14, lineHeight: 21, textAlignVertical: 'top', backgroundColor: 'rgba(5,4,12,.24)' }, error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  submit: { marginTop: 14, minHeight: 48, borderRadius: radius.pill, backgroundColor: colors.rose, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9 }, submitText: { color: '#fff', fontWeight: '800', fontSize: 14 }, disabled: { opacity: .45 },
});
