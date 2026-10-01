import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, ChevronDown, X } from 'lucide-react-native';
import { GradientButton, Screen } from '../../src/components';
import { colors, radius, typography } from '../../src/theme';
import { settingsMaterial as glass } from '../../src/styles/settingsMaterial';
import { FrostedSurface } from '../../src/components/FrostedGlass';
import { createSupportTicket, type SupportCategory } from '../../src/lib/operations';
import { canSubmitSupportRequest } from '../../src/lib/supportTicket';
import { useSupportRequest } from '../../src/lib/useSupportRequest';
import { useSupportDraft } from '../../src/lib/supportDraft';
import { recoveryTopics } from '../../src/lib/supportRecovery';
import { supportRequestReferences } from '../../src/lib/mediaSupportReference';

const categories: Array<{ value: SupportCategory; label: string }> = [
  { value: 'bug', label: 'App issue' },
  { value: 'billing', label: 'Billing & credits' },
  { value: 'safety', label: 'Safety' },
  { value: 'account', label: 'Account access' },
  { value: 'feedback', label: 'Feedback' },
  { value: 'other', label: 'Something else' },
];

export default function NewSupportRequest() {
  const params = useLocalSearchParams<{ topic?: string; mediaId?: string; conversationId?: string }>();
  const saved = useSupportDraft('new', { category: 'bug' as SupportCategory, subject: '', message: '' });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const topicApplied = useRef(false);
  const sendRequest = useSupportRequest();
  const { category, subject, message } = saved.draft;

  useEffect(() => {
    if (!saved.ready || topicApplied.current) return;
    topicApplied.current = true;
    const topic = recoveryTopics.find((item) => item.id === params.topic);
    if (topic && !saved.draft.subject && !saved.draft.message) saved.update({ category: topic.category, subject: topic.title });
  }, [saved.ready, params.topic]);

  const submit = async () => {
    if (busy || !saved.ready || !canSubmitSupportRequest(subject, message)) return;
    setBusy(true);
    setError('');
    try {
      const result = await sendRequest({
        category,
        subject: subject.trim(),
        message: message.trim(),
        ...supportRequestReferences(params),
      }, createSupportTicket);
      saved.clear();
      router.replace({ pathname: '/support', params: { ticket: result.ticket.id } } as never);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your request could not be sent.');
    } finally { setBusy(false); }
  };

  return <Screen contentStyle={styles.page}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.canGoBack() ? router.back() : router.replace('/support')} style={styles.back}><ArrowLeft size={21} color={colors.text} /></Pressable>
      <Text accessibilityRole="header" style={styles.heading}>New support request</Text>
    </View>
    <Text style={styles.intro}>Tell us what happened. You can follow replies in Support.</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <View style={styles.field}>
      <Text style={styles.label}>What is this about?</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`What is this about? ${categories.find((item) => item.value === category)?.label ?? 'Choose a topic'}`} accessibilityState={{ expanded: pickerOpen }} onPress={() => setPickerOpen(true)} style={({ pressed }) => [styles.pickerTrigger, pressed && styles.pressed]}>
        <Text style={styles.pickerValue}>{categories.find((item) => item.value === category)?.label ?? 'Choose a topic'}</Text><ChevronDown size={19} color={colors.textSecondary} />
      </Pressable>
    </View>
    <View style={styles.field}>
      <Text style={styles.label}>Subject</Text>
      <TextInput accessibilityLabel="Support request subject" value={subject} onChangeText={(value) => saved.update({ subject: value })} editable={!busy && saved.ready} maxLength={160} placeholder="Short summary" placeholderTextColor={colors.dimmed} style={styles.input} />
    </View>
    <View style={styles.field}>
      <Text style={styles.label}>What happened?</Text>
      <TextInput accessibilityLabel="Support request message" value={message} onChangeText={(value) => saved.update({ message: value })} editable={!busy && saved.ready} maxLength={5000} multiline textAlignVertical="top" placeholder="Describe the issue. Do not include passwords or payment card numbers." placeholderTextColor={colors.dimmed} style={[styles.input, styles.message]} />
    </View>
    <Text style={styles.meta}>{saved.persistenceError ? 'Device storage is unavailable. Keep this page open until you send your request.' : saved.ready ? 'Your draft is kept on this device for this account.' : 'Loading your draft…'}</Text>
    <GradientButton label={busy ? 'Sending…' : 'Send to support'} disabled={busy || !saved.ready || !canSubmitSupportRequest(subject, message)} onPress={() => void submit()} />
    <SupportTopicPicker visible={pickerOpen} value={category} onClose={() => setPickerOpen(false)} onChoose={(next) => { saved.update({ category: next }); setPickerOpen(false); }} />
  </Screen>;
}

function SupportTopicPicker({ visible, value, onClose, onChoose }: { visible: boolean; value: SupportCategory; onClose: () => void; onChoose: (value: SupportCategory) => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const desktop = width >= 700;
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={[styles.pickerBackdrop, desktop && styles.pickerCentered]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close topic picker" onPress={onClose} style={StyleSheet.absoluteFill} />
      <FrostedSurface intensity={92} style={[styles.pickerSheet, desktop && styles.pickerDesktop, { maxHeight: height - 24, paddingBottom: Math.max(insets.bottom, 20) }]}>
        <View style={styles.pickerHeader}><Text accessibilityRole="header" style={styles.pickerTitle}>What is this about?</Text><Pressable accessibilityRole="button" accessibilityLabel="Close topic picker" onPress={onClose} style={styles.pickerClose}><X size={20} color={colors.textSecondary} /></Pressable></View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.pickerOptions}>
          {categories.map((item) => <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ checked: value === item.value }} onPress={() => onChoose(item.value)} style={({ pressed }) => [styles.pickerOption, value === item.value && styles.pickerOptionSelected, pressed && styles.pressed]}><Text style={[styles.pickerOptionText, value === item.value && styles.pickerOptionTextSelected]}>{item.label}</Text>{value === item.value ? <Check size={18} color={glass.accent} /> : null}</Pressable>)}
        </ScrollView>
      </FrostedSurface>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: 17, paddingTop: 12, paddingBottom: 50 },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  heading: { color: colors.text, fontSize: 22, fontWeight: '800' },
  intro: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  field: { gap: 8 },
  label: { color: colors.text, fontSize: 14, fontWeight: '800' },
  input: { minHeight: 54, color: colors.text, borderWidth: 1, borderColor: glass.border, borderRadius: radius.md, backgroundColor: glass.glass, padding: 13, fontSize: 15 },
  message: { minHeight: 160 },
  pickerTrigger: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, borderWidth: 1, borderColor: glass.border, borderRadius: radius.md, backgroundColor: glass.glass },
  pickerValue: { flex: 1, color: colors.text, fontSize: 15 },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  pressed: { opacity: .72 },
  pickerBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: glass.backdrop },
  pickerCentered: { alignItems: 'center', justifyContent: 'center', padding: 18 },
  pickerSheet: { width: '100%', padding: 20, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: glass.border, backgroundColor: glass.nestedGlass },
  pickerDesktop: { maxWidth: 460, borderRadius: radius.xl },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  pickerTitle: { color: colors.text, fontFamily: typography.display, fontSize: 25, fontWeight: '700' },
  pickerClose: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  pickerOptions: { gap: 7, paddingTop: 18 },
  pickerOption: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: glass.border, backgroundColor: glass.inset },
  pickerOptionSelected: { borderColor: glass.selectedBorder, backgroundColor: glass.selected },
  pickerOptionText: { flex: 1, color: colors.textSecondary, fontSize: 14, fontWeight: '800' },
  pickerOptionTextSelected: { color: colors.text },
});
