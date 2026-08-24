import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  AlignLeft,
  Check,
  MessageCircle,
  Settings,
  Type,
  X,
} from "lucide-react-native";
import { manageConversation } from "../lib/api";
import {
  chatDialogueContentModeOptions,
  chatTextSizeOptions,
  resolveChatContentMode,
  resolveChatResponseStyle,
  resolveChatTextSize,
  withLocalChatSettings,
} from "../lib/chatSettings";
import { conversationStyleOptions } from "../lib/conversationStyle";
import { useTogether } from "../store/useTogether";
import { colors, radius } from "../theme";
import type {
  ChatTextSize,
  Conversation,
  ConversationStyle,
  DialogueContentMode,
} from "../types";
import { FrostedSurface } from "./FrostedGlass";

type Props = {
  visible: boolean;
  conversation: Conversation | null;
  onClose: () => void;
  onSaved?: (conversation: Conversation) => void;
};

const demoMode = __DEV__ &&
  process.env.EXPO_PUBLIC_TOGETHER_DEMO_MODE === "true";

export function GroupChatSettingsModal({
  visible,
  conversation,
  onClose,
  onSaved,
}: Props) {
  const { snapshot, upsertConversation } = useTogether();
  const [responseStyle, setResponseStyle] = useState<ConversationStyle>(
      "texting",
    ),
    [textSize, setTextSize] = useState<ChatTextSize>("medium"),
    [contentMode, setContentMode] = useState<DialogueContentMode>("explicit"),
    [saving, setSaving] = useState(false);
  const adultVerified = Boolean(snapshot?.profile?.age_verified_at),
    contentModes = adultVerified
      ? chatDialogueContentModeOptions
      : chatDialogueContentModeOptions.filter((option) => option.value === "romance");

  useEffect(() => {
    if (!visible || !conversation) return;
    setResponseStyle(
      resolveChatResponseStyle(conversation, snapshot?.profile ?? null),
    );
    setTextSize(resolveChatTextSize(conversation));
    const storedMode = resolveChatContentMode(
      conversation,
      snapshot?.profile ?? null,
    );
    setContentMode(
      !adultVerified && ["mature", "explicit"].includes(storedMode)
        ? "romance"
        : storedMode,
    );
  }, [adultVerified, conversation, snapshot?.profile, visible]);

  const save = async () => {
    if (!conversation || saving) return;
    setSaving(true);
    try {
      const input = {
          title: conversation.title,
          responseStyle,
          textSize,
          contentMode,
        },
        updated = demoMode
          ? withLocalChatSettings(conversation, input)
          : await manageConversation<Conversation>({
            action: "settings",
            conversationId: conversation.id,
            ...input,
          });
      upsertConversation(updated);
      onSaved?.(updated);
      onClose();
    } catch (caught) {
      // Keep the modal open so the user's choices are not lost.
      Alert.alert(
        "Could not save chat settings",
        caught instanceof Error
          ? caught.message
          : "The group chat settings could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      transparent
      visible={visible && Boolean(conversation)}
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalRoot}
      >
        <Pressable
          accessibilityLabel="Close group chat settings"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <FrostedSurface intensity={94} style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Settings size={23} color={colors.violet} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Chat Settings</Text>
              <Text style={styles.subtitle}>Customize this group.</Text>
            </View>
            <Pressable
              accessibilityLabel="Close"
              disabled={saving}
              onPress={onClose}
              style={styles.close}
            >
              <X size={20} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <Section
              icon={<AlignLeft size={16} color={colors.violet} />}
              label="Response style"
            >
              <View accessibilityRole="radiogroup" style={styles.twoColumns}>
                {conversationStyleOptions.map((option) => {
                  const selected = option.value === responseStyle,
                    Icon = option.value === "texting"
                      ? MessageCircle
                      : AlignLeft;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      disabled={saving}
                      onPress={() => setResponseStyle(option.value)}
                      style={[styles.choice, selected && styles.choiceActive]}
                    >
                      <Icon
                        size={18}
                        color={selected ? colors.violet : colors.muted}
                      />
                      <Text
                        style={[
                          styles.choiceTitle,
                          selected && styles.choiceTitleActive,
                        ]}
                      >
                        {option.value === "texting" ? "SMS" : "Paragraph"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Section>

            <Section
              icon={<Type size={16} color={colors.violet} />}
              label="Text size"
            >
              <View accessibilityRole="radiogroup" style={styles.threeColumns}>
                {chatTextSizeOptions.map((option) => {
                  const selected = option.value === textSize;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      disabled={saving}
                      onPress={() => setTextSize(option.value)}
                      style={[styles.sizeChoice, selected && styles.choiceActive]}
                    >
                      <Text
                        style={[
                          styles.sizePreview,
                          selected && styles.choiceTitleActive,
                        ]}
                      >
                        Aa
                      </Text>
                      <Text style={styles.choiceCaption}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Section>

            <Section
              icon={<MessageCircle size={16} color={colors.violet} />}
              label="Dialogue intensity"
            >
              <View accessibilityRole="radiogroup" style={styles.modeGrid}>
                {contentModes.map((option) => {
                  const selected = option.value === contentMode;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      disabled={saving}
                      onPress={() => setContentMode(option.value)}
                      style={[styles.modeChoice, selected && styles.choiceActive]}
                    >
                      <Text
                        style={[
                          styles.modeLabel,
                          selected && styles.choiceTitleActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                      {selected
                        ? <Check size={14} color={colors.violet} />
                        : null}
                    </Pressable>
                  );
                })}
              </View>
            </Section>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              disabled={saving}
              onPress={onClose}
              style={styles.cancel}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={saving}
              onPress={() => void save()}
              style={[styles.save, saving && styles.disabled]}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveText}>Save</Text>}
            </Pressable>
          </View>
        </FrostedSurface>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Section({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        {icon}
        <Text style={styles.sectionLabel}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
    backgroundColor: "rgba(5,4,10,.72)",
  },
  card: {
    width: "100%",
    maxWidth: 620,
    maxHeight: "90%",
    overflow: "hidden",
    borderRadius: 24,
    backgroundColor: "rgba(28,22,39,.97)",
    borderWidth: 1,
    borderColor: "rgba(203,168,255,.2)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(164,80,238,.12)",
  },
  headerCopy: { flex: 1 },
  title: { color: colors.text, fontSize: 23, fontWeight: "900" },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  close: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { padding: 20, gap: 22 },
  section: { gap: 10 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionLabel: { color: colors.text, fontSize: 13, fontWeight: "900" },
  twoColumns: { flexDirection: "row", gap: 10 },
  threeColumns: { flexDirection: "row", gap: 9 },
  choice: {
    minHeight: 74,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,.025)",
  },
  sizeChoice: {
    minHeight: 72,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,.025)",
  },
  choiceActive: {
    borderColor: colors.violet,
    backgroundColor: "rgba(164,80,238,.12)",
  },
  choiceTitle: { color: colors.muted, fontSize: 13, fontWeight: "800" },
  choiceTitleActive: { color: colors.text },
  choiceCaption: { color: colors.muted, fontSize: 10 },
  sizePreview: { color: colors.muted, fontSize: 19, fontWeight: "900" },
  modeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  modeChoice: {
    minWidth: "46%",
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,.025)",
  },
  modeLabel: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancel: {
    minHeight: 42,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  cancelText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  save: {
    minWidth: 112,
    minHeight: 42,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.rose,
  },
  saveText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  disabled: { opacity: .48 },
});
