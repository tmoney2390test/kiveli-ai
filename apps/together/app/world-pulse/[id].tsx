import { useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, LockKeyhole, MapPin, X } from 'lucide-react-native';
import { CharacterAvatar, LoadingSkeleton, Screen } from '../../src/components';
import { useTogether } from '../../src/store/useTogether';
import { useAuth } from '../../src/hooks/useAuth';
import { loadWorldPulseEvent, openDirectWorldPulse, openGroupWorldPulse } from '../../src/lib/api';
import { loadMessageDraft, clearMessageDraft } from '../../src/lib/messageDrafts';
import { subscriptionHref } from '../../src/lib/subscriptionPresentation';
import { colors, typography } from '../../src/theme';
import { worldPulsePortraitCellWidth } from '@together/domain/src/world-pulse-v2';

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

export default function WorldPulseDetail() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { width } = useWindowDimensions();
  const snapshot = useTogether((state) => state.snapshot);
  const { session } = useAuth();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const scope = session?.user.id && snapshot?.activeContinuity?.id ? `${session.user.id}:${snapshot.activeContinuity.id}` : null;
  const query = useQuery({ queryKey: ['world-pulse-detail', scope, id], queryFn: () => loadWorldPulseEvent(String(id)),
    enabled: Boolean(scope && id), retry: false, staleTime: Infinity, refetchOnWindowFocus: false });
  const event = query.data?.event;
  const world = snapshot?.worlds.find((item) => item.id === event?.worldId);
  const count = event?.participants.length ?? 0;
  const cellWidth = worldPulsePortraitCellWidth(width, Math.max(1, count));
  const groupEntitled = event?.allowedActions.group === true;
  const groupAvailable = event?.participants.every((person) => person.available) ?? false;

  const direct = async (characterTemplateId: string) => {
    if (!event || !session?.user.id || !event.allowedActions.directCharacterTemplateIds.includes(characterTemplateId)) return;
    setBusy(true); setActionError('');
    try {
      const result = await openDirectWorldPulse({ occurrenceId: event.id, characterTemplateId, requestId: crypto.randomUUID() });
      const draft = await suggestedDraft(session.user.id, result.conversation.id, 'direct', result.draft);
      setChooserOpen(false);
      const route = Platform.OS === 'web' ? '/(tabs)/chat-tab' : '/chat';
      router.push(`${route}?character=${encodeURIComponent(result.characterHandle)}&conversationId=${encodeURIComponent(result.conversation.id)}${draft ? `&draft=${encodeURIComponent(draft)}` : ''}` as never);
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Chat could not be opened.'); }
    finally { setBusy(false); }
  };
  const group = async () => {
    if (!event || !session?.user.id || !groupAvailable) return;
    if (!groupEntitled) return router.push(subscriptionHref({ intent: 'group_chat', returnTo: `/world-pulse/${event.id}` }) as never);
    setBusy(true); setActionError('');
    try {
      const result = await openGroupWorldPulse({ occurrenceId: event.id, requestId: crypto.randomUUID() });
      const draft = await suggestedDraft(session.user.id, result.conversation.id, 'group', result.draft);
      setChooserOpen(false);
      router.push(`/group-chat?id=${encodeURIComponent(result.conversation.id)}${draft ? `&draft=${encodeURIComponent(draft)}` : ''}` as never);
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Group chat could not be opened.'); }
    finally { setBusy(false); }
  };

  if (query.isPending) return <Screen contentStyle={styles.content}><LoadingSkeleton label="Opening World Pulse…" /></Screen>;
  if (!event) return <Screen contentStyle={styles.content}><Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><ArrowLeft color={colors.text} /></Pressable><Text accessibilityRole="header" style={styles.title}>{String((query.error as { code?: string } | null)?.code) === 'WORLD_PULSE_EXPIRED' ? 'This World Pulse has passed.' : 'World Pulse unavailable'}</Text><Text style={styles.body}>Fresh events appear in the last 24 hours feed.</Text></Screen>;
  return <Screen contentStyle={styles.content}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><ArrowLeft color={colors.text} /></Pressable>
    <Text style={styles.kicker}>WORLD PULSE · {world?.name ?? 'Kivelle'}</Text>
    <Text accessibilityRole="header" style={styles.title}>{event.title}</Text>
    <Text style={styles.time}>{new Date(event.occurredAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</Text>
    <View style={styles.location}><MapPin size={16} color={colors.rose} /><Text style={styles.locationText}>{event.location.name}</Text></View>
    <Text style={styles.body}>{event.detailBody}</Text>
    {event.userVisibleFacts.length ? <View style={styles.factPanel}><Text style={styles.sectionLabel}>WHAT IS KNOWN</Text>{event.userVisibleFacts.map((fact) => <Text key={fact.id} style={styles.fact}>• {fact.text}</Text>)}</View> : null}
    <Text style={styles.sectionLabel}>PEOPLE INVOLVED</Text>
    <View style={styles.cast}>{event.participants.map((person) => <Pressable key={person.characterTemplateId} accessibilityRole="button" accessibilityLabel={`View ${person.name}'s profile`} onPress={() => router.push(`/character/${person.publicHandle ?? person.slug}` as never)} style={[styles.person, { width: cellWidth }]}>
      <CharacterAvatar slug={person.slug} name={person.name} size={Math.min(76, cellWidth - 8)} />
      <Text numberOfLines={2} style={styles.personName}>{person.name}</Text>
      <Text numberOfLines={2} style={styles.role}>{person.roleLabel}</Text>
    </Pressable>)}</View>
    <Pressable accessibilityRole="button" accessibilityLabel={count === 1 ? `Message ${event.participants[0]?.name}` : 'Message about this'} disabled={busy || (count === 1 && !event.participants[0]?.available)} onPress={() => count === 1 ? void direct(event.participants[0]!.characterTemplateId) : setChooserOpen(true)} style={({ pressed }) => [styles.mainAction, pressed && { opacity: .82 }]}><Text style={styles.mainText}>{busy ? 'Opening chat…' : count === 1 && !event.participants[0]?.available ? 'Unavailable in this Life' : count === 1 ? `Message ${event.participants[0]?.name}` : 'Message about this'}</Text></Pressable>
    {actionError ? <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text> : null}
    <Modal visible={chooserOpen} transparent animationType="slide" onRequestClose={() => setChooserOpen(false)}><View style={styles.scrim}><Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close chooser" onPress={() => setChooserOpen(false)} /><View style={styles.sheet}>
      <View style={styles.sheetHeading}><Text accessibilityRole="header" style={styles.sheetTitle}>Who do you want to ask?</Text><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setChooserOpen(false)}><X color={colors.text} /></Pressable></View>
      {event.participants.map((person) => <Pressable key={person.characterTemplateId} accessibilityRole="button" disabled={busy || !person.available} accessibilityState={{disabled:busy || !person.available}} onPress={() => void direct(person.characterTemplateId)} style={[styles.choice,!person.available&&{opacity:.5}]}><CharacterAvatar slug={person.slug} name={person.name} size={38} /><Text style={styles.choiceText}>{person.available ? `Ask ${person.name}` : `${person.name} · unavailable in this Life`}</Text></Pressable>)}
      <Pressable accessibilityRole="button" disabled={busy || !groupAvailable} accessibilityState={{disabled:busy || !groupAvailable}} onPress={() => void group()} style={[styles.choice,!groupAvailable&&{opacity:.5}]}><Text style={styles.choiceText}>{groupAvailable ? `Start group chat with all ${count}` : 'Group unavailable in this Life'}</Text>{!groupEntitled&&groupAvailable ? <LockKeyhole size={18} color={colors.rose} /> : null}</Pressable>
      {actionError ? <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text> : null}
    </View></View></Modal>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 15, maxWidth: 670, width: '100%', alignSelf: 'center' },
  back: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  kicker: { color: colors.rose, fontSize: 10, fontWeight: '900', letterSpacing: 1.7 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 34, lineHeight: 40 },
  time: { color: colors.muted, fontSize: 12 },
  location: { flexDirection: 'row', alignItems: 'center', gap: 7 }, locationText: { color: colors.rose, fontSize: 13, fontWeight: '700' },
  body: { color: colors.textSecondary, fontSize: 15, lineHeight: 23 },
  factPanel: { backgroundColor: colors.surface, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 18, gap: 8 },
  fact: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  sectionLabel: { color: colors.rose, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginTop: 12 },
  cast: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'nowrap', gap: 7 },
  person: { minHeight: 136, alignItems: 'center', paddingVertical: 9, paddingHorizontal: 2, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 17, gap: 4 },
  personName: { color: colors.text, fontSize: 11, fontWeight: '800', textAlign: 'center' }, role: { color: colors.muted, fontSize: 10, textAlign: 'center' },
  mainAction: { backgroundColor: colors.rose, borderRadius: 18, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  mainText: { color: colors.background, fontSize: 15, fontWeight: '900' }, error: { color: colors.rose, fontSize: 13 },
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.7)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, gap: 10, paddingBottom: 38 },
  sheetHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sheetTitle: { color: colors.text, fontFamily: typography.display, fontSize: 25 },
  choice: { minHeight: 53, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 15, paddingHorizontal: 12 },
  choiceText: { color: colors.text, fontSize: 14, fontWeight: '700', flex: 1 },
});
