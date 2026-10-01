import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ChevronRight, RefreshCw } from 'lucide-react-native';
import { GradientButton, PageTitle, Screen } from '../src/components';
import { colors, radius } from '../src/theme';
import { settingsMaterial as glass } from '../src/styles/settingsMaterial';
import { type CustomerSupportDetail, loadMySupportTicket, loadMySupportTickets, replyToSupportTicket } from '../src/lib/operations';
import { formatSupportTicketReference } from '../src/lib/supportTicket';
import { useSupportRequest } from '../src/lib/useSupportRequest';
import { useSupportDraft } from '../src/lib/supportDraft';
import { supportStatusLabel } from '../src/lib/supportRecovery';

type Ticket = Awaited<ReturnType<typeof loadMySupportTickets>>['tickets'][number];

export default function Support() {
  const params = useLocalSearchParams<{ ticket?: string }>();
  const [selected, setSelected] = useState<string | null>(params.ticket ?? null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [detail, setDetail] = useState<CustomerSupportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const replyDraft = useSupportDraft(`reply:${selected ?? 'none'}`, { message: '' });
  const sequence = useRef(0);
  const sendRequest = useSupportRequest();

  const load = useCallback(async (quiet = false) => {
    const version = ++sequence.current;
    if (!quiet) setLoading(true);
    try {
      const [list, next] = await Promise.all([loadMySupportTickets(), selected ? loadMySupportTicket(selected) : Promise.resolve(null)]);
      if (version !== sequence.current) return;
      setTickets(list.tickets);
      setDetail(next);
      setError('');
    } catch (caught) {
      if (version === sequence.current) setError(caught instanceof Error ? caught.message : 'Support requests could not be loaded.');
    } finally {
      if (version === sequence.current) setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    setDetail(null);
    setError('');
    void load();
    const interval = setInterval(() => { if (AppState.currentState === 'active') void load(true); }, 30000);
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') void load(true); });
    return () => { sequence.current++; clearInterval(interval); listener.remove(); };
  }, [load]);
  useEffect(() => { if (params.ticket) setSelected(params.ticket); }, [params.ticket]);

  const sendReply = async () => {
    const reply = replyDraft.draft.message.trim();
    if (!selected || busy || !replyDraft.ready || reply.length < 2) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await sendRequest({ ticketId: selected, message: reply }, replyToSupportTicket);
      replyDraft.clear();
      setNotice('Reply saved. Your request is open with support.');
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your reply could not be sent.');
    } finally { setBusy(false); }
  };

  const goBack = () => {
    if (selected) { setSelected(null); router.setParams({ ticket: undefined }); }
    else if (router.canGoBack()) router.back();
    else router.replace('/profile');
  };

  return <Screen contentStyle={styles.page}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={goBack} style={styles.iconButton}><ArrowLeft color={colors.text} /></Pressable>
      <PageTitle>Support</PageTitle>
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh support requests" disabled={busy} onPress={() => void load()} style={styles.iconButton}><RefreshCw color={colors.text} size={20} /></Pressable>
    </View>
    {error ? <View style={styles.card}><Text accessibilityRole="alert" style={styles.text}>{error}</Text><Pressable onPress={() => void load()}><Text style={styles.link}>Try loading again</Text></Pressable></View> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.text}>{notice}</Text> : null}
    {loading ? <ActivityIndicator accessibilityLabel="Loading support requests" color={colors.violet} /> : null}
    {selected ? detail ? <>
      <Text style={styles.sectionTitle}>{detail.ticket.subject}</Text>
      <Text style={styles.meta}>{formatSupportTicketReference(detail.ticket.ticket_number)} · {supportStatusLabel(detail.ticket.status)}</Text>
      <View style={styles.card}><Text style={styles.label}>Your request</Text><Text style={styles.text}>{detail.ticket.message}</Text><Text style={styles.meta}>{new Date(detail.ticket.created_at).toLocaleString()}</Text></View>
      {detail.replies.map((item) => <View key={item.id} style={[styles.card, item.sender === 'support' && styles.staffCard]}><Text style={styles.label}>{item.sender === 'support' ? 'Kivelli Support' : 'You'}</Text><Text style={styles.text}>{item.message}</Text><Text style={styles.meta}>{new Date(item.created_at).toLocaleString()}</Text></View>)}
      {!detail.replies.length ? <Text style={styles.meta}>Support replies will appear here. This page refreshes automatically.</Text> : null}
      <Text style={styles.label}>Add a reply</Text>
      <TextInput accessibilityLabel="Support reply" value={replyDraft.draft.message} onChangeText={(message) => replyDraft.update({ message })} editable={!busy && replyDraft.ready} maxLength={5000} multiline textAlignVertical="top" placeholder="Add details or ask a follow-up question" placeholderTextColor={colors.dimmed} style={[styles.input, styles.message]} />
      <GradientButton label={busy ? 'Sending…' : 'Send reply'} disabled={busy || !replyDraft.ready || replyDraft.draft.message.trim().length < 2} onPress={() => void sendReply()} />
      {['closed', 'resolved'].includes(detail.ticket.status) ? <Text style={styles.meta}>Sending a reply reopens this request.</Text> : null}
    </> : !loading && !error ? <Text style={styles.meta}>This request could not be found.</Text> : null : <>
      <Pressable accessibilityRole="button" accessibilityLabel="New support request" onPress={() => router.push('/support/new' as never)} style={({ pressed }) => [styles.newRequest, pressed && styles.pressed]}><Text style={styles.newRequestText}>New support request</Text><ChevronRight size={18} color={colors.text} /></Pressable>
      <Text style={styles.sectionTitle}>Your requests</Text>
      {!loading && !tickets.length && !error ? <Text style={styles.meta}>No requests yet.</Text> : null}
      {tickets.map((ticket) => <Pressable key={ticket.id} accessibilityRole="button" accessibilityLabel={`Open ${formatSupportTicketReference(ticket.ticket_number)}: ${ticket.subject}`} style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={() => { setSelected(ticket.id); setNotice(''); }}><Text style={styles.label}>{ticket.subject}</Text><Text style={styles.meta}>{formatSupportTicketReference(ticket.ticket_number)} · {supportStatusLabel(ticket.status)} · {new Date(ticket.updated_at).toLocaleDateString()}</Text></Pressable>)}
    </>}
    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('mailto:support@kivelli.app').catch(() => setError('Email support@kivelli.app from your email app.'))}><Text style={styles.link}>Prefer email? support@kivelli.app</Text></Pressable>
  </Screen>;
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 15, paddingTop: 12, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  iconButton: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  text: { color: colors.text, lineHeight: 23 },
  label: { color: colors.text, fontWeight: '800', fontSize: 14 },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  newRequest: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17, borderRadius: radius.md, borderWidth: 1, borderColor: glass.selectedBorder, backgroundColor: glass.selected },
  newRequestText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  card: { gap: 9, padding: 16, borderRadius: radius.md, borderWidth: 1, borderColor: glass.border, backgroundColor: glass.glass },
  staffCard: { borderColor: glass.selectedBorder, backgroundColor: glass.selected },
  input: { color: colors.text, borderWidth: 1, borderColor: glass.border, borderRadius: radius.md, backgroundColor: glass.inset, padding: 13 },
  message: { minHeight: 130 },
  link: { color: colors.violet, fontWeight: '700', paddingVertical: 8 },
  pressed: { opacity: .75 },
});
