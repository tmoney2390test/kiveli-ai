import { supportRequestReferences } from '../src/lib/mediaSupportReference';
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, ChevronDown, RefreshCw } from "lucide-react-native";
import { GradientButton, PageTitle, Screen } from '../src/components/ui';
import { ThemedSettingPicker } from "../src/components/settings/ThemedSettingPicker";
import { colors, radius } from "../src/theme";
import {
  createSupportTicket,
  type CustomerSupportDetail,
  loadMySupportTicket,
  loadMySupportTickets,
  replyToSupportTicket,
  type SupportCategory,
} from "../src/lib/operations";
import {
  canSubmitSupportRequest,
  canSubmitSupportReply,
  formatSupportTicketReference,
  SUPPORT_MESSAGE_MAX_LENGTH,
  SUPPORT_SUBJECT_MAX_LENGTH,
} from "../src/lib/supportTicket";
import { useSupportRequest } from "../src/lib/useSupportRequest";
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useSupportDraft } from '../src/lib/supportDraft';
import { recoveryTopics, supportStatusLabel } from '../src/lib/supportRecovery';
const categories: Array<{value:SupportCategory;label:string;description:string}> = [
  {value:"bug",label:"Something isn't working",description:"Report a broken feature or unexpected error."},
  {value:"billing",label:"Billing or credits",description:"Purchases, subscriptions, or credit balances."},
  {value:"safety",label:"Safety concern",description:"Report a safety or content concern."},
  {value:"account",label:"Account access",description:"Sign-in, profile, or account recovery."},
  {value:"feedback",label:"Feedback or idea",description:"Share a suggestion about Kivelli."},
  {value:"other",label:"Something else",description:"Anything that does not fit above."},
];
type Ticket = Awaited<
  ReturnType<typeof loadMySupportTickets>
>["tickets"][number];
export default function Support() {
  const params = useLocalSearchParams<{ ticket?: string; topic?: string; mediaId?: string; conversationId?: string }>();
  const saved = useSupportDraft('new', { category: 'bug' as SupportCategory, subject: '', message: '', topic: '' });
  const { subject, message } = saved.draft;
  const category = categories.find(item=>item.value===saved.draft.category)?.value ?? 'other';
  const setCategory = (category: SupportCategory) => { saved.update({category}); setActionError(""); };
  const setSubject = (subject: string) => { saved.update({subject}); setActionError(""); };
  const setMessage = (message: string) => { saved.update({message}); setActionError(""); };

  const [diagnostics] = useState(() => ({platform:Platform.OS,appVersion:Constants.expoConfig?.version ?? 'unknown',buildId:Platform.OS === 'ios' ? Constants.expoConfig?.ios?.buildNumber : Platform.OS === 'android' ? String(Constants.expoConfig?.android?.versionCode ?? 'unknown') : typeof document !== 'undefined' ? Array.from(document.scripts).map(script=>script.src.split('/').pop()).find(name=>name?.startsWith('__common-')) ?? 'web' : 'web'}));
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [linkedReferences, setLinkedReferences] = useState(() => supportRequestReferences(params));
  useEffect(() => { setLinkedReferences(supportRequestReferences(params)); }, [params.mediaId, params.conversationId]);
  const topicApplied = useRef(false);
  useEffect(() => {
    if (!saved.ready || topicApplied.current) return;
    topicApplied.current = true;
    const topic = recoveryTopics.find(topic => topic.id === params.topic);
    if (topic && !saved.draft.subject && !saved.draft.message) saved.update({topic:topic.id,category:topic.category,subject:topic.title});
  }, [saved.ready, params.topic]);
  const [tickets, setTickets] = useState<Ticket[]>([]),
    [detail, setDetail] = useState<CustomerSupportDetail | null>(null);
  const [selected, setSelected] = useState<string | null>(
      params.ticket ?? null,
    ),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [loadError, setLoadError] = useState(""),
    [actionError, setActionError] = useState(""),
    [emailError, setEmailError] = useState(""),
    [notice, setNotice] = useState("");
  const replyDraft = useSupportDraft('reply:'+(selected??'none'), {message:''});
  const reply = replyDraft.draft.message;
  const setReply = (message:string) => { replyDraft.update({message}); setActionError(""); };
  const sequence = useRef(0), sendRequest = useSupportRequest();
  const load = useCallback(async (quiet = false) => {
    const version = ++sequence.current;
    if (!quiet) setLoading(true);
    try {
      const [list, next] = await Promise.all([
        loadMySupportTickets(),
        selected ? loadMySupportTicket(selected) : Promise.resolve(null),
      ]);
      if (version !== sequence.current) return;
      setTickets(list.tickets);
      setDetail(next);
      setLoadError("");
    } catch (caught) {
      if (version === sequence.current) {
        setLoadError(
          caught instanceof Error
            ? caught.message
            : "Support requests could not be loaded.",
        );
      }
    } finally {
      if (version === sequence.current) setLoading(false);
    }
  }, [selected]);
  useEffect(() => {
    setDetail(null);
    setLoadError("");
    void load();
    const interval = selected ? setInterval(() => {
      if (AppState.currentState === "active") void load(true);
    }, 30000) : null;
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void load(true);
    });
    return () => {
      sequence.current++;
      if (interval) clearInterval(interval);
      listener.remove();
    };
  }, [load]);
  useEffect(() => {
    if (params.ticket) setSelected(params.ticket);
  }, [params.ticket]);
  const submit = async () => {
    if (busy || !saved.ready || !canSubmitSupportRequest(subject, message)) return;
    const topic = recoveryTopics.find(item=>item.id===saved.draft.topic)?.id;
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      const result = await sendRequest({
        category,
        subject: subject.trim(),
        message: message.trim(),
        ...linkedReferences,
        diagnostics: {...diagnostics,topic},
      }, createSupportTicket);
      await saved.clear();
      setLinkedReferences({});
      router.setParams({mediaId:undefined,conversationId:undefined});
      setSelected(result.ticket.id);
      setNotice(
        `${
          formatSupportTicketReference(result.ticket.ticket_number)
        } received. You can read replies here.`,
      );
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? caught.message
          : "Your request could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  };
  const sendReply = async () => {
    if (!selected || busy || !replyDraft.ready || !canSubmitSupportReply(reply)) return;
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      await sendRequest(
        { ticketId: selected, message: reply.trim() },
        replyToSupportTicket,
      );
      await replyDraft.clear();
      setNotice("Reply saved. Your request is open with support.");
      await load(true);
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? caught.message
          : "Your reply could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.headerAction}
          onPress={() => {
            if (selected) {
              setSelected(null);
              setActionError("");
              router.setParams({ ticket: undefined });
            } else if (router.canGoBack()) router.back();
            else router.replace("/profile");
          }}
        >
          <ArrowLeft color={colors.text} />
        </Pressable>
        <View style={{flex:1}}><PageTitle>{selected ? 'Support request' : 'Contact support'}</PageTitle></View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh support requests"
          disabled={busy}
          style={styles.headerAction}
          onPress={() => void load()}
        >
          <RefreshCw color={colors.text} size={20} />
        </Pressable>
      </View>
      {loadError
        ? (
          <View style={styles.card}>
            <Text accessibilityRole="alert" style={styles.text}>{loadError}</Text>
            <Pressable accessibilityRole="button" onPress={() => void load()}>
              <Text style={styles.link}>Try loading again</Text>
            </Pressable>
          </View>
        )
        : null}
      {notice
        ? (
          <Text accessibilityLiveRegion="polite" style={styles.text}>
            {notice}
          </Text>
        )
        : null}
      {loading
        ? (
          <ActivityIndicator
            accessibilityLabel="Loading support requests"
            color={colors.violet}
          />
        )
        : null}
      {selected
        ? detail
          ? (
            <>
              <Text style={styles.sectionTitle}>{detail.ticket.subject}</Text>
              <Text style={styles.meta}>
                {formatSupportTicketReference(detail.ticket.ticket_number)} ·
                {" "}
                {supportStatusLabel(detail.ticket.status)}
              </Text>
              <View style={styles.card}>
                <Text style={styles.label}>Your request</Text>
                <Text style={styles.text}>{detail.ticket.message}</Text>
                <Text style={styles.meta}>
                  {new Date(detail.ticket.created_at).toLocaleString()}
                </Text>
              </View>
              {detail.replies.map((item) => (
                <View
                  key={item.id}
                  style={[
                    styles.card,
                    item.sender === "support" && styles.staffCard,
                  ]}
                >
                  <Text style={styles.label}>
                    {item.sender === "support" ? "Kivelli Support" : "You"}
                  </Text>
                  <Text style={styles.text}>{item.message}</Text>
                  <Text style={styles.meta}>
                    {new Date(item.created_at).toLocaleString()}
                  </Text>
                </View>
              ))}
              {!detail.replies.length
                ? (
                  <Text style={styles.meta}>
                    Support replies will appear here. This page refreshes
                    automatically.
                  </Text>
                )
                : null}
              <Text style={styles.label}>Add a reply</Text>
              <TextInput
                accessibilityLabel="Support reply"
                value={reply}
                onChangeText={setReply}
                editable={!busy && replyDraft.ready}
                maxLength={SUPPORT_MESSAGE_MAX_LENGTH}
                multiline
                textAlignVertical="top"
                placeholder="Add details or ask a follow-up question"
                placeholderTextColor={colors.dimmed}
                style={[styles.input, styles.message]}
              />
              <GradientButton
                label={busy ? "Sending…" : "Send reply"}
                disabled={busy || !replyDraft.ready || !canSubmitSupportReply(reply)}
                onPress={() => void sendReply()}
              />
              {actionError ? <Text accessibilityRole="alert" style={[styles.text, styles.error]}>{actionError}</Text> : null}
              {["closed", "resolved"].includes(detail.ticket.status)
                ? (
                  <Text style={styles.meta}>
                    Sending a reply reopens this request.
                  </Text>
                )
                : null}
            </>
          )
          : null
        : (
          <>
            <Text style={styles.text}>Tell us what happened. You can follow replies here after sending.</Text>
            <View style={styles.formCard}>
              <Text style={styles.label}>What is this about?</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Issue type: ${categories.find(item=>item.value===category)?.label ?? 'Choose'}`} accessibilityState={{expanded:categoryPickerOpen,disabled:busy || !saved.ready}} disabled={busy || !saved.ready} onPress={()=>setCategoryPickerOpen(true)} style={styles.picker}>
                <Text style={styles.pickerText}>{categories.find(item=>item.value===category)?.label ?? 'Choose an issue'}</Text><ChevronDown size={18} color={colors.muted}/>
              </Pressable>
              <ThemedSettingPicker visible={categoryPickerOpen} title="What is this about?" choices={categories} selected={category} disabled={busy || !saved.ready} onSelect={setCategory} onClose={()=>setCategoryPickerOpen(false)} testIDPrefix="support-category"/>
              <View style={styles.fieldHeading}><Text style={styles.label}>Subject</Text><Text style={styles.meta}>{subject.length}/{SUPPORT_SUBJECT_MAX_LENGTH}</Text></View>
              <TextInput accessibilityLabel="Support request subject" value={subject} onChangeText={setSubject} editable={!busy && saved.ready} maxLength={SUPPORT_SUBJECT_MAX_LENGTH} placeholder="A short summary" placeholderTextColor={colors.dimmed} style={styles.input}/>
              <View style={styles.fieldHeading}><Text style={styles.label}>What happened?</Text><Text style={styles.meta}>{message.length}/{SUPPORT_MESSAGE_MAX_LENGTH}</Text></View>
              <TextInput accessibilityLabel="Support request message" value={message} onChangeText={setMessage} editable={!busy && saved.ready} maxLength={SUPPORT_MESSAGE_MAX_LENGTH} multiline textAlignVertical="top" placeholder="Describe what you expected, what happened, and how to reproduce it. Don't include passwords or card numbers." placeholderTextColor={colors.dimmed} style={[styles.input, styles.message]}/>
              {linkedReferences.mediaId || linkedReferences.conversationId ? <View style={styles.linkedRow}><Text style={styles.meta}>Linked to {linkedReferences.mediaId && linkedReferences.conversationId ? 'the original media request and conversation' : linkedReferences.mediaId ? 'the original media request' : 'this conversation'}.</Text><Pressable accessibilityRole="button" accessibilityLabel="Remove support request link" disabled={busy} style={styles.removeLink} onPress={()=>{setLinkedReferences({});setActionError('');router.setParams({mediaId:undefined,conversationId:undefined});}}><Text style={styles.link}>Remove link</Text></Pressable></View> : null}
              <Text style={styles.meta}>Use at least 3 characters for the subject and 10 for the description.</Text>
              <Text style={styles.meta}>We include your app platform and version to help troubleshoot. Chat history is not attached.</Text>
              <Text style={styles.meta}>{saved.persistenceError ? 'Device storage is unavailable. Keep this page open until you send your request.' : saved.ready ? 'Your draft is saved on this device.' : 'Loading your draft…'}</Text>
              <GradientButton label={busy ? "Sending…" : "Send to support"} disabled={busy || !saved.ready || !canSubmitSupportRequest(subject, message)} onPress={() => void submit()}/>
              {actionError ? <Text accessibilityRole="alert" style={[styles.text, styles.error]}>{actionError}</Text> : null}
            </View>
            <Text style={styles.sectionTitle}>Your recent requests</Text>
            {!loading && !tickets.length && !loadError
              ? <Text style={styles.meta}>No requests yet.</Text>
              : null}
            {tickets.map((ticket) => (
              <Pressable
                key={ticket.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${
                  formatSupportTicketReference(ticket.ticket_number)
                }: ${ticket.subject}`}
                style={styles.card}
                onPress={() => {
                  setSelected(ticket.id);
                  setActionError("");
                  setNotice("");
                }}
              >
                <Text style={styles.label}>{ticket.subject}</Text>
                <Text style={styles.meta}>
                  {formatSupportTicketReference(ticket.ticket_number)} ·{" "}
                  {supportStatusLabel(ticket.status)} ·{" "}
                  {new Date(ticket.updated_at).toLocaleDateString()}
                </Text>
              </Pressable>
            ))}
          </>
        )}
      <Pressable
        accessibilityRole="link"
        onPress={() => {
          setEmailError("");
          void Linking.openURL("mailto:support@kivelli.app").catch(() =>
            setEmailError("Email support@kivelli.app from your email app.")
          );
        }}
      >
        <Text style={styles.link}>Prefer email? support@kivelli.app</Text>
      </Pressable>
      {emailError ? <Text accessibilityRole="alert" style={[styles.text, styles.error]}>{emailError}</Text> : null}
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: 16, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 80 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 8,
  },
  headerAction: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  text: { color: colors.text, lineHeight: 23 },
  error: { color: colors.danger },
  label: { color: colors.text, fontWeight: "800", fontSize: 14 },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  formCard: { gap: 14, padding: 20, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  fieldHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  linkedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  removeLink: { minHeight: 44, justifyContent: 'center' },
  picker: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  pickerText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' },
  staffCard: {
    borderColor: colors.violet,
    backgroundColor: "rgba(154,104,255,.1)",
  },
  input: {
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: 13,
  },
  message: { minHeight: 130 },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  card: {
    gap: 9,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  link: { color: colors.violet, fontWeight: "700", paddingVertical: 8 },
});
