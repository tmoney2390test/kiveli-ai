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
import { ArrowLeft, RefreshCw } from "lucide-react-native";
import { GradientButton, PageTitle, Screen } from "../src/components";
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
  formatSupportTicketReference,
} from "../src/lib/supportTicket";
import { useSupportRequest } from "../src/lib/useSupportRequest";
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useSupportDraft } from '../src/lib/supportDraft';
import { SupportRecoveryLinks } from '../src/components/SupportRecoveryLinks';
import { recoveryTopics, supportStatusLabel } from '../src/lib/supportRecovery';
const categories: SupportCategory[] = [
  "bug",
  "billing",
  "safety",
  "account",
  "feedback",
  "other",
];
type Ticket = Awaited<
  ReturnType<typeof loadMySupportTickets>
>["tickets"][number];
export default function Support() {
  const params = useLocalSearchParams<{ ticket?: string; topic?: string }>();
  const saved = useSupportDraft('new', { category: 'bug' as SupportCategory, subject: '', message: '', topic: '', mediaId: '', conversationId: '', purchaseReference: '', includeDiagnostics: true });
  const { category, subject, message } = saved.draft;
  const setCategory = (category: SupportCategory) => saved.update({category});
  const setSubject = (subject: string) => saved.update({subject});
  const setMessage = (message: string) => saved.update({message});

  const [diagnostics] = useState(() => ({platform:Platform.OS,appVersion:Constants.expoConfig?.version ?? 'unknown',buildId:Platform.OS === 'ios' ? Constants.expoConfig?.ios?.buildNumber : Platform.OS === 'android' ? String(Constants.expoConfig?.android?.versionCode ?? 'unknown') : typeof document !== 'undefined' ? Array.from(document.scripts).map(script=>script.src.split('/').pop()).find(name=>name?.startsWith('__common-')) ?? 'web' : 'web'}));
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
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const replyDraft = useSupportDraft('reply:'+(selected??'none'), {message:''});
  const reply = replyDraft.draft.message;
  const setReply = (message:string) => replyDraft.update({message});
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
      setError("");
    } catch (caught) {
      if (version === sequence.current) {
        setError(
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
    setError("");
    void load();
    const interval = setInterval(() => {
      if (AppState.currentState === "active") void load(true);
    }, 30000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void load(true);
    });
    return () => {
      sequence.current++;
      clearInterval(interval);
      listener.remove();
    };
  }, [load]);
  useEffect(() => {
    if (params.ticket) setSelected(params.ticket);
  }, [params.ticket]);
  const submit = async () => {
    if (busy || !saved.ready || !canSubmitSupportRequest(subject, message)) return;
    if (saved.draft.mediaId.trim() && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(saved.draft.mediaId.trim())) { setError('Use the Kivelli media request ID shown in the app, not a provider URL.'); return; }
    if (saved.draft.conversationId.trim() && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(saved.draft.conversationId.trim())) { setError('Use the conversation ID, or leave it blank if you do not have it.'); return; }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await sendRequest({
        category,
        subject: subject.trim(),
        message: message.trim(),
        mediaId: saved.draft.mediaId.trim() || undefined,
        conversationId: saved.draft.conversationId.trim() || undefined,
        purchaseReference: saved.draft.purchaseReference.trim() || undefined,
        diagnostics: saved.draft.includeDiagnostics ? {...diagnostics,topic:saved.draft.topic || undefined} : undefined,
      }, createSupportTicket);
      saved.clear();
      setSelected(result.ticket.id);
      setNotice(
        `${
          formatSupportTicketReference(result.ticket.ticket_number)
        } received. You can read replies here.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Your request could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  };
  const sendReply = async () => {
    if (!selected || busy || !replyDraft.ready || reply.trim().length < 2) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await sendRequest(
        { ticketId: selected, message: reply.trim() },
        replyToSupportTicket,
      );
      setReply("");
      setNotice("Reply saved. Your request is open with support.");
      await load(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Your reply could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => {
            if (selected) {
              setSelected(null);
              router.setParams({ ticket: undefined });
            } else if (router.canGoBack()) router.back();
            else router.replace("/profile");
          }}
        >
          <ArrowLeft color={colors.text} />
        </Pressable>
        <PageTitle>Support</PageTitle>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh support requests"
          disabled={busy}
          onPress={() => void load()}
        >
          <RefreshCw color={colors.text} size={20} />
        </Pressable>
      </View>
      {error
        ? (
          <View style={styles.card}>
            <Text accessibilityRole="alert" style={styles.text}>{error}</Text>
            <Pressable onPress={() => void load()}>
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
                maxLength={5000}
                multiline
                textAlignVertical="top"
                placeholder="Add details or ask a follow-up question"
                placeholderTextColor={colors.dimmed}
                style={[styles.input, styles.message]}
              />
              <GradientButton
                label={busy ? "Sending…" : "Send reply"}
                disabled={busy || !replyDraft.ready || reply.trim().length < 2}
                onPress={() => void sendReply()}
              />
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
            <SupportRecoveryLinks onTopic={topic => saved.update({topic:topic.id,category:topic.category,subject:subject || topic.title})}/>
            <Text style={styles.sectionTitle}>Send a support request</Text>
            <Text style={styles.text}>
              Send a private request and follow replies here. We never attach
              your chat history.
            </Text>
            <Text style={styles.label}>What is this about?</Text>
            <View style={styles.categories}>
              {categories.map((item) => (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityState={{ selected: category === item }}
                  disabled={busy}
                  onPress={() => setCategory(item)}
                  style={[
                    styles.category,
                    category === item && styles.staffCard,
                  ]}
                >
                  <Text style={styles.categoryText}>{item}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>Subject</Text>
            <TextInput
              accessibilityLabel="Support request subject"
              value={subject}
              onChangeText={setSubject}
              editable={!busy && saved.ready}
              maxLength={160}
              placeholder="Short summary"
              placeholderTextColor={colors.dimmed}
              style={styles.input}
            />
            <Text style={styles.label}>What happened?</Text>
            <TextInput
              accessibilityLabel="Support request message"
              value={message}
              onChangeText={setMessage}
              editable={!busy && saved.ready}
              maxLength={5000}
              multiline
              textAlignVertical="top"
              placeholder="Describe the issue. Do not include passwords or payment card numbers."
              placeholderTextColor={colors.dimmed}
              style={[styles.input, styles.message]}
            />
            <Text style={styles.label}>Media request ID (optional)</Text>
            <TextInput accessibilityLabel="Media request ID" value={saved.draft.mediaId} onChangeText={mediaId=>saved.update({mediaId})} editable={!busy && saved.ready} autoCapitalize="none" maxLength={36} placeholder="Kivelli request ID" placeholderTextColor={colors.dimmed} style={styles.input}/>
            <Text style={styles.label}>Purchase reference (optional)</Text>
            <TextInput accessibilityLabel="Purchase reference" value={saved.draft.purchaseReference} onChangeText={purchaseReference=>saved.update({purchaseReference})} editable={!busy && saved.ready} autoCapitalize="none" maxLength={120} placeholder="Store transaction reference — no payment details" placeholderTextColor={colors.dimmed} style={styles.input}/>
            <Pressable accessibilityRole="checkbox" accessibilityState={{checked:saved.draft.includeDiagnostics}} onPress={()=>saved.update({includeDiagnostics:!saved.draft.includeDiagnostics})} style={styles.card}><Text style={styles.label}>{saved.draft.includeDiagnostics?'✓ ':''}Include app diagnostics</Text><Text style={styles.meta}>{diagnostics.platform} · App {diagnostics.appVersion} · Build {diagnostics.buildId}</Text><Text style={styles.meta}>Only these technical details and your selected issue type are attached. Your messages and memories are not included.</Text></Pressable>
            <Text style={styles.label}>Conversation ID (optional)</Text>
            <TextInput accessibilityLabel="Conversation ID" value={saved.draft.conversationId} onChangeText={conversationId=>saved.update({conversationId})} editable={!busy && saved.ready} autoCapitalize="none" maxLength={36} placeholder="Leave blank if unavailable" placeholderTextColor={colors.dimmed} style={styles.input}/>
            <Text style={styles.meta}>{saved.persistenceError ? 'Device storage is unavailable. Keep this page open until you send your request.' : saved.ready ? 'Your draft is kept on this device for this account.' : 'Loading your draft…'}</Text>
            <GradientButton
              label={busy ? "Sending…" : "Send to support"}
              disabled={busy || !saved.ready || !canSubmitSupportRequest(subject, message)}
              onPress={() => void submit()}
            />
            <Text style={styles.sectionTitle}>Your recent requests</Text>
            {!loading && !tickets.length && !error
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
        onPress={() =>
          void Linking.openURL("mailto:support@kivelli.app").catch(() =>
            setError("Email support@kivelli.app from your email app.")
          )}
      >
        <Text style={styles.link}>Prefer email? support@kivelli.app</Text>
      </Pressable>
    </Screen>
  );
}
const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  text: { color: colors.text, lineHeight: 23 },
  label: { color: colors.text, fontWeight: "800", fontSize: 14 },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  categories: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  category: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryText: { color: colors.text, textTransform: "capitalize" },
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
