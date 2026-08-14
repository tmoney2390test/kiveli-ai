import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { CalendarDays, LockKeyhole, Sparkles } from 'lucide-react-native';
import { characterAssets } from '../../src/assets';
import { Body, GlassCard, LoadingSkeleton, PageTitle, Screen, SectionHeader } from '../../src/components';
import { colors, radius, spacing } from '../../src/theme';
import { useTogether } from '../../src/store/useTogether';
import { buildCompanionLife } from '../../src/lib/companionLife';

export default function Dates() {
  const snapshot = useTogether((state) => state.snapshot);
  if (!snapshot) return <LoadingSkeleton />;
  const life = buildCompanionLife(snapshot);
  const dinner = life?.dates.find((date) => date.together_date_templates.id === '15000000-0000-4000-8000-000000000001') ?? life?.dates[0];
  const unlocked = dinner?.status !== 'locked';
  const companionName = life?.companion.together_character_templates.name ?? 'your companion';
  const moreDates = life?.dates.filter((date) => date.id !== dinner?.id).sort((left,right) => Number(right.status === 'unlocked') - Number(left.status === 'unlocked')).slice(0, 6) ?? [];

  return <Screen>
    <View style={styles.header}><View><PageTitle>Dates</PageTitle><Text style={styles.subtitle}>Shared experiences, remembered.</Text></View><View style={styles.dateCount}><CalendarDays size={16} color={colors.rose} /><Text style={styles.dateCountText}>{dinner?.status === 'completed' ? '1 MEMORY' : '1 POSSIBILITY'}</Text></View></View>
    <View style={styles.tabs}><Text style={styles.tabActive}>Upcoming</Text><Text style={styles.tab}>Available</Text><Text style={styles.tab}>Past</Text></View>

    <SectionHeader title={dinner?.status === 'completed' ? 'A shared memory' : unlocked ? 'Your next night out' : 'When the time feels right'} />
    <Pressable disabled={!unlocked} onPress={() => router.push(`/date/${dinner!.id}`)} style={({ pressed }) => [styles.hero, !unlocked && styles.lockedHero, pressed && unlocked && styles.pressed]}>
      <Image source={characterAssets[life?.companion.together_character_versions.portrait_asset_key ?? 'maya'] ?? characterAssets.maya} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" />
      <View style={styles.shade} />
      <View style={styles.heroHeader}><Text style={styles.heroKicker}>{dinner?.status === 'completed' ? 'YOUR FIRST DATE' : 'DINNER AT JUNIPER'}</Text>{unlocked ? <View style={styles.availablePill}><View style={styles.availableDot} /><Text style={styles.availableText}>{dinner?.status === 'completed' ? 'COMPLETED' : 'AVAILABLE'}</Text></View> : null}</View>
      <View style={styles.heroText}><Text style={styles.dateTitle}>{dinner?.together_date_templates.name ?? 'Shared experience'}</Text><Text style={styles.dateMeta}>{dinner?.status === 'locked' ? 'A little anticipation is part of it.' : dinner?.status === 'completed' ? 'A night you will both remember.' : dinner?.scheduled_for ? new Date(dinner.scheduled_for).toLocaleString(undefined,{weekday:'long',hour:'numeric',minute:'2-digit'}) : 'Ready when you are'}</Text>{!unlocked ? <View style={styles.lock}><LockKeyhole size={13} color="#D2CBD5" /><Text style={styles.lockText}>Keep getting to know {companionName}</Text></View> : <Text style={styles.tapHint}>Tap to {dinner?.status === 'completed' ? 'revisit the memory' : 'begin your date'}</Text>}</View>
    </Pressable>

    <SectionHeader title="Past dates" />
    {dinner?.status === 'completed' ? <GlassCard style={styles.memory}><Sparkles size={18} color={colors.rose} /><View style={{ flex: 1 }}><Text style={styles.memoryTitle}>Dinner at Juniper</Text><Body muted>Your first date is now part of your shared history.</Body></View></GlassCard> : <View style={styles.emptyPast}><Text style={styles.emptyPastTitle}>Your first shared night is still ahead.</Text><Text style={styles.emptyPastCopy}>Completed dates become a part of your visual timeline.</Text></View>}
    <SectionHeader title="More experiences" action={`${life?.dates.length ?? 0} in City Life`} />
    <View style={styles.moreList}>{moreDates.map((date) => { const isReady = date.status === 'unlocked' || date.status === 'upcoming' || date.status === 'deferred'; return <Pressable key={date.id} disabled={!isReady} onPress={() => router.push(`/date/${date.id}`)} style={({pressed}) => [styles.moreDate, !isReady && styles.moreDateLocked, pressed && isReady && styles.pressed]}><View style={styles.moreIcon}>{isReady ? <Sparkles size={16} color={colors.rose} /> : <LockKeyhole size={15} color={colors.muted} />}</View><View style={{flex:1}}><Text style={styles.moreTitle}>{date.together_date_templates.name}</Text><Text style={styles.moreCopy}>{isReady ? 'Ready when the time feels right.' : 'Unlocks as your shared story grows.'}</Text></View></Pressable>;})}</View>
  </Screen>;
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
  memory: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  memoryTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 19, marginBottom: 4 },
  emptyPast: { borderRadius: radius.md, backgroundColor: colors.surface, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  emptyPastTitle: { color: colors.text, fontWeight: '800' },
  emptyPastCopy: { color: colors.muted, fontSize: 12, marginTop: 4, lineHeight: 18 },
  moreList:{gap:9},moreDate:{flexDirection:'row',alignItems:'center',gap:11,padding:12,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},moreDateLocked:{opacity:.62},moreIcon:{width:32,height:32,borderRadius:16,backgroundColor:'rgba(241,103,154,.10)',alignItems:'center',justifyContent:'center'},moreTitle:{color:colors.text,fontWeight:'800',fontSize:14},moreCopy:{color:colors.muted,fontSize:11,marginTop:3},
});
