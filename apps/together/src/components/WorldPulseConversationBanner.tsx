import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Newspaper, ChevronRight } from 'lucide-react-native';
import { loadWorldPulseConversationLabel } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { colors } from '../theme';

/** A historical context marker, never a transcript message or scene change. */
export function WorldPulseConversationBanner({ conversationId, continuityId }: { conversationId: string; continuityId: string }) {
  const { session } = useAuth();
  const [tick, setTick] = useState(0);
  const query = useQuery({
    queryKey: ['world-pulse-conversation-label', session?.user.id, continuityId, conversationId],
    queryFn: async () => ({ value: await loadWorldPulseConversationLabel(conversationId), receivedAt: performance.now() }),
    enabled: Boolean(session?.user.id && continuityId && conversationId),
    staleTime: 5 * 60_000, retry: false,
  });
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  const response = query.data;
  const label = response?.value.label;
  if (!label) return null;
  const serverNow = Date.parse(response.value.serverNow) + Math.max(0, performance.now() - response.receivedAt);
  const fresh = label.fresh && Date.parse(label.occurredAt) <= serverNow && Date.parse(label.occurredAt) >= serverNow - 24 * 3_600_000;
  void tick;
  return <Pressable accessibilityRole={fresh ? 'button' : 'text'} accessibilityLabel={fresh ? `View World Pulse: ${label.title}` : `World Pulse: ${label.title}`}
    disabled={!fresh} onPress={() => router.push(`/world-pulse/${label.eventId}`)} style={styles.banner}>
    <Newspaper size={15} color={colors.rose}/><Text style={styles.kicker}>WORLD PULSE</Text>
    <Text numberOfLines={1} style={styles.title}>{label.title}</Text>
    {fresh ? <><Text style={styles.view}>View event</Text><ChevronRight size={15} color={colors.rose}/></> : <Text style={styles.past}>Passed</Text>}
  </Pressable>;
}

const styles = StyleSheet.create({
  banner: { minHeight: 42, paddingHorizontal: 14, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 7,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: 'rgba(35,21,42,.72)' },
  kicker: { color: colors.rose, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 12, fontWeight: '600', flex: 1 },
  view: { color: colors.rose, fontSize: 11, fontWeight: '700' },
  past: { color: colors.muted, fontSize: 11 },
});
