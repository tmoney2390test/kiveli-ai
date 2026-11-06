import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Clock3, MapPin } from 'lucide-react-native';
import type { WorldPulseV2Event } from '@together/domain/src/world-pulse-v2';
import { colors, typography } from '../../theme';
import { CharacterAvatar } from '../ui';

function relativePulseTime(occurredAt: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(occurredAt)) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export function WorldPulseV2Section({ worldName, events, onOpen, onViewAll }: {
  worldName: string;
  events: WorldPulseV2Event[];
  onOpen: (event: WorldPulseV2Event) => void;
  onViewAll: () => void;
}) {
  return <View style={styles.section}>
    <View style={styles.heading}><View><Text style={styles.kicker}>WORLD PULSE</Text><Text accessibilityRole="header" style={styles.title}>Last 24 hours in {worldName}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="View all World Pulse events" onPress={onViewAll} hitSlop={8}><Text style={styles.all}>View all →</Text></Pressable></View>
    {!events.length?<View style={styles.loadError}><Text style={styles.loadErrorText}>Nothing new in the last 24 hours. Check back soon.</Text></View>
      :<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} accessibilityLabel={`World Pulse in ${worldName}`}>
      {[...events].sort((a, b) => Number(b.eventTier === 'major') - Number(a.eventTier === 'major') || Date.parse(b.occurredAt) - Date.parse(a.occurredAt)).slice(0, 5).map((event) => <Pressable key={event.id} accessibilityRole="button" accessibilityLabel={`${event.feedSummary}, ${event.location.name}`} onPress={() => onOpen(event)} style={({ pressed }) => [styles.card, event.eventTier === 'major' && styles.majorCard, pressed && styles.pressed]}>
        <View style={styles.cardTop}><Text style={[styles.status, event.eventTier === 'major' && styles.majorStatus]}>{event.eventTier === 'major' ? 'MAJOR EVENT' : 'RECENT'}</Text><View style={styles.cardTime}><Clock3 size={13} color="#BFA9BE" /><Text style={styles.timeText}>{relativePulseTime(event.occurredAt)}</Text></View></View>
        <Text numberOfLines={4} style={styles.summary}>{event.feedSummary}</Text>
        <View style={styles.location}><MapPin size={13} color="#E79AC0" /><Text numberOfLines={1} style={styles.locationText}>{event.location.name}</Text></View>
        <View style={styles.peopleRow}><View style={styles.avatars}>{event.participants.map((person) => <CharacterAvatar key={person.characterTemplateId} slug={person.slug} name={person.name} size={23}/>)}</View><Text numberOfLines={1} style={styles.people}>{event.participants.map((person) => person.name).join(' · ')}</Text></View>
      </Pressable>)}
    </ScrollView>}
  </View>;
}

export function WorldPulseV2Skeleton({ worldName }: { worldName: string }) {
  return <View style={styles.section} accessibilityRole="progressbar" accessibilityLabel={`Loading World Pulse in ${worldName}`}>
    <View style={styles.heading}><View><Text style={styles.kicker}>WORLD PULSE</Text><Text accessibilityRole="header" style={styles.title}>Last 24 hours in {worldName}</Text></View></View>
    <ScrollView horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
      {[0, 1].map((item) => <View key={item} style={[styles.card, styles.skeletonCard]}>
        <View style={[styles.skeletonLine, styles.skeletonKicker]} />
        <View style={[styles.skeletonLine, styles.skeletonBody]} />
        <View style={[styles.skeletonLine, styles.skeletonBodyShort]} />
        <View style={[styles.skeletonLine, styles.skeletonPlace]} />
      </View>)}
    </ScrollView>
  </View>;
}

export function WorldPulseV2LoadError({ onRetry }: { onRetry: () => void }) {
  return <View style={styles.section}>
    <Text style={styles.kicker}>WORLD PULSE</Text>
    <View style={styles.loadError}><Text style={styles.loadErrorText}>World Pulse couldn’t load.</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8}><Text style={styles.all}>Try again →</Text></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 13 }, heading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  kicker: { color: '#D685B2', fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 27, lineHeight: 33, flexShrink: 1 },
  all: { color: '#E8A5D0', fontSize: 12, fontWeight: '800', paddingBottom: 5 },
  rail: { gap: 12, paddingRight: 8 },
  card: { width: 284, minHeight: 190, padding: 17, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(203,105,158,.17)', backgroundColor: 'rgba(26,18,29,.76)', gap: 8 },
  majorCard: { borderWidth: 2, borderColor: '#DD5C69', backgroundColor: 'rgba(56,23,35,.84)' },
  pressed: { opacity: .82, transform: [{ scale: .992 }] },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTime: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeText: { color: '#BFA9BE', fontSize: 10 },
  status: { color: '#72D7C2', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  majorStatus: { color: '#FF9FA9' },
  summary: { color: colors.text, fontSize: 15, lineHeight: 21, flex: 1 },
  location: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  locationText: { color: '#E8C6D8', fontSize: 11, fontWeight: '800', flex: 1 },
  peopleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  avatars: { flexDirection: 'row', gap: 3 },
  people: { color: '#B1A5B3', fontSize: 10, flex: 1 },
  skeletonCard: { height: 190, overflow: 'hidden', backgroundColor: 'rgba(35,25,38,.64)' },
  skeletonLine: { height: 10, borderRadius: 7, backgroundColor: 'rgba(222,173,207,.13)' },
  skeletonKicker: { width: 63, height: 8, marginBottom: 5 },
  skeletonBody: { width: '94%' },
  skeletonBodyShort: { width: '69%' },
  skeletonPlace: { width: '46%', marginTop: 'auto' },
  loadError: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 70, paddingHorizontal: 17, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(203,105,158,.17)', backgroundColor: 'rgba(26,18,29,.76)' },
  loadErrorText: { color: '#BEB4C0', fontSize: 12 },
});
