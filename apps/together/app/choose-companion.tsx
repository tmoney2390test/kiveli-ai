import { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, ChevronRight, MapPin, Sparkles, X } from 'lucide-react-native';
import { FrostedBackdrop, FrostedSurface, GradientButton, KivelleLogo, LoadingSkeleton, Screen, resolveCharacterPortraitSource } from '../src/components';
import { CompanionGenderToggle, useCompanionGenderPreference } from '../src/components/CompanionGenderToggle';
import { worldHeroAsset } from '../src/assets';
import { bootstrap } from '../src/lib/api';
import { featuredCompanionsMatchingGender, type FeaturedCompanion } from '../src/lib/featuredCompanions';
import { onboardingCompanionsForWorld, onboardingWorldFantasy, onboardingWorlds } from '../src/lib/onboardingCatalog';
import { quickStartProfile, skipQuickStartProfile } from '../src/lib/quickStart';
import { resolveKivelleAccountStage } from '../src/lib/authRouting';
import { useTogether } from '../src/store/useTogether';
import type { Snapshot, World } from '../src/types';
import { colors, radius, spacing, typography } from '../src/theme';

const nav = router as unknown as { replace: (href: string) => void; setParams: (params: Record<string, string>) => void };

export default function ChooseCompanion() {
  const params = useLocalSearchParams<{ world?: string }>();
  const { width } = useWindowDimensions();
  const desktop = width >= 760;
  const { snapshot, setSnapshot, setBrowsedWorldId, refresh, loading } = useTogether();
  const [selectedWorldId, setSelectedWorldId] = useState('');
  const [preview, setPreview] = useState<FeaturedCompanion | null>(null);
  const [visibleCount, setVisibleCount] = useState(8);
  const [gender, setGender] = useCompanionGenderPreference();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!snapshot && !loading) void refresh();
  }, [loading, refresh, snapshot]);

  const worlds = useMemo(() => snapshot ? onboardingWorlds(snapshot) : [], [snapshot]);
  useEffect(() => {
    if (selectedWorldId || !params.world) return;
    const requested = worlds.find((world) => world.slug === params.world);
    if (requested) setSelectedWorldId(requested.id);
  }, [params.world, selectedWorldId, worlds]);

  const selectedWorld = worlds.find((world) => world.id === selectedWorldId);
  const worldCompanions = useMemo(
    () => snapshot && selectedWorldId ? onboardingCompanionsForWorld(snapshot, selectedWorldId) : [],
    [selectedWorldId, snapshot],
  );
  const filteredCompanions = useMemo(
    () => featuredCompanionsMatchingGender(worldCompanions, gender),
    [gender, worldCompanions],
  );
  const visibleCompanions = filteredCompanions.slice(0, visibleCount);
  const worldCounts = useMemo(() => snapshot ? new Map(worlds.map((world) => [world.id, onboardingCompanionsForWorld(snapshot, world.id).length])) : new Map<string, number>(), [snapshot, worlds]);

  useEffect(() => { setVisibleCount(8); }, [gender, selectedWorldId]);

  if (!snapshot) return <LoadingSkeleton label="Opening Kivelle…" />;

  if (resolveKivelleAccountStage(snapshot.profile) === 'age_confirmation') {
    router.replace('/age-confirmation' as never);
    return <LoadingSkeleton label="Opening age confirmation…" />;
  }

  const chooseWorld = (world: World) => {
    setSelectedWorldId(world.id);
    setPreview(null);
    setError('');
    nav.setParams({ world: world.slug });
  };

  const startMeeting = async (companion: FeaturedCompanion) => {
    if (!selectedWorld) {
      setError('Choose a world and someone you want to meet.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const next = await bootstrap(quickStartProfile(companion.id, selectedWorld.id, { ageConfirmed: true }));
      setSnapshot(next);
      setBrowsedWorldId(selectedWorld.id);
      setPreview(null);
      nav.replace(`/chat?character=${companion.public_handle ?? companion.slug}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your first conversation could not be prepared.');
    } finally {
      setBusy(false);
    }
  };

  const skipForNow = async () => {
    setBusy(true);
    setError('');
    try {
      const next = await bootstrap(skipQuickStartProfile(selectedWorld?.id, { ageConfirmed: true }));
      setSnapshot(next);
      setBrowsedWorldId(selectedWorld?.id ?? null);
      nav.replace(selectedWorld ? `/(tabs)/explore?world=${encodeURIComponent(selectedWorld.slug)}` : '/(tabs)/explore');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Kivelle could not finish setting up your account.');
    } finally {
      setBusy(false);
    }
  };

  return <View style={styles.root}>
    <Screen contentStyle={[styles.screen, desktop && styles.screenDesktop] as never}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <KivelleLogo height={30} />
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void skipForNow()} style={({ pressed }) => [styles.headerSkip, pressed && styles.skipPressed]}>
            <Text style={styles.headerSkipText}>{busy ? 'Preparing…' : 'Skip for now'}</Text>
          </Pressable>
        </View>
        <Text style={styles.title}>Where should your story begin?</Text>
        <Text style={styles.subtitle}>Choose a world, then meet someone who already has a life there. You can explore every world later.</Text>
      </View>

      <View style={styles.worldGrid} accessibilityRole="radiogroup" accessibilityLabel="Choose a starting world">
        {worlds.map((world) => {
          const chosen = world.id === selectedWorldId;
          const count = worldCounts.get(world.id) ?? 0;
          return <Pressable
            key={world.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: chosen }}
            accessibilityLabel={`${world.name}. ${count ? `${count} companions` : 'New arrivals coming soon'}`}
            onPress={() => chooseWorld(world)}
            style={({ pressed }) => [styles.worldCard, desktop && styles.worldCardDesktop, chosen && styles.worldCardSelected, pressed && styles.cardPressed]}
          >
            <Image source={worldHeroAsset(world.slug)} style={StyleSheet.absoluteFill} contentFit="cover" />
            <View style={styles.worldShade} />
            {chosen ? <View style={styles.worldCheck}><Check size={15} color="#fff" /></View> : null}
            <View style={styles.worldCopy}>
              <Text style={styles.worldName}>{world.name}</Text>
              <Text style={styles.worldMeta}>{count ? `${count} people to meet` : 'New arrivals soon'}</Text>
            </View>
          </Pressable>;
        })}
      </View>

      {selectedWorld ? <View style={styles.worldHero}>
        <Image source={worldHeroAsset(selectedWorld.slug)} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={styles.worldHeroShade} />
        <View style={styles.worldHeroCopy}>
          <Text style={styles.worldHeroKicker}>BEGIN IN</Text>
          <Text style={styles.worldHeroTitle}>{selectedWorld.name}</Text>
          <Text numberOfLines={3} style={styles.worldHeroBody}>{onboardingWorldFantasy(selectedWorld)}</Text>
        </View>
      </View> : null}

      {selectedWorld ? <View style={styles.peopleSection}>
        <View style={styles.peopleHeading}>
          <View style={{ flex: 1 }}><Text style={styles.peopleKicker}>PEOPLE IN {selectedWorld.name.toUpperCase()}</Text><Text style={styles.peopleTitle}>Who catches your attention?</Text></View>
          <CompanionGenderToggle value={gender} onChange={setGender} />
        </View>
        {visibleCompanions.length ? <View style={styles.peopleGrid} accessibilityRole="radiogroup" accessibilityLabel={`Companions in ${selectedWorld.name}`}>
          {visibleCompanions.map((person) => <CompanionCard key={person.id} person={person} desktop={desktop} onPress={() => { setPreview(person); setError(''); }} />)}
        </View> : <FrostedSurface intensity={70} style={styles.emptyPeople}><Sparkles size={20} color={colors.violet} /><Text style={styles.emptyPeopleTitle}>New introductions are being prepared</Text><Text style={styles.emptyPeopleBody}>Try another companion filter or choose a different world.</Text></FrostedSurface>}
        {visibleCount < filteredCompanions.length ? <Pressable accessibilityRole="button" onPress={() => setVisibleCount((count) => count + 8)} style={styles.showMore}><Text style={styles.showMoreText}>Show more people</Text><ChevronRight size={15} color={colors.rose} /></Pressable> : null}
      </View> : null}

      {error && !preview ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </Screen>

    <CompanionPreview companion={preview} snapshot={snapshot} desktop={desktop} busy={busy} error={error} onClose={() => { if (!busy) setPreview(null); }} onMeet={() => { if (preview) void startMeeting(preview); }} />
  </View>;
}

function CompanionCard({ person, desktop, onPress }: { person: FeaturedCompanion; desktop: boolean; onPress: () => void }) {
  const portrait = resolveCharacterPortraitSource(person, person.together_character_versions, person.slug);
  return <Pressable accessibilityRole="button" accessibilityLabel={`Preview ${person.name}, ${person.age}, ${person.occupation}`} onPress={onPress} style={({ pressed }) => [styles.person, desktop && styles.personDesktop, pressed && styles.cardPressed]}>
    {portrait ? <Image source={portrait} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" /> : <View style={[StyleSheet.absoluteFill, styles.personFallback]}><Text style={styles.personInitial}>{person.name[0]}</Text></View>}
    <View style={styles.personShade} />
    <View style={styles.personCopy}>
      <Text numberOfLines={1} style={styles.personName}>{person.name} <Text style={styles.personAge}>{person.age}</Text></Text>
      <Text numberOfLines={1} style={styles.personOccupation}>{person.occupation}</Text>
      <View style={styles.previewAction}><Text style={styles.previewActionText}>Preview</Text><ChevronRight size={14} color="#fff" /></View>
    </View>
  </Pressable>;
}

function CompanionPreview({ companion, snapshot, desktop, busy, error, onClose, onMeet }: { companion: FeaturedCompanion | null; snapshot: Snapshot; desktop: boolean; busy: boolean; error: string; onClose: () => void; onMeet: () => void }) {
  if (!companion) return null;
  const portrait = resolveCharacterPortraitSource(companion, companion.together_character_versions, companion.slug);
  const meeting = companion.first_meeting;
  const location = snapshot.locations.find((item) => item.id === meeting?.location_id);
  const world = snapshot.worlds.find((item) => item.id === (location?.world_id ?? meeting?.world_id));
  const interests = companion.together_character_versions.interests.slice(0, 3);
  return <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <View style={[styles.modalRoot, desktop ? styles.modalCenter : styles.modalBottom]}>
      <FrostedBackdrop intensity={36} />
      <Pressable accessibilityLabel="Close companion preview" onPress={onClose} style={StyleSheet.absoluteFill} />
      <FrostedSurface intensity={94} style={[styles.previewModal, desktop && styles.previewModalDesktop]}>
        <View style={styles.previewHero}>
          {portrait ? <Image source={portrait} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" /> : <View style={[StyleSheet.absoluteFill, styles.personFallback]} />}
          <View style={styles.previewShade} />
          <Pressable accessibilityRole="button" accessibilityLabel="Close preview" onPress={onClose} style={styles.close}><X size={19} color="#fff" /></Pressable>
          <View style={styles.previewIdentity}>
            <Text style={styles.previewName}>{companion.name} <Text style={styles.previewAge}>{companion.age}</Text></Text>
            <Text style={styles.previewOccupation}>{companion.occupation}</Text>
          </View>
        </View>
        <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={styles.previewBodyScroll} contentContainerStyle={styles.previewBody}>
          <Text numberOfLines={3} style={styles.previewBio}>{companion.biography}</Text>
          {interests.length ? <View style={styles.interests}>{interests.map((interest, index) => <View key={`${interest}-${index}`} style={styles.interest}><Text style={styles.interestText}>{interest}</Text></View>)}</View> : null}
          {meeting ? <View style={styles.meeting}>
            <View style={styles.meetingTop}><MapPin size={16} color={colors.warm} /><View style={{ flex: 1 }}><Text style={styles.meetingKicker}>YOUR FIRST MEETING · {world?.name?.toUpperCase()}</Text><Text style={styles.meetingTitle}>{location?.name ?? meeting.title}</Text></View></View>
            <Text numberOfLines={2} style={styles.meetingSetup}>{meeting.setup}</Text>
            <Text numberOfLines={3} style={styles.openingLine}>“{meeting.opening_line}”</Text>
          </View> : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <GradientButton label={busy ? `Opening chat with ${companion.name}…` : `Meet ${companion.name}`} disabled={busy} onPress={onMeet} />
        </ScrollView>
      </FrostedSurface>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  screen: { minHeight: '100%', maxWidth: 1040, paddingHorizontal: 14, paddingTop: 22, paddingBottom: 48, gap: spacing.lg },
  screenDesktop: { paddingTop: 34 },
  header: { gap: 6, maxWidth: 700 },
  headerTop: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  headerSkip: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 2 },
  headerSkipText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  title: { fontFamily: typography.display, color: colors.text, fontSize: 34, lineHeight: 40, fontWeight: '600' },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, maxWidth: 650 },
  worldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  worldCard: { width: '48.3%', height: 142, overflow: 'hidden', justifyContent: 'flex-end', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  worldCardDesktop: { width: '24%' },
  worldCardSelected: { borderColor: '#F2C67D', borderWidth: 2, shadowColor: '#F2C67D', shadowOpacity: .2, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 6 },
  cardPressed: { opacity: .9, transform: [{ scale: .988 }] },
  worldShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,6,12,.3)' },
  worldCheck: { position: 'absolute', top: 10, right: 10, width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.rose, borderWidth: 1, borderColor: 'rgba(255,255,255,.4)' },
  worldCopy: { zIndex: 1, padding: 12 },
  worldName: { color: '#fff', fontFamily: typography.display, fontSize: 21, lineHeight: 25, textShadowColor: '#000', textShadowRadius: 10 },
  worldMeta: { color: '#F6E6EC', fontSize: 9, fontWeight: '800', marginTop: 3, textShadowColor: '#000', textShadowRadius: 7 },
  worldHero: { height: 210, overflow: 'hidden', justifyContent: 'flex-end', borderRadius: radius.xl, borderWidth: 1, borderColor: 'rgba(242,198,125,.24)' },
  worldHeroShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,6,12,.32)' },
  worldHeroCopy: { zIndex: 1, padding: 18, maxWidth: 620 },
  worldHeroKicker: { color: '#F4C77E', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  worldHeroTitle: { color: '#fff', fontFamily: typography.display, fontSize: 34, lineHeight: 39, textShadowColor: '#000', textShadowRadius: 12 },
  worldHeroBody: { color: '#F8ECF1', fontSize: 12, lineHeight: 18, textShadowColor: '#000', textShadowRadius: 8 },
  peopleSection: { gap: 13 },
  peopleHeading: { zIndex: 20, flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  peopleKicker: { color: colors.warm, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  peopleTitle: { color: colors.text, fontFamily: typography.display, fontSize: 28, lineHeight: 33, marginTop: 2 },
  peopleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  person: { width: '48.3%', height: 270, overflow: 'hidden', justifyContent: 'flex-end', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.elevated },
  personDesktop: { width: '24%' },
  personFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.plum },
  personInitial: { color: 'rgba(255,255,255,.18)', fontFamily: typography.display, fontSize: 90 },
  personShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,6,12,.18)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(0deg, rgba(6,4,9,.94), rgba(6,4,9,.05) 68%)' } as never) : {}) },
  personCopy: { zIndex: 1, padding: 12 },
  personName: { color: '#fff', fontFamily: typography.display, fontSize: 23, lineHeight: 28, textShadowColor: '#000', textShadowRadius: 8 },
  personAge: { color: 'rgba(255,255,255,.7)' },
  personOccupation: { color: '#F6D6DF', fontSize: 9, fontWeight: '800', marginTop: 1 },
  previewAction: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 7 },
  previewActionText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  emptyPeople: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 20, borderRadius: radius.lg },
  emptyPeopleTitle: { color: colors.text, fontWeight: '900', fontSize: 13, textAlign: 'center' },
  emptyPeopleBody: { color: colors.muted, fontSize: 10, textAlign: 'center' },
  showMore: { alignSelf: 'center', minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderBright, backgroundColor: colors.surface },
  showMoreText: { color: colors.text, fontSize: 11, fontWeight: '900' },
  skipPressed: { opacity: .65 },
  error: { color: '#FF9BA7', fontSize: 11, lineHeight: 16, textAlign: 'center' },
  modalRoot: { flex: 1, padding: 12 },
  modalBottom: { justifyContent: 'flex-end' },
  modalCenter: { alignItems: 'center', justifyContent: 'center' },
  previewModal: { width: '100%', maxHeight: '94%', borderRadius: 28, borderColor: 'rgba(255,221,241,.25)', shadowColor: '#000', shadowOpacity: .62, shadowRadius: 34, shadowOffset: { width: 0, height: 16 }, elevation: 28 },
  previewModalDesktop: { maxWidth: 540 },
  previewHero: { height: 280, justifyContent: 'flex-end', overflow: 'hidden' },
  previewShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,5,12,.18)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(0deg, rgba(12,8,17,.96), rgba(10,6,14,.02) 68%)' } as never) : {}) },
  close: { position: 'absolute', zIndex: 8, top: 12, left: 12, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,6,12,.66)', borderWidth: 1, borderColor: 'rgba(255,255,255,.25)' },
  previewIdentity: { zIndex: 2, padding: 18 },
  previewName: { color: '#fff', fontFamily: typography.display, fontSize: 38, lineHeight: 43, textShadowColor: '#000', textShadowRadius: 12 },
  previewAge: { color: 'rgba(255,255,255,.7)' },
  previewOccupation: { color: '#F7D8E4', fontSize: 11, fontWeight: '900' },
  previewBodyScroll: { flexShrink: 1 },
  previewBody: { gap: 12, padding: 17 },
  previewBio: { color: '#F1E8ED', fontSize: 12, lineHeight: 18 },
  interests: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  interest: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(216,62,234,.12)', borderWidth: 1, borderColor: 'rgba(216,62,234,.22)' },
  interestText: { color: '#F1CBDF', fontSize: 9, fontWeight: '800' },
  meeting: { gap: 7, padding: 12, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.035)', borderWidth: 1, borderColor: colors.border },
  meetingTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meetingKicker: { color: colors.warm, fontSize: 7, fontWeight: '900', letterSpacing: .7 },
  meetingTitle: { color: colors.text, fontSize: 13, fontWeight: '900', marginTop: 2 },
  meetingSetup: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  openingLine: { color: '#F5D7E4', fontFamily: typography.display, fontSize: 15, lineHeight: 20 },
});
