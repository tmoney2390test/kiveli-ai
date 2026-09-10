import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Asset } from 'expo-asset';
import { router as expoRouter, useFocusEffect } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { EmptyState, GradientButton, Screen, resolveCharacterPortraitSource } from '../../src/components';
import { HomeCompanionCard } from '../../src/components/home/HomeCompanionCard';
import { HomeNextRow, HomeRecentSection } from '../../src/components/home/HomeCompactSections';
import { homeChatHref, homeNextItem, homeSharedItems, type HomeSharedItem } from '../../src/lib/compactHome';
import { navigateLocalRouteOnWeb } from '../../src/lib/appNavigation';
import { HomeFeaturedRail } from '../../src/components/home/HomeFeaturedRail';
import { CompanionWorldToggle } from '../../src/components/CompanionWorldToggle';
import { homeSnapshotForWorld } from '../../src/lib/homeFeatured';
import { characterResidentWorld } from '../../src/lib/place';
import { HomeHeader } from '../../src/components/home/HomeHeader';
import { colors, spacing, typography } from '../../src/theme';
import { useTogether } from '../../src/store/useTogether';
import { markProactiveOpened, setCharacterFavorite, simulate } from '../../src/lib/api';
import { buildHomeViewModel, mostRecentHomeCompanion, type HomeTargetAction } from '../../src/lib/homeViewModel';
import { selectPortraitVersion } from '../../src/lib/selectors';
import { type FeaturedCompanion } from '../../src/lib/featuredCompanions';
import { useSubscriptionStatus } from '../../src/hooks/useSubscriptionStatus';
import { useAppShell } from '../../src/shell/AppShellContext';
import { scheduleDeferredHomeWork } from '../../src/lib/homeDeferredWork';
import { uniqueHttpsImageUris } from '../../src/lib/imageWarmup';
import { subscriptionHref } from '../../src/lib/subscriptionPresentation';
import { useSurfaceReadyTiming } from '../../src/components/ClientPerformanceBridge';
import { useAuth } from '../../src/hooks/useAuth';
import { writeSessionHeroUri } from '../../src/lib/sessionSnapshotCache';

const router = expoRouter as unknown as { push: (href: string) => void };

export default function Home() {
  const {session}=useAuth();
  const { snapshot, loading, error, refresh, setBrowsedWorldId, setCoreState } = useTogether();
  const { desktop } = useAppShell();
  const secondaryWorkReady=useDeferredHomeWork();
  const { data: subscription = null } = useSubscriptionStatus(Boolean(snapshot)&&secondaryWorkReady);
  const analyticsEnabled=snapshot?.profile?.privacy_settings?.analytics!==false;
  const heroReady=useSurfaceReadyTiming('home','hero_image_ready',Boolean(snapshot&&analyticsEnabled));
  useEffect(()=>{
    if(!snapshot)return;
    const urls=uniqueHttpsImageUris((snapshot.generatedMedia??[]).filter((item)=>item.status==='ready'&&item.media_type==='image').sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).map((item)=>item.signed_url),3);
    if(!urls.length)return;
    const timer=setTimeout(()=>void Image.prefetch(urls,'memory-disk').catch(()=>undefined),1_600);
    return()=>clearTimeout(timer);
  },[snapshot]);
  const [chosenWorldId,setChosenWorldId]=useState<string|null>(null);
  const recentCompanion=snapshot?mostRecentHomeCompanion(snapshot):undefined;
  const selectedWorld=snapshot?.worlds.find(w=>w.published&&w.id===chosenWorldId)??snapshot?.worlds.find(w=>w.published&&w.id===recentCompanion?.scenario_state?.worldId)??(snapshot?characterResidentWorld(snapshot,recentCompanion):undefined)??snapshot?.worlds.find(w=>w.published);
  const homeSnapshot=snapshot?homeSnapshotForWorld(snapshot,selectedWorld?.id):undefined;
  const homeCompanion=homeSnapshot?mostRecentHomeCompanion(homeSnapshot):undefined;
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
  const homeModel=homeSnapshot?buildHomeViewModel(homeSnapshot):undefined;
  useFocusEffect(useCallback(() => { if(homeCompanionId) void refresh({scope:'presence',characterInstanceId:homeCompanionId}).catch(() => undefined); }, [homeCompanionId, refresh]));
  const simulationStale=!homeCompanion||Date.now()-new Date(homeCompanion.last_simulated_at).getTime()>2*60000||!(snapshot?.scheduleEvents??[]).some((item)=>item.character_instance_id===homeCompanionId&&new Date(item.ends_at)>new Date());
  useEffect(()=>{if(!secondaryWorkReady||!homeCompanionId||!simulationStale||homeCompanion?.scenario_state)return;let cancelled=false;void simulate(homeCompanionId).then(()=>cancelled?undefined:refresh({scope:'presence',characterInstanceId:homeCompanionId})).catch(()=>undefined);return()=>{cancelled=true;};},[homeCompanionId,homeCompanion?.scenario_state,refresh,secondaryWorkReady,simulationStale]);

  if (loading && !snapshot) return <CinematicHomeLoading />;
  if (error && !snapshot) return <HomeError message={error} onRetry={() => void refresh()} />;
  if (!snapshot) return <EmptyState title="Opening your world" body="Your companion and first conversation are being prepared automatically." />;

  const publishedWorlds=snapshot.worlds.filter((world)=>world.published);
  const chooseWorld=(id:string)=>{setChosenWorldId(id);setBrowsedWorldId(id);};
  const continuationHeading=<View style={styles.continueHeading}><Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.75} style={[styles.continueTitle,!desktop&&{fontSize:16}]}>Continue conversation</Text>{selectedWorld?<View style={styles.worldPicker}><CompanionWorldToggle worlds={publishedWorlds} value={selectedWorld.id} onChange={chooseWorld}/></View>:null}</View>;
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
    return <Screen contentStyle={desktop?styles.contentDesktop:styles.content}>
      <View pointerEvents="none" style={styles.ambientGlow}/>
      {!desktop?<HomeHeader status={subscription} personaName={snapshot.activePersona?.display_name??snapshot.profile?.display_name??'You'} onCredits={()=>router.push(subscriptionHref({intent:'credits'}) as never)} onProfile={()=>router.push('/settings')}/>:null}
      {continuationHeading}
      <View style={styles.emptyLife}><Text accessibilityRole="header" style={styles.emptyLifeTitle}>Meet someone in {selectedWorld?.name??'your world'}</Text><Text style={{color:colors.muted}}>Your next conversation starts here.</Text><GradientButton label="Explore companions" onPress={()=>router.push(`/(tabs)/singles${selectedWorld?`?world=${selectedWorld.slug}`:''}`)}/></View>
      <HomeFeaturedRail snapshot={snapshot} worldId={selectedWorld?.id} onOpen={(item)=>router.push(`/character/${item.public_handle??item.slug}`)} onViewAll={()=>router.push('/(tabs)/singles')} onToggleFavorite={toggleFavorite}/>
    </Screen>;
  }

  const { companion } = model;
  const template = companion.together_character_templates;
  const handle = template.public_handle ?? template.slug;
  const portraitVersion = startupPortraitVersion??selectPortraitVersion(snapshot, companion);
  const portraitSource = startupPortraitSource??resolveCharacterPortraitSource(template, portraitVersion, template.slug);
  const next = homeNextItem(model);
  const shared = homeSharedItems(snapshot, model);
  const navigate = (href: string) => { if (!navigateLocalRouteOnWeb(href)) router.push(href); };
  const openCompanion = (planning = false) => {
    if (!planning && model.message?.id) void markProactiveOpened(model.message.id).catch(() => undefined);
    navigate(homeChatHref(homeSnapshot!, model, planning));
  };
  const runAction = (action: HomeTargetAction) => {
    if (action.kind === 'plan') return navigate(`/plan/${action.id}`);
    if (action.kind === 'date') return navigate(`/date/${action.id}`);
    void openCompanion(action.kind === 'plan-create');
  };
  const openShared = (entry: HomeSharedItem) => {
    if (entry.kind === 'moment') return navigate(`/moment/${entry.item.id}`);
    navigate(entry.item.locked ? subscriptionHref({intent:'generated_media'}) : `/media/${entry.item.id}`);
  };
  return <Screen contentStyle={desktop ? styles.contentDesktop : styles.content}>
    <View pointerEvents="none" style={styles.ambientGlow} />
    {!desktop?<HomeHeader status={subscription} personaName={snapshot.activePersona?.display_name ?? snapshot.profile?.display_name ?? 'You'} onCredits={() => router.push(subscriptionHref({intent:'credits'}))} onProfile={() => router.push('/settings')} />:null}
    {continuationHeading}
    <HomeCompanionCard companion={companion} portraitVersion={portraitVersion} source={portraitSource} location={model.currentLocation?.name} world={model.currentWorld?.name} prompt={model.message?.content || model.hero.prompt} notice={model.message ? 'NEW MESSAGE' : undefined} relationship={snapshot.relationshipCues?.[companion.id]?.tone === 'tense' ? 'Needs attention' : model.hero.stage} onContinue={() => void openCompanion()} onProfile={() => navigate(`/character/${handle}`)} onVisualReady={heroReady} />
    <HomeNextRow next={next} onOpen={() => next.kind === 'scenario' ? void openCompanion() : next.kind === 'planning' ? void openCompanion(true) : runAction(model.upcoming.action)} onPlan={() => void openCompanion(true)} />
    {secondaryWorkReady ? <>
      <HomeFeaturedRail snapshot={snapshot} worldId={selectedWorld?.id} activeTemplateId={template.id} onOpen={item=>navigate(`/character/${item.public_handle??item.slug}`)} onViewAll={()=>navigate('/(tabs)/singles')} onToggleFavorite={toggleFavorite}/>
      <HomeRecentSection items={shared} onOpen={openShared} onViewAll={() => navigate('/(tabs)/moments')} />
    </> : <HomeSecondaryLoading />}
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
  content: { position: 'relative', maxWidth: 1100, gap: 18, paddingTop: 14, paddingBottom: 120 },
  contentDesktop: { position: 'relative', maxWidth: 1100, gap: 18, paddingTop: 24, paddingBottom: 48 },
  continueHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,minHeight:48},
  continueTitle:{flex:1,minWidth:0,color:colors.text,fontFamily:typography.display,fontSize:25,fontWeight:'600'},
  worldPicker:{maxWidth:'45%',flexShrink:1},
  ambientGlow: { position: 'absolute', top: 80, left: '22%', width: '70%', height: 700, borderRadius: 500, backgroundColor: 'rgba(122,34,86,.045)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'radial-gradient(circle, rgba(191,55,119,.09), transparent 68%)' } as never) : {}) },
  emptyLife: { gap: spacing.md, paddingVertical: spacing.lg },
  emptyLifeTitle: { color: colors.text, fontFamily: typography.display, fontSize: 36, lineHeight: 42, fontWeight: '600' },
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

