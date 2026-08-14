import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { ArrowUpRight, CalendarDays, Compass, Palmtree } from 'lucide-react-native';
import { characterAssets, cityLifeAsset } from '../../src/assets';
import { EmptyState, GlassCard, LoadingSkeleton, PageTitle, Screen, SectionHeader } from '../../src/components';
import { colors, radius, spacing } from '../../src/theme';
import { useTogether } from '../../src/store/useTogether';

const tabs = ['People', 'Experiences', 'Worlds', 'Trips'] as const;
type Tab = (typeof tabs)[number];

export default function Discover() {
  const snapshot = useTogether((state) => state.snapshot);
  const [tab, setTab] = useState<Tab>('People');
  const activeCompanionId = snapshot?.profile?.active_companion_instance_id;
  const availableDates = useMemo(() => snapshot?.dates.filter((date) => ['unlocked', 'deferred', 'upcoming', 'active'].includes(date.status)) ?? [], [snapshot]);
  if (!snapshot) return <LoadingSkeleton label="Curating your world..." />;
  if (!snapshot.characters.length) return <EmptyState title="Your world is waiting" body="Finish onboarding to discover City Life." />;

  return <Screen>
    <View><PageTitle>Discover</PageTitle><Text style={styles.subtitle}>People, places, and experiences for the life you’re building.</Text></View>
    <View style={styles.tabs}>{tabs.map((item) => <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabSelected]} accessibilityRole="tab" accessibilityState={{ selected: tab === item }}><Text style={[styles.tabText, tab === item && styles.tabTextSelected]}>{item}</Text></Pressable>)}</View>
    {tab === 'People' ? <People snapshot={snapshot} activeCompanionId={activeCompanionId} /> : null}
    {tab === 'Experiences' ? <Experiences dates={snapshot.dates} /> : null}
    {tab === 'Worlds' ? <Worlds /> : null}
    {tab === 'Trips' ? <Trips trips={snapshot.trips ?? []} /> : null}
    {tab === 'Experiences' && !availableDates.length ? <Text style={styles.quiet}>Nothing is unlocked yet. Let your relationship find its pace.</Text> : null}
  </Screen>;
}

function People({ snapshot, activeCompanionId }: { snapshot: NonNullable<ReturnType<typeof useTogether.getState>['snapshot']>; activeCompanionId?: string | null }) {
  return <>
    <SectionHeader title="People in your world" />
    <View style={styles.people}>{snapshot.characters.map((character) => {
      const template = character.together_character_templates;
      const current = character.id === activeCompanionId;
      const known = Boolean(character.contact_added_at || character.introduced_at || current);
      const action = current ? `Continue with ${template.name}` : known ? `View ${template.name}` : `Meet ${template.name}`;
      return <Pressable key={character.id} onPress={() => router.push(`/character/${template.slug}`)} style={({ pressed }) => [styles.person, pressed && styles.pressed]} accessibilityLabel={action}>
        <Image source={characterAssets[character.together_character_versions.portrait_asset_key] ?? characterAssets[template.slug]} style={styles.personImage} contentFit="cover" contentPosition="top" />
        <View style={styles.personCopy}><Text style={styles.personName}>{template.name}, {template.age}</Text><Text style={styles.personMeta}>{template.occupation} · City Life</Text><Text style={styles.personTraits}>{character.together_character_versions.interests.slice(0, 3).join(' · ')}</Text><Text style={styles.personAction}>{action}</Text></View>
      </Pressable>;
    })}</View>
  </>;
}

function Experiences({ dates }: { dates: NonNullable<ReturnType<typeof useTogether.getState>['snapshot']>['dates'] }) {
  return <>
    <SectionHeader title="Experiences" />
    <View style={styles.stack}>{dates.map((date) => <Pressable key={date.id} onPress={() => date.status !== 'locked' && router.push(`/date/${date.id}`)} disabled={date.status === 'locked'} style={({ pressed }) => [styles.experience, date.status === 'locked' && styles.locked, pressed && styles.pressed]}><View style={styles.experienceIcon}><CalendarDays size={20} color={colors.warm} /></View><View style={{ flex: 1 }}><Text style={styles.experienceKicker}>{date.status === 'locked' ? 'NOT QUITE YET' : date.status === 'completed' ? 'SHARED HISTORY' : 'AVAILABLE NOW'}</Text><Text style={styles.experienceTitle}>{date.together_date_templates.name}</Text><Text style={styles.experienceCopy}>{date.together_date_templates.description}</Text></View>{date.status !== 'locked' ? <ArrowUpRight color={colors.rose} size={18} /> : null}</Pressable>)}</View>
  </>;
}

function Worlds() { return <Pressable onPress={() => router.push('/(tabs)/worlds')} style={({ pressed }) => [styles.worldFeature, pressed && styles.pressed]}><Image source={cityLifeAsset} style={StyleSheet.absoluteFill} contentFit="cover" /><View style={styles.worldShade} /><View style={styles.worldTop}><View style={styles.worldPill}><Compass color="#fff" size={14} /><Text style={styles.worldPillText}>CITY LIFE</Text></View><ArrowUpRight color="#fff" size={18} /></View><View><Text style={styles.featureKicker}>YOUR LIVING WORLD</Text><Text style={styles.worldTitle}>Juniper City</Text><Text style={styles.worldCopy}>A city full of people, places, and stories.</Text></View></Pressable>; }

function Trips({ trips }: { trips: NonNullable<ReturnType<typeof useTogether.getState>['snapshot']>['trips'] }) { const items = trips ?? []; return <><SectionHeader title="Trips" />{items.length ? <View style={styles.stack}>{items.map((trip) => <GlassCard key={trip.slug} style={styles.trip}><Palmtree color={colors.violet} size={21} /><View style={{ flex: 1 }}><Text style={styles.tripTitle}>{trip.title}</Text><Text style={styles.experienceCopy}>{trip.description}</Text><Text style={styles.personAction}>Keep getting closer to unlock this</Text></View></GlassCard>)}</View> : <EmptyState title="The city comes first" body="Get to know each other before planning time away." />}</>; }

const styles = StyleSheet.create({ subtitle: { color: colors.muted, marginTop: 5, lineHeight: 19 }, tabs: { flexDirection: 'row', gap: 7, padding: 4, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }, tab: { flex: 1, minHeight: 36, justifyContent: 'center', alignItems: 'center', borderRadius: radius.sm }, tabSelected: { backgroundColor: colors.rose }, tabText: { color: colors.muted, fontSize: 11, fontWeight: '800' }, tabTextSelected: { color: '#fff' }, people: { gap: 12 }, person: { minHeight: 138, borderRadius: radius.lg, overflow: 'hidden', flexDirection: 'row', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, personImage: { width: 104, height: '100%' }, personCopy: { flex: 1, padding: 13, justifyContent: 'center' }, personName: { color: colors.text, fontFamily: 'Georgia', fontSize: 21 }, personMeta: { color: colors.muted, fontSize: 11, marginTop: 4 }, personTraits: { color: '#E5D7E8', fontSize: 10, lineHeight: 15, marginTop: 6 }, personAction: { color: colors.rose, fontSize: 11, fontWeight: '900', marginTop: 9 }, stack: { gap: 10 }, experience: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, locked: { opacity: .72 }, experienceIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(233,160,127,.11)' }, experienceKicker: { color: colors.rose, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, experienceTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 20, marginTop: 3 }, experienceCopy: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }, quiet: { color: colors.muted, textAlign: 'center', lineHeight: 20 }, worldFeature: { height: 306, borderRadius: radius.xl, overflow: 'hidden', padding: spacing.md, justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border }, worldShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10,9,16,.42)' }, worldTop: { zIndex: 1, flexDirection: 'row', justifyContent: 'space-between' }, worldPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(10,9,16,.55)' }, worldPillText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 1 }, featureKicker: { color: '#F6D4E1', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }, worldTitle: { color: '#fff', fontFamily: 'Georgia', fontSize: 30, marginTop: 5 }, worldCopy: { color: '#F6E8ED', fontSize: 12, marginTop: 4 }, trip: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' }, tripTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 20 }, pressed: { opacity: .88, transform: [{ scale: .98 }] } });
