import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AlignLeft, Check, ChevronDown, ChevronRight, Languages, MessageCircle, Pause, Play, Settings, Type, Volume2, X } from 'lucide-react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router } from 'expo-router';
import { companionVoiceGenderFromSignals, companionVoicePresetsForGender, type CompanionVoicePreset } from '@together/domain/src/voice-presets';
import { manageConversation, previewCompanionVoice } from '../lib/api';
import { chatPreferencesFromConversation, chatTextSizeOptions, resolveChatContentMode, resolveChatLanguage, resolveChatResponseStyle, resolveChatTextSize, resolveChatVoicePreset, withLocalChatSettings } from '../lib/chatSettings';
import { conversationStyleOptions } from '../lib/conversationStyle';
import { useTogether } from '../store/useTogether';
import { colors, radius, spacing, typography } from '../theme';
import type { CharacterInstance, ChatTextSize, Conversation, ConversationStyle, DialogueContentMode } from '../types';
import { FrostedSurface } from './FrostedGlass';
import { createClientRequestId } from '../lib/requestId';
import { cachedVoicePreview, rememberVoicePreview, type VoicePreview } from '../lib/voicePreviewCache';
import { chatLanguageOptions, type ChatLanguagePreference } from '@together/domain/src/chat-language';
import { subscriptionHref } from '../lib/subscriptionPresentation';
import { navigateLocalRouteOnWeb } from '../lib/conversationNavigation';
import { ChatContentModeControl } from './ChatContentModeControl';
import { ChatGenerationSettings } from './settings/ChatGenerationSettings';
import { type ChatDynamism, type ReasoningPreference } from '@together/domain/src/chat-generation';

type Props = {
  visible: boolean;
  conversation: Conversation | null;
  character: CharacterInstance | null;
  onClose: () => void;
  onSaved?: (conversation: Conversation) => void;
};

const demoMode = __DEV__ && process.env.EXPO_PUBLIC_TOGETHER_DEMO_MODE === 'true';
export function ChatSettingsModal({ visible, conversation, character, onClose, onSaved }: Props) {
  const { snapshot, upsertConversation } = useTogether();
  const [title, setTitle] = useState('');
  const [responseStyle, setResponseStyle] = useState<ConversationStyle>('texting');
  const [textSize, setTextSize] = useState<ChatTextSize>('medium');
  const [chatDynamism,setChatDynamism]=useState<ChatDynamism>(50);
  const [reasoningPreference,setReasoningPreference]=useState<ReasoningPreference>('auto');
  const [contentMode,setContentMode]=useState<DialogueContentMode>('mature');
  const [chatLanguage, setChatLanguage] = useState<ChatLanguagePreference>('en');
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [voicePreset, setVoicePreset] = useState<CompanionVoicePreset | null>(null);
  const [voicePreview, setVoicePreview] = useState<VoicePreview | null>(null);
  const [voicePreviewBusy, setVoicePreviewBusy] = useState(false);
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const voicePlayer = useAudioPlayer(null, { updateInterval: 200 });
  const voicePlayerStatus = useAudioPlayerStatus(voicePlayer);
  const voiceEntitled = snapshot?.experienceCapabilities?.voiceNotes === true || snapshot?.entitlements?.entitlement_keys?.includes('voice_notes') === true;
  const adultEligible=Boolean((snapshot?.profile as {adult_content_eligible?:boolean}|null|undefined)?.adult_content_eligible);
  const name = character?.together_character_templates.name ?? 'this companion';
  const voiceGender = companionVoiceGenderFromSignals(
    character?.together_character_templates.discovery_metadata?.gender,
    character?.together_character_versions.pronouns,
    character?.together_character_versions.visual_identity?.gender,
    character?.together_character_versions.appearance_config,
    character?.together_character_versions.visual_identity,
    character?.together_character_templates.biography,
  );
  const voiceOptions = companionVoicePresetsForGender(voiceGender);
  const selectedVoice = voicePreset === null
    ? { label: `${name}'s default`, detail: 'Authored character voice', value: null }
    : voiceOptions.find((option) => option.value === voicePreset) ?? { label: `${name}'s default`, detail: 'Authored character voice', value: null };
  const selectableVoices = [
    { label: `${name}'s default`, detail: 'Authored character voice', value: null as CompanionVoicePreset | null },
    ...voiceOptions,
  ];
  const selectedLanguage = chatLanguageOptions.find((option) => option.value === chatLanguage) ?? chatLanguageOptions[1]!;

  useEffect(() => {
    if (!visible || !conversation) return;
    setTitle(conversation.title ?? '');
    setResponseStyle(resolveChatResponseStyle(conversation, snapshot?.profile ?? null));
    setTextSize(resolveChatTextSize(conversation));
    const generationPreferences=chatPreferencesFromConversation(conversation);
    setChatDynamism(generationPreferences.chatDynamism);
    setReasoningPreference(generationPreferences.reasoningPreference);
    setContentMode(resolveChatContentMode(conversation,snapshot?.profile??null));
    setChatLanguage(resolveChatLanguage(conversation));
    setLanguageMenuOpen(false);
    const selectedVoice = resolveChatVoicePreset(conversation);
    const selectedLanguage = resolveChatLanguage(conversation);
    const cachedPreview = cachedVoicePreview(conversation.id, selectedVoice, selectedLanguage);
    setVoicePreset(selectedVoice);
    setVoicePreview(cachedPreview);
    setVoiceMenuOpen(false);
    if (cachedPreview) voicePlayer.replace(cachedPreview.signedUrl);
    voicePlayer.pause();
  }, [visible, conversation?.id, character?.id, snapshot?.profile]);

  useEffect(() => () => voicePlayer.pause(), [voicePlayer]);
  useEffect(() => { if (!visible) { voicePlayer.pause(); setVoicePreview(null); } }, [visible, voicePlayer]);

  const selectVoice = (next: CompanionVoicePreset | null) => {
    voicePlayer.pause();
    const cachedPreview = conversation ? cachedVoicePreview(conversation.id, next, chatLanguage) : null;
    setVoicePreview(cachedPreview);
    if (cachedPreview) voicePlayer.replace(cachedPreview.signedUrl);
    setVoicePreset(next);
    setVoiceMenuOpen(false);
  };

  const testVoice = async () => {
    if (!conversation || voicePreviewBusy) return;
    if (voicePreview && voicePreview.selection === voicePreset && voicePreview.language === chatLanguage) {
      if (voicePlayerStatus.playing) voicePlayer.pause();
      else {
        if (voicePlayerStatus.didJustFinish) void voicePlayer.seekTo(0);
        voicePlayer.play();
      }
      return;
    }
    setVoicePreviewBusy(true);
    try {
      const result = await previewCompanionVoice({ conversationId: conversation.id, voicePreset, chatLanguage, requestId: createClientRequestId() });
      const preview = { ...result.preview, selection: voicePreset, language: chatLanguage };
      rememberVoicePreview(conversation.id, preview);
      setVoicePreview(preview);
      voicePlayer.replace(result.preview.signedUrl);
      voicePlayer.play();
    } catch (error) {
      Alert.alert('Voice preview unavailable', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setVoicePreviewBusy(false);
    }
  };

  const save = async () => {
    if (!conversation || saving) return;
    const cleanTitle = title.trim() || null;
    setSaving(true);
    try {
      const input = { title: cleanTitle, responseStyle, textSize,contentMode, chatLanguage,chatDynamism,reasoningPreference, ...(voiceEntitled ? { voicePreset } : {}) };
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

          <ChatGenerationSettings mode="direct" chatDynamism={chatDynamism} reasoningPreference={reasoningPreference} tier={snapshot?.entitlements?.tier} disabled={saving} onChatDynamismChange={setChatDynamism} onReasoningPreferenceChange={setReasoningPreference} onUpgrade={()=>{onClose();const href=subscriptionHref({intent:'plans',returnTo:`/chat?conversationId=${conversation?.id??''}`});if(Platform.OS!=='web'||!navigateLocalRouteOnWeb(href))router.push(href as never);}}/>

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

          <ChatContentModeControl value={contentMode} onChange={setContentMode} disabled={saving} eligible={adultEligible}/>

          <SettingSection icon={<Languages size={16} color={colors.violet} />} label="Chat language">
            <Pressable accessibilityRole="button" accessibilityLabel={`Chat language: ${selectedLanguage.label}`} accessibilityState={{ expanded: languageMenuOpen, disabled: saving }} disabled={saving} onPress={() => { setVoiceMenuOpen(false); setLanguageMenuOpen(true); }} style={({ pressed }) => [styles.intensitySelect, pressed && styles.pressed]}>
              <View style={styles.intensityIcon}><Languages size={16} color="#fff" /></View>
              <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={styles.intensityValue}>{selectedLanguage.nativeLabel}</Text>{selectedLanguage.nativeLabel !== selectedLanguage.label ? <Text numberOfLines={1} style={styles.languageDetail}>{selectedLanguage.label}</Text> : null}</View>
              <ChevronDown size={17} color={colors.muted} />
            </Pressable>
            <Text style={styles.languageHint}>Companion replies, suggestions, and voice use this language.</Text>
          </SettingSection>

          <SettingSection icon={<Volume2 size={16} color={colors.violet} />} label="Companion voice">
            {voiceEntitled ? <>
              <View style={styles.voiceControlRow}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Companion voice: ${selectedVoice.label}`} accessibilityState={{ expanded: voiceMenuOpen, disabled: saving || voicePreviewBusy }} disabled={saving || voicePreviewBusy} onPress={() => { setLanguageMenuOpen(false); setVoiceMenuOpen(true); }} style={({ pressed }) => [styles.voiceSelect, voiceMenuOpen && styles.voiceSelectOpen, pressed && styles.pressed]}>
                  <View style={styles.voiceSelectIcon}><Volume2 size={15} color="#fff" /></View>
                  <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={styles.voiceSelectLabel}>{selectedVoice.label}</Text><Text numberOfLines={1} style={styles.voiceSelectDetail}>{selectedVoice.detail}</Text></View>
                  <ChevronDown size={17} color={colors.muted} style={{ transform: [{ rotate: voiceMenuOpen ? '180deg' : '0deg' }] }} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={voicePreview ? voicePlayerStatus.playing ? 'Pause voice sample' : 'Play voice sample' : 'Prepare voice sample'} disabled={saving || voicePreviewBusy} onPress={() => void testVoice()} style={({ pressed }) => [styles.voicePreviewButton, (saving || voicePreviewBusy) && styles.disabled, pressed && styles.pressed]}>
                  {voicePreviewBusy ? <ActivityIndicator size="small" color="#fff" /> : voicePreview ? voicePlayerStatus.playing ? <Pause size={14} color="#fff" fill="#fff" /> : <Play size={14} color="#fff" fill="#fff" /> : <Volume2 size={14} color="#fff" />}
                  <Text style={styles.voicePreviewButtonText}>{voicePreviewBusy ? 'Loading…' : voicePreview && voicePlayerStatus.playing ? 'Pause' : 'Play'}</Text>
                </Pressable>
              </View>
              {voicePreview && !voicePlayerStatus.isLoaded && voicePlayerStatus.error ? <Text accessibilityLiveRegion="polite" style={styles.voiceLoadingText}>The sample could not load. Try it again.</Text> : null}
            </> : <Pressable accessibilityRole="button" onPress={() => { onClose(); const href=subscriptionHref({intent:'voice'}); if(Platform.OS!=='web'||!navigateLocalRouteOnWeb(href))router.push(href as never); }} style={styles.voiceLocked}><Volume2 size={18} color={colors.muted} /><View style={{ flex: 1 }}><Text style={styles.voiceLockedTitle}>Custom voices are available with Kivelle+</Text><Text style={styles.voiceLockedCopy}>Your companion’s authored voice is still used by default.</Text></View><ChevronRight size={16} color={colors.dimmed} /></Pressable>}
          </SettingSection>

        </ScrollView>

        <View style={styles.footer}>
          <Pressable disabled={saving} onPress={onClose} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}><Text style={styles.cancelText}>Cancel</Text></Pressable>
          <Pressable disabled={saving} onPress={() => void save()} style={({ pressed }) => [styles.save, saving && styles.disabled, pressed && styles.pressed]}><Text style={styles.saveText}>{saving ? 'Saving…' : 'Save changes'}</Text></Pressable>
        </View>
      </FrostedSurface>
      {languageMenuOpen ? <View style={styles.intensityOverlay}>
        <Pressable accessibilityLabel="Close chat language selector" onPress={() => setLanguageMenuOpen(false)} style={StyleSheet.absoluteFill} />
        <FrostedSurface intensity={96} style={styles.intensityPopup}>
          <View style={styles.intensityPopupHeader}><Text style={styles.intensityPopupTitle}>Chat language</Text><Pressable accessibilityLabel="Close" onPress={() => setLanguageMenuOpen(false)} style={styles.close}><X size={18} color={colors.muted} /></Pressable></View>
          <ScrollView style={styles.languageList} showsVerticalScrollIndicator={false}><View accessibilityRole="radiogroup" style={styles.intensityOptions}>{chatLanguageOptions.map((option) => {
            const active = option.value === chatLanguage;
            return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => { voicePlayer.pause(); setVoicePreview(null); setChatLanguage(option.value); setLanguageMenuOpen(false); }} style={({ pressed }) => [styles.voicePopupOption, active && styles.intensityOptionActive, pressed && styles.pressed]}><View style={{ flex: 1, minWidth: 0 }}><Text style={[styles.voicePopupLabel, active && styles.optionTextActive]}>{option.nativeLabel}</Text>{option.nativeLabel !== option.label ? <Text style={styles.voicePopupDetail}>{option.label}</Text> : null}</View>{active ? <Check size={17} color="#C778FF" strokeWidth={3} /> : null}</Pressable>;
          })}</View></ScrollView>
        </FrostedSurface>
      </View> : null}
      {voiceMenuOpen ? <View style={styles.intensityOverlay}>
        <Pressable accessibilityLabel="Close companion voice selector" onPress={() => setVoiceMenuOpen(false)} style={StyleSheet.absoluteFill} />
        <FrostedSurface intensity={96} style={styles.intensityPopup}>
          <View style={styles.intensityPopupHeader}><Text style={styles.intensityPopupTitle}>Companion voice</Text><Pressable accessibilityLabel="Close" onPress={() => setVoiceMenuOpen(false)} style={styles.close}><X size={18} color={colors.muted} /></Pressable></View>
          <View accessibilityRole="radiogroup" style={styles.intensityOptions}>{selectableVoices.map((option) => {
            const active = option.value === voicePreset;
            return <Pressable key={option.value ?? 'default'} accessibilityRole="radio" accessibilityState={{ checked: active, disabled: saving || voicePreviewBusy }} disabled={saving || voicePreviewBusy} onPress={() => selectVoice(option.value)} style={({ pressed }) => [styles.voicePopupOption, active && styles.intensityOptionActive, pressed && styles.pressed]}><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={[styles.voicePopupLabel, active && styles.optionTextActive]}>{option.label}</Text><Text numberOfLines={1} style={styles.voicePopupDetail}>{option.detail}</Text></View>{active ? <Check size={17} color="#C778FF" strokeWidth={3} /> : null}</Pressable>;
          })}</View>
        </FrostedSurface>
      </View> : null}
    </KeyboardAvoidingView>
  </Modal>;
}

function SettingSection({ icon, label, optional = false, children }: { icon: React.ReactNode; label: string; optional?: boolean; children: React.ReactNode }) {
  return <View style={styles.section}><View style={styles.sectionLabel}>{icon}<Text style={styles.sectionLabelText}>{label}</Text>{optional ? <Text style={styles.optional}>(optional)</Text> : null}</View>{children}</View>;
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
  intensitySelect: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.04)', borderWidth: 1, borderColor: 'rgba(199,120,255,.30)' },
  intensityIcon: { width: 31, height: 31, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#A845F2' },
  intensityValue: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '900' },
  languageDetail: { color: colors.muted, fontSize: 10, lineHeight: 13, marginTop: 2 },
  languageHint: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: -3 },
  languageList: { maxHeight: 430 },
  intensityOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 20, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(3,2,7,.62)' },
  intensityPopup: { width: '100%', maxWidth: 380, overflow: 'hidden', borderRadius: radius.xl, padding: 16, backgroundColor: 'rgba(28,21,39,.98)', borderColor: 'rgba(199,120,255,.38)', shadowColor: '#000', shadowOpacity: .55, shadowRadius: 28, shadowOffset: { width: 0, height: 15 } },
  intensityPopupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  intensityPopupTitle: { flex: 1, color: colors.text, fontFamily: typography.display, fontSize: 22, fontWeight: '700' },
  intensityOptions: { gap: 7 },
  intensityOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.035)', borderWidth: 1, borderColor: colors.border },
  intensityOptionActive: { backgroundColor: 'rgba(112,55,139,.26)', borderColor: '#A845F2' },
  intensityOptionText: { color: colors.textSecondary, fontSize: 13, fontWeight: '900' },
  voiceControlRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  voiceSelect: { minHeight: 49, flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.04)', borderWidth: 1, borderColor: colors.border },
  voiceSelectOpen: { borderColor: '#A845F2', backgroundColor: 'rgba(112,55,139,.18)' },
  voiceSelectIcon: { width: 29, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.violet },
  voiceSelectLabel: { color: colors.text, fontSize: 12, fontWeight: '900' },
  voiceSelectDetail: { color: colors.muted, fontSize: 9, lineHeight: 12, marginTop: 2 },
  voicePopupOption: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.035)', borderWidth: 1, borderColor: colors.border },
  voicePopupLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '900' },
  voicePopupDetail: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 2 },
  voicePreviewButton: { minHeight: 49, minWidth: 78, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 11, borderRadius: radius.md, backgroundColor: colors.violet },
  voicePreviewButtonText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  voiceLoadingText: { color: colors.muted, fontSize: 9, marginTop: -5 },
  voiceLocked: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.025)', borderWidth: 1, borderColor: colors.border },
  voiceLockedTitle: { color: colors.textSecondary, fontSize: 11, fontWeight: '900' },
  voiceLockedCopy: { color: colors.muted, fontSize: 9, lineHeight: 13, marginTop: 3 },
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
