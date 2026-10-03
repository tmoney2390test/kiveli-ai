import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Clock3, LockKeyhole, MapPin, X } from 'lucide-react-native';
import { worldPulseIsDiscoverable, type WorldPulseV2Event } from '@together/domain/src/world-pulse-v2';
import { FrostedBackdrop, FrostedSurface } from './FrostedGlass';
import { CharacterAvatar } from './ui';
import { useTogether } from '../store/useTogether';
import { useAuth } from '../hooks/useAuth';
import { loadWorldPulseEvent, openDirectWorldPulse, openGroupWorldPulse } from '../lib/api';
import { loadMessageDraft, clearMessageDraft } from '../lib/messageDrafts';
import { subscriptionHref } from '../lib/subscriptionPresentation';
import { colors } from '../theme';

async function suggestedDraft(userId: string, conversationId: string, kind: 'direct' | 'group', suggestion: string): Promise<string> {
  const stored = await loadMessageDraft(userId, conversationId, kind);
  if (!stored?.trim()) return suggestion;
  const replace = Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.confirm('You have an unsent draft. Replace it with the World Pulse suggestion?')
    : await new Promise<boolean>((resolve) => Alert.alert('Keep your draft?', 'You already have an unsent message in this chat.', [
      { text: 'Keep my draft', onPress: () => resolve(false), style: 'cancel' },
      { text: 'Use suggestion', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }));
  if (!replace) return '';
  await clearMessageDraft(userId, conversationId, kind);
  return suggestion;
}

export function WorldPulseEventModal({ eventId, previewEvent, onClose, onNavigate }: {
  eventId: string | null;
  previewEvent?: WorldPulseV2Event | null;
  onClose: () => void;
  onNavigate: (href: string) => void;
}) {
  const { width, height } = useWindowDimensions();
  const snapshot = useTogether((state) => state.snapshot);
  const { session } = useAuth();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const scope = session?.user.id && snapshot?.activeContinuity?.id ? `${session.user.id}:${snapshot.activeContinuity.id}` : null;
  const query = useQuery({
    queryKey: ['world-pulse-detail', scope, eventId],
    queryFn: async () => ({ ...await loadWorldPulseEvent(eventId!), receivedAtMonotonic: performance.now() }),
    enabled: Boolean(scope && eventId),
    retry: false,
    staleTime: 60_000,
  });
  useEffect(() => { setChooserOpen(false); setActionError(''); }, [eventId]);
  const cached = query.data;
  const cachedServerNow = cached ? new Date(Date.parse(cached.serverNow) + Math.max(0, performance.now() - cached.receivedAtMonotonic)).toISOString() : null;
  const event = cached && cachedServerNow && worldPulseIsDiscoverable(cached.event.occurredAt, cachedServerNow) ? cached.event : null;
  const expired = String((query.error as { code?: string } | null)?.code) === 'WORLD_PULSE_EXPIRED' || Boolean(cached && !event);
  const preview = previewEvent?.id === eventId ? previewEvent : null;
  const displayEvent = expired ? null : event ?? (query.isPending ? preview : null);
  const world = snapshot?.worlds.find((item) => item.id === displayEvent?.worldId);
  const count = event?.participants.length ?? 0;
  const displayCount = displayEvent?.participants.length ?? 0;
  const groupEntitled = event?.allowedActions.group === true;
  const groupAvailable = event?.participants.every((person) => person.available) ?? false;
  const cellWidth = displayCount ? Math.max(55, Math.min(130, (Math.min(width - 24, 660) - 40 - (displayCount - 1) * 6) / displayCount)) : 0;
  const close = () => chooserOpen ? setChooserOpen(false) : onClose();

  const direct = async (characterTemplateId: string) => {
    if (!event || !session?.user.id || !event.allowedActions.directCharacterTemplateIds.includes(characterTemplateId)) return;
    setBusy(true); setActionError('');
    try {
      const result = await openDirectWorldPulse({ occurrenceId: event.id, characterTemplateId, requestId: crypto.randomUUID() });
      const draft = await suggestedDraft(session.user.id, result.conversation.id, 'direct', result.draft);
      const route = Platform.OS === 'web' ? '/(tabs)/chat-tab' : '/chat';
      onNavigate(`${route}?character=${encodeURIComponent(result.characterHandle)}&conversationId=${encodeURIComponent(result.conversation.id)}${draft ? `&draft=${encodeURIComponent(draft)}` : ''}`);
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Chat could not be opened.'); }
    finally { setBusy(false); }
  };
  const group = async () => {
    if (!event || !session?.user.id || !groupAvailable) return;
    if (!groupEntitled) return onNavigate(subscriptionHref({ intent: 'group_chat', returnTo: `/world-pulse/${event.id}` }));
    setBusy(true); setActionError('');
    try {
      const result = await openGroupWorldPulse({ occurrenceId: event.id, requestId: crypto.randomUUID() });
      const draft = await suggestedDraft(session.user.id, result.conversation.id, 'group', result.draft);
      onNavigate(`/group-chat?id=${encodeURIComponent(result.conversation.id)}${draft ? `&draft=${encodeURIComponent(draft)}` : ''}`);
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Group chat could not be opened.'); }
    finally { setBusy(false); }
  };

  return <Modal visible={Boolean(eventId)} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
    <View style={[styles.root, width >= 720 ? styles.centered : styles.bottom]}>
      <FrostedBackdrop intensity={36} />
      <Pressable accessibilityLabel="Close World Pulse event" onPress={close} style={StyleSheet.absoluteFill} />
      <FrostedSurface intensity={88} style={[styles.card, { height: Math.min(620, height * .78) }, width >= 720 && styles.cardDesktop, displayEvent?.eventTier === 'major' && styles.majorCard]}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, displayEvent?.eventTier === 'major' && styles.majorEyebrow]}>{displayEvent?.eventTier === 'major' ? 'MAJOR WORLD EVENT' : 'WORLD PULSE'}{world ? ` · ${world.name}` : ''}</Text>
            {displayEvent ? <View style={styles.meta}><Clock3 size={13} color={colors.muted}/><Text style={styles.metaText}>{new Date(displayEvent.occurredAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</Text><MapPin size={13} color={colors.rose}/><Text numberOfLines={1} style={styles.metaPlace}>{displayEvent.location.name}</Text></View> : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close World Pulse event" onPress={onClose} hitSlop={8} style={styles.close}><X size={19} color={colors.text}/></Pressable>
        </View>
        {expired || (!event && (query.isError || !query.isPending)) ? <View style={styles.empty}><Text accessibilityRole="alert" style={styles.emptyTitle}>{expired ? 'This World Pulse has passed.' : 'This event could not be loaded.'}</Text><Text style={styles.emptyCopy}>{expired ? 'Fresh events appear in the last 24 hours feed.' : 'Check your connection and try again.'}</Text>{!expired ? <Pressable accessibilityRole="button" accessibilityLabel="Retry World Pulse event" onPress={() => void query.refetch()}><Text style={styles.retry}>Try again →</Text></Pressable> : null}</View>
          : <>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.content}>
              {displayEvent ? <Text accessibilityRole="header" style={styles.eventTitle}>{displayEvent.title}</Text> : null}
              {event ? <Text style={styles.body}>{event.detailBody}</Text> : preview ? <Text style={styles.body}>{preview.feedSummary}</Text> : <View style={styles.loading}><View style={styles.loadingLine}/><View style={[styles.loadingLine, { width: '84%' }]}/><View style={[styles.loadingLine, { width: '63%' }]}/></View>}
              {displayEvent ? <View style={styles.cast}>{displayEvent.participants.map((person) => <Pressable key={person.characterTemplateId} accessibilityRole="button" accessibilityLabel={`View ${person.name}'s profile`} onPress={() => onNavigate(`/character/${person.publicHandle ?? person.slug}`)} style={[styles.person, { width: cellWidth }]}>
                <CharacterAvatar slug={person.slug} name={person.name} size={Math.min(64, cellWidth - 8)}/>
                <Text numberOfLines={2} style={styles.personName}>{person.name}</Text>
                <Text numberOfLines={2} style={styles.role}>{person.roleLabel}</Text>
              </Pressable>)}</View> : null}
            </ScrollView>
            {event ? <View style={styles.footer}>
              <Pressable accessibilityRole="button" accessibilityLabel={count === 1 ? `Message ${event.participants[0]?.name}` : 'Message about this'} disabled={busy || (count === 1 && !event.participants[0]?.available)} onPress={() => count === 1 ? void direct(event.participants[0]!.characterTemplateId) : setChooserOpen(true)} style={({ pressed }) => [styles.mainAction, pressed && styles.pressed]}><Text style={styles.mainText}>{busy ? 'Opening chat…' : count === 1 && !event.participants[0]?.available ? 'Unavailable in this Life' : count === 1 ? `Message ${event.participants[0]?.name}` : 'Message about this'}</Text></Pressable>
              {actionError ? <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text> : null}
            </View> : <View accessibilityRole="progressbar" accessibilityLabel="Loading full World Pulse story" style={[styles.footer, styles.loadingFooter]}><ActivityIndicator size="small" color={colors.rose}/><Text style={styles.loadingStatusText}>Getting the full story…</Text></View>}
          </>}
      </FrostedSurface>
      {chooserOpen && event ? <View style={styles.chooserLayer}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close participant chooser" onPress={() => setChooserOpen(false)}/>
        <FrostedSurface intensity={94} style={[styles.chooser, width >= 720 && styles.chooserDesktop]}>
          <View style={styles.chooserHeading}><Text style={styles.chooserTitle}>Who do you want to ask?</Text><Pressable accessibilityRole="button" accessibilityLabel="Close chooser" onPress={() => setChooserOpen(false)}><X size={20} color={colors.text}/></Pressable></View>
          {event.participants.map((person) => <Pressable key={person.characterTemplateId} accessibilityRole="button" disabled={busy || !person.available} accessibilityState={{ disabled: busy || !person.available }} onPress={() => void direct(person.characterTemplateId)} style={[styles.choice, !person.available && styles.disabled]}><CharacterAvatar slug={person.slug} name={person.name} size={36}/><Text style={styles.choiceText}>{person.available ? `Ask ${person.name}` : `${person.name} · unavailable in this Life`}</Text></Pressable>)}
          <Pressable accessibilityRole="button" disabled={busy || !groupAvailable} accessibilityState={{ disabled: busy || !groupAvailable }} onPress={() => void group()} style={[styles.choice, !groupAvailable && styles.disabled]}><Text style={styles.choiceText}>{groupAvailable ? `Start group chat with all ${count}` : 'Group unavailable in this Life'}</Text>{!groupEntitled && groupAvailable ? <LockKeyhole size={18} color={colors.rose}/> : null}</Pressable>
          {actionError ? <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text> : null}
        </FrostedSurface>
      </View> : null}
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 12 }, centered: { alignItems: 'center', justifyContent: 'center' }, bottom: { justifyContent: 'flex-end' },
  card: { width: '100%', maxHeight: '89%', borderRadius: 27, borderColor: 'rgba(255,221,241,.27)', shadowColor: '#000', shadowOpacity: .55, shadowRadius: 32, shadowOffset: { width: 0, height: 16 }, elevation: 25 },
  cardDesktop: { maxWidth: 660 }, majorCard: { borderColor: 'rgba(240,100,116,.82)', borderWidth: 2 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 19, paddingBottom: 15, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,.16)' },
  headerCopy: { flex: 1, gap: 9 }, eyebrow: { color: '#E8A4D1', fontSize: 10, fontWeight: '900', letterSpacing: 1.3 }, majorEyebrow: { color: '#FFA8B0' },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 }, metaText: { color: colors.muted, fontSize: 11, marginRight: 7 }, metaPlace: { color: '#E5C9D9', fontSize: 11, fontWeight: '700', flexShrink: 1 },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.08)' },
  scroll: { flex: 1 }, content: { paddingHorizontal: 20, paddingVertical: 22, gap: 23 },
  eventTitle: { color: colors.text, fontSize: 22, fontWeight: '800', lineHeight: 28 },
  body: { color: '#F0E8EE', fontSize: 15, lineHeight: 23 },
  cast: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  person: { minHeight: 117, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 2, borderWidth: 1, borderColor: 'rgba(246,200,232,.16)', backgroundColor: 'rgba(255,255,255,.055)', borderRadius: 17, gap: 4 },
  personName: { color: colors.text, fontSize: 11, fontWeight: '800', textAlign: 'center' }, role: { color: '#CBB7C5', fontSize: 10, textAlign: 'center' },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,.15)', gap: 8 },
  mainAction: { minHeight: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#A867CC' }, mainText: { color: '#fff', fontSize: 14, fontWeight: '900' }, pressed: { opacity: .82 }, error: { color: '#FF9FA9', fontSize: 12 },
  loading: { gap: 13, minHeight: 95 }, loadingLine: { width: '100%', height: 12, borderRadius: 8, backgroundColor: 'rgba(255,255,255,.11)' },
  loadingFooter: { minHeight: 78, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, loadingStatusText: { color: colors.muted, fontSize: 12 },
  empty: { padding: 24, gap: 8 }, emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '800' }, emptyCopy: { color: colors.muted, fontSize: 13 }, retry: { color: colors.rose, fontSize: 13, fontWeight: '800', marginTop: 7 },
  chooserLayer: { ...StyleSheet.absoluteFill, zIndex: 20, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: 'rgba(7,4,11,.67)' },
  chooser: { width: '100%', maxHeight: '80%', borderRadius: 25, padding: 19, gap: 9 }, chooserDesktop: { maxWidth: 520, marginBottom: 24 },
  chooserHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }, chooserTitle: { color: colors.text, fontSize: 21, fontWeight: '800' },
  choice: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,.15)', backgroundColor: 'rgba(255,255,255,.05)', borderRadius: 15, paddingHorizontal: 11 }, choiceText: { color: colors.text, fontSize: 13, fontWeight: '700', flex: 1 }, disabled: { opacity: .5 },
});
