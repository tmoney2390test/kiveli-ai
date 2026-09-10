import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Asset } from 'expo-asset';
import { router as expoRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { EmptyState, GradientButton, MomentCarousel, Screen, resolveCharacterPortraitSource } from '../../src/components';
import { CinematicCompanionHero } from '../../src/components/home/CinematicCompanionHero';
import { FeaturedCompanionsSection } from '../../src/components/home/FeaturedCompanionsSection';
import { HomeHeader } from '../../src/components/home/HomeHeader';
import { HomeWorldDiscoveryHero } from '../../src/components/home/HomeWorldDiscoveryHero';
import { AroundTownSection } from '../../src/components/home/AroundTownSection';
import { colors, spacing, typography } from '../../src/theme';
import { useTogether } from '../../src/store/useTogether';
import { loadExploreCatalog, markProactiveOpened, setCharacterFavorite, simulate } from '../../src/lib/api';
import { buildHomeViewModel, mostRecentHomeCompanion, type HomeTargetAction } from '../../src/lib/homeViewModel';
import { getHomeWorldScopes } from '../../src/lib/homePresentation';
import { selectPortraitVersion } from '../../src/lib/selectors';
import { featuredCompanionsForWorld, type FeaturedCompanion } from '../../src/lib/featuredCompanions';
import { homeWorldDiscoveryOptions } from '../../src/lib/homeWorldDiscovery';
import { useSubscriptionStatus } from '../../src/hooks/useSubscriptionStatus';
import { useAppShell } from '../../src/shell/AppShellContext';
import { useWorldPulse } from '../../src/hooks/useWorldPulse';
import { scheduleDeferredHomeWork } from '../../src/lib/homeDeferredWork';
import { uniqueHttpsImageUris } from '../../src/lib/imageWarmup';
import { subscriptionHref } from '../../src/lib/subscriptionPresentation';
import { useSurfaceReadyTiming } from '../../src/components/ClientPerformanceBridge';
import { useAuth } from '../../src/hooks/useAuth';
import { writeSessionHeroUri } from '../../src/lib/sessionSnapshotCache';

const router = expoRouter as unknown as { push: (href: string) => void };

export default function Home() {
  const {session}=useAuth();
  const { snapshot, loading, error, refresh, browsedWorldId, setBrowsedWorldId, setCoreState } = useTogether();
  const { desktop } = useAppShell();
  const secondaryWorkReady=useDeferredHomeWork();
  const { data: subscription = null } = useSubscriptionStatus(Boolean(snapshot)&&secondaryWorkReady);
  const { width } = useWindowDimensions();
  const analyticsEnabled=snapshot?.profile?.privacy_settings?.analytics!==false;
  const heroReady=useSurfaceReadyTiming('home','hero_image_ready',Boolean(snapshot&&analyticsEnabled));
  useEffect(()=>{
    if(!snapshot)return;
    const urls=uniqueHttpsImageUris((snapshot.generatedMedia??[]).filter((item)=>item.status==='ready'&&item.media_type==='image').sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).map((item)=>item.signed_url),3);
    if(!urls.length)return;
    const timer=setTimeout(()=>void Image.prefetch(urls,'memory-disk').catch(()=>undefined),1_600);
    return()=>clearTimeout(timer);
  },[snapshot]);
  useEffect(()=>{
    if(!snapshot||snapshot.discoverableCharacters.length>=100)return;
    let cancelled=false;
    const timer=setTimeout(()=>{void loadExploreCatalog().then((catalog)=>{
      if(cancelled)return;
      setCoreState({worlds:catalog.worlds,locations:catalog.locations,characterWorldPresence:catalog.characterWorldPresence,discoverableCharacters:catalog.discoverableCharacters,favoriteCharacterTemplateIds:catalog.favoriteCharacterTemplateIds,lifeEvents:catalog.lifeEvents});
    }).catch(()=>undefined);},1_600);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[setCoreState,snapshot]);
  const homeCompanion=snapshot?mostRecentHomeCompanion(snapshot):undefined;
  const startupPortraitVersion=snapshot&&homeCompanion?selectPortraitVersion(snapshot,homeCompanion):undefined;
  const startupPortraitSource=homeCompanion&&startupPortraitVersion?resolveCharacterPortraitSource(homeCompanion.together_character_templates,startupPortraitVersion,homeCompanion.together_character_templates.slug):undefined;
  useEffect(()=>{
    if(Platform.OS!=='web'||!session?.user.id||!startupPortraitSource)return;
    const uri=typeof startupPortraitSource==='number'
      ? Asset.fromModule(startupPortraitSource).uri
      : Array.isArray(startupPortraitSource)
        ? startupPortraitSource.find((item)=>typeof item?.uri==='string')?.uri
        : startupPortraitSource.uri;
    if(uri)writeSessionHeroUri(session.user.id,uri);
  },[session?.user.id,startupPortraitSource]);
  const homeCompanionId=homeCompanion?.id;
  const homeModel=snapshot?buildHomeViewModel(snapshot):undefined;
  const pulseWorldId=homeModel?.currentWorld?.id??null;
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
  const model = homeModel;
  if (!model) {
    const featuredCompanions=fallbackWorld?featuredCompanionsForWorld(snapshot,fallbackWorld.id):[];
    return <Screen contentStyle={desktop?styles.contentDesktop:styles.content}>
      <View pointerEvents="none" style={styles.ambientGlow}/>
      {!desktop?<HomeHeader status={subscription} personaName={snapshot.activePersona?.display_name??snapshot.profile?.display_name??'You'} onCredits={()=>router.push(subscriptionHref({intent:'credits'}) as never)} onProfile={()=>router.push('/settings')}/>:null}
      <View style={styles.emptyLife}><Text accessibilityRole="header" style={styles.emptyLifeTitle}>Start a conversation</Text><GradientButton label="Explore" onPress={()=>router.push('/(tabs)/explore')}/></View>
      {fallbackWorld?<FeaturedCompanionsSection companions={featuredCompanions} world={fallbackWorld} favoriteIds={snapshot.favoriteCharacterTemplateIds??[]} onOpen={(item)=>router.push(`/character/${item.public_handle??item.slug}`)} onViewAll={()=>{setBrowsedWorldId(fallbackWorld.id);router.push(`/(tabs)/singles?world=${fallbackWorld.slug}`);}} onToggleFavorite={toggleFavorite}/>:null}
    </Screen>;
  }

  const { companion } = model;
  const template = companion.together_character_templates;
  const handle = template.public_handle ?? template.slug;
  const portraitVersion = startupPortraitVersion??selectPortraitVersion(snapshot, companion);
  const portraitSource = startupPortraitSource??resolveCharacterPortraitSource(template, portraitVersion, template.slug);
  const { pulseWorld, selectedWorld } = getHomeWorldScopes(model, publishedWorlds, browsedWorldId);
  const featuredCompanions = selectedWorld ? featuredCompanionsForWorld(snapshot, selectedWorld.id, template.id) : [];
  const discoveryWorlds=homeWorldDiscoveryOptions(snapshot.worlds,model.currentWorld?.id);
  const topStageWide=width>=900;

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
  return <Screen contentStyle={desktop ? styles.contentDesktop : styles.content}>
    <View pointerEvents="none" style={styles.ambientGlow} />
    {!desktop ? <HomeHeader status={subscription} personaName={snapshot.activePersona?.display_name ?? snapshot.profile?.display_name ?? 'You'} onCredits={() => router.push(subscriptionHref({intent:'credits'}) as never)} onProfile={() => router.push('/settings')} /> : null}
    <View style={[styles.topStage,!topStageWide&&styles.topStageStack]}>
      <View style={styles.companionHeroPane}><CinematicCompanionHero companion={companion} portraitVersion={portraitVersion} source={portraitSource} location={model.currentLocation?.name} world={model.currentWorld?.name} actionLabel={model.hero.action.label} notice={model.hero.notice} prompt={model.message?.content ? `“${model.message.content}”` : model.hero.prompt} onContinue={() => void runAction(model.hero.action)} onProfile={() => router.push(`/character/${handle}`)} onVisualReady={heroReady}/></View>
      {discoveryWorlds.length?<View style={[styles.worldDiscoveryPane,!topStageWide&&styles.worldDiscoveryPaneStack]}><HomeWorldDiscoveryHero fill={topStageWide} worlds={discoveryWorlds} onExplore={(world)=>{setBrowsedWorldId(world.id);router.push(`/(tabs)/explore?world=${world.slug}`);}}/></View>:null}
    </View>
    {secondaryWorkReady?<>
      {model.recentMoments.length ? <View style={styles.moments}><View style={styles.momentsTop}><Text accessibilityRole="header" style={styles.sectionTitle}>Recently shared</Text><Pressable accessibilityRole="button" accessibilityLabel="View all recently shared moments" hitSlop={6} onPress={() => router.push('/(tabs)/moments')} style={({pressed})=>[styles.sectionActionButton,pressed&&styles.sectionActionPressed]}><Text style={styles.sectionAction}>View all →</Text></Pressable></View><MomentCarousel moments={model.recentMoments} characters={[companion]} portraitVersions={{ [companion.id]: portraitVersion }} preserveImageDetails onPress={(moment) => router.push(`/moment/${moment.id}`)} /></View> : null}
      {pulseWorld&&worldPulse?.worldId===pulseWorld.id?<AroundTownSection worldName={pulseWorld.name} items={worldPulse.items.slice(0,5)} onOpen={(item)=>{if(item.locationSlug)return router.push(`/location/${item.locationSlug}?world=${pulseWorld.slug}`);router.push(`/(tabs)/explore?world=${pulseWorld.slug}`);}}/>:null}
      {selectedWorld ? <FeaturedCompanionsSection companions={featuredCompanions} world={selectedWorld} favoriteIds={snapshot.favoriteCharacterTemplateIds ?? []} onOpen={(item) => router.push(`/character/${item.public_handle ?? item.slug}`)} onViewAll={() => { setBrowsedWorldId(selectedWorld.id); router.push(`/(tabs)/singles?world=${selectedWorld.slug}`); }} onToggleFavorite={toggleFavorite} /> : null}
    </>:<HomeSecondaryLoading/>}
  </Screen>;
}

function useDeferredHomeWork(){
  const[ready,setReady]=useState(false);
  useEffect(()=>scheduleDeferredHomeWork(()=>setReady(true)),[]);
  return ready;
}

function CinematicHomeLoading() {
  return <Screen contentStyle={styles.content}><View style={styles.loadingHeader}><View style={styles.loadingBrand} /><View style={styles.loadingChip} /></View><View style={styles.loadingHero}><View style={styles.loadingGlow} /><View style={styles.loadingCopy}><View style={styles.loadingEyebrow} /><View style={styles.loadingTitle} /><View style={styles.loadingLine} /><View style={styles.loadingButton} /></View></View><View style={styles.loadingSectionTitle} /><View style={styles.loadingRail}>{[0, 1, 2].map((item) => <View key={item} style={styles.loadingMedia} />)}</View></Screen>;
}

function HomeError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <Screen contentStyle={styles.error}><View style={styles.errorIcon}><Sparkles size={22} color={colors.rose} /></View><Text style={styles.errorTitle}>Your world paused for a moment</Text><Text style={styles.errorCopy}>{message}</Text><GradientButton label="Try again" onPress={onRetry} /></Screen>;
}

function HomeSecondaryLoading(){return <View accessibilityLabel="Loading more from your world" style={styles.secondaryLoading}><View style={styles.loadingSectionTitle}/><View style={styles.loadingRail}>{[0,1,2].map((item)=><View key={item} style={styles.loadingMedia}/>)}</View></View>;}

const styles = StyleSheet.create({
  content: { position: 'relative', maxWidth: 1180, gap: 30, paddingTop: 14, paddingBottom: 176 },
  contentDesktop: { position: 'relative', maxWidth: 1180, gap: 30, paddingTop: 24, paddingBottom: 48 },
  ambientGlow: { position: 'absolute', top: 80, left: '22%', width: '70%', height: 700, borderRadius: 500, backgroundColor: 'rgba(122,34,86,.045)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'radial-gradient(circle, rgba(191,55,119,.09), transparent 68%)' } as never) : {}) },
  topStage:{flexDirection:'row',alignItems:'stretch',gap:14},
  topStageStack:{flexDirection:'column'},
  companionHeroPane:{flex:1.7,minWidth:0},
  worldDiscoveryPane:{flex:1,minWidth:300},
  worldDiscoveryPaneStack:{minWidth:0},
  emptyLife: { gap: spacing.md, paddingVertical: spacing.lg },
  emptyLifeTitle: { color: colors.text, fontFamily: typography.display, fontSize: 36, lineHeight: 42, fontWeight: '600' },
  moments: { gap: 13 },
  momentsTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.text, fontFamily: typography.display, fontSize: 30, fontWeight: '600', letterSpacing: -.5 },
  sectionAction: { color: '#E8A2BA', fontSize: 12, fontWeight: '800' },
  sectionActionButton:{minWidth:70,minHeight:44,alignItems:'flex-end',justifyContent:'center',paddingLeft:10},
  sectionActionPressed:{opacity:.68},
  loadingHeader: { height: 54, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  loadingBrand: { width: 132, height: 26, borderRadius: 8, backgroundColor: colors.surface },
  loadingChip: { width: 94, height: 44, borderRadius: 22, backgroundColor: colors.surface },
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

