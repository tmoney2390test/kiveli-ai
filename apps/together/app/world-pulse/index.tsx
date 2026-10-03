import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, Clock3, MapPin } from 'lucide-react-native';
import { Screen, LoadingSkeleton } from '../../src/components/ui';
import { useWorldPulse } from '../../src/hooks/useWorldPulse';
import { useTogether } from '../../src/store/useTogether';
import { useAuth } from '../../src/hooks/useAuth';
import { colors, typography } from '../../src/theme';
import { WorldPulseEventModal } from '../../src/components/WorldPulseEventModal';
import type { WorldPulseV2Event } from '@together/domain/src/world-pulse-v2';

export default function WorldPulseList() {
  const [selectedEvent, setSelectedEvent] = useState<WorldPulseV2Event | null>(null);
  const { world: slug } = useLocalSearchParams<{ world?: string }>();
  const snapshot = useTogether((state) => state.snapshot);
  const { session } = useAuth();
  const world = snapshot?.worlds.find((item) => item.slug === slug);
  const scope = session?.user.id && snapshot?.activeContinuity?.id ? `${session.user.id}:${snapshot.activeContinuity.id}` : null;
  const { data, isLoading, isError, refetch } = useWorldPulse(world?.id, scope, Boolean(world));
  return <><Screen contentStyle={styles.content}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><ArrowLeft size={20} color={colors.text} /></Pressable>
    <Text style={styles.kicker}>WORLD PULSE</Text>
    <Text accessibilityRole="header" style={styles.title}>Last 24 hours in {world?.name ?? 'this world'}</Text>
    {isLoading ? <LoadingSkeleton label="Loading World Pulse…" /> : null}
    {isError ? <Pressable accessibilityRole="button" onPress={() => void refetch()}><Text style={styles.error}>World Pulse could not be loaded. Tap to retry.</Text></Pressable> : null}
    {data?.version === 2 && !data.events.length ? <Text style={styles.empty}>No fresh events right now. Check back later.</Text> : null}
    {data?.version === 2 ? data.events.map((event) => <Pressable key={event.id} accessibilityRole="button" accessibilityLabel={`${event.feedSummary}, ${event.location.name}`} onPress={() => setSelectedEvent(event)} style={({ pressed }) => [styles.card, event.eventTier === 'major' && styles.majorCard, pressed && { opacity: .82 }]}>
      {event.eventTier === 'major' ? <Text style={styles.majorLabel}>MAJOR EVENT</Text> : null}
      <Text style={styles.summary}>{event.feedSummary}</Text>
      <View style={styles.meta}><Clock3 size={14} color={colors.muted} /><Text style={styles.metaText}>{new Date(event.occurredAt).toLocaleString()}</Text></View>
      <View style={styles.meta}><MapPin size={14} color={colors.rose} /><Text style={styles.metaText}>{event.location.name}</Text></View>
      <Text style={styles.people}>{event.participants.map((person) => person.name).join(' · ')}</Text>
    </Pressable>) : null}
  </Screen><WorldPulseEventModal eventId={selectedEvent?.id??null} previewEvent={selectedEvent} onClose={() => setSelectedEvent(null)} onNavigate={(href) => { setSelectedEvent(null); router.push(href as never); }}/></>;
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 15, maxWidth: 850, width: '100%', alignSelf: 'center' },
  back: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  kicker: { color: colors.rose, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 32, lineHeight: 39 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 20, padding: 18, gap: 10 },
  majorCard: { borderColor: '#DD5C69', borderWidth: 2, backgroundColor: 'rgba(56,23,35,.84)' },
  majorLabel: { color: '#FF9FA9', fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  summary: { color: colors.text, fontSize: 16, lineHeight: 23 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 7 }, metaText: { color: colors.muted, fontSize: 12 },
  people: { color: colors.rose, fontSize: 12, fontWeight: '700' },
  error: { color: colors.rose }, empty: { color: colors.muted, marginTop: 16 },
});
