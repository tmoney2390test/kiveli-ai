import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { ArrowUpRight, ChevronRight, Compass, PartyPopper, Sparkles } from 'lucide-react-native';
import { cityLifeAsset } from '../../src/assets';
import { EventCard, GlassCard, LoadingSkeleton, PageTitle, Screen, SectionHeader, WorldCharacterCard, WorldHero } from '../../src/components';
import { colors, radius, spacing } from '../../src/theme';
import { useTogether } from '../../src/store/useTogether';

export default function Worlds() {
  const snapshot = useTogether((state) => state.snapshot);
  if (!snapshot) return <LoadingSkeleton />;
  const chloeIsIntroduced = snapshot.characters.find((item) => item.together_character_templates.slug === 'chloe')?.introduced_at;
  const mayaMet = snapshot.characters.find((item) => item.together_character_templates.slug === 'maya')?.contact_added_at;

  return <Screen>
    <View style={styles.heading}><View><PageTitle>Worlds</PageTitle><Text style={styles.subtitle}>A living city around you.</Text></View><View style={styles.cityBadge}><Compass size={15} color={colors.violet} /><Text style={styles.cityBadgeText}>CITY LIFE</Text></View></View>
    <WorldHero source={cityLifeAsset} title="City Life" subtitle="People, places, and stories moving in real time." />

    <SectionHeader title="Around the city" action="Explore" />
    <GlassCard style={styles.characterCard}>
      {snapshot.characters.map((character, index) => <View key={character.id}>{index > 0 ? <View style={styles.rule} /> : null}<WorldCharacterCard character={character} location={snapshot.locations.find((item) => item.id === character.current_location_id)?.name} onPress={() => character.together_character_templates.slug === 'maya' ? router.push('/character/maya') : character.together_character_templates.slug === 'chloe' && character.introduced_at ? router.push('/chat?character=chloe') : undefined} /></View>)}
    </GlassCard>

    <SectionHeader title="Tonight" action="Full calendar" />
    <GlassCard style={styles.eventCard}>
      <EventCard title="Open Mic at Juniper" time="8:00 PM" icon="♫" />
      <EventCard title="Rooftop Movie Night" time="9:30 PM" icon="▣" />
      <EventCard title="Trivia at Northside" time="9:00 PM" icon="?" />
    </GlassCard>

    <SectionHeader title="Explore places" action="See map" />
    <View style={styles.grid}>{snapshot.locations.slice(0, 4).map((location, index) => <Pressable key={location.id} style={({ pressed }) => [styles.location, pressed && styles.locationPressed]}><Image source={cityLifeAsset} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={index % 2 ? 'right' : 'left'} /><View style={styles.locationShade} /><View style={styles.locationTop}><Text style={styles.locationCategory}>{location.category.toUpperCase()}</Text><ArrowUpRight color="#fff" size={16} /></View><View><Text style={styles.locationName}>{location.name}</Text><Text style={styles.locationMeta}>{location.possible_activities[0] ?? 'Explore the city'}</Text></View></Pressable>)}</View>

    {mayaMet && !chloeIsIntroduced ? <Pressable onPress={() => router.push('/introduction')} style={({ pressed }) => [styles.intro, pressed && styles.locationPressed]}><View style={styles.introIcon}><PartyPopper size={19} color={colors.violet} /></View><View style={{ flex: 1 }}><Text style={styles.introKicker}>A NEW CONNECTION</Text><Text style={styles.introTitle}>Maya wants you to meet Chloe.</Text><Text style={styles.introBody}>A short introduction could make City Life feel a little bigger.</Text></View><ChevronRight color={colors.violet} /></Pressable> : <View style={styles.worldNote}><Sparkles size={17} color={colors.warm} /><Text style={styles.worldNoteText}>Characters keep moving even when you are away.</Text></View>}
  </Screen>;
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  subtitle: { color: colors.muted, marginTop: 5 },
  cityBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: 'rgba(154,104,255,.12)' },
  cityBadgeText: { color: '#D7C2FF', fontSize: 9, fontWeight: '800', letterSpacing: .8 },
  characterCard: { paddingVertical: 4 },
  rule: { height: 1, backgroundColor: colors.border, marginLeft: 56 },
  eventCard: { paddingVertical: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  location: { width: '48%', height: 170, borderRadius: radius.lg, overflow: 'hidden', justifyContent: 'space-between', padding: 13, borderWidth: 1, borderColor: colors.border },
  locationPressed: { transform: [{ scale: .975 }], opacity: .9 },
  locationShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,11,19,.42)' },
  locationTop: { flexDirection: 'row', justifyContent: 'space-between' },
  locationName: { color: colors.text, fontSize: 17, fontFamily: 'Georgia', fontWeight: '600' },
  locationCategory: { color: '#F6D6C8', fontSize: 9, letterSpacing: 1, fontWeight: '800' },
  locationMeta: { color: '#D8D3DB', fontSize: 11, marginTop: 4 },
  intro: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(154,104,255,.10)', borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: 'rgba(154,104,255,.30)' },
  introIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(154,104,255,.16)' },
  introKicker: { color: '#D7C2FF', fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  introTitle: { fontFamily: 'Georgia', fontSize: 19, color: colors.text, marginTop: 3 },
  introBody: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  worldNote: { flexDirection: 'row', gap: 9, alignItems: 'center', padding: 14, borderRadius: radius.md, backgroundColor: colors.surface },
  worldNoteText: { flex: 1, color: colors.muted, fontSize: 12 },
});
