import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { CalendarDays, LockKeyhole, Sparkles } from 'lucide-react-native';
import { characterAssets, cityLifeAsset } from '../../src/assets';
import { Body, GlassCard, LoadingSkeleton, PageTitle, Screen, SectionHeader } from '../../src/components';
import { colors, radius, spacing } from '../../src/theme';
import { useTogether } from '../../src/store/useTogether';

export default function Dates() {
  const snapshot = useTogether((state) => state.snapshot);
  if (!snapshot) return <LoadingSkeleton />;
  const dinner = snapshot.dates[0];
  const unlocked = dinner?.status !== 'locked';

  return <Screen>
    <View style={styles.header}><View><PageTitle>Dates</PageTitle><Text style={styles.subtitle}>Shared experiences, remembered.</Text></View><View style={styles.dateCount}><CalendarDays size={16} color={colors.rose} /><Text style={styles.dateCountText}>{dinner?.status === 'completed' ? '1 MEMORY' : '1 POSSIBILITY'}</Text></View></View>
    <View style={styles.tabs}><Text style={styles.tabActive}>Upcoming</Text><Text style={styles.tab}>Available</Text><Text style={styles.tab}>Past</Text></View>

    <SectionHeader title={dinner?.status === 'completed' ? 'A shared memory' : unlocked ? 'Your next night out' : 'When the time feels right'} />
    <Pressable disabled={!unlocked} onPress={() => router.push(`/date/${dinner!.id}`)} style={({ pressed }) => [styles.hero, !unlocked && styles.lockedHero, pressed && unlocked && styles.pressed]}>
      <Image source={characterAssets.maya} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" />
      <View style={styles.shade} />
      <View style={styles.heroHeader}><Text style={styles.heroKicker}>{dinner?.status === 'completed' ? 'YOUR FIRST DATE' : 'DINNER AT JUNIPER'}</Text>{unlocked ? <View style={styles.availablePill}><View style={styles.availableDot} /><Text style={styles.availableText}>{dinner?.status === 'completed' ? 'COMPLETED' : 'AVAILABLE'}</Text></View> : null}</View>
      <View style={styles.heroText}><Text style={styles.dateTitle}>Dinner at Juniper</Text><Text style={styles.dateMeta}>{dinner?.status === 'locked' ? 'A little anticipation is part of it.' : dinner?.status === 'completed' ? 'A night you will both remember.' : 'Saturday · 7:00 PM'}</Text>{!unlocked ? <View style={styles.lock}><LockKeyhole size={13} color="#D2CBD5" /><Text style={styles.lockText}>Keep getting to know Maya</Text></View> : <Text style={styles.tapHint}>Tap to {dinner?.status === 'completed' ? 'revisit the memory' : 'begin your date'}</Text>}</View>
    </Pressable>

    <SectionHeader title="More ways to connect" action="Coming soon" />
    <ActivityCard title="Walk at Riverwalk" mood="Romantic" detail="An unhurried evening by the water" />
    <ActivityCard title="Rooftop Movie" mood="Easygoing" detail="Blankets, city lights, and a bad movie" />
    <ActivityCard title="Live Music Night" mood="Electric" detail="A little louder than either of you expected" />

    <SectionHeader title="Past dates" />
    {dinner?.status === 'completed' ? <GlassCard style={styles.memory}><Sparkles size={18} color={colors.rose} /><View style={{ flex: 1 }}><Text style={styles.memoryTitle}>Dinner at Juniper</Text><Body muted>Your first date is now part of your shared history.</Body></View></GlassCard> : <View style={styles.emptyPast}><Text style={styles.emptyPastTitle}>Your first shared night is still ahead.</Text><Text style={styles.emptyPastCopy}>Completed dates become a part of your visual timeline.</Text></View>}
  </Screen>;
}

function ActivityCard({ title, mood, detail }: { title: string; mood: string; detail: string }) {
  return <View style={styles.activity}><Image source={cityLifeAsset} style={styles.thumb} contentFit="cover" /><View style={{ flex: 1 }}><Text style={styles.activityTitle}>{title}</Text><Text style={styles.activityDetail}>{detail}</Text><Text style={styles.mood}>{mood}</Text></View><LockKeyhole size={16} color={colors.dimmed} /></View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  subtitle: { color: colors.muted, marginTop: 5 },
  dateCount: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: 'rgba(241,103,154,.12)' },
  dateCountText: { color: '#FFB8D0', fontSize: 9, fontWeight: '800', letterSpacing: .7 },
  tabs: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: 4, borderWidth: 1, borderColor: colors.border },
  tab: { flex: 1, textAlign: 'center', color: colors.muted, padding: 10, fontWeight: '700', fontSize: 12 },
  tabActive: { flex: 1, textAlign: 'center', color: '#fff', padding: 10, fontWeight: '800', backgroundColor: colors.elevated, borderRadius: radius.sm, fontSize: 12 },
  hero: { height: 330, borderRadius: radius.xl, overflow: 'hidden', justifyContent: 'space-between', padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  lockedHero: { opacity: .78 },
  pressed: { transform: [{ scale: .985 }], opacity: .92 },
  shade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,11,19,.35)' },
  heroHeader: { zIndex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroKicker: { color: '#F6DCE6', fontSize: 10, letterSpacing: 1.15, fontWeight: '800' },
  availablePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(17,21,34,.62)' },
  availableDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.success },
  availableText: { color: '#D8F3E5', fontSize: 9, fontWeight: '800' },
  heroText: { zIndex: 1 },
  dateTitle: { color: colors.text, fontSize: 30, fontFamily: 'Georgia', fontWeight: '600' },
  dateMeta: { color: '#F4E8EF', marginTop: 6, fontSize: 14 },
  lock: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 12 },
  lockText: { color: '#D2CBD5', fontSize: 12 },
  tapHint: { color: '#FFC6D9', fontSize: 12, fontWeight: '700', marginTop: 12 },
  activity: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 9 },
  thumb: { width: 76, height: 62, borderRadius: radius.sm },
  activityTitle: { color: colors.text, fontWeight: '800' },
  activityDetail: { color: colors.muted, fontSize: 11, marginTop: 3 },
  mood: { color: colors.rose, fontSize: 11, marginTop: 5, fontWeight: '700' },
  memory: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  memoryTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 19, marginBottom: 4 },
  emptyPast: { borderRadius: radius.md, backgroundColor: colors.surface, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  emptyPastTitle: { color: colors.text, fontWeight: '800' },
  emptyPastCopy: { color: colors.muted, fontSize: 12, marginTop: 4, lineHeight: 18 },
});
