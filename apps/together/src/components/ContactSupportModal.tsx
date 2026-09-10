import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { ArrowLeft, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, typography } from "../theme";
import { createSupportTicket } from "../lib/operations";
import {
  canSubmitSupportRequest,
  formatSupportTicketReference,
  SUPPORT_MESSAGE_MAX_LENGTH,
  SUPPORT_SUBJECT_MAX_LENGTH,
} from "../lib/supportTicket";
import { FrostedBackdrop, FrostedSurface } from "./index";

export function ContactSupportModal({
  visible,
  email,
  onClose,
}: {
  visible: boolean;
  email?: string | null;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 700;
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setSubject("");
      setMessage("");
      setBusy(false);
    }
  }, [visible]);

  const ready = canSubmitSupportRequest(subject, message);
  const close = () => { if (!busy) onClose(); };
  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const result = await createSupportTicket({
        category: "other",
        subject: subject.trim(),
        message: message.trim(),
      });
      const reference = formatSupportTicketReference(result.ticket.ticket_number);
      onClose();
      Alert.alert(
        "Request received",
        result.emailDelivery === "sent"
          ? `${reference} was sent to Kivelli Support.`
          : `${reference} was created and is available to the support team.`,
      );
    } catch (error) {
      Alert.alert(
        "Could not contact support",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={close}
    statusBarTranslucent
  >
    <View style={[styles.overlay, compact && styles.overlayCompact]}>
      <FrostedBackdrop intensity={compact ? 34 : 74} />
      <Pressable
        accessible={false}
        onPress={close}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        pointerEvents="box-none"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardLayer}
      >
        <FrostedSurface
          intensity={88}
          style={[
            styles.modal,
            compact ? styles.modalCompact : styles.modalDesktop,
            {
              maxHeight: Math.max(440, height - Math.max(insets.top, 18) - 18),
              paddingBottom: Math.max(insets.bottom, 14),
            },
          ]}
        >
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close contact support"
              disabled={busy}
              onPress={close}
              hitSlop={6}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
            ><ArrowLeft size={21} color={colors.textSecondary} /></Pressable>
            <Text accessibilityRole="header" style={styles.title}>Contact support</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close contact support"
              disabled={busy}
              onPress={close}
              hitSlop={6}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
            ><X size={22} color={colors.textSecondary} /></Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.intro}>For billing, account access, subscriptions, payments, refunds, or bugs.</Text>

            <View style={styles.fieldCard}>
              <Text style={styles.label}>Your email</Text>
              <View style={styles.readOnlyInput}>
                <Text numberOfLines={1} style={styles.email}>{email || "Signed-in account"}</Text>
              </View>
            </View>

            <View style={styles.fieldCard}>
              <Text style={styles.label}>Subject</Text>
              <TextInput
                accessibilityLabel="Support request subject"
                value={subject}
                onChangeText={setSubject}
                editable={!busy}
                maxLength={SUPPORT_SUBJECT_MAX_LENGTH}
                placeholder="What can we help with?"
                placeholderTextColor={colors.textSecondary}
                returnKeyType="next"
                style={styles.input}
              />
            </View>

            <View style={styles.fieldCard}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Message</Text>
                <Text style={styles.counter}>{message.length}/{SUPPORT_MESSAGE_MAX_LENGTH.toLocaleString()}</Text>
              </View>
              <TextInput
                accessibilityLabel="Support request message"
                value={message}
                onChangeText={setMessage}
                editable={!busy}
                maxLength={SUPPORT_MESSAGE_MAX_LENGTH}
                multiline
                textAlignVertical="top"
                placeholder="Describe the issue and include any relevant settings or steps to reproduce it."
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, styles.message]}
              />
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Contact support"
              accessibilityState={{ disabled: !ready || busy }}
              disabled={!ready || busy}
              onPress={() => void submit()}
              style={({ pressed }) => [
                styles.submit,
                (!ready || busy) && styles.submitDisabled,
                pressed && styles.submitPressed,
              ]}
            ><Text style={styles.submitText}>{busy ? "Sending…" : "Contact support"}</Text></Pressable>
          </View>
        </FrostedSurface>
      </KeyboardAvoidingView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: "rgba(2,2,5,.7)" },
  overlayCompact: { justifyContent: "flex-end", padding: 0 },
  keyboardLayer: { width: "100%", alignItems: "center", justifyContent: "center" },
  modal: { width: "100%", overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,.1)", backgroundColor: "rgba(23,21,25,.97)" },
  modalDesktop: { maxWidth: 780, borderRadius: 28, shadowColor: "#000", shadowOpacity: .54, shadowRadius: 42, shadowOffset: { width: 0, height: 22 } },
  modalCompact: { maxWidth: 700, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderBottomWidth: 0 },
  header: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20 },
  headerButton: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.05)" },
  title: { flex: 1, color: colors.text, fontFamily: typography.display, fontSize: 24, fontWeight: "600", textAlign: "center" },
  scroll: { flexShrink: 1 },
  content: { gap: 16, paddingHorizontal: 24, paddingBottom: 18 },
  intro: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, textAlign: "center", paddingHorizontal: 10, marginBottom: 2 },
  fieldCard: { gap: 12, padding: 18, borderRadius: radius.lg, backgroundColor: "rgba(255,255,255,.045)", borderWidth: 1, borderColor: "rgba(255,255,255,.055)" },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  label: { color: colors.text, fontSize: 14, fontWeight: "900" },
  counter: { color: colors.textSecondary, fontSize: 12 },
  readOnlyInput: { minHeight: 54, justifyContent: "center", paddingHorizontal: 16, borderRadius: 15, backgroundColor: "rgba(255,255,255,.07)" },
  email: { color: colors.text, fontSize: 16, fontWeight: "700" },
  input: { minHeight: 54, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 15, color: colors.text, fontSize: 16, backgroundColor: "rgba(255,255,255,.07)", borderWidth: 1, borderColor: "transparent", outlineStyle: "none" } as never,
  message: { minHeight: 154, lineHeight: 22 },
  footer: { paddingHorizontal: 24, paddingTop: 2 },
  submit: { minHeight: 56, alignItems: "center", justifyContent: "center", borderRadius: 28, backgroundColor: "#F4F1F5" },
  submitDisabled: { opacity: .38 },
  submitPressed: { opacity: .84, transform: [{ scale: .995 }] },
  submitText: { color: "#151218", fontSize: 16, fontWeight: "900" },
  pressed: { opacity: .7, transform: [{ scale: .97 }] },
});
