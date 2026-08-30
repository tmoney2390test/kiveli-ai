import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ChevronDown, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react-native';
import { EmptyState, FrostedSurface, LoadingSkeleton, PlaceCategoryFilters, Screen } from '../../src/components';
import { CompanionPortraitCard } from '../../src/components/CompanionPortraitCard';
import { locationHeroAsset, worldHeroAsset } from '../../src/assets';
import { colors, radius } from '../../src/theme';
import { useTogether } from '../../src/store/useTogether';
import { setCharacterFavorite } from '../../src/lib/api';
import { activeCompanion } from '../../src/lib/companionLife';
import { characterCanPlanInWorld, characterResidentWorld } from '../../src/lib/place';
import { buildExploreContext, locationsForExploreCategory, type ExploreCategoryId } from '../../src/lib/explore';
import { responsivePlaceGrid } from '../../src/lib/responsivePlaceGrid';
import { useAppShell } from '../../src/shell/AppShellContext';
import type { FeaturedCompanion } from '../../src/lib/featuredCompanions';
import type { Location, World } from '../../src/types';
import { KIVELLI_IMAGE_PLACEHOLDER } from '../../src/lib/imageWarmup';
import { useSurfaceReadyTiming } from '../../src/components/ClientPerformanceBridge';

const nav=router as unknown as {push:(href:string)=>void;setParams:(params:Record<string,string>)=>void};
const EMPTY_FAVORITE_IDS:string[]=[];
let lastExploreCatalogRefreshAt=0;
export default function Explore(){
  const{width}=useWindowDimensions();
  const{desktop,sidebarWidth}=useAppShell();
  const params=useLocalSearchParams<{world?:string}>();
  const{snapshot,browsedWorldId,setBrowsedWorldId,refresh}=useTogether();
  const heroReady=useSurfaceReadyTiming('explore','hero_image_ready',Boolean(snapshot&&snapshot.profile?.privacy_settings?.analytics!==false));
  const[worldPickerOpen,setWorldPickerOpen]=useState(false);
  const[category,setCategory]=useState<ExploreCategoryId|null>(null);
  const worlds=snapshot?.worlds.filter((item)=>item.published).sort((a,b)=>a.sort_order-b.sort_order)??[];
  const companion=snapshot?activeCompanion(snapshot):undefined;
  const companionWorld=snapshot&&companion?characterResidentWorld(snapshot,companion):undefined;
  const requestedWorld=worlds.find((item)=>item.slug===params.world);
  const selectedWorld=worlds.find((item)=>item.id===browsedWorldId)??requestedWorld??companionWorld??worlds[0];

  useEffect(()=>{if(requestedWorld&&requestedWorld.id!==browsedWorldId)setBrowsedWorldId(requestedWorld.id);},[requestedWorld?.id,browsedWorldId]);
  useEffect(()=>{if(!browsedWorldId&&selectedWorld)setBrowsedWorldId(selectedWorld.id);},[selectedWorld?.id,browsedWorldId]);
  useEffect(()=>{setCategory(null);},[selectedWorld?.id]);
  useFocusEffect(useCallback(()=>{
    if(Date.now()-lastExploreCatalogRefreshAt<5*60*1000)return;
    lastExploreCatalogRefreshAt=Date.now();
    void refresh();
  },[refresh]));

  if(!snapshot)return <LoadingSkeleton label="Opening Explore…"/>;
  if(!selectedWorld)return <EmptyState title="Worlds are being prepared" body="Explore will fill in as worlds become available."/>;

  const localCompanion=characterCanPlanInWorld(snapshot,companion,selectedWorld.id)?companion:undefined;
  const context=buildExploreContext(snapshot,localCompanion,selectedWorld.id);
  const categoryLocations=category?locationsForExploreCategory(context.locations,category):[];
  const visibleLocations=(category?categoryLocations:context.featuredLocations).slice(0,6);
  const isCurrentWorld=companionWorld?.id===selectedWorld.id;
  const discussionHandle=companion?.id;
  const peopleCardWidth=width>=1000?344:width>=700?300:Math.min(306,width-58);
  const placeGrid=responsivePlaceGrid({viewportWidth:width,sidebarWidth:desktop?sidebarWidth:0,outerPadding:desktop?64:40,gap:10});
  const placeCardWidth=placeGrid.cardWidth;
  const placeCardHeight=!desktop&&placeGrid.columns===2?placeCardWidth:Math.max(175,Math.min(220,Math.round(placeCardWidth*.66)));
  const openLocation=(location:Location)=>nav.push(`/location/${location.slug}?world=${selectedWorld.slug}`);
  const chooseWorld=(world:World)=>{setBrowsedWorldId(world.id);setWorldPickerOpen(false);nav.setParams({world:world.slug});};
  const primaryWorldAction=()=>localCompanion
    ?nav.push(`/(tabs)/chat-tab?character=${encodeURIComponent(localCompanion.id)}&plan=1`)
    :nav.push(`/(tabs)/singles?world=${encodeURIComponent(selectedWorld.slug)}`);

  return <Screen contentStyle={styles.content}>
    <View style={styles.heading}>
      <View><Text style={styles.brand}>Kivelle</Text><Text style={styles.pageTitle}>Explore</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Browse worlds. ${selectedWorld.name} selected`} onPress={()=>setWorldPickerOpen((value)=>!value)} style={styles.worldSelect}><Image source={worldHeroAsset(selectedWorld.slug)} style={styles.worldSelectImage} contentFit="cover" loading="eager" priority="high" placeholder={KIVELLI_IMAGE_PLACEHOLDER}/><Text numberOfLines={1} style={styles.worldSelectText}>{selectedWorld.name}</Text><ChevronDown size={16} color={colors.muted}/></Pressable>
    </View>

    {worldPickerOpen?<FrostedSurface style={styles.worldPicker}><Text style={styles.pickerKicker}>BROWSE A WORLD</Text><HorizontalRail label="Browse all Kivelle worlds" compact contentStyle={styles.worldPickerRow}>{worlds.map((world)=><Pressable key={world.id} onPress={()=>chooseWorld(world)} style={[styles.worldPickerCard,world.id===selectedWorld.id&&styles.worldPickerCardActive]}><Image source={worldHeroAsset(world.slug)} style={styles.worldPickerImage} contentFit="cover"/><View style={styles.worldPickerShade}/><Text style={styles.worldPickerName}>{world.name}</Text><Text style={styles.worldPickerMeta}>{worldRole(world)}</Text></Pressable>)}</HorizontalRail></FrostedSurface>:null}

    <View accessibilityLabel={`${selectedWorld.name} world`} style={styles.hero}>
      <Image source={worldHeroAsset(selectedWorld.slug)} style={StyleSheet.absoluteFill} contentFit="cover" loading="eager" priority="high" placeholder={KIVELLI_IMAGE_PLACEHOLDER} placeholderContentFit="cover" transition={180} onLoad={heroReady}/>
      <View style={styles.heroContent}><Text style={styles.heroTitle}>{selectedWorld.name}</Text><Text numberOfLines={2} style={styles.heroCopy}>{worldFantasy(selectedWorld)}</Text><Pressable onPress={primaryWorldAction} style={styles.heroAction}><Text style={styles.heroActionText}>{isCurrentWorld?'Plan something here':'Meet someone in this world'}</Text><ChevronRight size={18} color="#24160B"/></Pressable></View>
    </View>

    {context.people.length?<Section title="People in this world" action="View all" onAction={()=>nav.push(`/(tabs)/singles?world=${selectedWorld.slug}`)}><HorizontalRail label={`People in ${selectedWorld.name}`} previousLabel="Previous people" moreLabel="More people" contentStyle={styles.peoplePortraitRow}>{context.people.map((person)=><WorldPersonCard key={person.id} person={person} width={peopleCardWidth} worldName={selectedWorld.name}/>)}</HorizontalRail></Section>:null}

    <Section title="Places" action={category?'Clear filter':'See all'} onAction={()=>category?setCategory(null):nav.push(`/world/places?world=${selectedWorld.slug}`)}>
      <PlaceCategoryFilters categories={context.categories} value={category} onChange={setCategory}/>
      {category?<View style={styles.filterLine}><Text style={styles.filterLabel}>{context.categories.find((item)=>item.id===category)?.label}</Text><Text style={styles.filterMeta}>{categoryLocations.length} places in {selectedWorld.name}</Text></View>:null}
      <View style={styles.locationGrid}>{visibleLocations.map((location)=><Pressable key={location.id} onPress={()=>openLocation(location)} style={[styles.locationCard,{width:placeCardWidth,height:placeCardHeight}]}><Image source={locationHeroAsset(selectedWorld.slug,location.slug)} style={StyleSheet.absoluteFill} contentFit="cover"/><View style={styles.locationShade}/><View style={styles.locationCopy}><Text style={styles.locationType}>{friendlyCategory(location.category)}</Text><Text style={styles.locationName}>{location.name}</Text><Text numberOfLines={1} style={styles.locationMeta}>{location.possible_activities.slice(0,3).join(' · ')}</Text></View></Pressable>)}</View>
    </Section>

    <Section title="Worlds" action="See all" onAction={()=>setWorldPickerOpen(true)}><HorizontalRail label="Other Kivelle worlds" contentStyle={styles.worldRow}>{worlds.filter((world)=>world.id!==selectedWorld.id).map((world)=><Pressable key={world.id} onPress={()=>chooseWorld(world)} style={styles.worldCard}><Image source={worldHeroAsset(world.slug)} style={StyleSheet.absoluteFill} contentFit="cover"/><View style={styles.worldCardShade}/><View style={styles.worldCardCopy}><Text style={styles.worldCardName}>{world.name}</Text><Text style={styles.worldCardMeta}>{worldRole(world)}</Text></View></Pressable>)}</HorizontalRail></Section>

    {context.worldEvents.length?<Section title="What’s happening" action="Explore places" onAction={()=>nav.push(`/world/places?world=${selectedWorld.slug}`)}><View style={styles.eventStack}>{context.worldEvents.map((event)=><Pressable key={event.id} onPress={()=>discussionHandle&&nav.push(`/(tabs)/chat-tab?character=${discussionHandle}&draft=${encodeURIComponent(`What's going on with ${event.title}?`)}`)} style={styles.eventCard}><View style={styles.eventIcon}><Sparkles size={16} color={colors.warm}/></View><View style={{flex:1}}><Text style={styles.eventTitle}>{event.title}</Text><Text numberOfLines={2} style={styles.eventCopy}>{event.narrative_summary}</Text></View><ChevronRight size={17} color={colors.muted}/></Pressable>)}</View></Section>:null}

  </Screen>;
}

function WorldPersonCard({person,width,worldName}:{person:FeaturedCompanion;width:number;worldName:string}){
  const favoriteIds=useTogether((state)=>state.snapshot?.favoriteCharacterTemplateIds??EMPTY_FAVORITE_IDS);
  const setCoreState=useTogether((state)=>state.setCoreState);
  const[savingFavorite,setSavingFavorite]=useState(false);
  const favorite=favoriteIds.includes(person.id);
  const toggleFavorite=async()=>{
    if(savingFavorite)return;
    const previous=favoriteIds;
    const next=favorite?previous.filter((id)=>id!==person.id):[...new Set([...previous,person.id])];
    setSavingFavorite(true);
    setCoreState({favoriteCharacterTemplateIds:next});
    try{const result=await setCharacterFavorite(person.id,!favorite,'discover');setCoreState({favoriteCharacterTemplateIds:result.favoriteCharacterTemplateIds});}
    catch{setCoreState({favoriteCharacterTemplateIds:previous});}
    finally{setSavingFavorite(false);}
  };
  return <CompanionPortraitCard companion={person} width={width} favorite={favorite} favoriteBusy={savingFavorite} subtitle={`${person.occupation} · ${worldName}`} onFavorite={()=>void toggleFavorite()} onPress={()=>nav.push(`/character/${person.public_handle??person.slug}`)}/>;
}
function Section({title,action,onAction,children}:{title:string;action?:string;onAction?:()=>void;children:ReactNode}){return <View style={styles.section}><View style={styles.sectionHead}><Text style={styles.sectionTitle}>{title}</Text>{action&&onAction?<Pressable onPress={onAction} style={styles.sectionAction}><Text style={styles.sectionActionText}>{action}</Text><ChevronRight size={14} color="#F2C67D"/></Pressable>:null}</View>{children}</View>}
function HorizontalRail({children,contentStyle,label,compact=false,previousLabel='Previous worlds',moreLabel='More worlds'}:{children:ReactNode;contentStyle?:StyleProp<ViewStyle>;label:string;compact?:boolean;previousLabel?:string;moreLabel?:string}){
  const scroll=useRef<ScrollView>(null);
  const[x,setX]=useState(0),[viewport,setViewport]=useState(0),[contentWidth,setContentWidth]=useState(0);
  const max=Math.max(0,contentWidth-viewport),canBack=x>4,canForward=x<max-4;
  const move=(direction:-1|1)=>{const next=Math.max(0,Math.min(max,x+direction*Math.max(260,viewport*.72)));setX(next);scroll.current?.scrollTo({x:next,animated:true});};
  return <View style={styles.horizontalRail}>
    <ScrollView ref={scroll} horizontal nestedScrollEnabled directionalLockEnabled decelerationRate="fast" showsHorizontalScrollIndicator={false} accessibilityLabel={label} onLayout={(event)=>setViewport(event.nativeEvent.layout.width)} onContentSizeChange={(width)=>setContentWidth(width)} onScroll={(event)=>setX(event.nativeEvent.contentOffset.x)} scrollEventThrottle={16} contentContainerStyle={[styles.horizontalRailContent,contentStyle]}>{children}</ScrollView>
    <Pressable accessibilityRole="button" accessibilityLabel={previousLabel} accessibilityState={{disabled:!canBack}} disabled={!canBack} onPress={()=>move(-1)} style={({pressed})=>[styles.railArrow,styles.railArrowLeft,compact&&styles.railArrowCompact,!canBack&&styles.railArrowHidden,pressed&&styles.railArrowPressed]}><ChevronLeft size={compact?19:24} color="#FFF8F4"/></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={moreLabel} accessibilityState={{disabled:!canForward}} disabled={!canForward} onPress={()=>move(1)} style={({pressed})=>[styles.railArrow,styles.railArrowRight,compact&&styles.railArrowCompact,!canForward&&styles.railArrowHidden,pressed&&styles.railArrowPressed]}><ChevronRight size={compact?19:24} color="#FFF8F4"/></Pressable>
  </View>;
}
function worldRole(world:World){return world.world_role==='destination'?'Destination':world.world_role==='hybrid'?'Home + destination':'Home world'}
function worldFantasy(world:World){const value=world.metadata?.relationshipFantasy;return typeof value==='string'&&value.trim()?value:world.description}
function friendlyCategory(value:string){return value.replace(/_/g,' ').replace(/\b\w/g,(letter)=>letter.toUpperCase())}

const styles=StyleSheet.create({
  content:{paddingTop:22,gap:24},heading:{flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',gap:12},brand:{fontFamily:'Georgia',color:'#E8BF83',fontSize:16,letterSpacing:1.3},pageTitle:{fontFamily:'Georgia',fontSize:44,lineHeight:49,color:colors.text,marginTop:2},worldSelect:{maxWidth:'54%',minHeight:52,flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:10,borderRadius:radius.pill,borderWidth:1,borderColor:colors.borderBright,backgroundColor:'rgba(20,19,25,.88)'},worldSelectImage:{width:34,height:34,borderRadius:17},worldSelectText:{flexShrink:1,color:colors.text,fontSize:13,fontWeight:'800'},worldPicker:{gap:10,padding:12,borderRadius:radius.lg},pickerKicker:{fontSize:9,fontWeight:'900',letterSpacing:1.2,color:colors.dimmed},worldPickerRow:{gap:9},worldPickerCard:{width:148,height:90,borderRadius:radius.md,overflow:'hidden',justifyContent:'flex-end',borderWidth:1,borderColor:colors.border},worldPickerCardActive:{borderColor:'#E8BF83',borderWidth:2},worldPickerImage:{...StyleSheet.absoluteFill},worldPickerShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(10,9,16,.34)'},worldPickerName:{zIndex:1,color:'#fff',fontFamily:'Georgia',fontSize:17,paddingHorizontal:10},worldPickerMeta:{zIndex:1,color:'#EADCE4',fontSize:9,paddingHorizontal:10,paddingBottom:9},horizontalRail:{position:'relative',marginHorizontal:-4},horizontalRailContent:{paddingHorizontal:48},railArrow:{position:'absolute',zIndex:4,top:'50%',width:42,height:66,marginTop:-33,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(20,15,28,.88)',borderWidth:1,borderColor:'rgba(255,255,255,.20)',shadowColor:'#000',shadowOpacity:.44,shadowRadius:15,shadowOffset:{width:0,height:7},elevation:12},railArrowCompact:{width:34,height:48,marginTop:-24,borderRadius:17},railArrowLeft:{left:6},railArrowRight:{right:6},railArrowHidden:{opacity:0},railArrowPressed:{transform:[{scale:.94}],backgroundColor:'rgba(87,44,100,.94)'},hero:{height:230,borderRadius:24,overflow:'hidden',borderWidth:1,borderColor:'rgba(240,198,125,.24)',justifyContent:'flex-end',shadowColor:'#000',shadowOpacity:.36,shadowRadius:18,shadowOffset:{width:0,height:10},elevation:7},heroContent:{zIndex:1,padding:18,gap:5,maxWidth:560},heroTitle:{fontFamily:'Georgia',fontSize:34,lineHeight:38,color:'#fff',textShadowColor:'#000',textShadowRadius:14},heroCopy:{color:'#FFF8F4',fontSize:12,lineHeight:17,maxWidth:430,textShadowColor:'#000',textShadowRadius:10},heroAction:{alignSelf:'flex-start',marginTop:6,minHeight:42,flexDirection:'row',alignItems:'center',gap:7,paddingHorizontal:16,borderRadius:radius.pill,backgroundColor:'#F1C67C'},heroActionText:{color:'#24160B',fontWeight:'900',fontSize:12},section:{gap:13},sectionHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},sectionTitle:{fontFamily:'Georgia',fontSize:27,color:colors.text},sectionAction:{flexDirection:'row',alignItems:'center',gap:2},sectionActionText:{color:'#F2C67D',fontSize:11,fontWeight:'800'},peoplePortraitRow:{gap:12,paddingLeft:4,paddingRight:18},categoryRow:{flexDirection:'row',alignItems:'stretch',justifyContent:'center',gap:7,width:'100%'},categoryCard:{flexGrow:1,flexBasis:58,maxWidth:124,minWidth:58,minHeight:76,alignItems:'center',justifyContent:'center',gap:6,paddingHorizontal:3,paddingVertical:8,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:'rgba(255,255,255,.025)'},categoryCardActive:{borderColor:'#F1C67C',backgroundColor:'rgba(240,198,125,.10)'},categoryIcon:{width:31,height:31,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.045)'},categoryIconActive:{backgroundColor:'rgba(240,198,125,.12)'},categoryLabel:{color:colors.muted,fontSize:8.5,lineHeight:11,fontWeight:'800',textAlign:'center'},categoryLabelActive:{color:'#FFE2B2'},filterLine:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},filterLabel:{color:colors.text,fontWeight:'900',fontSize:13},filterMeta:{color:colors.muted,fontSize:10},locationGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},locationCard:{borderRadius:radius.lg,overflow:'hidden',justifyContent:'flex-end',borderWidth:1,borderColor:colors.border},locationShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(8,8,13,.37)'},locationCopy:{zIndex:1,padding:12},locationType:{color:'#F4C77E',fontSize:8,fontWeight:'900',letterSpacing:.9},locationName:{fontFamily:'Georgia',fontSize:19,color:'#fff',marginTop:2,textShadowColor:'#000',textShadowRadius:8},locationMeta:{color:'#E9DDE3',fontSize:9,marginTop:3,textTransform:'capitalize'},worldRow:{gap:11,paddingRight:8},worldCard:{width:180,height:220,borderRadius:radius.lg,overflow:'hidden',justifyContent:'flex-end',borderWidth:1,borderColor:colors.border},worldCardShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(10,9,16,.27)'},worldCardCopy:{zIndex:1,padding:13},worldCardName:{fontFamily:'Georgia',fontSize:21,color:'#fff',textShadowColor:'#000',textShadowRadius:7},worldCardMeta:{color:'#EADCE4',fontSize:9,marginTop:3},eventStack:{gap:9},eventCard:{minHeight:74,flexDirection:'row',alignItems:'center',gap:11,padding:12,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},eventIcon:{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(240,184,126,.10)'},eventTitle:{color:colors.text,fontSize:13,fontWeight:'900'},eventCopy:{color:colors.muted,fontSize:10,lineHeight:15,marginTop:2}
});
