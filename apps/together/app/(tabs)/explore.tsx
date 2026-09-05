import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode,type RefObject} from'react';
import{AccessibilityInfo,ActivityIndicator,Modal,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View,useWindowDimensions,type StyleProp,type ViewStyle}from'react-native';
import{Image}from'expo-image';
import{router,useFocusEffect,useLocalSearchParams}from'expo-router';
import{AlertCircle,Check,ChevronDown,ChevronLeft,ChevronRight,Clock3,MapPin,Search,Sparkles,UsersRound,X}from'lucide-react-native';
import{useSafeAreaInsets}from'react-native-safe-area-context';
import{EmptyState,LoadingSkeleton,PlaceCategoryFilters,Screen}from'../../src/components';
import{CompanionPortraitCard}from'../../src/components/CompanionPortraitCard';
import{useCompanionGenderPreference}from'../../src/components/CompanionGenderToggle';
import{locationHeroAsset,worldHeroAsset}from'../../src/assets';
import{colors,radius}from'../../src/theme';
import{useTogether}from'../../src/store/useTogether';
import{loadExploreCatalog,setCharacterFavorite}from'../../src/lib/api';
import{activeCompanion}from'../../src/lib/companionLife';
import{characterCanPlanInWorld,characterResidentWorld}from'../../src/lib/place';
import{buildExploreContext,exploreCompanionBadge,exploreEventStatus,locationsForExploreCategory,type ExploreCategoryId}from'../../src/lib/explore';
import{mergeExplorePreference,readExplorePreference,writeExplorePreference,type ExploreIntent,type ExplorePreference}from'../../src/lib/explorePreference';
import{responsivePlaceGrid}from'../../src/lib/responsivePlaceGrid';
import{useAppShell}from'../../src/shell/AppShellContext';
import type{FeaturedCompanion}from'../../src/lib/featuredCompanions';
import type{Location,Snapshot,World}from'../../src/types';
import{KIVELLI_IMAGE_PLACEHOLDER}from'../../src/lib/imageWarmup';
import{useSurfaceReadyTiming}from'../../src/components/ClientPerformanceBridge';
import{naturalizeCharacterEventSummary,naturalizeCharacterEventTitle}from'@together/domain/src/character-language';
import{updateLocalRouteParamsOnWeb}from'../../src/lib/appNavigation';
import{EXPLORE_VISIBLE_INTENTS,exploreResponsiveLayout,normalizeVisibleExploreIntent}from'../../src/lib/exploreLayout';

const nav={
  push:(href:string)=>router.push(href as never),
  setParams:(params:Record<string,string>)=>{if(!updateLocalRouteParamsOnWeb(params))router.setParams(params);},
};
const EMPTY_FAVORITE_IDS:string[]=[];
const EXPLORE_REFRESH_TTL=10*60*1000;
const DEFAULT_PREFERENCE:ExplorePreference={worldSlug:null,intent:'for_you',scrollY:0};
const intentIcons:Record<Exclude<ExploreIntent,'worlds'>,typeof Sparkles>={for_you:Sparkles,tonight:Clock3,people:UsersRound,places:MapPin};
const intents=EXPLORE_VISIBLE_INTENTS.map((item)=>({...item,icon:intentIcons[item.id]}));
let lastExploreCatalogRefreshAt=0;

export default function Explore(){
  const{width}=useWindowDimensions();
  const insets=useSafeAreaInsets();
  const{desktop,sidebarWidth}=useAppShell();
  const params=useLocalSearchParams<{world?:string}>();
  const{snapshot,browsedWorldId,setBrowsedWorldId,setCoreState}=useTogether();
  const[gender]=useCompanionGenderPreference();
  const heroReady=useSurfaceReadyTiming('explore','hero_image_ready',Boolean(snapshot&&snapshot.profile?.privacy_settings?.analytics!==false));
  const[worldPickerOpen,setWorldPickerOpen]=useState(false);
  const[category,setCategory]=useState<ExploreCategoryId|null>(null);
  const[query,setQuery]=useState('');
  const[preference,setPreference]=useState<ExplorePreference>(DEFAULT_PREFERENCE);
  const[preferenceReady,setPreferenceReady]=useState(false);
  const[locationLimit,setLocationLimit]=useState(4);
  const[refreshing,setRefreshing]=useState(false);
  const[refreshError,setRefreshError]=useState('');
  const[notice,setNotice]=useState('');
  const[reducedMotion,setReducedMotion]=useState(false);
  const[filterScrollX,setFilterScrollX]=useState(0);
  const[filterViewportWidth,setFilterViewportWidth]=useState(0);
  const[filterContentWidth,setFilterContentWidth]=useState(0);
  const scrollRef=useRef<ScrollView>(null);
  const worldSelectorRef=useRef<View|null>(null);
  const restoredScroll=useRef(false);
  const persistenceTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const preferenceScope=snapshot?.activeContinuity?.id??'default';
  const worlds=useMemo(()=>snapshot?.worlds.filter((item)=>item.published).sort((a,b)=>a.sort_order-b.sort_order)??[],[snapshot?.worlds]);
  const companion=snapshot?activeCompanion(snapshot):undefined;
  const companionWorld=snapshot&&companion?characterResidentWorld(snapshot,companion):undefined;
  const requestedWorld=worlds.find((item)=>item.slug===params.world);
  const preferredWorld=worlds.find((item)=>item.slug===preference.worldSlug);
  const selectedWorld=requestedWorld??preferredWorld??worlds.find((item)=>item.id===browsedWorldId)??companionWorld??worlds[0];

  useEffect(()=>{
    let active=true;
    setPreferenceReady(false);
    restoredScroll.current=false;
    void readExplorePreference(preferenceScope).then((saved)=>{if(active){const intent=normalizeVisibleExploreIntent(saved.intent),next={...saved,intent};setPreference(next);setPreferenceReady(true);if(intent!==saved.intent)void writeExplorePreference(preferenceScope,next).catch(()=>undefined);}});
    return()=>{active=false;};
  },[preferenceScope]);
  useEffect(()=>{if(requestedWorld&&requestedWorld.id!==browsedWorldId)setBrowsedWorldId(requestedWorld.id);},[requestedWorld?.id,browsedWorldId,setBrowsedWorldId]);
  useEffect(()=>{if(!requestedWorld&&preferenceReady&&preferredWorld&&preferredWorld.id!==browsedWorldId)setBrowsedWorldId(preferredWorld.id);},[browsedWorldId,preferenceReady,preferredWorld?.id,requestedWorld?.id,setBrowsedWorldId]);
  useEffect(()=>{if(!browsedWorldId&&selectedWorld)setBrowsedWorldId(selectedWorld.id);},[selectedWorld?.id,browsedWorldId,setBrowsedWorldId]);
  useEffect(()=>{setCategory(null);setLocationLimit(4);},[selectedWorld?.id]);
  useEffect(()=>()=>{if(persistenceTimer.current)clearTimeout(persistenceTimer.current);},[]);
  useEffect(()=>{let active=true;void AccessibilityInfo.isReduceMotionEnabled().then((value)=>{if(active)setReducedMotion(value);});const subscription=AccessibilityInfo.addEventListener('reduceMotionChanged',setReducedMotion);return()=>{active=false;subscription.remove();};},[]);

  const refreshCatalog=useCallback(async(force=false)=>{
    if(!snapshot||(!force&&Date.now()-lastExploreCatalogRefreshAt<EXPLORE_REFRESH_TTL))return;
    setRefreshing(true);setRefreshError('');
    try{
      const result=await loadExploreCatalog();
      setCoreState({worlds:result.worlds,locations:result.locations,characterWorldPresence:result.characterWorldPresence,discoverableCharacters:result.discoverableCharacters,favoriteCharacterTemplateIds:result.favoriteCharacterTemplateIds,lifeEvents:result.lifeEvents});
      lastExploreCatalogRefreshAt=Date.now();
    }catch{setRefreshError('Explore could not refresh. Showing your saved people and places.');}
    finally{setRefreshing(false);}
  },[setCoreState,snapshot]);
  useFocusEffect(useCallback(()=>{void refreshCatalog();},[refreshCatalog]));

  const persistPreference=useCallback((patch:Partial<ExplorePreference>)=>{
    setPreference((current)=>{const next=mergeExplorePreference(current,patch);void writeExplorePreference(preferenceScope,next).catch(()=>undefined);return next;});
  },[preferenceScope]);
  const handleScroll=useCallback((event:{nativeEvent:{contentOffset:{y:number}}})=>{
    const y=Math.max(0,event.nativeEvent.contentOffset.y);
    if(persistenceTimer.current)clearTimeout(persistenceTimer.current);
    persistenceTimer.current=setTimeout(()=>persistPreference({scrollY:y}),220);
  },[persistPreference]);
  const restoreSavedScroll=useCallback((_width:number,height:number)=>{
    if(!preferenceReady||restoredScroll.current||height<preference.scrollY+120)return;
    restoredScroll.current=true;
    if(preference.scrollY>0)scrollRef.current?.scrollTo({y:preference.scrollY,animated:false});
  },[preference.scrollY,preferenceReady]);

  if(!snapshot)return <LoadingSkeleton label="Opening Explore…"/>;
  if(!selectedWorld)return <EmptyState title="Worlds are being prepared" body="Explore will fill in as worlds become available."/>;

  const localCompanion=characterCanPlanInWorld(snapshot,companion,selectedWorld.id)?companion:undefined;
  const context=buildExploreContext(snapshot,localCompanion,selectedWorld.id,{gender,limit:80});
  const normalizedQuery=query.trim().toLowerCase();
  const searching=Boolean(normalizedQuery);
  const matchingPeople=searching?context.people.filter((person)=>matchesSearch(normalizedQuery,person.name,person.occupation,person.biography,...(person.together_character_versions.interests??[]))):context.people;
  const baseLocations=category?locationsForExploreCategory(context.locations,category):context.featuredLocations;
  const matchingLocations=searching?context.locations.filter((location)=>matchesSearch(normalizedQuery,location.name,location.category,location.description,...location.possible_activities)):baseLocations;
  const matchingWorlds=searching?worlds.filter((world)=>matchesSearch(normalizedQuery,world.name,world.description,worldRole(world))):worlds.filter((world)=>world.id!==selectedWorld.id);
  const visibleLocations=matchingLocations.slice(0,desktop?6:locationLimit);
  const visiblePeople=matchingPeople.slice(0,searching?12:6);
  const isCurrentWorld=companionWorld?.id===selectedWorld.id;
  const discussionHandle=companion?.id;
  const peopleCardWidth=desktop?344:width>=700?300:Math.min(292,Math.max(252,Math.round(width*.78)));
  const peopleCardHeight=desktop?390:Math.max(308,Math.min(340,Math.round(peopleCardWidth*1.14)));
  const placeGrid=responsivePlaceGrid({viewportWidth:width,sidebarWidth:desktop?sidebarWidth:0,outerPadding:desktop?64:40,gap:10});
  const placeCardWidth=placeGrid.cardWidth;
  const placeCardHeight=!desktop&&placeGrid.columns===2?placeCardWidth:Math.max(175,Math.min(220,Math.round(placeCardWidth*.66)));
  const selectedIntent=preference.intent;
  const showRecommendations=!searching&&(selectedIntent==='for_you'||selectedIntent==='tonight');
  const showEvents=!searching&&(selectedIntent==='for_you'||selectedIntent==='tonight');
  const showPeople=searching?matchingPeople.length>0:selectedIntent==='for_you'||selectedIntent==='people';
  const showPlaces=searching?matchingLocations.length>0:selectedIntent==='for_you'||selectedIntent==='tonight'||selectedIntent==='places';
  const hasActiveWorldEvent=context.worldEvents.some((event)=>exploreEventStatus(event)==='HAPPENING NOW');
  const noSearchResults=searching&&!matchingPeople.length&&!matchingLocations.length&&!matchingWorlds.length;
  const responsive=exploreResponsiveLayout(width,desktop,insets.bottom);
  const filterCanScrollForward=filterContentWidth-filterViewportWidth-filterScrollX>4;
  const openLocation=(location:Location)=>nav.push(`/location/${location.slug}?world=${selectedWorld.slug}`);
  const chooseWorld=(world:World)=>{
    setBrowsedWorldId(world.id);setWorldPickerOpen(false);setCategory(null);setQuery('');setLocationLimit(4);
    persistPreference({worldSlug:world.slug,scrollY:0});
    scrollRef.current?.scrollTo({y:0,animated:!reducedMotion});
    nav.setParams({world:world.slug});
  };
  const primaryWorldAction=()=>localCompanion?nav.push(`/(tabs)/chat-tab?character=${encodeURIComponent(localCompanion.id)}&plan=1`):nav.push(`/(tabs)/singles?world=${encodeURIComponent(selectedWorld.slug)}`);
  const changeIntent=(intent:ExploreIntent)=>{persistPreference({intent,scrollY:0});setQuery('');scrollRef.current?.scrollTo({y:0,animated:!reducedMotion});};
  const openAllWorlds=()=>setWorldPickerOpen(true);
  const closeWorldPicker=()=>setWorldPickerOpen(false);

  return <><Screen contentStyle={[styles.content,{paddingBottom:responsive.bottomClearance},Platform.OS==='web'&&styles.webContent]} scrollRef={scrollRef} onScroll={handleScroll} onContentSizeChange={restoreSavedScroll}>
    <View style={[styles.heading,responsive.stackHeader&&styles.headingStacked]}>
      <Text accessibilityRole="header" style={[styles.pageTitle,desktop&&styles.pageTitleDesktop]}>Explore</Text>
      <Pressable ref={worldSelectorRef} accessibilityRole="button" accessibilityLabel={`Choose a world. ${selectedWorld.name} selected`} accessibilityState={{expanded:worldPickerOpen}} {...webExpandedState(worldPickerOpen)} onPress={openAllWorlds} style={({pressed})=>[styles.worldSelect,responsive.stackHeader&&styles.worldSelectStacked,pressed&&styles.pressed]}><Image source={worldHeroAsset(selectedWorld.slug)} style={styles.worldSelectImage} contentFit="cover" loading="eager" priority="high" placeholder={KIVELLI_IMAGE_PLACEHOLDER}/><Text numberOfLines={1} style={styles.worldSelectText}>{selectedWorld.name}</Text><ChevronDown size={16} color={colors.textSecondary}/></Pressable>
    </View>

    <View style={styles.searchShell}><Search size={19} color={colors.textSecondary}/><TextInput nativeID="explore-search" accessibilityLabel="Search people, places, and worlds" value={query} onChangeText={setQuery} placeholder="Search people, places, and worlds" placeholderTextColor={colors.muted} returnKeyType="search" style={styles.searchInput}/>{query?<Pressable accessibilityRole="button" accessibilityLabel="Clear Explore search" onPress={()=>setQuery('')} style={styles.clearSearch}><X size={17} color={colors.text}/></Pressable>:null}</View>
    <View style={styles.intentRail}><ScrollView horizontal accessibilityRole="tablist" accessibilityLabel="Explore by intent" showsHorizontalScrollIndicator={false} onLayout={(event)=>setFilterViewportWidth(event.nativeEvent.layout.width)} onContentSizeChange={(contentWidth)=>setFilterContentWidth(contentWidth)} onScroll={(event)=>setFilterScrollX(event.nativeEvent.contentOffset.x)} scrollEventThrottle={16} contentContainerStyle={styles.intentRow}>{intents.map((item)=>{const Icon=item.icon,selected=selectedIntent===item.id&&!searching;return <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={`Show ${item.label.toLowerCase()} in Explore`} accessibilityState={{selected}} {...webSelectedState(selected)} onPress={()=>changeIntent(item.id)} style={({pressed})=>[styles.intentChip,selected&&styles.intentChipActive,pressed&&styles.pressed]}><Icon size={15} color={selected?'#281527':colors.textSecondary}/><Text style={[styles.intentText,selected&&styles.intentTextActive]}>{item.label}</Text></Pressable>;})}</ScrollView>{filterCanScrollForward?<View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.intentOverflowAffordance}><ChevronRight size={17} color={colors.textSecondary}/></View>:null}</View>
    {refreshError?<View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.errorNotice}><AlertCircle size={17} color={colors.warm}/><Text style={styles.errorText}>{refreshError}</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry Explore refresh" onPress={()=>void refreshCatalog(true)} style={styles.noticeAction}><Text style={styles.noticeActionText}>Retry</Text></Pressable></View>:null}
    {notice?<View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.errorNotice}><AlertCircle size={17} color={colors.warm}/><Text style={styles.errorText}>{notice}</Text><Pressable accessibilityRole="button" accessibilityLabel="Dismiss message" onPress={()=>setNotice('')} style={styles.clearSearch}><X size={16} color={colors.text}/></Pressable></View>:null}

    {!searching?<View accessibilityLabel={`${selectedWorld.name} world`} style={[styles.hero,!desktop&&styles.heroMobile]}>
      <Image source={worldHeroAsset(selectedWorld.slug)} style={StyleSheet.absoluteFill} contentFit="cover" loading="eager" priority="high" placeholder={KIVELLI_IMAGE_PLACEHOLDER} placeholderContentFit="cover" transition={reducedMotion?0:180} onLoad={heroReady}/>
      <View pointerEvents="none" style={styles.heroShade}/>
      <View style={styles.heroContent}><Text accessibilityRole="header" style={styles.heroTitle}>{selectedWorld.name}</Text><Text numberOfLines={2} style={styles.heroCopy}>{worldFantasy(selectedWorld)}</Text><Pressable accessibilityRole="button" accessibilityLabel={isCurrentWorld?`Plan something with ${companion?.together_character_templates.name??'your companion'} in ${selectedWorld.name}`:`Meet someone in ${selectedWorld.name}`} onPress={primaryWorldAction} style={({pressed})=>[styles.heroAction,pressed&&styles.heroActionPressed]}><Text style={styles.heroActionText}>{isCurrentWorld?'Plan something here':'Meet someone in this world'}</Text><ChevronRight size={18} color="#24160B"/></Pressable></View>
    </View>:<View style={styles.searchHeading}><Text accessibilityRole="header" style={styles.searchTitle}>Search results</Text><Text style={styles.searchMeta}>People, places, and worlds matching “{query.trim()}”</Text></View>}
    {noSearchResults?<InlineState title="Nothing matched that search" body="Try a person’s name, an activity, a place, or a world."/>:null}

    {showRecommendations&&context.recommendations.length?<Section title={localCompanion?`For you and ${localCompanion.together_character_templates.name}`:'Picked for you'} subtitle="Personalized to your interests, relationship, and what feels right now"><HorizontalRail label="Personalized places" compact contentStyle={styles.recommendationRow}>{context.recommendations.map((recommendation,index)=><Pressable key={recommendation.id} accessibilityRole="button" accessibilityLabel={`${recommendation.title}: ${recommendation.subtitle}`} onPress={()=>openLocation(recommendation.location)} style={({pressed})=>[styles.recommendationCard,{width:Math.min(270,width-72)},pressed&&styles.pressed]}><Image source={locationHeroAsset(selectedWorld.slug,recommendation.location.slug)} style={StyleSheet.absoluteFill} contentFit="cover" loading={index<2?'eager':'lazy'} priority={index===0?'normal':'low'}/><View style={styles.recommendationShade}/><View style={styles.recommendationCopy}><Text style={styles.recommendationKicker}>{recommendation.title.toUpperCase()}</Text><Text style={styles.recommendationTitle}>{recommendation.location.name}</Text><Text numberOfLines={2} style={styles.recommendationMeta}>{recommendation.option.reason||recommendation.subtitle}</Text></View></Pressable>)}</HorizontalRail></Section>:selectedIntent==='tonight'&&!searching?<InlineState title="Tonight is still taking shape" body="Browse Places for something that fits, or check back as your world changes."/>:null}

    {showEvents&&context.worldEvents.length?<Section title={hasActiveWorldEvent?'Happening now':'Coming up'} subtitle={hasActiveWorldEvent?`What is unfolding around ${selectedWorld.name}`:`What is next around ${selectedWorld.name}`} action="Explore places" onAction={()=>nav.push(`/world/places?world=${selectedWorld.slug}`)}><View style={styles.eventStack}>{context.worldEvents.slice(0,selectedIntent==='tonight'?4:2).map((event,index)=>{const location=context.locations.find((item)=>item.id===event.location_id),title=naturalizeCharacterEventTitle(event.title,event.event_type),summary=naturalizeCharacterEventSummary(event.narrative_summary),status=exploreEventStatus(event);return <Pressable key={event.id} accessibilityRole="button" accessibilityLabel={`${status}: ${title}`} onPress={()=>discussionHandle?nav.push(`/(tabs)/chat-tab?character=${discussionHandle}&draft=${encodeURIComponent(`What's going on with ${title}?`)}`):location?openLocation(location):undefined} style={({pressed})=>[styles.eventCard,index===0&&styles.eventCardFeatured,pressed&&styles.pressed]}><View style={styles.eventIcon}><Sparkles size={16} color={colors.warm}/></View><View style={{flex:1}}><Text style={styles.eventKicker}>{status}</Text><Text style={styles.eventTitle}>{title}</Text><Text numberOfLines={2} style={styles.eventCopy}>{summary}</Text>{location?<Text style={styles.eventLocation}>{location.name}</Text>:null}</View><ChevronRight size={17} color={colors.muted}/></Pressable>;})}</View></Section>:null}

    {showPeople?<Section title={searching?`People · ${matchingPeople.length}`:'People you might connect with'} subtitle={searching?`Residents of ${selectedWorld.name}`:`Chosen from ${selectedWorld.name} for your interests and goals`} action="View all" onAction={()=>nav.push(`/(tabs)/singles?world=${selectedWorld.slug}`)}>{visiblePeople.length?<HorizontalRail label={`People in ${selectedWorld.name}`} previousLabel="Previous people" moreLabel="More people" contentStyle={styles.peoplePortraitRow}>{visiblePeople.map((person,index)=><WorldPersonCard key={person.id} person={person} index={index} width={peopleCardWidth} height={peopleCardHeight} worldName={selectedWorld.name} snapshot={snapshot} onFeedback={setNotice}/>)}</HorizontalRail>:<InlineState title="No people matched" body="Try another search or choose Any in your companion preference."/>}</Section>:null}

    {showPlaces?<Section title={searching?`Places · ${matchingLocations.length}`:'Places'} subtitle={searching?`Things to do around ${selectedWorld.name}`:'Browse by the kind of time you want'} action={category&&!searching?'Clear filter':'See all'} onAction={()=>category&&!searching?setCategory(null):nav.push(`/world/places?world=${selectedWorld.slug}`)}>
      {!searching?<PlaceCategoryFilters categories={context.categories} value={category} onChange={(value)=>{setCategory(value);setLocationLimit(4);}} compact={!desktop}/>:null}
      {category&&!searching?<View style={styles.filterLine}><Text style={styles.filterLabel}>{context.categories.find((item)=>item.id===category)?.label}</Text><Text style={styles.filterMeta}>{matchingLocations.length} places in {selectedWorld.name}</Text></View>:null}
      {visibleLocations.length?<><View style={styles.locationGrid}>{visibleLocations.map((location)=><Pressable accessibilityRole="button" accessibilityLabel={`Explore ${location.name}, ${friendlyCategory(location.category)}`} key={location.id} onPress={()=>openLocation(location)} style={({pressed})=>[styles.locationCard,{width:placeCardWidth,height:placeCardHeight},pressed&&styles.pressed]}><Image source={locationHeroAsset(selectedWorld.slug,location.slug)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" loading="lazy" priority="low"/><View style={styles.locationShade}/><View style={styles.locationCopy}><Text style={styles.locationType}>{friendlyCategory(location.category)}</Text><Text numberOfLines={2} style={styles.locationName}>{location.name}</Text><Text numberOfLines={1} style={styles.locationMeta}>{location.possible_activities.slice(0,3).join(' · ')}</Text></View></Pressable>)}</View>{!desktop&&locationLimit<matchingLocations.length?<Pressable accessibilityRole="button" accessibilityLabel={`Show ${Math.min(4,matchingLocations.length-locationLimit)} more places`} onPress={()=>setLocationLimit((value)=>value+4)} style={({pressed})=>[styles.showMore,pressed&&styles.pressed]}><Text style={styles.showMoreText}>Show more places</Text><ChevronDown size={15} color={colors.rose}/></Pressable>:null}</>:<InlineState title="No places matched" body="Try another category or clear the search."/>}
    </Section>:null}

    {searching&&matchingWorlds.length?<Section title={`Worlds · ${matchingWorlds.length}`}><HorizontalRail label="Matching Kivelle worlds" showControls={false} snapInterval={responsive.worldDiscoveryCardWidth+11} contentStyle={styles.worldRow}>{matchingWorlds.map((world)=><WorldCard key={world.id} world={world} width={responsive.worldDiscoveryCardWidth} onPress={()=>chooseWorld(world)}/>)}</HorizontalRail></Section>:null}
    {!searching&&matchingWorlds.length?<Section title="Discover other worlds" subtitle="Different worlds bring different people, places, and possibilities" action="Choose a world" onAction={openAllWorlds}><HorizontalRail label="Discover other Kivelle worlds" showControls={false} snapInterval={responsive.worldDiscoveryCardWidth+11} contentStyle={styles.worldRow}>{matchingWorlds.map((world)=><WorldCard key={world.id} world={world} width={responsive.worldDiscoveryCardWidth} onPress={()=>chooseWorld(world)}/>)}</HorizontalRail></Section>:null}
  </Screen><WorldSwitcherSheet visible={worldPickerOpen} worlds={worlds} selectedWorldId={selectedWorld.id} homeWorldId={companionWorld?.id} loading={refreshing} error={refreshError} desktop={desktop} reducedMotion={reducedMotion} returnFocusRef={worldSelectorRef} onRetry={()=>void refreshCatalog(true)} onSelect={chooseWorld} onClose={closeWorldPicker}/></>;
}

function WorldPersonCard({person,index,width,height,worldName,snapshot,onFeedback}:{person:FeaturedCompanion;index:number;width:number;height:number;worldName:string;snapshot:Snapshot;onFeedback:(message:string)=>void}){
  const favoriteIds=useTogether((state)=>state.snapshot?.favoriteCharacterTemplateIds??EMPTY_FAVORITE_IDS);
  const setCoreState=useTogether((state)=>state.setCoreState);
  const[savingFavorite,setSavingFavorite]=useState(false);
  const favorite=favoriteIds.includes(person.id);
  const instance=snapshot.characters.find((item)=>item.character_template_id===person.id);
  const active=instance?.id===snapshot.activeContinuity?.active_companion_instance_id;
  const action=active?`Continue with ${person.name}`:instance?.contact_added_at||instance?.introduced_at?'View your relationship':`Meet ${person.name}`;
  const toggleFavorite=async()=>{
    if(savingFavorite)return;
    const previous=favoriteIds;
    const next=favorite?previous.filter((id)=>id!==person.id):[...new Set([...previous,person.id])];
    setSavingFavorite(true);setCoreState({favoriteCharacterTemplateIds:next});
    try{const result=await setCharacterFavorite(person.id,!favorite,'discover');setCoreState({favoriteCharacterTemplateIds:result.favoriteCharacterTemplateIds});}
    catch{setCoreState({favoriteCharacterTemplateIds:previous});onFeedback(`Couldn’t update ${person.name}’s favorite status. Try again.`);}
    finally{setSavingFavorite(false);}
  };
  return <CompanionPortraitCard companion={person} width={width} height={height} favorite={favorite} favoriteBusy={savingFavorite} badgeLabel={exploreCompanionBadge(snapshot,person,index)} compact preserveArtwork={false} loading={index<2?'eager':'lazy'} subtitle={`${person.occupation} · ${worldName}`} actionLabel={action} onFavorite={()=>void toggleFavorite()} onPress={()=>nav.push(`/character/${person.public_handle??person.slug}`)}/>;
}

function WorldCard({world,width,onPress}:{world:World;width:number;onPress:()=>void}){return <Pressable accessibilityRole="button" accessibilityLabel={`Explore ${world.name}`} onPress={onPress} style={({pressed})=>[styles.worldCard,{width},Platform.OS==='web'&&webWorldSnapStyle,pressed&&styles.pressed]}><Image source={worldHeroAsset(world.slug)} style={StyleSheet.absoluteFill} contentFit="cover" loading="lazy" priority="low"/><View pointerEvents="none" style={styles.worldCardShade}/><View pointerEvents="none" style={styles.worldCardBottomShade}/><View style={styles.worldCardCopy}><Text style={styles.worldCardName}>{world.name}</Text><Text style={styles.worldCardMeta}>{worldRole(world)}</Text></View></Pressable>;}
function Section({title,subtitle,action,onAction,children}:{title:string;subtitle?:string;action?:string;onAction?:()=>void;children:ReactNode}){return <View style={styles.section}><View style={styles.sectionHead}><View style={styles.sectionHeadingCopy}><Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>{subtitle?<Text style={styles.sectionSubtitle}>{subtitle}</Text>:null}</View>{action&&onAction?<Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction} style={({pressed})=>[styles.sectionAction,pressed&&styles.pressed]}><Text style={styles.sectionActionText}>{action}</Text><ChevronRight size={14} color="#F2C67D"/></Pressable>:null}</View>{children}</View>}
function InlineState({title,body}:{title:string;body:string}){return <View style={styles.inlineState}><Text style={styles.inlineStateTitle}>{title}</Text><Text style={styles.inlineStateBody}>{body}</Text></View>}
function HorizontalRail({children,contentStyle,label,compact=false,showControls=true,snapInterval,previousLabel='Previous worlds',moreLabel='More worlds'}:{children:ReactNode;contentStyle?:StyleProp<ViewStyle>;label:string;compact?:boolean;showControls?:boolean;snapInterval?:number;previousLabel?:string;moreLabel?:string}){
  const scroll=useRef<ScrollView>(null);
  const[x,setX]=useState(0),[viewport,setViewport]=useState(0),[contentWidth,setContentWidth]=useState(0);
  const max=Math.max(0,contentWidth-viewport),canBack=x>4,canForward=x<max-4;
  const move=(direction:-1|1)=>{const next=Math.max(0,Math.min(max,x+direction*Math.max(260,viewport*.72)));setX(next);scroll.current?.scrollTo({x:next,animated:true});};
  return <View style={styles.horizontalRail}><ScrollView ref={scroll} horizontal nestedScrollEnabled directionalLockEnabled decelerationRate="fast" disableIntervalMomentum={Boolean(snapInterval)} snapToAlignment={snapInterval?'start':undefined} snapToInterval={snapInterval} showsHorizontalScrollIndicator={false} accessibilityLabel={label} style={snapInterval&&Platform.OS==='web'?webRailSnapStyle:undefined} onLayout={(event)=>setViewport(event.nativeEvent.layout.width)} onContentSizeChange={(width)=>setContentWidth(width)} onScroll={(event)=>setX(event.nativeEvent.contentOffset.x)} scrollEventThrottle={16} contentContainerStyle={[styles.horizontalRailContent,contentStyle]}>{children}</ScrollView>{showControls?<><Pressable accessibilityRole="button" accessibilityLabel={previousLabel} accessibilityState={{disabled:!canBack}} disabled={!canBack} onPress={()=>move(-1)} style={({pressed})=>[styles.railArrow,styles.railArrowLeft,compact&&styles.railArrowCompact,!canBack&&styles.railArrowHidden,pressed&&styles.railArrowPressed]}><ChevronLeft size={compact?19:24} color="#FFF8F4"/></Pressable><Pressable accessibilityRole="button" accessibilityLabel={moreLabel} accessibilityState={{disabled:!canForward}} disabled={!canForward} onPress={()=>move(1)} style={({pressed})=>[styles.railArrow,styles.railArrowRight,compact&&styles.railArrowCompact,!canForward&&styles.railArrowHidden,pressed&&styles.railArrowPressed]}><ChevronRight size={compact?19:24} color="#FFF8F4"/></Pressable></>:null}</View>;
}

function WorldSwitcherSheet({visible,worlds,selectedWorldId,homeWorldId,loading,error,desktop,reducedMotion,returnFocusRef,onRetry,onSelect,onClose}:{visible:boolean;worlds:World[];selectedWorldId:string;homeWorldId?:string;loading:boolean;error:string;desktop:boolean;reducedMotion:boolean;returnFocusRef:RefObject<View|null>;onRetry:()=>void;onSelect:(world:World)=>void;onClose:()=>void}){
  const{width,height}=useWindowDimensions();
  const safeArea=useSafeAreaInsets();
  const mobile=!desktop&&width<768;
  const sheetWidth=mobile?width:Math.min(640,width-40);
  const cardWidth=Math.max(140,Math.floor((sheetWidth-(mobile?40:44)-10)/2));
  const closeRef=useRef(onClose);closeRef.current=onClose;
  const previouslyOpen=useRef(false);
  useEffect(()=>{
    if(!visible){if(previouslyOpen.current){previouslyOpen.current=false;setTimeout(()=>{(returnFocusRef.current as unknown as{focus?:()=>void})?.focus?.();},0);}return;}
    previouslyOpen.current=true;
    if(Platform.OS!=='web')return;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const dialog=document.getElementById('explore-world-dialog');
    const focusables=()=>Array.from(dialog?.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')??[]).filter((element)=>!element.hasAttribute('disabled'));
    const timer=setTimeout(()=>focusables()[0]?.focus(),0);
    const handleKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();closeRef.current();return;}
      if(event.key!=='Tab')return;
      const items=focusables();if(!items.length)return;
      const first=items[0]!,last=items[items.length-1]!,active=document.activeElement;
      if(event.shiftKey&&active===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&active===last){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',handleKey);
    return()=>{clearTimeout(timer);document.body.style.overflow=previousOverflow;document.removeEventListener('keydown',handleKey);};
  },[visible,returnFocusRef]);
  return <Modal visible={visible} transparent statusBarTranslucent navigationBarTranslucent animationType={reducedMotion?'none':mobile?'slide':'fade'} onRequestClose={onClose}>
    <View style={[styles.worldSheetBackdrop,mobile?styles.worldSheetBackdropMobile:styles.worldSheetBackdropDesktop]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close world chooser" onPress={onClose} style={StyleSheet.absoluteFill}/>
      <View nativeID="explore-world-dialog" accessibilityViewIsModal style={[styles.worldSheet,mobile?styles.worldSheetMobile:styles.worldSheetDesktop,{maxHeight:Math.min(height-(mobile?20:48),760),paddingBottom:Math.max(mobile?18:20,safeArea.bottom+12)}]}>
        {mobile?<View style={styles.worldSheetHandle}/>:null}
        <View style={styles.worldSheetHeader}><View style={{flex:1}}><Text style={styles.worldSheetKicker}>EXPLORE KIVELLE</Text><Text accessibilityRole="header" style={styles.worldSheetTitle}>Choose a world</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close world chooser" onPress={onClose} style={({pressed})=>[styles.worldSheetClose,pressed&&styles.pressed]}><X size={20} color={colors.text}/></Pressable></View>
        {loading?<View accessibilityLiveRegion="polite" style={styles.worldSheetStatus}><ActivityIndicator size="small" color={colors.rose}/><Text style={styles.worldSheetStatusText}>Refreshing worlds…</Text></View>:null}
        {error?<View accessibilityRole="alert" style={styles.worldSheetError}><AlertCircle size={17} color={colors.warm}/><Text style={styles.worldSheetErrorText}>{error}</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry loading worlds" onPress={onRetry} style={styles.worldSheetRetry}><Text style={styles.worldSheetRetryText}>Retry</Text></Pressable></View>:null}
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.worldSheetGrid}>{worlds.length?worlds.map((world)=>{const selected=world.id===selectedWorldId,home=world.id===homeWorldId;return <Pressable key={world.id} accessibilityRole="button" accessibilityLabel={`${world.name}${home?', home world':''}`} accessibilityState={{selected}} {...webSelectedState(selected)} onPress={()=>onSelect(world)} style={({pressed})=>[styles.worldSheetCard,{width:cardWidth},selected&&styles.worldSheetCardSelected,pressed&&styles.pressed]}><Image source={worldHeroAsset(world.slug)} style={StyleSheet.absoluteFill} contentFit="cover" loading="lazy" priority="low"/><View pointerEvents="none" style={styles.worldSheetCardShade}/><View style={styles.worldSheetCardTop}>{home?<View style={styles.homeWorldBadge}><Text style={styles.homeWorldBadgeText}>HOME WORLD</Text></View>:<View/>}{selected?<View style={styles.worldSelectedBadge}><Check size={15} strokeWidth={3} color="#281527"/></View>:null}</View><View style={styles.worldSheetCardCopy}><Text numberOfLines={2} style={styles.worldSheetCardName}>{world.name}</Text></View></Pressable>}):!loading?<View style={styles.worldSheetEmpty}><Text style={styles.worldSheetEmptyTitle}>No worlds are available yet</Text><Text style={styles.worldSheetEmptyCopy}>Check back when the next world opens.</Text></View>:null}</ScrollView>
      </View>
    </View>
  </Modal>;
}

const webRailSnapStyle=Platform.OS==='web'?({scrollSnapType:'x mandatory',scrollPaddingInline:4}as never):undefined;
const webWorldSnapStyle=Platform.OS==='web'?({scrollSnapAlign:'start'}as never):undefined;
function webSelectedState(selected:boolean){return Platform.OS==='web'?{'aria-selected':selected}:{};}
function webExpandedState(expanded:boolean){return Platform.OS==='web'?{'aria-expanded':expanded}:{};}
function worldRole(world:World){return world.world_role==='destination'?'Destination':world.world_role==='hybrid'?'Home + destination':'Home world'}
function worldFantasy(world:World){const value=world.metadata?.relationshipFantasy;return typeof value==='string'&&value.trim()?value:world.description}
function friendlyCategory(value:string){return value.replace(/_/g,' ').replace(/\b\w/g,(letter)=>letter.toUpperCase())}
function matchesSearch(query:string,...values:Array<string|undefined|null>){return values.some((value)=>value?.toLowerCase().includes(query))}
const styles=StyleSheet.create({
  content:{paddingTop:12,gap:16,overflow:'hidden'},webContent:{minHeight:'100dvh' as never},heading:{minWidth:0,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},headingStacked:{alignItems:'flex-start',flexDirection:'column',gap:9},pageTitle:{fontFamily:'Georgia',fontSize:46,lineHeight:48,color:colors.text,letterSpacing:-1},pageTitleDesktop:{fontSize:52,lineHeight:55},worldSelect:{height:46,minWidth:0,maxWidth:'58%',flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:7,paddingRight:11,borderRadius:radius.pill,borderWidth:1,borderColor:colors.borderBright,backgroundColor:'rgba(20,19,25,.92)'},worldSelectStacked:{width:'100%',maxWidth:300},worldSelectImage:{width:32,height:32,borderRadius:16},worldSelectText:{flexShrink:1,color:colors.text,fontSize:13,fontWeight:'800'},pressed:{opacity:.82,transform:[{scale:.985}]},
  searchShell:{height:54,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:15,borderRadius:radius.md,borderWidth:1,borderColor:'rgba(255,248,244,.14)',backgroundColor:'rgba(255,255,255,.045)'},searchInput:{flex:1,minWidth:0,color:colors.text,fontSize:15,paddingVertical:11},clearSearch:{width:44,height:44,alignItems:'center',justifyContent:'center',borderRadius:22},intentRail:{position:'relative',minWidth:0,maxWidth:'100%'},intentRow:{gap:8,paddingRight:34},intentChip:{height:44,flexDirection:'row',alignItems:'center',gap:7,paddingHorizontal:14,borderRadius:radius.pill,borderWidth:1,borderColor:'rgba(255,248,244,.13)',backgroundColor:colors.surface},intentChipActive:{backgroundColor:'#EF5AD7',borderColor:'#EF5AD7'},intentText:{color:colors.textSecondary,fontSize:12,fontWeight:'800'},intentTextActive:{color:'#281527'},intentOverflowAffordance:{position:'absolute',top:0,right:0,width:32,height:44,alignItems:'flex-end',justifyContent:'center',paddingRight:2,backgroundColor:'rgba(8,7,13,.88)',...(Platform.OS==='web'?({backgroundImage:'linear-gradient(90deg, rgba(8,7,13,0), #08070D 58%)'}as never):{})},
  errorNotice:{minHeight:48,flexDirection:'row',alignItems:'center',gap:9,paddingLeft:13,paddingRight:5,borderRadius:radius.md,backgroundColor:'rgba(194,93,73,.10)',borderWidth:1,borderColor:'rgba(240,184,126,.26)'},errorText:{flex:1,color:colors.textSecondary,fontSize:11,lineHeight:16,fontWeight:'700'},noticeAction:{minWidth:52,minHeight:44,alignItems:'center',justifyContent:'center'},noticeActionText:{color:colors.rose,fontSize:11,fontWeight:'900'},
  hero:{height:220,borderRadius:radius.lg,overflow:'hidden',borderWidth:1,borderColor:'rgba(240,198,125,.24)',justifyContent:'flex-end',shadowColor:'#000',shadowOpacity:.36,shadowRadius:18,shadowOffset:{width:0,height:10},elevation:7},heroMobile:{height:200},heroShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(7,5,12,.30)',...(Platform.OS==='web'?({backgroundImage:'linear-gradient(180deg, rgba(7,5,12,.05) 22%, rgba(7,5,12,.88) 100%)'}as never):{})},heroContent:{zIndex:1,padding:16,gap:4,maxWidth:560},heroTitle:{fontFamily:'Georgia',fontSize:30,lineHeight:34,color:'#fff',textShadowColor:'#000',textShadowRadius:14},heroCopy:{color:'#FFF8F4',fontSize:12,lineHeight:17,maxWidth:430,textShadowColor:'#000',textShadowRadius:10},heroAction:{alignSelf:'flex-start',marginTop:5,minHeight:44,flexDirection:'row',alignItems:'center',gap:7,paddingHorizontal:15,borderRadius:radius.pill,backgroundColor:'#F1C67C'},heroActionPressed:{opacity:.86,transform:[{scale:.98}]},heroActionText:{color:'#24160B',fontWeight:'900',fontSize:12},
  searchHeading:{gap:3},searchTitle:{fontFamily:'Georgia',fontSize:30,color:colors.text},searchMeta:{color:colors.textSecondary,fontSize:11},section:{gap:11},sectionHead:{minHeight:46,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},sectionHeadingCopy:{flex:1,minWidth:0},sectionTitle:{fontFamily:'Georgia',fontSize:26,color:colors.text},sectionSubtitle:{color:colors.textSecondary,fontSize:10,lineHeight:15,marginTop:2},sectionAction:{minHeight:44,flexDirection:'row',alignItems:'center',gap:2,paddingLeft:9},sectionActionText:{color:'#F2C67D',fontSize:11,fontWeight:'800'},inlineState:{minHeight:112,alignItems:'center',justifyContent:'center',gap:5,padding:18,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,backgroundColor:'rgba(255,255,255,.025)'},inlineStateTitle:{color:colors.text,fontFamily:'Georgia',fontSize:20},inlineStateBody:{maxWidth:440,color:colors.textSecondary,fontSize:11,lineHeight:16,textAlign:'center'},
  horizontalRail:{position:'relative',marginHorizontal:-4},horizontalRailContent:{paddingHorizontal:48},railArrow:{position:'absolute',zIndex:4,top:'50%',width:44,height:66,marginTop:-33,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(20,15,28,.88)',borderWidth:1,borderColor:'rgba(255,255,255,.20)',shadowColor:'#000',shadowOpacity:.44,shadowRadius:15,shadowOffset:{width:0,height:7},elevation:12},railArrowCompact:{height:48,marginTop:-24},railArrowLeft:{left:6},railArrowRight:{right:6},railArrowHidden:{opacity:0},railArrowPressed:{transform:[{scale:.94}],backgroundColor:'rgba(87,44,100,.94)'},
  recommendationRow:{gap:10,paddingLeft:4,paddingRight:18},recommendationCard:{height:158,borderRadius:radius.lg,overflow:'hidden',justifyContent:'flex-end',borderWidth:1,borderColor:colors.border},recommendationShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(7,5,12,.40)'},recommendationCopy:{zIndex:1,padding:13},recommendationKicker:{color:'#F4C77E',fontSize:8,fontWeight:'900',letterSpacing:.9},recommendationTitle:{fontFamily:'Georgia',fontSize:22,color:'#fff',marginTop:3,textShadowColor:'#000',textShadowRadius:8},recommendationMeta:{color:'#F2E4E9',fontSize:9,lineHeight:13,marginTop:3},
  eventStack:{gap:9},eventCard:{minHeight:92,flexDirection:'row',alignItems:'center',gap:11,padding:13,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},eventCardFeatured:{backgroundColor:'rgba(240,184,126,.065)',borderColor:'rgba(240,184,126,.22)'},eventIcon:{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(240,184,126,.10)'},eventKicker:{color:colors.warm,fontSize:8,fontWeight:'900',letterSpacing:.8},eventTitle:{color:colors.text,fontSize:14,fontWeight:'900',marginTop:2},eventCopy:{color:colors.muted,fontSize:10,lineHeight:15,marginTop:2},eventLocation:{color:'#E7B7C5',fontSize:9,fontWeight:'800',marginTop:5},peoplePortraitRow:{gap:12,paddingLeft:4,paddingRight:18},
  filterLine:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},filterLabel:{color:colors.text,fontWeight:'900',fontSize:13},filterMeta:{color:colors.muted,fontSize:10},locationGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},locationCard:{borderRadius:radius.lg,overflow:'hidden',justifyContent:'flex-end',borderWidth:1,borderColor:colors.border},locationShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(8,8,13,.37)'},locationCopy:{zIndex:1,padding:12},locationType:{color:'#F4C77E',fontSize:8,fontWeight:'900',letterSpacing:.9},locationName:{fontFamily:'Georgia',fontSize:19,lineHeight:21,color:'#fff',marginTop:2,textShadowColor:'#000',textShadowRadius:8},locationMeta:{color:'#E9DDE3',fontSize:9,marginTop:3,textTransform:'capitalize'},showMore:{alignSelf:'center',minHeight:46,flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:18,borderRadius:radius.pill,backgroundColor:'rgba(216,62,234,.08)',borderWidth:1,borderColor:colors.border},showMoreText:{color:colors.rose,fontSize:11,fontWeight:'900'},
  worldRow:{gap:11,paddingLeft:4,paddingRight:48},worldCard:{height:176,borderRadius:radius.lg,overflow:'hidden',justifyContent:'flex-end',borderWidth:1,borderColor:'rgba(255,248,244,.15)'},worldCardShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(8,6,12,.18)'},worldCardBottomShade:{position:'absolute',left:0,right:0,bottom:0,height:92,backgroundColor:'rgba(7,5,12,.65)',...(Platform.OS==='web'?({backgroundImage:'linear-gradient(180deg, rgba(7,5,12,0), rgba(7,5,12,.94))'}as never):{})},worldCardCopy:{zIndex:1,padding:14},worldCardName:{fontFamily:'Georgia',fontSize:22,color:'#fff',textShadowColor:'#000',textShadowRadius:8},worldCardMeta:{color:'#F1E5EB',fontSize:10,marginTop:3},
  worldSheetBackdrop:{flex:1,backgroundColor:'rgba(3,3,8,.76)'},worldSheetBackdropMobile:{justifyContent:'flex-end'},worldSheetBackdropDesktop:{alignItems:'center',justifyContent:'center',padding:24},worldSheet:{width:'100%',flexShrink:1,borderWidth:1,borderColor:'rgba(255,248,244,.16)',backgroundColor:'#111018',shadowColor:'#000',shadowOpacity:.55,shadowRadius:32,shadowOffset:{width:0,height:18},elevation:24},worldSheetMobile:{borderTopLeftRadius:28,borderTopRightRadius:28,borderBottomWidth:0},worldSheetDesktop:{maxWidth:640,borderRadius:28},worldSheetHandle:{alignSelf:'center',width:42,height:4,borderRadius:2,marginTop:9,marginBottom:1,backgroundColor:'rgba(255,248,244,.30)'},worldSheetHeader:{minHeight:78,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:18,paddingTop:12,paddingBottom:10},worldSheetKicker:{color:colors.rose,fontSize:9,fontWeight:'900',letterSpacing:1.15},worldSheetTitle:{fontFamily:'Georgia',color:colors.text,fontSize:29,lineHeight:34,marginTop:2},worldSheetClose:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.06)'},worldSheetStatus:{minHeight:40,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:19},worldSheetStatusText:{color:colors.textSecondary,fontSize:11,fontWeight:'700'},worldSheetError:{minHeight:50,flexDirection:'row',alignItems:'center',gap:8,marginHorizontal:18,marginBottom:8,paddingLeft:11,borderRadius:radius.md,backgroundColor:'rgba(194,93,73,.10)',borderWidth:1,borderColor:'rgba(240,184,126,.23)'},worldSheetErrorText:{flex:1,color:colors.textSecondary,fontSize:10,lineHeight:14},worldSheetRetry:{minWidth:52,minHeight:44,alignItems:'center',justifyContent:'center'},worldSheetRetryText:{color:colors.rose,fontSize:10,fontWeight:'900'},worldSheetGrid:{flexDirection:'row',flexWrap:'wrap',gap:10,paddingHorizontal:18,paddingTop:3,paddingBottom:8},worldSheetCard:{height:150,borderRadius:radius.md,overflow:'hidden',justifyContent:'space-between',borderWidth:1,borderColor:colors.border},worldSheetCardSelected:{borderColor:'#EF5AD7',borderWidth:2},worldSheetCardShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(7,5,12,.30)',...(Platform.OS==='web'?({backgroundImage:'linear-gradient(180deg, rgba(7,5,12,.12), rgba(7,5,12,.86))'}as never):{})},worldSheetCardTop:{zIndex:1,minHeight:42,flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',padding:8},homeWorldBadge:{minHeight:25,justifyContent:'center',paddingHorizontal:7,borderRadius:12,backgroundColor:'rgba(8,7,13,.76)',borderWidth:1,borderColor:'rgba(255,255,255,.18)'},homeWorldBadgeText:{color:'#FFF8F4',fontSize:7,fontWeight:'900',letterSpacing:.75},worldSelectedBadge:{width:27,height:27,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#EF5AD7'},worldSheetCardCopy:{zIndex:1,padding:10},worldSheetCardName:{fontFamily:'Georgia',fontSize:19,lineHeight:21,color:'#fff',textShadowColor:'#000',textShadowRadius:8},worldSheetEmpty:{width:'100%',minHeight:180,alignItems:'center',justifyContent:'center',gap:5},worldSheetEmptyTitle:{fontFamily:'Georgia',color:colors.text,fontSize:20},worldSheetEmptyCopy:{color:colors.textSecondary,fontSize:11},
});
