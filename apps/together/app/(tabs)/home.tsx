import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router as expoRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { EmptyState, GradientButton, MomentCarousel, Screen, resolveCharacterPortraitSource } from '../../src/components';
import { CinematicCompanionHero } from '../../src/components/home/CinematicCompanionHero';
import { FromCompanionSection } from '../../src/components/home/FromCompanionSection';
import { HomeHeader } from '../../src/components/home/HomeHeader';
import { HomeTimeline } from '../../src/components/home/HomeTimeline';
import { HomeWorldSection } from '../../src/components/home/HomeWorldSection';
import { colors, spacing, typography } from '../../src/theme';
import { useTogether } from '../../src/store/useTogether';
import { manageSubscription, markProactiveOpened, simulate } from '../../src/lib/api';
import { buildHomeViewModel, type HomeTargetAction, type HomeTimelineItem } from '../../src/lib/homeViewModel';
import { getCompanionMedia, getCurrentScenePresentation, getMemoryPresentation, getRelationshipPresentation, getWorldHook, selectFeaturedMemory } from '../../src/lib/homePresentation';
import { locationHeroAsset } from '../../src/assets';
import { selectPortraitVersion } from '../../src/lib/selectors';
import type { SubscriptionStatus } from '../../src/lib/subscription';
import type { Snapshot } from '../../src/types';

const router = expoRouter as unknown as { push: (href: string) => void };

export default function Home() {
  const { snapshot, loading, error, refresh } = useTogether();
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const { width } = useWindowDimensions();
  const hasSnapshot = Boolean(snapshot);
  const activeCompanionId=snapshot?.activeContinuity?.active_companion_instance_id??snapshot?.profile?.active_companion_instance_id;

  useEffect(() => {
    if (!hasSnapshot) return;
    let mounted = true;
    void manageSubscription<SubscriptionStatus>().then((next) => { if (mounted) setSubscription(next); }).catch(() => undefined);
    return () => { mounted = false; };
  }, [hasSnapshot]);

  const activeCompanion=snapshot?.characters.find((item)=>item.id===activeCompanionId);
  const simulationStale=!activeCompanion||Date.now()-new Date(activeCompanion.last_simulated_at).getTime()>2*60000||!(snapshot?.scheduleEvents??[]).some((item)=>item.character_instance_id===activeCompanionId&&new Date(item.ends_at)>new Date());
  useEffect(()=>{if(!activeCompanionId||!simulationStale)return;let cancelled=false;void simulate(activeCompanionId).then(()=>cancelled?undefined:refresh()).catch(()=>undefined);return()=>{cancelled=true;};},[activeCompanionId,refresh,simulationStale]);

  if (loading && !snapshot) return <CinematicHomeLoading />;
  if (error && !snapshot) return <HomeError message={error} onRetry={() => void refresh()} />;
  if (!snapshot) return <EmptyState title="Opening your world" body="Your companion and first conversation are being prepared automatically." />;

  const model = buildHomeViewModel(snapshot);
  if (!model) return <Screen contentStyle={styles.emptyLife}><EmptyState title={`Start ${snapshot.activePersona?.display_name ?? 'your'}'s Kivelle Life`} body="Meet an official companion or create someone original. This Life will keep its own relationships, memories, plans, and history." /><GradientButton label="Choose who to meet" onPress={() => router.push('/(tabs)/explore')} /></Screen>;

  const { companion } = model;
  const template = companion.together_character_templates;
  const handle = template.public_handle ?? template.slug;
  const portraitVersion = selectPortraitVersion(snapshot, companion);
  const portraitSource = resolveCharacterPortraitSource(template, portraitVersion, template.slug);
  const scene = getCurrentScenePresentation(model);
  const relationship = getRelationshipPresentation(snapshot, companion, model.relationshipDay);
  const memory = getMemoryPresentation(selectFeaturedMemory(snapshot, companion.id), template.name);
  const media = getCompanionMedia(snapshot, companion.id);
  const upcomingLocation = resolveUpcomingLocation(snapshot, model.upcoming.action) ?? model.currentLocation;
  const upcomingWorld = upcomingLocation ? snapshot.worlds.find((item) => item.id === upcomingLocation.world_id) : model.currentWorld;
  const nearbyMedia = media.find((item) => {
    const record = snapshot.generatedMedia?.find((entry) => entry.id === item.id);
    return record?.location_id === upcomingLocation?.id;
  });
  const upcomingSource = nearbyMedia ? { uri: nearbyMedia.thumbnailUrl ?? nearbyMedia.url } : locationHeroAsset(upcomingWorld?.slug, upcomingLocation?.slug);
  const timelineTitle = currentDaypart(snapshot) === 'evening' || currentDaypart(snapshot) === 'night' ? 'Tonight' : 'Today';
  const wideCards = width >= 760;

  const openCompanion = async (proactiveMessageId?: string) => {
    if (proactiveMessageId) await markProactiveOpened(proactiveMessageId).catch(() => undefined);
    router.push('/(tabs)/chat-tab');
  };
  const runAction = async (action: HomeTargetAction) => {
    if (action.kind === 'chat') return openCompanion(action.proactiveMessageId);
    if (action.kind === 'plan') return router.push(`/plan/${action.id}`);
    if (action.kind === 'date') return router.push(`/date/${action.id}`);
    router.push('/(tabs)/chat-tab?plan=1');
  };
  const openLocation = () => {
    if (model.currentLocation && model.currentWorld) return router.push(`/location/${model.currentLocation.slug}?world=${model.currentWorld.slug}`);
    router.push('/(tabs)/worlds');
  };
  const openTimelineItem = (item: HomeTimelineItem) => {
    if (item.kind === 'plan') return router.push(`/plan/${item.id.replace(/^plan:/, '')}`);
    if (item.kind === 'date') return router.push(`/date/${item.id.replace(/^date:/, '')}`);
    if (item.locationId) {
      const location = snapshot.locations.find((place) => place.id === item.locationId);
      const world = location ? snapshot.worlds.find((entry) => entry.id === location.world_id) : undefined;
      if (location && world) return router.push(`/location/${location.slug}?world=${world.slug}`);
    }
    if (item.kind === 'event') router.push('/(tabs)/chat-tab');
  };

  return <Screen contentStyle={styles.content}>
    <View pointerEvents="none" style={styles.ambientGlow} />
    <HomeHeader status={subscription} personaName={snapshot.activePersona?.display_name ?? snapshot.profile?.display_name ?? 'You'} onCredits={() => router.push('/subscription')} onProfile={() => router.push('/(tabs)/profile')} />
    <CinematicCompanionHero companion={companion} portraitVersion={portraitVersion} source={portraitSource} relationshipDay={model.relationshipDay} stage={model.hero.stage} eyebrow={scene.eyebrow} heading={scene.heading} activity={scene.activity} location={scene.location} quote={scene.quote} notice={model.hero.notice} onContinue={() => void runAction(model.hero.action)} onProfile={() => router.push(`/character/${handle}`)} onLocation={openLocation} />
    <FromCompanionSection name={template.name} items={media} fallbackSource={portraitSource} onViewAll={() => router.push('/(tabs)/moments')} onOpen={(item) => router.push(item.locked ? '/subscription' : `/media/${item.id}`)} onAsk={() => router.push(`/(tabs)/chat-tab?draft=${encodeURIComponent('Send me a photo from where you are.')}`)} />
    <HomeWorldSection wide={wideCards} upcoming={{ eyebrow: model.upcoming.eyebrow, title: model.upcoming.title, meta: model.upcoming.meta }} relationship={{ eyebrow: `YOU + ${template.name.toUpperCase()}`, title: relationship.headline, meta: relationship.detail }} hook={getWorldHook(model)} memory={memory} upcomingSource={upcomingSource} relationshipSource={portraitSource} onUpcoming={() => void runAction(model.upcoming.action)} onRelationship={() => router.push(`/character/${handle}`)} />
    <HomeTimeline title={timelineTitle} items={model.timeline} onViewWorld={() => router.push('/(tabs)/worlds')} onOpen={openTimelineItem} />
    {model.recentMoments.length ? <View style={styles.moments}><View style={styles.momentsTop}><Text accessibilityRole="header" style={styles.sectionTitle}>Recently shared</Text><Text onPress={() => router.push('/(tabs)/moments')} style={styles.sectionAction}>View all â†’</Text></View><MomentCarousel moments={model.recentMoments} characters={[companion]} portraitVersions={{ [companion.id]: portraitVersion }} onPress={(moment) => router.push(`/moment/${moment.id}`)} /></View> : null}
  </Screen>;
}

function resolveUpcomingLocation(snapshot: Snapshot, action: HomeTargetAction) {
  if (action.kind === 'plan') return snapshot.locations.find((item) => item.id === snapshot.sharedPlans.find((plan) => plan.id === action.id)?.location_id);
  if (action.kind === 'date') return snapshot.locations.find((item) => item.id === snapshot.dates.find((date) => date.id === action.id)?.together_date_templates.location_id);
  return undefined;
}

function currentDaypart(snapshot: Snapshot) {
  if (snapshot.currentPlaceContext?.clock.daypart) return snapshot.currentPlaceContext.clock.daypart.toLowerCase();
  const hour = new Date().getHours();
  return hour >= 18 ? 'evening' : hour < 6 ? 'night' : hour < 12 ? 'morning' : 'afternoon';
}

function CinematicHomeLoading() {
  return <Screen contentStyle={styles.content}><View style={styles.loadingHeader}><View style={styles.loadingBrand} /><View style={styles.loadingChip} /></View><View style={styles.loadingHero}><View style={styles.loadingGlow} /><View style={styles.loadingCopy}><View style={styles.loadingEyebrow} /><View style={styles.loadingTitle} /><View style={styles.loadingLine} /><View style={styles.loadingButton} /></View></View><View style={styles.loadingSectionTitle} /><View style={styles.loadingRail}>{[0, 1, 2].map((item) => <View key={item} style={styles.loadingMedia} />)}</View></Screen>;
}

function HomeError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <Screen contentStyle={styles.error}><View style={styles.errorIcon}><Sparkles size={22} color={colors.rose} /></View><Text style={styles.errorTitle}>Your world paused for a moment</Text><Text style={styles.errorCopy}>{message}</Text><GradientButton label="Try again" onPress={onRetry} /></Screen>;
}

const styles = StyleSheet.create({
  content: { position: 'relative', maxWidth: 1180, gap: 30, paddingTop: 14, paddingBottom: 154 },
  ambientGlow: { position: 'absolute', top: 80, left: '22%', width: '70%', height: 700, borderRadius: 500, backgroundColor: 'rgba(122,34,86,.045)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'radial-gradient(circle, rgba(191,55,119,.09), transparent 68%)' } as never) : {}) },
  emptyLife: { flex: 1, justifyContent: 'center', gap: spacing.lg },
  moments: { gap: 13 },
  momentsTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.text, fontFamily: typography.display, fontSize: 30, fontWeight: '600', letterSpacing: -.5 },
  sectionAction: { color: '#E8A2BA', fontSize: 12, fontWeight: '800' },
  loadingHeader: { height: 54, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  loadingBrand: { width: 132, height: 26, borderRadius: 8, backgroundColor: colors.surface },
  loadingChip: { width: 92, height: 38, borderRadius: 20, backgroundColor: colors.surface },
  loadingHero: { height: 590, borderRadius: 34, overflow: 'hidden', justifyContent: 'flex-end', padding: 23, backgroundColor: '#21131F' },
  loadingGlow: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(153,48,99,.08)' },
  loadingCopy: { gap: 12, maxWidth: 570 },
  loadingEyebrow: { width: 110, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,.14)' },
  loadingTitle: { width: '82%', height: 58, borderRadius: 14, backgroundColor: 'rgba(255,255,255,.12)' },
  loadingLine: { width: '58%', height: 17, borderRadius: 8, backgroundColor: 'rgba(255,255,255,.10)' },
  loadingButton: { width: 230, height: 54, borderRadius: 18, backgroundColor: 'rgba(232,82,137,.34)' },
  loadingSectionTitle: { width: 170, height: 31, borderRadius: 9, backgroundColor: colors.surface },
  loadingRail: { flexDirection: 'row', gap: 13, overflow: 'hidden' },
  loadingMedia: { width: 248, height: 322, borderRadius: 23, backgroundColor: colors.surface },
  error: { minHeight: '100%', alignItems: 'center', justifyContent: 'center', gap: 13 },
  errorIcon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(232,82,137,.10)' },
  errorTitle: { color: colors.text, fontFamily: typography.display, fontSize: 28, textAlign: 'center' },
  errorCopy: { maxWidth: 480, color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
});

