import { CatalogImage as Image } from '../src/components/CatalogImage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Check, ChevronRight, LockKeyhole, Sparkles } from 'lucide-react-native';
import { isSubscriberEarlyAccessWorld } from '@together/domain/src/world-access';
import { SpiceBadge } from '../src/components/SpiceBadge';
import { CompanionGenderToggle } from '../src/components/CompanionGenderToggle';
import { FrostedSurface, KivelleLogo, LoadingSkeleton, Screen, resolveCharacterPortraitSource } from '../src/components';
import { worldHeroAsset } from '../src/assets';
import { bootstrap } from '../src/lib/api';
import { featuredCompanionsMatchingGender, type FeaturedCompanion, type FeaturedGenderFilter } from '../src/lib/featuredCompanions';
import { onboardingCompanionsForWorld, onboardingRecommendedWorld, onboardingWorldCompactCopy, onboardingWorldFantasy, onboardingWorldGenre, onboardingWorlds } from '../src/lib/onboardingCatalog';
import { quickStartProfile } from '../src/lib/quickStart';
import { resolveKivelleAccountStage } from '../src/lib/authRouting';
import { useTogether } from '../src/store/useTogether';
import type { World } from '../src/types';
import { colors, radius, spacing, typography } from '../src/theme';
import { updateLocalRouteParamsOnWeb } from '../src/lib/appNavigation';
import { canAccessWorld } from '../src/lib/place';
import { subscriptionHref } from '../src/lib/subscriptionPresentation';

type OnboardingStep = 'world' | 'character';

const nav = {
  replace: (href: string) => router.replace(href as never),
  setParams: (params: Record<string, string>) => { if (!updateLocalRouteParamsOnWeb(params)) router.setParams(params); },
};

export default function ChooseCompanion() {
  const params = useLocalSearchParams<{ world?: string }>();
  const { width } = useWindowDimensions();
  const desktop = width >= 760;
  const screenRef = useRef<ScrollView | null>(null);
  const { snapshot, setSnapshot, setBrowsedWorldId, refresh, loading } = useTogether();
  const [step, setStep] = useState<OnboardingStep>('world');
  const [selectedWorldId, setSelectedWorldId] = useState('');
  const [selectedCompanionId, setSelectedCompanionId] = useState('');
  const [visibleCount, setVisibleCount] = useState(12);
  const [gender, setGender] = useState<FeaturedGenderFilter>('any');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!snapshot && !loading) void refresh();
  }, [loading, refresh, snapshot]);

  const worlds = useMemo(() => snapshot ? onboardingWorlds(snapshot) : [], [snapshot]);
  const recommendedWorld = useMemo(() => snapshot ? onboardingRecommendedWorld(snapshot, worlds) : null, [snapshot, worlds]);
  useEffect(() => {
    if (selectedWorldId || !worlds.length) return;
    const requested = params.world ? worlds.find((world) => world.slug === params.world) : null;
    setSelectedWorldId((requested ?? recommendedWorld!).id);
  }, [params.world, recommendedWorld, selectedWorldId, worlds]);

  const selectedWorld = worlds.find((world) => world.id === selectedWorldId) ?? null;
  const selectedWorldAccessible = Boolean(selectedWorld && canAccessWorld(snapshot!, selectedWorld));
  const worldCompanions = useMemo(
    () => snapshot && selectedWorldId ? onboardingCompanionsForWorld(snapshot, selectedWorldId) : [],
    [selectedWorldId, snapshot],
  );
  const filteredCompanions = useMemo(
    () => featuredCompanionsMatchingGender(worldCompanions, gender),
    [gender, worldCompanions],
  );
  const selectedCompanion = worldCompanions.find((person) => person.id === selectedCompanionId) ?? null;
  const visibleCompanions = filteredCompanions.slice(0, visibleCount);
  const otherWorlds = worlds.filter((world) => world.id !== recommendedWorld?.id);

  useEffect(() => {
    setVisibleCount(12);
    setSelectedCompanionId('');
  }, [gender, selectedWorldId]);

  if (!snapshot) return <LoadingSkeleton label="Opening Kivelle…" />;

  if (resolveKivelleAccountStage(snapshot.profile) === 'age_confirmation') {
    router.replace('/age-confirmation' as never);
    return <LoadingSkeleton label="Opening age confirmation…" />;
  }

  const chooseWorld = (world: World) => {
    if (busy) return;
    setSelectedWorldId(world.id);
    setSelectedCompanionId('');
    setError('');
    nav.setParams({ world: world.slug });
  };

  const continueToCharacters = () => {
    if (!selectedWorld) return;
    if (!selectedWorldAccessible) {
      router.push(subscriptionHref({ intent: 'worlds', returnTo: `/choose-companion?world=${encodeURIComponent(selectedWorld.slug)}` }) as never);
      return;
    }
    setStep('character');
    setGender('any');
    setSelectedCompanionId('');
    setError('');
    requestAnimationFrame(() => screenRef.current?.scrollTo({ y: 0, animated: false }));
  };

  const returnToWorlds = () => {
    if (busy) return;
    setStep('world');
    setSelectedCompanionId('');
    setError('');
    requestAnimationFrame(() => screenRef.current?.scrollTo({ y: 0, animated: false }));
  };

  const startMeeting = async () => {
    if (!selectedWorld || !selectedCompanion || busy) {
      if (!selectedCompanion) setError('Choose someone to begin your first conversation.');
      return;
    }
    if (!selectedWorldAccessible) {
      router.push(subscriptionHref({ intent: 'worlds', returnTo: `/choose-companion?world=${encodeURIComponent(selectedWorld.slug)}` }) as never);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const next = await bootstrap(quickStartProfile(selectedCompanion.id, selectedWorld.id, { ageConfirmed: true }));
      setSnapshot(next);
      setBrowsedWorldId(selectedWorld.id);
      nav.replace(`/chat?character=${selectedCompanion.public_handle ?? selectedCompanion.slug}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your first conversation could not be prepared.');
    } finally {
      setBusy(false);
    }
  };

  return <View style={styles.root}>
    <Screen scrollRef={screenRef} contentStyle={[styles.screen, desktop && styles.screenDesktop] as never}>
      <OnboardingHeader step={step} onBack={returnToWorlds} />

      {step === 'world' ? <>
        <View style={styles.heroCopy}>
          <Text accessibilityRole="header" style={[styles.title, desktop && styles.titleDesktop]}>Your story starts here.</Text>
          <Text style={styles.subtitle}>Choose a world to step into.</Text>
        </View>

        {recommendedWorld ? <View accessibilityRole="radiogroup" accessibilityLabel="Choose a world" style={styles.worldPicker}>
          <WorldCard world={recommendedWorld} selected={recommendedWorld.id === selectedWorldId} accessible={canAccessWorld(snapshot,recommendedWorld)} featured onPress={() => chooseWorld(recommendedWorld)} />
          {otherWorlds.length ? <View style={styles.worldGrid}>
            {otherWorlds.map((world) => <WorldCard key={world.id} world={world} selected={world.id === selectedWorldId} accessible={canAccessWorld(snapshot,world)} compact desktop={desktop} onPress={() => chooseWorld(world)} />)}
          </View> : null}
        </View> : <FrostedSurface intensity={70} style={styles.emptyState}><Sparkles size={20} color={colors.violet} /><Text style={styles.emptyTitle}>Worlds are being prepared</Text></FrostedSurface>}

        <OutlinedAction
          label={selectedWorld ? selectedWorldAccessible ? `Continue to ${selectedWorld.name}` : `Unlock early access to ${selectedWorld.name}` : 'Choose a world'}
          disabled={!selectedWorld || busy}
          onPress={continueToCharacters}
        />
        <Text style={styles.reassurance}>You can explore other worlds anytime.</Text>
      </> : <>
        <View style={styles.heroCopy}>
          <Text accessibilityRole="header" style={[styles.title, desktop && styles.titleDesktop]}>Who will you meet?</Text>
          <Text style={styles.subtitle}>{selectedWorld ? `Choose someone already living in ${selectedWorld.name}.` : 'Choose someone to begin your story.'}</Text>
        </View>

        <View accessibilityRole="tablist" style={styles.tabs}>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: true }} style={[styles.tab, styles.tabActive]}><Text style={[styles.tabText, styles.tabTextActive]}>Characters</Text></Pressable>
          <Pressable accessibilityRole="tab" accessibilityLabel="Scenarios. Not available yet." accessibilityState={{ disabled: true, selected: false }} disabled style={[styles.tab, styles.tabDisabled]}><Text style={styles.tabText}>Scenarios</Text></Pressable>
        </View>

        <View style={styles.peopleHeading}>
          <Text style={styles.peopleLabel}>{selectedWorld?.name.toUpperCase()}</Text>
          <CompanionGenderToggle value={gender} onChange={setGender} />
        </View>

        {visibleCompanions.length ? <View style={styles.peopleGrid} accessibilityRole="radiogroup" accessibilityLabel={`Characters in ${selectedWorld?.name ?? 'this world'}`}>
          {visibleCompanions.map((person) => <CompanionCard key={person.id} person={person} desktop={desktop} selected={person.id === selectedCompanionId} busy={busy && person.id === selectedCompanionId} onPress={() => { if (!busy) { setSelectedCompanionId(person.id); setError(''); } }} />)}
        </View> : <FrostedSurface intensity={70} style={styles.emptyState}><Sparkles size={20} color={colors.violet} /><Text style={styles.emptyTitle}>No characters match this filter</Text><Text style={styles.emptyBody}>Choose All or try another gender.</Text></FrostedSurface>}

        {visibleCount < filteredCompanions.length ? <Pressable accessibilityRole="button" onPress={() => setVisibleCount((count) => count + 12)} style={styles.showMore}><Text style={styles.showMoreText}>Show more</Text><ChevronRight size={15} color={colors.rose} /></Pressable> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <OutlinedAction
          label={busy && selectedCompanion ? `Opening chat with ${selectedCompanion.name}…` : selectedCompanion ? `Start a conversation with ${firstName(selectedCompanion.name)}` : 'Choose a character'}
          disabled={!selectedCompanion || busy}
          onPress={() => void startMeeting()}
        />
      </>}
    </Screen>
  </View>;
}

function OnboardingHeader({ step, onBack }: { step: OnboardingStep; onBack: () => void }) {
  return <View style={styles.header}>
    <View style={styles.headerSide}>{step === 'character' ? <Pressable accessibilityRole="button" accessibilityLabel="Back to world selection" hitSlop={10} onPress={onBack} style={styles.back}><ArrowLeft size={21} color={colors.text} /></Pressable> : <KivelleLogo height={34} />}</View>
    <View accessibilityLabel={`Step ${step === 'world' ? '1' : '2'} of 2`} style={styles.progress}>
      <View style={styles.progressActive} />
      <View style={step === 'character' ? styles.progressActive : styles.progressInactive} />
    </View>
  </View>;
}

function WorldCard({ world, selected, accessible, featured = false, compact = false, desktop = false, onPress }: { world: World; selected: boolean; accessible: boolean; featured?: boolean; compact?: boolean; desktop?: boolean; onPress: () => void }) {
  const copy = compact ? onboardingWorldCompactCopy(world) : { genre: onboardingWorldGenre(world), description: onboardingWorldFantasy(world) };
  const earlyAccess = isSubscriberEarlyAccessWorld(world.metadata);
  return <Pressable
    accessibilityRole="radio"
    accessibilityState={{ checked: selected }}
    aria-checked={selected}
    accessibilityLabel={`${world.name}. ${earlyAccess ? accessible ? 'Subscriber early access included. ' : 'Subscriber early access. ' : ''}${copy.genre}. ${copy.description}`}
    onPress={onPress}
    style={({ pressed }) => [styles.worldCard, featured && styles.worldCardFeatured, compact && styles.worldCardCompact, compact && desktop && styles.worldCardCompactDesktop, selected && styles.worldCardSelected, pressed && styles.cardPressed]}
  >
    <Image source={worldHeroAsset(world.slug)} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" cachePolicy="memory-disk" priority={selected ? 'high' : 'normal'} />
    <View style={styles.worldShade} />
    {earlyAccess ? <View style={styles.earlyAccessBadge}><LockKeyhole size={11} color="#FFF4FD" /><Text style={styles.earlyAccessText}>EARLY ACCESS</Text></View> : null}
    {selected ? <View style={styles.selectionCheck}><Check size={19} strokeWidth={3} color="#fff" /></View> : null}
    <View style={[styles.worldCopy, compact && styles.worldCopyCompact]}>
      {featured ? <Text style={styles.recommended}>Recommended</Text> : null}
      <Text numberOfLines={1} style={[styles.worldName, compact && styles.worldNameCompact]}>{world.name}</Text>
      <Text numberOfLines={2} style={[styles.worldGenre, compact && styles.worldGenreCompact]}>{copy.genre}</Text>
      <Text numberOfLines={2} style={[styles.worldFantasy, compact && styles.worldFantasyCompact]}>{copy.description}</Text>
    </View>
  </Pressable>;
}

function CompanionCard({ person, desktop, selected, busy, onPress }: { person: FeaturedCompanion; desktop: boolean; selected: boolean; busy: boolean; onPress: () => void }) {
  const portrait = resolveCharacterPortraitSource(person, person.together_character_versions, person.slug);
  return <Pressable
    accessibilityRole="radio"
    accessibilityState={{ checked: selected, disabled: busy }}
    accessibilityLabel={`${person.name}, ${person.occupation}`}
    onPress={onPress}
    style={({ pressed }) => [styles.person, desktop && styles.personDesktop, selected && styles.personSelected, pressed && !busy && styles.cardPressed]}
  >
    {portrait ? <Image source={portrait} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" cachePolicy="memory-disk" /> : <View style={[StyleSheet.absoluteFill, styles.personFallback]}><Text style={styles.personInitial}>{person.name[0]}</Text></View>}
    <View style={styles.personShade} />
    <SpiceBadge level={person.spice_level} overlay />
    {selected ? <View style={styles.personCheck}><Check size={15} strokeWidth={3} color="#fff" /></View> : null}
    <View style={styles.personCopy}>
      <Text numberOfLines={1} style={styles.personName}>{person.name}</Text>
      <Text numberOfLines={1} style={styles.personOccupation}>{busy ? 'Opening conversation…' : person.occupation}</Text>
    </View>
  </Pressable>;
}

function OutlinedAction({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, disabled && styles.actionDisabled, pressed && !disabled && styles.actionPressed]}>
    <Text numberOfLines={1} style={styles.actionText}>{label}</Text>
    {!disabled ? <ChevronRight size={22} color="#F7E9FA" /> : null}
  </Pressable>;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#06050B' },
  screen: { minHeight: '100%', maxWidth: 1120, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 34, gap: spacing.lg },
  screenDesktop: { paddingHorizontal: 28, paddingTop: 28, paddingBottom: 48 },
  header: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSide: { width: 78, alignItems: 'flex-start' },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: 'rgba(255,255,255,.045)', borderWidth: 1, borderColor: 'rgba(255,255,255,.08)' },
  progress: { width: 78, flexDirection: 'row', justifyContent: 'flex-end', gap: 7 },
  progressActive: { width: 22, height: 5, borderRadius: 3, backgroundColor: '#B65CDB' },
  progressInactive: { width: 22, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.10)' },
  heroCopy: { alignItems: 'center', gap: 5, paddingHorizontal: 4 },
  title: { color: '#FFF9F5', fontFamily: typography.display, fontSize: 40, lineHeight: 44, fontWeight: '500', letterSpacing: -1.1, textAlign: 'center' },
  titleDesktop: { fontSize: 50, lineHeight: 54 },
  subtitle: { color: '#B8A7BC', fontSize: 16, lineHeight: 22, textAlign: 'center' },
  worldPicker: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: 12 },
  worldGrid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  worldCard: { width: '100%', overflow: 'hidden', justifyContent: 'flex-end', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,.13)', backgroundColor: colors.elevated },
  worldCardFeatured: { aspectRatio: 1.2, maxHeight: 470 },
  worldCardCompact: { width: '48%', aspectRatio: .78, borderRadius: 17 },
  worldCardCompactDesktop: { width: '31.9%', aspectRatio: .9 },
  worldCardSelected: { borderColor: '#B960DD', borderWidth: 2, shadowColor: '#B960DD', shadowOpacity: .28, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  earlyAccessBadge: { position: 'absolute', zIndex: 2, top: 10, left: 10, minHeight: 27, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, borderRadius: 14, backgroundColor: 'rgba(12,8,17,.82)', borderWidth: 1, borderColor: 'rgba(235,137,255,.48)' },
  earlyAccessText: { color: '#FFF4FD', fontSize: 8, fontWeight: '900', letterSpacing: .75 },
  worldShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(7,5,10,.13)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(0deg, rgba(6,4,9,.97) 0%, rgba(6,4,9,.18) 55%, rgba(6,4,9,.03) 78%)' } as never) : {}) },
  selectionCheck: { position: 'absolute', top: 13, right: 13, width: 37, height: 37, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#A94FDC', borderWidth: 1, borderColor: 'rgba(255,255,255,.52)' },
  worldCopy: { zIndex: 1, gap: 5, padding: 22 },
  worldCopyCompact: { gap: 3, padding: 13 },
  recommended: { color: '#F0D9F1', fontSize: 12, lineHeight: 17, fontWeight: '700', marginBottom: 3 },
  worldName: { color: '#fff', fontFamily: typography.display, fontSize: 36, lineHeight: 40, textShadowColor: '#000', textShadowRadius: 12 },
  worldNameCompact: { fontSize: 23, lineHeight: 27 },
  worldGenre: { color: '#F0D9F1', fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase' },
  worldGenreCompact: { fontSize: 8, lineHeight: 11, letterSpacing: 1.4 },
  worldFantasy: { color: '#F4EAF2', fontSize: 14, lineHeight: 20, textShadowColor: '#000', textShadowRadius: 8 },
  worldFantasyCompact: { fontSize: 11, lineHeight: 15 },
  tabs: { flexDirection: 'row', alignSelf: 'center', width: '100%', maxWidth: 520, minHeight: 48, padding: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(187,97,216,.22)', backgroundColor: 'rgba(255,255,255,.025)' },
  tab: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  tabActive: { backgroundColor: 'rgba(178,79,210,.17)', borderWidth: 1, borderColor: 'rgba(201,110,224,.50)' },
  tabDisabled: { opacity: .42 },
  tabText: { color: '#A99CAB', fontSize: 12, fontWeight: '800' },
  tabTextActive: { color: '#FFF7FC' },
  peopleHeading: { zIndex: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  peopleLabel: { flex: 1, color: '#C9B9C8', fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1.4 },
  peopleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  person: { width: '48.4%', height: 275, overflow: 'hidden', justifyContent: 'flex-end', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,.10)', backgroundColor: colors.elevated },
  personDesktop: { width: '24.1%', height: 315 },
  personSelected: { borderColor: '#BA5DDB', borderWidth: 2, shadowColor: '#BA5DDB', shadowOpacity: .22, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 7 },
  personFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.plum },
  personInitial: { color: 'rgba(255,255,255,.18)', fontFamily: typography.display, fontSize: 90 },
  personShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,6,12,.15)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(0deg, rgba(6,4,9,.95), rgba(6,4,9,.03) 68%)' } as never) : {}) },
  personCheck: { position: 'absolute', top: 10, left: 10, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#A94FDC', borderWidth: 1, borderColor: 'rgba(255,255,255,.48)' },
  personCopy: { zIndex: 1, padding: 13 },
  personName: { color: '#fff', fontFamily: typography.display, fontSize: 23, lineHeight: 27, textShadowColor: '#000', textShadowRadius: 8 },
  personOccupation: { color: '#E6D9E5', fontSize: 10, lineHeight: 14, fontWeight: '700', marginTop: 2 },
  action: { width: '100%', maxWidth: 720, alignSelf: 'center', minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18, borderRadius: 19, borderWidth: 1, borderColor: '#C35FE0', backgroundColor: '#A64CCE', shadowColor: '#A64CCE', shadowOpacity: .25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  actionPressed: { backgroundColor: '#933DBA', transform: [{ scale: .994 }] },
  actionDisabled: { opacity: .42 },
  actionText: { maxWidth: '86%', color: '#FFF8FC', fontSize: 16, lineHeight: 21, fontWeight: '800' },
  reassurance: { color: '#8F818F', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: -8 },
  cardPressed: { opacity: .9, transform: [{ scale: .988 }] },
  emptyState: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 20, borderRadius: radius.lg },
  emptyTitle: { color: colors.text, fontWeight: '900', fontSize: 13, textAlign: 'center' },
  emptyBody: { color: colors.muted, fontSize: 10, textAlign: 'center' },
  showMore: { alignSelf: 'center', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 17, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderBright, backgroundColor: colors.surface },
  showMoreText: { color: colors.text, fontSize: 11, fontWeight: '900' },
  error: { color: '#FF9BA7', fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
