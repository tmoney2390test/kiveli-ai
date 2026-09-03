import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from'react';
import{ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,TextInput,View,useWindowDimensions,type StyleProp,type ViewStyle}from'react-native';
import{Image}from'expo-image';
import{router,useFocusEffect,useLocalSearchParams}from'expo-router';
import{AlertCircle,ChevronDown,ChevronLeft,ChevronRight,Clock3,MapPin,Search,Sparkles,UsersRound,X}from'lucide-react-native';
import{EmptyState,FrostedSurface,LoadingSkeleton,PlaceCategoryFilters,Screen}from'../../src/components';
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

const nav={
  push:(href:string)=>router.push(href as never),
  setParams:(params:Record<string,string>)=>{if(!updateLocalRouteParamsOnWeb(params))router.setParams(params);},
};
const EMPTY_FAVORITE_IDS:string[]=[];
const EXPLORE_REFRESH_TTL=10*60*1000;
const DEFAULT_PREFERENCE:ExplorePreference={worldSlug:null,intent:'for_you',scrollY:0};
const intents:Array<{id:ExploreIntent;label:string;icon:typeof Sparkles}>=[
  {id:'for_you',label:'For you',icon:Sparkles},
  {id:'tonight',label:'Tonight',icon:Clock3},
  {id:'people',label:'Meet someone',icon:UsersRound},
  {id:'places',label:'Places',icon:MapPin},
  {id:'worlds',label:'Worlds',icon:Sparkles},
];
let lastExploreCatalogRefreshAt=0;

export default function Explore(){
  const{width}=useWindowDimensions();
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
  const scrollRef=useRef<ScrollView>(null);
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
    void readExplorePreference(preferenceScope).then((saved)=>{if(active){setPreference(saved);setPreferenceReady(true);}});
    return()=>{active=false;};
  },[preferenceScope]);
  useEffect(()=>{if(requestedWorld&&requestedWorld.id!==browsedWorldId)setBrowsedWorldId(requestedWorld.id);},[requestedWorld?.id,browsedWorldId,setBrowsedWorldId]);
  useEffect(()=>{if(!requestedWorld&&preferenceReady&&preferredWorld&&preferredWorld.id!==browsedWorldId)setBrowsedWorldId(preferredWorld.id);},[browsedWorldId,preferenceReady,preferredWorld?.id,requestedWorld?.id,setBrowsedWorldId]);
  useEffect(()=>{if(!browsedWorldId&&selectedWorld)setBrowsedWorldId(selectedWorld.id);},[selectedWorld?.id,browsedWorldId,setBrowsedWorldId]);
  useEffect(()=>{setCategory(null);setLocationLimit(4);},[selectedWorld?.id]);
  useEffect(()=>()=>{if(persistenceTimer.current)clearTimeout(persistenceTimer.current);},[]);

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
  const showWorlds=searching?matchingWorlds.length>0:selectedIntent==='for_you'||selectedIntent==='worlds';
  const hasActiveWorldEvent=context.worldEvents.some((event)=>exploreEventStatus(event)==='HAPPENING NOW');
  const noSearchResults=searching&&!matchingPeople.length&&!matchingLocations.length&&!matchingWorlds.length;
  const nextWorld=worlds.length>1?worlds[(Math.max(0,worlds.findIndex((world)=>world.id===selectedWorld.id))+1)%worlds.length]:undefined;
  const openLocation=(location:Location)=>nav.push(`/location/${location.slug}?world=${selectedWorld.slug}`);
  const chooseWorld=(world:World)=>{
    setBrowsedWorldId(world.id);setWorldPickerOpen(false);setCategory(null);setQuery('');setLocationLimit(4);
    persistPreference({worldSlug:world.slug,scrollY:0});
    scrollRef.current?.scrollTo({y:0,animated:true});
    nav.setParams({world:world.slug});
  };
  const primaryWorldAction=()=>localCompanion?nav.push(`/(tabs)/chat-tab?character=${encodeURIComponent(localCompanion.id)}&plan=1`):nav.push(`/(tabs)/singles?world=${encodeURIComponent(selectedWorld.slug)}`);
  const changeIntent=(intent:ExploreIntent)=>{persistPreference({intent,scrollY:0});setQuery('');scrollRef.current?.scrollTo({y:0,animated:true});};
  const openAllWorlds=()=>{setWorldPickerOpen(true);scrollRef.current?.scrollTo({y:0,animated:true});};

  return <Screen contentStyle={styles.content} scrollRef={scrollRef} onScroll={handleScroll} onContentSizeChange={restoreSavedScroll}>
    <View style={styles.heading}>
      <View><Text style={styles.brand}>Kivelle</Text><Text accessibilityRole="header" style={styles.pageTitle}>Explore</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Browse worlds. ${selectedWorld.name} selected`} accessibilityState={{expanded:worldPickerOpen}} onPress={()=>setWorldPickerOpen((value)=>!value)} style={({pressed})=>[styles.worldSelect,pressed&&styles.pressed]}><Image source={worldHeroAsset(selectedWorld.slug)} style={styles.worldSelectImage} contentFit="cover" loading="eager" priority="high" placeholder={KIVELLI_IMAGE_PLACEHOLDER}/><Text numberOfLines={1} style={styles.worldSelectText}>{selectedWorld.name}</Text><ChevronDown size={16} color={colors.muted}/></Pressable>
    </View>
    {worldPickerOpen?<FrostedSurface style={styles.worldPicker}><Text style={styles.pickerKicker}>BROWSE A WORLD</Text><HorizontalRail label="Browse all Kivelle worlds" compact contentStyle={styles.worldPickerRow}>{worlds.map((world)=><Pressable key={world.id} accessibilityRole="button" accessibilityLabel={`Explore ${world.name}`} accessibilityState={{selected:world.id===selectedWorld.id}} onPress={()=>chooseWorld(world)} style={({pressed})=>[styles.worldPickerCard,world.id===selectedWorld.id&&styles.worldPickerCardActive,pressed&&styles.pressed]}><Image source={worldHeroAsset(world.slug)} style={styles.worldPickerImage} contentFit="cover" loading="lazy" priority="low"/><View style={styles.worldPickerShade}/><Text style={styles.worldPickerName}>{world.name}</Text><Text style={styles.worldPickerMeta}>{worldRole(world)}</Text></Pressable>)}</HorizontalRail></FrostedSurface>:null}

    <View style={styles.searchShell}><Search size={18} color={colors.muted}/><TextInput accessibilityLabel="Search people, places, and worlds" value={query} onChangeText={setQuery} placeholder="Search people, places, or worlds" placeholderTextColor={colors.dimmed} returnKeyType="search" style={styles.searchInput}/>{query?<Pressable accessibilityRole="button" accessibilityLabel="Clear Explore search" onPress={()=>setQuery('')} style={styles.clearSearch}><X size={17} color={colors.text}/></Pressable>:null}</View>
    <ScrollView horizontal accessibilityRole="tablist" accessibilityLabel="Explore by intent" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.intentRow}>{intents.map((item)=>{const Icon=item.icon,selected=selectedIntent===item.id&&!searching;return <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{selected}} onPress={()=>changeIntent(item.id)} style={({pressed})=>[styles.intentChip,selected&&styles.intentChipActive,pressed&&styles.pressed]}><Icon size={14} color={selected?'#2A1708':colors.muted}/><Text style={[styles.intentText,selected&&styles.intentTextActive]}>{item.label}</Text></Pressable>;})}</ScrollView>
    {refreshing?<View accessibilityLiveRegion="polite" style={styles.syncNotice}><ActivityIndicator size="small" color={colors.rose}/><Text style={styles.syncText}>Updating Explore…</Text></View>:null}
    {refreshError?<View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.errorNotice}><AlertCircle size={17} color={colors.warm}/><Text style={styles.errorText}>{refreshError}</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry Explore refresh" onPress={()=>void refreshCatalog(true)} style={styles.noticeAction}><Text style={styles.noticeActionText}>Retry</Text></Pressable></View>:null}
    {notice?<View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.errorNotice}><AlertCircle size={17} color={colors.warm}/><Text style={styles.errorText}>{notice}</Text><Pressable accessibilityRole="button" accessibilityLabel="Dismiss message" onPress={()=>setNotice('')} style={styles.clearSearch}><X size={16} color={colors.text}/></Pressable></View>:null}

    {!searching?<View accessibilityLabel={`${selectedWorld.name} world`} style={[styles.hero,!desktop&&styles.heroMobile]}>
      <Image source={worldHeroAsset(selectedWorld.slug)} style={StyleSheet.absoluteFill} contentFit="cover" loading="eager" priority="high" placeholder={KIVELLI_IMAGE_PLACEHOLDER} placeholderContentFit="cover" transition={180} onLoad={heroReady}/>
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

    {showWorlds&&searching?<Section title={`Worlds · ${matchingWorlds.length}`}><HorizontalRail label="Matching Kivelle worlds" contentStyle={styles.worldRow}>{matchingWorlds.map((world)=><WorldCard key={world.id} world={world} onPress={()=>chooseWorld(world)}/>)}</HorizontalRail></Section>:null}
    {showWorlds&&!searching&&selectedIntent==='worlds'?<Section title="Choose another world" subtitle="Every world has its own people, places, and relationship possibilities" action="Browse all" onAction={openAllWorlds}><HorizontalRail label="Other Kivelle worlds" contentStyle={styles.worldRow}>{matchingWorlds.map((world)=><WorldCard key={world.id} world={world} onPress={()=>chooseWorld(world)}/>)}</HorizontalRail></Section>:null}
    {showWorlds&&!searching&&selectedIntent==='for_you'&&nextWorld?<Section title="Discover another world" subtitle="A different setting changes who you can meet and what can happen" action="Browse all" onAction={openAllWorlds}><Pressable accessibilityRole="button" accessibilityLabel={`Explore ${nextWorld.name}`} onPress={()=>chooseWorld(nextWorld)} style={({pressed})=>[styles.worldFeature,pressed&&styles.pressed]}><Image source={worldHeroAsset(nextWorld.slug)} style={StyleSheet.absoluteFill} contentFit="cover" loading="lazy" priority="low"/><View style={styles.worldFeatureShade}/><View style={styles.worldFeatureCopy}><Text style={styles.worldFeatureKicker}>{worldRole(nextWorld).toUpperCase()}</Text><Text style={styles.worldFeatureName}>{nextWorld.name}</Text><Text numberOfLines={2} style={styles.worldFeatureMeta}>{worldFantasy(nextWorld)}</Text><View style={styles.worldFeatureAction}><Text style={styles.worldFeatureActionText}>Explore this world</Text><ChevronRight size={16} color="#fff"/></View></View></Pressable></Section>:null}
  </Screen>;
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

function WorldCard({world,onPress}:{world:World;onPress:()=>void}){return <Pressable accessibilityRole="button" accessibilityLabel={`Explore ${world.name}`} onPress={onPress} style={({pressed})=>[styles.worldCard,pressed&&styles.pressed]}><Image source={worldHeroAsset(world.slug)} style={StyleSheet.absoluteFill} contentFit="cover" loading="lazy" priority="low"/><View style={styles.worldCardShade}/><View style={styles.worldCardCopy}><Text style={styles.worldCardName}>{world.name}</Text><Text style={styles.worldCardMeta}>{worldRole(world)}</Text></View></Pressable>;}
function Section({title,subtitle,action,onAction,children}:{title:string;subtitle?:string;action?:string;onAction?:()=>void;children:ReactNode}){return <View style={styles.section}><View style={styles.sectionHead}><View style={styles.sectionHeadingCopy}><Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>{subtitle?<Text style={styles.sectionSubtitle}>{subtitle}</Text>:null}</View>{action&&onAction?<Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction} style={({pressed})=>[styles.sectionAction,pressed&&styles.pressed]}><Text style={styles.sectionActionText}>{action}</Text><ChevronRight size={14} color="#F2C67D"/></Pressable>:null}</View>{children}</View>}
function InlineState({title,body}:{title:string;body:string}){return <View style={styles.inlineState}><Text style={styles.inlineStateTitle}>{title}</Text><Text style={styles.inlineStateBody}>{body}</Text></View>}
function HorizontalRail({children,contentStyle,label,compact=false,previousLabel='Previous worlds',moreLabel='More worlds'}:{children:ReactNode;contentStyle?:StyleProp<ViewStyle>;label:string;compact?:boolean;previousLabel?:string;moreLabel?:string}){
  const scroll=useRef<ScrollView>(null);
  const[x,setX]=useState(0),[viewport,setViewport]=useState(0),[contentWidth,setContentWidth]=useState(0);
  const max=Math.max(0,contentWidth-viewport),canBack=x>4,canForward=x<max-4;
  const move=(direction:-1|1)=>{const next=Math.max(0,Math.min(max,x+direction*Math.max(260,viewport*.72)));setX(next);scroll.current?.scrollTo({x:next,animated:true});};
  return <View style={styles.horizontalRail}><ScrollView ref={scroll} horizontal nestedScrollEnabled directionalLockEnabled decelerationRate="fast" showsHorizontalScrollIndicator={false} accessibilityLabel={label} onLayout={(event)=>setViewport(event.nativeEvent.layout.width)} onContentSizeChange={(width)=>setContentWidth(width)} onScroll={(event)=>setX(event.nativeEvent.contentOffset.x)} scrollEventThrottle={16} contentContainerStyle={[styles.horizontalRailContent,contentStyle]}>{children}</ScrollView><Pressable accessibilityRole="button" accessibilityLabel={previousLabel} accessibilityState={{disabled:!canBack}} disabled={!canBack} onPress={()=>move(-1)} style={({pressed})=>[styles.railArrow,styles.railArrowLeft,compact&&styles.railArrowCompact,!canBack&&styles.railArrowHidden,pressed&&styles.railArrowPressed]}><ChevronLeft size={compact?19:24} color="#FFF8F4"/></Pressable><Pressable accessibilityRole="button" accessibilityLabel={moreLabel} accessibilityState={{disabled:!canForward}} disabled={!canForward} onPress={()=>move(1)} style={({pressed})=>[styles.railArrow,styles.railArrowRight,compact&&styles.railArrowCompact,!canForward&&styles.railArrowHidden,pressed&&styles.railArrowPressed]}><ChevronRight size={compact?19:24} color="#FFF8F4"/></Pressable></View>;
}
function worldRole(world:World){return world.world_role==='destination'?'Destination':world.world_role==='hybrid'?'Home + destination':'Home world'}
function worldFantasy(world:World){const value=world.metadata?.relationshipFantasy;return typeof value==='string'&&value.trim()?value:world.description}
function friendlyCategory(value:string){return value.replace(/_/g,' ').replace(/\b\w/g,(letter)=>letter.toUpperCase())}
function matchesSearch(query:string,...values:Array<string|undefined|null>){return values.some((value)=>value?.toLowerCase().includes(query))}
const styles=StyleSheet.create({
  content:{paddingTop:22,paddingBottom:156,gap:22},heading:{flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',gap:12},brand:{fontFamily:'Georgia',color:'#E8BF83',fontSize:16,letterSpacing:1.3},pageTitle:{fontFamily:'Georgia',fontSize:44,lineHeight:49,color:colors.text,marginTop:2},worldSelect:{maxWidth:'54%',minHeight:52,flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:10,borderRadius:radius.pill,borderWidth:1,borderColor:colors.borderBright,backgroundColor:'rgba(20,19,25,.88)'},worldSelectImage:{width:34,height:34,borderRadius:17},worldSelectText:{flexShrink:1,color:colors.text,fontSize:13,fontWeight:'800'},pressed:{opacity:.82,transform:[{scale:.985}]},
  worldPicker:{gap:10,padding:12,borderRadius:radius.lg},pickerKicker:{fontSize:9,fontWeight:'900',letterSpacing:1.2,color:colors.dimmed},worldPickerRow:{gap:9},worldPickerCard:{width:148,height:90,borderRadius:radius.md,overflow:'hidden',justifyContent:'flex-end',borderWidth:1,borderColor:colors.border},worldPickerCardActive:{borderColor:'#E8BF83',borderWidth:2},worldPickerImage:{...StyleSheet.absoluteFill},worldPickerShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(10,9,16,.34)'},worldPickerName:{zIndex:1,color:'#fff',fontFamily:'Georgia',fontSize:17,paddingHorizontal:10},worldPickerMeta:{zIndex:1,color:'#EADCE4',fontSize:9,paddingHorizontal:10,paddingBottom:9},
  searchShell:{minHeight:50,flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:14,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,backgroundColor:'rgba(255,255,255,.035)'},searchInput:{flex:1,minWidth:0,color:colors.text,fontSize:14,paddingVertical:10},clearSearch:{width:44,height:44,alignItems:'center',justifyContent:'center',borderRadius:22},intentRow:{gap:8,paddingRight:8},intentChip:{minHeight:44,flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:13,borderRadius:radius.pill,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface},intentChipActive:{backgroundColor:'#F1C67C',borderColor:'#F1C67C'},intentText:{color:colors.muted,fontSize:11,fontWeight:'900'},intentTextActive:{color:'#2A1708'},
  syncNotice:{minHeight:42,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,paddingHorizontal:12,borderRadius:radius.md,backgroundColor:'rgba(141,83,184,.12)',borderWidth:1,borderColor:'rgba(141,83,184,.24)'},syncText:{color:colors.textSecondary,fontSize:11,fontWeight:'800'},errorNotice:{minHeight:48,flexDirection:'row',alignItems:'center',gap:9,paddingLeft:13,paddingRight:5,borderRadius:radius.md,backgroundColor:'rgba(194,93,73,.10)',borderWidth:1,borderColor:'rgba(240,184,126,.26)'},errorText:{flex:1,color:colors.textSecondary,fontSize:11,lineHeight:16,fontWeight:'700'},noticeAction:{minWidth:52,minHeight:44,alignItems:'center',justifyContent:'center'},noticeActionText:{color:colors.rose,fontSize:11,fontWeight:'900'},
  hero:{height:230,borderRadius:24,overflow:'hidden',borderWidth:1,borderColor:'rgba(240,198,125,.24)',justifyContent:'flex-end',shadowColor:'#000',shadowOpacity:.36,shadowRadius:18,shadowOffset:{width:0,height:10},elevation:7},heroMobile:{height:214},heroContent:{zIndex:1,padding:18,gap:5,maxWidth:560},heroTitle:{fontFamily:'Georgia',fontSize:34,lineHeight:38,color:'#fff',textShadowColor:'#000',textShadowRadius:14},heroCopy:{color:'#FFF8F4',fontSize:12,lineHeight:17,maxWidth:430,textShadowColor:'#000',textShadowRadius:10},heroAction:{alignSelf:'flex-start',marginTop:6,minHeight:46,flexDirection:'row',alignItems:'center',gap:7,paddingHorizontal:16,borderRadius:radius.pill,backgroundColor:'#F1C67C'},heroActionPressed:{opacity:.86,transform:[{scale:.98}]},heroActionText:{color:'#24160B',fontWeight:'900',fontSize:12},
  searchHeading:{gap:3},searchTitle:{fontFamily:'Georgia',fontSize:30,color:colors.text},searchMeta:{color:colors.muted,fontSize:11},section:{gap:13},sectionHead:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},sectionHeadingCopy:{flex:1,minWidth:0},sectionTitle:{fontFamily:'Georgia',fontSize:27,color:colors.text},sectionSubtitle:{color:colors.muted,fontSize:10,lineHeight:15,marginTop:2},sectionAction:{minHeight:44,flexDirection:'row',alignItems:'center',gap:2,paddingLeft:9},sectionActionText:{color:'#F2C67D',fontSize:11,fontWeight:'800'},inlineState:{minHeight:112,alignItems:'center',justifyContent:'center',gap:5,padding:18,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,backgroundColor:'rgba(255,255,255,.025)'},inlineStateTitle:{color:colors.text,fontFamily:'Georgia',fontSize:20},inlineStateBody:{maxWidth:440,color:colors.muted,fontSize:11,lineHeight:16,textAlign:'center'},
  horizontalRail:{position:'relative',marginHorizontal:-4},horizontalRailContent:{paddingHorizontal:48},railArrow:{position:'absolute',zIndex:4,top:'50%',width:44,height:66,marginTop:-33,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(20,15,28,.88)',borderWidth:1,borderColor:'rgba(255,255,255,.20)',shadowColor:'#000',shadowOpacity:.44,shadowRadius:15,shadowOffset:{width:0,height:7},elevation:12},railArrowCompact:{height:48,marginTop:-24},railArrowLeft:{left:6},railArrowRight:{right:6},railArrowHidden:{opacity:0},railArrowPressed:{transform:[{scale:.94}],backgroundColor:'rgba(87,44,100,.94)'},
  recommendationRow:{gap:10,paddingLeft:4,paddingRight:18},recommendationCard:{height:158,borderRadius:radius.lg,overflow:'hidden',justifyContent:'flex-end',borderWidth:1,borderColor:colors.border},recommendationShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(7,5,12,.40)'},recommendationCopy:{zIndex:1,padding:13},recommendationKicker:{color:'#F4C77E',fontSize:8,fontWeight:'900',letterSpacing:.9},recommendationTitle:{fontFamily:'Georgia',fontSize:22,color:'#fff',marginTop:3,textShadowColor:'#000',textShadowRadius:8},recommendationMeta:{color:'#F2E4E9',fontSize:9,lineHeight:13,marginTop:3},
  eventStack:{gap:9},eventCard:{minHeight:92,flexDirection:'row',alignItems:'center',gap:11,padding:13,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},eventCardFeatured:{backgroundColor:'rgba(240,184,126,.065)',borderColor:'rgba(240,184,126,.22)'},eventIcon:{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(240,184,126,.10)'},eventKicker:{color:colors.warm,fontSize:8,fontWeight:'900',letterSpacing:.8},eventTitle:{color:colors.text,fontSize:14,fontWeight:'900',marginTop:2},eventCopy:{color:colors.muted,fontSize:10,lineHeight:15,marginTop:2},eventLocation:{color:'#E7B7C5',fontSize:9,fontWeight:'800',marginTop:5},peoplePortraitRow:{gap:12,paddingLeft:4,paddingRight:18},
  filterLine:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},filterLabel:{color:colors.text,fontWeight:'900',fontSize:13},filterMeta:{color:colors.muted,fontSize:10},locationGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},locationCard:{borderRadius:radius.lg,overflow:'hidden',justifyContent:'flex-end',borderWidth:1,borderColor:colors.border},locationShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(8,8,13,.37)'},locationCopy:{zIndex:1,padding:12},locationType:{color:'#F4C77E',fontSize:8,fontWeight:'900',letterSpacing:.9},locationName:{fontFamily:'Georgia',fontSize:19,lineHeight:21,color:'#fff',marginTop:2,textShadowColor:'#000',textShadowRadius:8},locationMeta:{color:'#E9DDE3',fontSize:9,marginTop:3,textTransform:'capitalize'},showMore:{alignSelf:'center',minHeight:46,flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:18,borderRadius:radius.pill,backgroundColor:'rgba(216,62,234,.08)',borderWidth:1,borderColor:colors.border},showMoreText:{color:colors.rose,fontSize:11,fontWeight:'900'},
  worldRow:{gap:11,paddingLeft:4,paddingRight:18},worldCard:{width:180,height:220,borderRadius:radius.lg,overflow:'hidden',justifyContent:'flex-end',borderWidth:1,borderColor:colors.border},worldCardShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(10,9,16,.27)'},worldCardCopy:{zIndex:1,padding:13},worldCardName:{fontFamily:'Georgia',fontSize:21,color:'#fff',textShadowColor:'#000',textShadowRadius:7},worldCardMeta:{color:'#EADCE4',fontSize:9,marginTop:3},worldFeature:{height:190,borderRadius:radius.lg,overflow:'hidden',justifyContent:'flex-end',borderWidth:1,borderColor:'rgba(240,198,125,.20)'},worldFeatureShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(6,5,10,.37)'},worldFeatureCopy:{zIndex:1,padding:17,maxWidth:560},worldFeatureKicker:{color:'#F4C77E',fontSize:8,fontWeight:'900',letterSpacing:.9},worldFeatureName:{fontFamily:'Georgia',fontSize:28,color:'#fff',marginTop:2,textShadowColor:'#000',textShadowRadius:9},worldFeatureMeta:{color:'#F2E4E9',fontSize:10,lineHeight:15,marginTop:3},worldFeatureAction:{minHeight:36,flexDirection:'row',alignItems:'center',gap:3,marginTop:7},worldFeatureActionText:{color:'#fff',fontSize:11,fontWeight:'900'},
});
