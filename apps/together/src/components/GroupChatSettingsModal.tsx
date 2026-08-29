import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AlignLeft, Check, ChevronDown, Languages, MessageCircle, Settings, Sparkles, Type, UsersRound, X } from 'lucide-react-native';
import { manageConversation, manageGroup } from '../lib/api';
import { chatTextSizeOptions, resolveChatLanguage, resolveChatResponseStyle, resolveChatTextSize, withLocalChatSettings } from '../lib/chatSettings';
import { conversationStyleOptions } from '../lib/conversationStyle';
import { useTogether } from '../store/useTogether';
import { colors, radius } from '../theme';
import type { ChatTextSize, Conversation, ConversationStyle, GroupDetail, GroupSettings } from '../types';
import { FrostedSurface } from './FrostedGlass';
import { chatLanguageOptions, type ChatLanguagePreference } from '@together/domain/src/chat-language';

type Props = {
  visible: boolean;
  conversation: Conversation | null;
  settings: GroupSettings;
  onClose: () => void;
  onSaved?: (conversation: Conversation, settings: GroupSettings) => void;
};

const demoMode = __DEV__ && process.env.EXPO_PUBLIC_TOGETHER_DEMO_MODE === 'true';

export function GroupChatSettingsModal({ visible, conversation, settings, onClose, onSaved }: Props) {
  const { snapshot, upsertConversation } = useTogether();
  const [title, setTitle] = useState('');
  const [responseStyle, setResponseStyle] = useState<ConversationStyle>('texting');
  const [textSize, setTextSize] = useState<ChatTextSize>('medium');
  const [chatLanguage, setChatLanguage] = useState<ChatLanguagePreference>('en');
  const [languageOpen, setLanguageOpen] = useState(false);
  const [responseMode, setResponseMode] = useState<GroupSettings['responseMode']>('automatic');
  const [energy, setEnergy] = useState<GroupSettings['energy']>('balanced');
  const [saving, setSaving] = useState(false);
  const selectedLanguage = chatLanguageOptions.find((option) => option.value === chatLanguage) ?? chatLanguageOptions[1]!;

  useEffect(() => {
    if (!visible || !conversation) return;
    setTitle(conversation.title ?? '');
    setResponseStyle(resolveChatResponseStyle(conversation, snapshot?.profile ?? null));
    setTextSize(resolveChatTextSize(conversation));
    setChatLanguage(resolveChatLanguage(conversation));
    setLanguageOpen(false);
    setResponseMode(settings.responseMode);
    setEnergy(settings.energy);
  }, [conversation, settings.energy, settings.responseMode, snapshot?.profile, visible]);

  const save = async () => {
    if (!conversation || saving) return;
    setSaving(true);
    const input = { title: title.trim() || null, responseStyle, textSize, chatLanguage };
    try {
      if (demoMode) {
        const updated = withLocalChatSettings(conversation, input);
        upsertConversation(updated);
        onSaved?.(updated, { responseMode, energy });
      } else {
        // Both endpoints preserve and rewrite the conversation metadata object.
        // Save sequentially so a stale parallel update cannot discard either
        // chatPreferences or groupSettings.
        const updated = await manageConversation<Conversation>({ action: 'settings', conversationId: conversation.id, ...input });
        const group = await manageGroup<GroupDetail>({ action: 'settings', conversationId: conversation.id, responseMode, energy });
        const canonical = group.conversation ?? updated;
        upsertConversation(canonical);
        onSaved?.(canonical, group.settings);
      }
      onClose();
    } catch (caught) {
      Alert.alert('Could not save chat settings', caught instanceof Error ? caught.message : 'The group chat settings could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return <Modal transparent visible={visible && Boolean(conversation)} animationType="fade" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
      <Pressable accessibilityLabel="Close group chat settings" onPress={onClose} style={StyleSheet.absoluteFill} />
      <FrostedSurface intensity={94} style={styles.card}>
        <View style={styles.header}>
          <View style={styles.headerIcon}><Settings size={23} color={colors.violet} /></View>
          <View style={styles.headerCopy}><Text style={styles.title}>Chat settings</Text><Text style={styles.subtitle}>Conversation style and group behavior.</Text></View>
          <Pressable accessibilityLabel="Close" disabled={saving} onPress={onClose} style={styles.close}><X size={20} color={colors.muted} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Section icon={<UsersRound size={16} color={colors.violet} />} label="Group name">
            <TextInput value={title} onChangeText={setTitle} editable={!saving} maxLength={80} placeholder="Name this group" placeholderTextColor={colors.dimmed} style={styles.input} />
          </Section>
          <Section icon={<Languages size={16} color={colors.violet} />} label="Chat language">
            <Pressable accessibilityRole="button" accessibilityLabel={`Chat language: ${selectedLanguage.label}`} accessibilityState={{ expanded: languageOpen, disabled: saving }} disabled={saving} onPress={() => setLanguageOpen(true)} style={styles.languageSelect}>
              <View style={{ flex: 1, minWidth: 0 }}><Text style={styles.languageValue}>{selectedLanguage.nativeLabel}</Text>{selectedLanguage.nativeLabel !== selectedLanguage.label ? <Text style={styles.languageDetail}>{selectedLanguage.label}</Text> : null}</View><ChevronDown size={17} color={colors.muted} />
            </Pressable>
            <Text style={styles.languageHint}>All companions in this group reply and speak in this language.</Text>
          </Section>
          <Section icon={<AlignLeft size={16} color={colors.violet} />} label="Response style">
            <View accessibilityRole="radiogroup" style={styles.columns}>
              {conversationStyleOptions.map((option) => {
                const selected = option.value === responseStyle;
                const Icon = option.value === 'texting' ? MessageCircle : AlignLeft;
                return <Choice key={option.value} label={option.value === 'texting' ? 'SMS' : 'Paragraph'} selected={selected} disabled={saving} icon={<Icon size={18} color={selected ? colors.violet : colors.muted} />} onPress={() => setResponseStyle(option.value)} />;
              })}
            </View>
          </Section>
          <Section icon={<Type size={16} color={colors.violet} />} label="Text size">
            <View accessibilityRole="radiogroup" style={styles.columns}>
              {chatTextSizeOptions.map((option) => <Choice key={option.value} label={option.label} selected={option.value === textSize} disabled={saving} icon={<Text style={[styles.aa, option.value === textSize && styles.selectedText]}>Aa</Text>} onPress={() => setTextSize(option.value)} />)}
            </View>
          </Section>
          <View style={styles.divider} />
          <Section icon={<UsersRound size={16} color={colors.violet} />} label="Who responds">
            <View accessibilityRole="radiogroup" style={styles.columns}>
              <Choice label="Automatic" selected={responseMode === 'automatic'} disabled={saving} icon={<Sparkles size={18} color={responseMode === 'automatic' ? colors.violet : colors.muted} />} onPress={() => setResponseMode('automatic')} />
              <Choice label="Choose speaker" selected={responseMode === 'choose_speaker'} disabled={saving} icon={<UsersRound size={18} color={responseMode === 'choose_speaker' ? colors.violet : colors.muted} />} onPress={() => setResponseMode('choose_speaker')} />
            </View>
          </Section>
          <Section icon={<Sparkles size={16} color={colors.violet} />} label="Group energy">
            <View accessibilityRole="radiogroup" style={styles.columns}>
              {(['quiet', 'balanced', 'lively'] as const).map((value) => <Choice key={value} label={value[0]!.toUpperCase() + value.slice(1)} selected={energy === value} disabled={saving} onPress={() => setEnergy(value)} />)}
            </View>
          </Section>
        </ScrollView>
        <View style={styles.footer}>
          <Pressable disabled={saving} onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>
          <Pressable disabled={saving} onPress={() => void save()} style={[styles.save, saving && styles.disabled]}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save changes</Text>}</Pressable>
        </View>
      </FrostedSurface>
      {languageOpen ? <View style={styles.languageOverlay}>
        <Pressable accessibilityLabel="Close chat language selector" onPress={() => setLanguageOpen(false)} style={StyleSheet.absoluteFill} />
        <FrostedSurface intensity={96} style={styles.languagePopup}>
          <View style={styles.languagePopupHeader}><Text style={styles.languagePopupTitle}>Chat language</Text><Pressable accessibilityLabel="Close" onPress={() => setLanguageOpen(false)} style={styles.close}><X size={18} color={colors.muted} /></Pressable></View>
          <ScrollView style={styles.languageList} showsVerticalScrollIndicator={false}><View accessibilityRole="radiogroup" style={styles.optionList}>{chatLanguageOptions.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: option.value === chatLanguage }} onPress={() => { setChatLanguage(option.value); setLanguageOpen(false); }} style={[styles.choiceRow, option.value === chatLanguage && styles.selected]}><View style={{ flex: 1 }}><Text style={[styles.choiceText, { textAlign: 'left' }, option.value === chatLanguage && styles.selectedText]}>{option.nativeLabel}</Text>{option.nativeLabel !== option.label ? <Text style={styles.languageDetail}>{option.label}</Text> : null}</View>{option.value === chatLanguage ? <Check size={14} color={colors.violet} /> : null}</Pressable>)}</View></ScrollView>
        </FrostedSurface>
      </View> : null}
    </KeyboardAvoidingView>
  </Modal>;
}

function Section({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return <View style={styles.section}><View style={styles.sectionHeading}>{icon}<Text style={styles.sectionLabel}>{label}</Text></View>{children}</View>;
}

function Choice({ label, selected, disabled, icon, onPress }: { label: string; selected: boolean; disabled: boolean; icon?: React.ReactNode; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={[styles.choice, selected && styles.selected]}>{icon}<Text style={[styles.choiceText, selected && styles.selectedText]}>{label}</Text>{selected ? <Check size={14} color={colors.violet} /> : null}</Pressable>;
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 18, backgroundColor: 'rgba(5,4,10,.72)' },
  card: { width: '100%', maxWidth: 620, maxHeight: '92%', overflow: 'hidden', borderRadius: 24, backgroundColor: 'rgba(28,22,39,.97)', borderWidth: 1, borderColor: 'rgba(203,168,255,.2)' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(164,80,238,.12)' },
  headerCopy: { flex: 1 },
  title: { color: colors.text, fontSize: 23, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  close: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, gap: 22 },
  section: { gap: 10 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionLabel: { color: colors.text, fontSize: 13, fontWeight: '900' },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderBright, backgroundColor: 'rgba(255,255,255,.04)', paddingHorizontal: 14, color: colors.text, fontSize: 14 },
  columns: { flexDirection: 'row', gap: 9 },
  choice: { minHeight: 66, flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.035)', borderWidth: 1, borderColor: colors.border },
  optionList: { gap: 7 },
  choiceRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.035)', borderWidth: 1, borderColor: colors.border },
  languageSelect: { minHeight: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.035)', borderWidth: 1, borderColor: colors.border },
  languageValue: { color: colors.text, fontSize: 13, fontWeight: '900' },
  languageDetail: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 2 },
  languageHint: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: -3 },
  languageOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 20, alignItems: 'center', justifyContent: 'center', padding: 18, backgroundColor: 'rgba(3,2,7,.62)' },
  languagePopup: { width: '100%', maxWidth: 380, maxHeight: '82%', overflow: 'hidden', borderRadius: 24, padding: 16, backgroundColor: 'rgba(28,21,39,.98)', borderWidth: 1, borderColor: 'rgba(199,120,255,.38)' },
  languagePopupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  languagePopupTitle: { flex: 1, color: colors.text, fontSize: 22, fontWeight: '900' },
  languageList: { maxHeight: 430 },
  selected: { backgroundColor: 'rgba(112,55,139,.24)', borderColor: '#A845F2' },
  choiceText: { color: colors.muted, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  selectedText: { color: colors.text },
  aa: { color: colors.muted, fontSize: 19, fontWeight: '900' },
  divider: { height: 1, backgroundColor: colors.border },
  footer: { flexDirection: 'row', gap: 10, padding: 20, borderTopWidth: 1, borderTopColor: colors.border },
  cancel: { minHeight: 47, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderBright },
  cancelText: { color: colors.textSecondary, fontSize: 13, fontWeight: '800' },
  save: { minHeight: 47, flex: 1.35, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: '#9D42E4' },
  saveText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  disabled: { opacity: .5 },
});
