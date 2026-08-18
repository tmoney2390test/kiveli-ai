import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AlignLeft, Brain, Check, ChevronRight, Flame, History, MessageCircle, RotateCcw, Settings, Type, X } from 'lucide-react-native';
import { manageConversation } from '../lib/api';
import { chatTextSizeOptions, isSubscribedTier, resolveChatResponseStyle, resolveChatSpiceLevel, resolveChatTextSize, withLocalChatSettings } from '../lib/chatSettings';
import { conversationStyleOptions } from '../lib/conversationStyle';
import { useTogether } from '../store/useTogether';
import { colors, radius, spacing, typography } from '../theme';
import type { CharacterInstance, ChatTextSize, Conversation, ConversationStyle, SpiceLevel } from '../types';
import { FrostedSurface } from './FrostedGlass';

type Props = {
  visible: boolean;
  conversation: Conversation | null;
  character: CharacterInstance | null;
  onClose: () => void;
  onHistory: () => void;
  onMemories: () => void;
  onAdvanced: () => void;
  onSaved?: (conversation: Conversation) => void;
};

const demoMode = __DEV__ && process.env.EXPO_PUBLIC_TOGETHER_DEMO_MODE === 'true';
const spiceOptions: Array<{ value: SpiceLevel; label: string }> = [
  { value: 1, label: 'Mild' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'Spicy' },
];

export function ChatSettingsModal({ visible, conversation, character, onClose, onHistory, onMemories, onAdvanced, onSaved }: Props) {
  const { snapshot, upsertConversation } = useTogether();
  const [title, setTitle] = useState('');
  const [responseStyle, setResponseStyle] = useState<ConversationStyle>('texting');
  const [textSize, setTextSize] = useState<ChatTextSize>('medium');
  const [spiceLevel, setSpiceLevel] = useState<SpiceLevel>(2);
  const [saving, setSaving] = useState(false);
  const subscribed = isSubscribedTier(snapshot?.entitlements?.tier);
  const name = character?.together_character_templates.name ?? 'this companion';

  useEffect(() => {
    if (!visible || !conversation) return;
    setTitle(conversation.title ?? '');
    setResponseStyle(resolveChatResponseStyle(conversation, snapshot?.profile ?? null));
    setTextSize(resolveChatTextSize(conversation));
    setSpiceLevel(resolveChatSpiceLevel(conversation, character?.together_character_templates.spice_level));
  }, [visible, conversation?.id, character?.id, snapshot?.profile]);

  const save = async () => {
    if (!conversation || saving) return;
    const cleanTitle = title.trim() || null;
    setSaving(true);
    try {
      const input = { title: cleanTitle, responseStyle, textSize, ...(subscribed ? { spiceLevel } : {}) };
      const updated = demoMode
        ? withLocalChatSettings(conversation, input)
        : await manageConversation<Conversation>({ action: 'settings', conversationId: conversation.id, ...input });
      upsertConversation(updated);
      onSaved?.(updated);
      onClose();
    } catch (error) {
      Alert.alert('Could not save chat settings', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const navigate = (action: () => void) => { onClose(); action(); };

  return <Modal transparent visible={visible && Boolean(conversation && character)} animationType="fade" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
      <Pressable accessibilityLabel="Close chat settings" onPress={onClose} style={StyleSheet.absoluteFill} />
      <FrostedSurface intensity={92} style={styles.modalCard}>
        <View style={styles.header}>
          <View style={styles.headerIcon}><Settings size={25} color="#C778FF" /></View>
          <View style={styles.headerCopy}><Text style={styles.title}>Edit Chat Settings</Text><Text style={styles.subtitle}>Customize this conversation with {name}.</Text></View>
          <Pressable accessibilityLabel="Close" disabled={saving} onPress={onClose} style={({ pressed }) => [styles.close, pressed && styles.pressed]}><X size={21} color={colors.muted} /></Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <SettingSection icon={<MessageCircle size={16} color={colors.violet} />} label="Chat name" optional>
            <TextInput
              accessibilityLabel="Chat name"
              value={title}
              onChangeText={setTitle}
              editable={!saving}
              maxLength={80}
              placeholder={'e.g. “Main Story”, “Roleplay”, “Casual”'}
              placeholderTextColor={colors.dimmed}
              style={styles.input}
            />
          </SettingSection>

          <SettingSection icon={<AlignLeft size={16} color={colors.violet} />} label="Response style">
            <View accessibilityRole="radiogroup" style={styles.styleOptions}>
              {conversationStyleOptions.map((option) => {
                const active = responseStyle === option.value;
                const Icon = option.value === 'texting' ? MessageCircle : AlignLeft;
                return <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active, disabled: saving }}
                  disabled={saving}
                  onPress={() => setResponseStyle(option.value)}
                  style={({ pressed }) => [styles.styleOption, active && styles.optionActive, pressed && styles.pressed]}
                >
                  <Icon size={21} color={active ? '#C778FF' : colors.muted} />
                  <Text style={[styles.styleOptionText, active && styles.optionTextActive]}>{option.value === 'texting' ? 'SMS' : 'Paragraph'}</Text>
                  {active ? <View style={styles.miniCheck}><Check size={11} color="#fff" strokeWidth={3} /></View> : null}
                </Pressable>;
              })}
            </View>
          </SettingSection>

          <SettingSection icon={<Type size={16} color={colors.violet} />} label="Text size">
            <View accessibilityRole="radiogroup" style={styles.textSizeOptions}>
              {chatTextSizeOptions.map((option) => {
                const active = textSize === option.value;
                return <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active, disabled: saving }}
                  disabled={saving}
                  onPress={() => setTextSize(option.value)}
                  style={({ pressed }) => [styles.textSizeOption, active && styles.optionActive, pressed && styles.pressed]}
                >
                  <Text style={[styles.aa, active && styles.optionTextActive, { fontSize: option.value === 'small' ? 17 : option.value === 'medium' ? 20 : 23 }]}>Aa</Text>
                  <Text style={[styles.textSizeLabel, active && styles.optionTextActive]}>{option.label}</Text>
                </Pressable>;
              })}
            </View>
          </SettingSection>

          {subscribed ? <SettingSection icon={<Flame size={16} color="#FF6F7D" />} label="Spice level">
            <View accessibilityRole="adjustable" accessibilityLabel="Spice level" accessibilityValue={{ min: 1, max: 3, now: spiceLevel, text: spiceOptions.find((item) => item.value === spiceLevel)?.label ?? 'Medium' }} style={styles.spiceControl}>
              <View style={styles.spiceTrack}><View style={[styles.spiceFill, { width: spiceLevel === 1 ? '0%' : spiceLevel === 2 ? '50%' : '100%' }]} /></View>
              <View style={styles.spiceStops}>
                {spiceOptions.map((option) => <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: option.value === spiceLevel, disabled: saving }}
                  disabled={saving}
                  onPress={() => setSpiceLevel(option.value)}
                  style={styles.spiceStop}
                >
                  <View style={[styles.spiceDot, option.value === spiceLevel && styles.spiceThumb]}>{option.value === spiceLevel && option.value === 3 ? <Flame size={16} color="#fff" fill="#fff" /> : null}</View>
                </Pressable>)}
              </View>
              <View style={styles.spiceLabels}>{spiceOptions.map((option) => <Text key={option.value} style={[styles.spiceLabel, option.value === spiceLevel && styles.spiceLabelActive]}>{option.label}</Text>)}</View>
            </View>
          </SettingSection> : null}

          <View style={styles.divider} />
          <Text style={styles.manageTitle}>CONVERSATION TOOLS</Text>
          <View style={styles.tools}>
            <ToolRow icon={<History size={18} color={colors.textSecondary} />} title="History & search" body="Find messages or manage earlier chats." onPress={() => navigate(onHistory)} />
            <ToolRow icon={<Brain size={18} color={colors.violet} />} title={`What ${name} remembers`} body="Review or forget relationship memories." onPress={() => navigate(onMemories)} />
            <ToolRow icon={<RotateCcw size={18} color={colors.warm} />} title="Advanced relationship controls" body="Reset progress or start over completely." onPress={() => navigate(onAdvanced)} />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable disabled={saving} onPress={onClose} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}><Text style={styles.cancelText}>Cancel</Text></Pressable>
          <Pressable disabled={saving} onPress={() => void save()} style={({ pressed }) => [styles.save, saving && styles.disabled, pressed && styles.pressed]}><Text style={styles.saveText}>{saving ? 'Saving…' : 'Save changes'}</Text></Pressable>
        </View>
      </FrostedSurface>
    </KeyboardAvoidingView>
  </Modal>;
}

function SettingSection({ icon, label, optional = false, children }: { icon: React.ReactNode; label: string; optional?: boolean; children: React.ReactNode }) {
  return <View style={styles.section}><View style={styles.sectionLabel}>{icon}<Text style={styles.sectionLabelText}>{label}</Text>{optional ? <Text style={styles.optional}>(optional)</Text> : null}</View>{children}</View>;
}

function ToolRow({ icon, title, body, onPress }: { icon: React.ReactNode; title: string; body: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.toolRow, pressed && styles.pressed]}>{icon}<View style={{ flex: 1 }}><Text style={styles.toolTitle}>{title}</Text><Text style={styles.toolBody}>{body}</Text></View><ChevronRight size={17} color={colors.dimmed} /></Pressable>;
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.md, backgroundColor: 'rgba(3,2,7,.74)' },
  modalCard: { width: '100%', maxWidth: 650, maxHeight: '92%', overflow: 'hidden', borderRadius: radius.xl, backgroundColor: 'rgba(31,24,42,.985)', borderColor: 'rgba(190,115,255,.30)', shadowColor: '#000', shadowOpacity: .56, shadowRadius: 32, shadowOffset: { width: 0, height: 18 } },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerIcon: { width: 37, height: 37, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { minWidth: 0, flex: 1 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 27, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  close: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.045)' },
  content: { gap: 24, padding: spacing.lg, paddingBottom: 26 },
  section: { gap: 11 },
  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionLabelText: { color: colors.text, fontSize: 14, fontWeight: '900' },
  optional: { color: colors.muted, fontSize: 12 },
  input: { minHeight: 54, paddingHorizontal: 15, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.055)', borderWidth: 1, borderColor: 'rgba(199,120,255,.48)', color: colors.text, fontSize: 15 },
  styleOptions: { flexDirection: 'row', gap: 10 },
  styleOption: { minHeight: 78, flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.035)', borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  optionActive: { backgroundColor: 'rgba(112,55,139,.26)', borderColor: '#A845F2', borderWidth: 2 },
  styleOptionText: { color: colors.muted, fontSize: 14, fontWeight: '800' },
  optionTextActive: { color: colors.text },
  miniCheck: { position: 'absolute', top: 8, right: 8, width: 19, height: 19, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.violet },
  textSizeOptions: { flexDirection: 'row', gap: 9 },
  textSizeOption: { minHeight: 76, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.035)', borderWidth: 1, borderColor: colors.border },
  aa: { color: colors.textSecondary, fontWeight: '900', lineHeight: 26 },
  textSizeLabel: { color: colors.muted, fontSize: 11, marginTop: 2 },
  spiceControl: { paddingHorizontal: 8, paddingTop: 12 },
  spiceTrack: { position: 'absolute', left: 24, right: 24, top: 29, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.14)', overflow: 'hidden' },
  spiceFill: { height: 4, borderRadius: 2, backgroundColor: '#B168E5' },
  spiceStops: { flexDirection: 'row', justifyContent: 'space-between' },
  spiceStop: { width: 48, height: 38, alignItems: 'center', justifyContent: 'center' },
  spiceDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#B168E5', borderWidth: 2, borderColor: '#D7B2F2' },
  spiceThumb: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F24F66', borderWidth: 0, shadowColor: '#F24F66', shadowOpacity: .36, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  spiceLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  spiceLabel: { width: 72, color: colors.muted, fontSize: 11, textAlign: 'center' },
  spiceLabelActive: { color: colors.text, fontWeight: '900' },
  divider: { height: 1, backgroundColor: colors.border },
  manageTitle: { color: colors.dimmed, fontSize: 9, fontWeight: '900', letterSpacing: 1.2, marginBottom: -14 },
  tools: { gap: 7 },
  toolRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.035)', borderWidth: 1, borderColor: colors.border },
  toolTitle: { color: colors.text, fontSize: 12, fontWeight: '900' },
  toolBody: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 3 },
  footer: { flexDirection: 'row', gap: 10, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: 'rgba(17,13,24,.82)' },
  cancel: { minHeight: 47, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderBright },
  cancelText: { color: colors.textSecondary, fontSize: 13, fontWeight: '800' },
  save: { minHeight: 47, flex: 1.35, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: '#9D42E4', shadowColor: '#9D42E4', shadowOpacity: .28, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  saveText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  pressed: { opacity: .72 },
  disabled: { opacity: .52 },
});
