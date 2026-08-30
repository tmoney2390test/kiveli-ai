import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router as expoRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { EmptyState, GradientButton, MomentCarousel, Screen, resolveCharacterPortraitSource } from '../../src/components';
import { CinematicCompanionHero } from '../../src/components/home/CinematicCompanionHero';
import { FromCompanionSection } from '../../src/components/home/FromCompanionSection';
import { FeaturedCompanionsSection } from '../../src/components/home/FeaturedCompanionsSection';
import { HomeHeader } from '../../src/components/home/HomeHeader';
import { HomeTimeline } from '../../src/components/home/HomeTimeline';
import { HomeWorldSection } from '../../src/components/home/HomeWorldSection';
import { HomeWorldDiscoveryHero } from '../../src/components/home/HomeWorldDiscoveryHero';
import { AroundTownSection } from '../../src/components/home/AroundTownSection';
import { colors, spacing, typography } from '../../src/theme';
import { useTogether } from '../../src/store/useTogether';
import { markProactiveOpened, setCharacterFavorite, simulate } from '../../src/lib/api';
import { buildHomeViewModel, mostRecentHomeCompanion, type HomeTargetAction, type HomeTimelineItem } from '../../src/lib/homeViewModel';
import { getCompanionMedia, getMemoryPresentation, getRelationshipPresentation, getWorldHook, selectFeaturedMemory } from '../../src/lib/homePresentation';
import { locationHeroAsset } from '../../src/assets';
import { selectPortraitVersion } from '../../src/lib/selectors';
import { featuredCompanionsForWorld, type FeaturedCompanion } from '../../src/lib/featuredCompanions';
import { homeWorldDiscoveryOptions } from '../../src/lib/homeWorldDiscovery';
import type { Snapshot } from '../../src/types';
import { useSubscriptionStatus } from '../../src/hooks/useSubscriptionStatus';
import { useAppShell } from '../../src/shell/AppShellContext';
import { storyLibraryHomeAsset } from '../../src/stories/homeAsset';
import { useWorldPulse } from '../../src/hooks/useWorldPulse';
import { scheduleDeferredHomeWork } from '../../src/lib/homeDeferredWork';

const router = expoRouter as unknown as { push: (href: string) => void };

export default function Home() {
  const { snapshot, loading, error, refresh, browsedWorldId, setBrowsedWorldId, setCoreState } = useTogether();
  const { desktop } = useAppShell();
  const secondaryWorkReady=useDeferredHomeWork();
  const { data: subscription = null } = useSubscriptionStatus(Boolean(snapshot)&&secondaryWorkReady);
  const { width } = useWindowDimensions();
  const homeCompanion=snapshot?mostRecentHomeCompanion(snapshot):undefined;
  const homeCompanionId=homeCompanion?.id;
  const pulseWorldId=snapshot?(browsedWorldId??buildHomeViewModel(snapshot)?.currentWorld?.id??snapshot.worlds.find(world=>world.published)?.id):null;
  const {data:worldPulse}=useWorldPulse(pulseWorldId,Boolean(snapshot&&pulseWorldId&&secondaryWorkReady));

  const simulationStale=!homeCompanion||Date.now()-new Date(homeCompanion.last_simulated_at).getTime()>2*60000||!(snapshot?.scheduleEvents??[]).some((item)=>item.character_instance_id===homeCompanionId&&new Date(item.ends_at)>new Date());
  useEffect(()=>{if(!secondaryWorkReady||!homeCompanionId||!simulationStale)return;let cancelled=false;void simulate(homeCompanionId).then(()=>cancelled?undefined:refresh({scope:'presence',characterInstanceId:homeCompanionId})).catch(()=>undefined);return()=>{cancelled=true;};},[homeCompanionId,refresh,secondaryWorkReady,simulationStale]);

  if (loading && !snapshot) return <CinematicHomeLoading />;
  if (error && !snapshot) return <HomeError message={error} onRetry={() => void refresh()} />;
  if (!snapshot) return <EmptyState title="Opening your world" body="Your companion and first conversation are being prepared automatically." />;

  const publishedWorlds=snapshot.worlds.filter((world)=>world.published);
  const fallbackWorld=publishedWorlds.find((world)=>world.id===browsedWorldId)??publishedWorlds[0];
  const toggleFavorite = async (item: FeaturedCompanion, favorite: boolean) => {
    const previous = snapshot.favoriteCharacterTemplateIds ?? [];
    const optimistic = favorite ? [...new Set([...previous, item.id])] : previous.filter((id) => id !== item.id);
    setCoreState({ favoriteCharacterTemplateIds: optimistic });
    try {
      const result = await setCharacterFavorite(item.id, favorite, 'home_featured');
      setCoreState({ favoriteCharacterTemplateIds: result.favoriteCharacterTemplateIds });
    } catch (favoriteError) {
      setCoreState({ favoriteCharacterTemplateIds: previous });
      throw favoriteError;
    }
  };
  const model = buildHomeViewModel(snapshot);
  if (!model) {
    const featuredCompanions=fallbackWorld?featuredCompanionsForWorld(snapshot,fallbackWorld.id):[];
    return <Screen contentStyle={desktop?styles.contentDesktop:styles.content}>
      <View pointerEvents="none" style={styles.ambientGlow}/>
      {!desktop?<HomeHeader status={subscription} personaName={snapshot.activePersona?.display_name??snapshot.profile?.display_name??'You'} onCredits={()=>router.push('/subscription')} onProfile={()=>router.push('/settings')}/>:null}
      <View style={styles.emptyLife}><Text accessibilityRole="header" style={styles.emptyLifeTitle}>Start a conversation</Text><GradientButton label="Explore" onPress={()=>router.push('/(tabs)/explore')}/></View>
      {fallbackWorld?<FeaturedCompanionsSection companions={featuredCompanions} world={fallbackWorld} worlds={publishedWorlds} favoriteIds={snapshot.favoriteCharacterTemplateIds??[]} onOpen={(item)=>router.push(`/character/${item.public_handle??item.slug}`)} onViewAll={()=>{setBrowsedWorldId(fallbackWorld.id);router.push(`/(tabs)/singles?world=${fallbackWorld.slug}`);}} onSelectWorld={setBrowsedWorldId} onToggleFavorite={toggleFavorite}/>:null}
    </Screen>;
  }

  const { companion } = model;
  const template = companion.together_character_templates;
  const handle = template.public_handle ?? template.slug;
  const portraitVersion = selectPortraitVersion(snapshot, companion);
  const portraitSource = resolveCharacterPortraitSource(template, portraitVersion, template.slug);
  const selectedWorld = publishedWorlds.find((world) => world.id === browsedWorldId) ?? model.currentWorld ?? publishedWorlds[0];
  const featuredCompanions = selectedWorld ? featuredCompanionsForWorld(snapshot, selectedWorld.id, template.id) : [];
  const discoveryWorlds=homeWorldDiscoveryOptions(snapshot.worlds,model.currentWorld?.id);
  const relationship = getRelationshipPresentation(snapshot, companion, model.relationshipDay);
  const memoryInspector=snapshot.entitlements?.entitlement_keys?.includes('memory_inspector')===true;
  const rememberedCount=snapshot.memoryCounts?.[companion.id]??snapshot.memories.filter((item)=>item.character_instance_id===companion.id).length;
  const memory = !memoryInspector&&rememberedCount>0
    ? {eyebrow:`${template.name.toUpperCase()} REMEMBERS`,text:`${rememberedCount} saved ${rememberedCount===1?'detail':'details'} · unlock the Memory Center with Kivelle+`}
    : getMemoryPresentation(selectFeaturedMemory(snapshot, companion.id), template.name);
  const media = getCompanionMedia(snapshot, companion.id);
  const upcomingLocation = resolveUpcomingLocation(snapshot, model.upcoming.action) ?? model.currentLocation;
  const upcomingWorld = upcomingLocation ? snapshot.worlds.find((item) => item.id === upcomingLocation.world_id) : model.currentWorld;
  const nearbyMedia = media.find((item) => {
    const record = snapshot.generatedMedia?.find((entry) => entry.id === item.id);
    return record?.location_id === upcomingLocation?.id;
  });
  const upcomingSource = nearbyMedia ? { uri: nearbyMedia.thumbnailUrl ?? nearbyMedia.url } : locationHeroAsset(upcomingWorld?.slug, upcomingLocation?.slug);
  const companionFirstName = template.name.trim().split(/\s+/)[0] || template.name;
  const timelineTitle = `${companionFirstName}'s Day`;
  const wideCards = width >= 760;

  const openCompanion = async (proactiveMessageId?: string) => {
    if (proactiveMessageId) await markProactiveOpened(proactiveMessageId).catch(() => undefined);
    router.push(`/(tabs)/chat-tab?character=${encodeURIComponent(handle)}`);
  };
  const runAction = async (action: HomeTargetAction) => {
    if (action.kind === 'chat') return openCompanion(action.proactiveMessageId);
    if (action.kind === 'plan') return router.push(`/plan/${action.id}`);
    if (action.kind === 'date') return router.push(`/date/${action.id}`);
    router.push(`/(tabs)/chat-tab?character=${encodeURIComponent(handle)}&plan=1`);
  };
  const openTimelineItem = (item: HomeTimelineItem) => {
    if (item.kind === 'plan') return router.push(`/plan/${item.id.replace(/^plan:/, '')}`);
    if (item.kind === 'date') return router.push(`/date/${item.id.replace(/^date:/, '')}`);
    if (item.locationId) {
      const location = snapshot.locations.find((place) => place.id === item.locationId);
      const world = location ? snapshot.worlds.find((entry) => entry.id === location.world_id) : undefined;
      if (location && world) return router.push(`/location/${location.slug}?world=${world.slug}`);
    }
    if (item.kind === 'event') router.push(`/(tabs)/chat-tab?character=${encodeURIComponent(handle)}`);
  };
  return <Screen contentStyle={desktop ? styles.contentDesktop : styles.content}>
    <View pointerEvents="none" style={styles.ambientGlow} />
    {!desktop ? <HomeHeader status={subscription} personaName={snapshot.activePersona?.display_name ?? snapshot.profile?.display_name ?? 'You'} onCredits={() => router.push('/subscription')} onProfile={() => router.push('/settings')} /> : null}
    <View style={[styles.heroPair,width<860&&styles.heroPairStack]}>
      <View style={styles.heroPane}><CinematicCompanionHero companion={companion} portraitVersion={portraitVersion} source={portraitSource} location={model.currentLocation?.name} world={model.currentWorld?.name} onContinue={() => void openCompanion()} onProfile={() => router.push(`/character/${handle}`)} /></View>
      {discoveryWorlds.length?<View style={styles.heroPane}><HomeWorldDiscoveryHero worlds={discoveryWorlds} onExplore={(world)=>{setBrowsedWorldId(world.id);router.push(`/(tabs)/explore?world=${world.slug}`);}}/></View>:null}
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Open Kivelli Stories" onPress={()=>router.push('/stories' as never)} style={({pressed})=>[styles.storiesBanner,pressed&&{opacity:.9}]}>
      <Image source={storyLibraryHomeAsset} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" loading="lazy" priority="low"/>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill,styles.storiesShade]}/>
      <View style={styles.storiesCopy}><Text style={styles.storiesKicker}>KIVELLI STORIES · NEW</Text><Text style={styles.storiesTitle}>A night you can change—if you learn enough.</Text><Text style={styles.storiesText}>Enter a replayable Vespormoor mystery with its own clues, timeline, and endings.</Text><Text style={styles.storiesAction}>Open the archive →</Text></View>
    </Pressable>
    {secondaryWorkReady?<>
      {selectedWorld&&worldPulse?.worldId===selectedWorld.id?<AroundTownSection worldName={selectedWorld.name} items={worldPulse.items} onOpen={(item)=>{if(item.locationSlug)return router.push(`/location/${item.locationSlug}?world=${selectedWorld.slug}`);router.push(`/(tabs)/explore?world=${selectedWorld.slug}`);}}/>:null}
      {selectedWorld ? <FeaturedCompanionsSection companions={featuredCompanions} world={selectedWorld} worlds={publishedWorlds} favoriteIds={snapshot.favoriteCharacterTemplateIds ?? []} onOpen={(item) => router.push(`/character/${item.public_handle ?? item.slug}`)} onViewAll={() => { setBrowsedWorldId(selectedWorld.id); router.push(`/(tabs)/singles?world=${selectedWorld.slug}`); }} onSelectWorld={setBrowsedWorldId} onToggleFavorite={toggleFavorite} /> : null}
      <FromCompanionSection name={template.name} items={media} fallbackSource={portraitSource} onViewAll={() => router.push('/(tabs)/moments')} onOpen={(item) => router.push(item.locked ? '/subscription' : `/media/${item.id}`)} onAsk={() => router.push(`/(tabs)/chat-tab?character=${encodeURIComponent(handle)}&draft=${encodeURIComponent('Send me a photo from where you are.')}`)} />
      <HomeWorldSection wide={wideCards} upcoming={{ eyebrow: model.upcoming.eyebrow, title: model.upcoming.title, meta: model.upcoming.meta }} relationship={{ eyebrow: `YOU + ${template.name.toUpperCase()}`, title: relationship.headline, meta: relationship.detail }} hook={getWorldHook(model)} memory={memory} upcomingSource={upcomingSource} relationshipSource={portraitSource} onUpcoming={() => void runAction(model.upcoming.action)} onRelationship={() => router.push(`/character/${handle}`)} />
      <HomeTimeline title={timelineTitle} items={model.timeline} onViewWorld={() => router.push('/(tabs)/explore')} onOpen={openTimelineItem} />
      {model.recentMoments.length ? <View style={styles.moments}><View style={styles.momentsTop}><Text accessibilityRole="header" style={styles.sectionTitle}>Recently shared</Text><Text onPress={() => router.push('/(tabs)/moments')} style={styles.sectionAction}>View all →</Text></View><MomentCarousel moments={model.recentMoments} characters={[companion]} portraitVersions={{ [companion.id]: portraitVersion }} preserveImageDetails onPress={(moment) => router.push(`/moment/${moment.id}`)} /></View> : null}
    </>:<HomeSecondaryLoading/>}
  </Screen>;
}

function useDeferredHomeWork(){
  const[ready,setReady]=useState(false);
  useEffect(()=>scheduleDeferredHomeWork(()=>setReady(true)),[]);
  return ready;
}

function resolveUpcomingLocation(snapshot: Snapshot, action: HomeTargetAction) {
  if (action.kind === 'plan') return snapshot.locations.find((item) => item.id === snapshot.sharedPlans.find((plan) => plan.id === action.id)?.location_id);
  if (action.kind === 'date') return snapshot.locations.find((item) => item.id === snapshot.dates.find((date) => date.id === action.id)?.together_date_templates.location_id);
  return undefined;
}

function CinematicHomeLoading() {
  return <Screen contentStyle={styles.content}><View style={styles.loadingHeader}><View style={styles.loadingBrand} /><View style={styles.loadingChip} /></View><View style={styles.loadingHero}><View style={styles.loadingGlow} /><View style={styles.loadingCopy}><View style={styles.loadingEyebrow} /><View style={styles.loadingTitle} /><View style={styles.loadingLine} /><View style={styles.loadingButton} /></View></View><View style={styles.loadingSectionTitle} /><View style={styles.loadingRail}>{[0, 1, 2].map((item) => <View key={item} style={styles.loadingMedia} />)}</View></Screen>;
}

function HomeError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <Screen contentStyle={styles.error}><View style={styles.errorIcon}><Sparkles size={22} color={colors.rose} /></View><Text style={styles.errorTitle}>Your world paused for a moment</Text><Text style={styles.errorCopy}>{message}</Text><GradientButton label="Try again" onPress={onRetry} /></Screen>;
}

function HomeSecondaryLoading(){return <View accessibilityLabel="Loading more from your world" style={styles.secondaryLoading}><View style={styles.loadingSectionTitle}/><View style={styles.loadingRail}>{[0,1,2].map((item)=><View key={item} style={styles.loadingMedia}/>)}</View></View>;}

const styles = StyleSheet.create({
  content: { position: 'relative', maxWidth: 1180, gap: 30, paddingTop: 14, paddingBottom: 154 },
  contentDesktop: { position: 'relative', maxWidth: 1180, gap: 30, paddingTop: 24, paddingBottom: 48 },
  ambientGlow: { position: 'absolute', top: 80, left: '22%', width: '70%', height: 700, borderRadius: 500, backgroundColor: 'rgba(122,34,86,.045)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'radial-gradient(circle, rgba(191,55,119,.09), transparent 68%)' } as never) : {}) },
  heroPair:{flexDirection:'row',alignItems:'stretch',gap:14},
  heroPairStack:{flexDirection:'column'},
  heroPane:{flex:1,minWidth:0},
  storiesBanner:{minHeight:190,borderRadius:25,overflow:'hidden',borderWidth:1,borderColor:'rgba(103,215,193,.22)',justifyContent:'center'},
  storiesShade:{backgroundColor:'rgba(7,8,14,.74)'},
  storiesCopy:{padding:22,maxWidth:650,gap:5},
  storiesKicker:{color:'#78DCC8',fontSize:10,fontWeight:'900',letterSpacing:1.4},
  storiesTitle:{color:colors.text,fontFamily:typography.display,fontSize:27,lineHeight:32},
  storiesText:{color:'#B7B0BA',fontSize:13,lineHeight:19},
  storiesAction:{color:'#8EE6D5',fontSize:12,fontWeight:'900',marginTop:5},
  emptyLife: { gap: spacing.md, paddingVertical: spacing.lg },
  emptyLifeTitle: { color: colors.text, fontFamily: typography.display, fontSize: 36, lineHeight: 42, fontWeight: '600' },
  moments: { gap: 13 },
  momentsTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.text, fontFamily: typography.display, fontSize: 30, fontWeight: '600', letterSpacing: -.5 },
  sectionAction: { color: '#E8A2BA', fontSize: 12, fontWeight: '800' },
  loadingHeader: { height: 54, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  loadingBrand: { width: 132, height: 26, borderRadius: 8, backgroundColor: colors.surface },
  loadingChip: { width: 92, height: 38, borderRadius: 20, backgroundColor: colors.surface },
  loadingHero: { height: 320, borderRadius: 30, overflow: 'hidden', justifyContent: 'flex-end', padding: 19, backgroundColor: '#21131F' },
  loadingGlow: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(153,48,99,.08)' },
  loadingCopy: { gap: 12, maxWidth: 570 },
  loadingEyebrow: { width: 110, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,.14)' },
  loadingTitle: { width: '82%', height: 58, borderRadius: 14, backgroundColor: 'rgba(255,255,255,.12)' },
  loadingLine: { width: '58%', height: 17, borderRadius: 8, backgroundColor: 'rgba(255,255,255,.10)' },
  loadingButton: { width: 230, height: 54, borderRadius: 18, backgroundColor: 'rgba(232,82,137,.34)' },
  loadingSectionTitle: { width: 170, height: 31, borderRadius: 9, backgroundColor: colors.surface },
  loadingRail: { flexDirection: 'row', gap: 13, overflow: 'hidden' },
  loadingMedia: { width: 248, height: 322, borderRadius: 23, backgroundColor: colors.surface },
  secondaryLoading:{gap:13,minHeight:366,overflow:'hidden'},
  error: { minHeight: '100%', alignItems: 'center', justifyContent: 'center', gap: 13 },
  errorIcon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(232,82,137,.10)' },
  errorTitle: { color: colors.text, fontFamily: typography.display, fontSize: 28, textAlign: 'center' },
  errorCopy: { maxWidth: 480, color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
});

