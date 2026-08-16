import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronDown, ChevronRight, Coffee, Compass, Gamepad2, Leaf, Martini, Sparkles, UtensilsCrossed } from 'lucide-react-native';
import { EmptyState, LoadingSkeleton, Screen } from '../../src/components';
import { locationHeroAsset, worldHeroAsset } from '../../src/assets';
import { colors, radius } from '../../src/theme';
import { useTogether } from '../../src/store/useTogether';
import { activeCompanion } from '../../src/lib/companionLife';
import { worldForLocation } from '../../src/lib/place';
import { buildExploreContext, locationsForExploreCategory, type ExploreCategoryId } from '../../src/lib/explore';
import type { PlanOption } from '../../src/lib/plans';
import type { CharacterTemplate, Location, World } from '../../src/types';

const categoryIcons:Record<ExploreCategoryId,React.ReactNode>={
  coffee:<Coffee size={18} color="#F3C989"/>,
  nightlife:<Martini size={18} color="#F2A4C6"/>,
  dining:<UtensilsCrossed size={18} color="#EFC28C"/>,
  quiet:<Leaf size={18} color="#A9C88D"/>,
  entertainment:<Gamepad2 size={18} color="#A9B9F2"/>,
};

export default function Explore(){
  const params=useLocalSearchParams<{world?:string;section?:string}>();
  const snapshot=useTogether((state)=>state.snapshot);
  const [browsedWorldId,setBrowsedWorldId]=useState<string|null>(null);
  const [worldPickerOpen,setWorldPickerOpen]=useState(false);
  const [category,setCategory]=useState<ExploreCategoryId|null>(null);
  const worlds=snapshot?.worlds.filter((item)=>item.published).sort((a,b)=>a.sort_order-b.sort_order)??[];
  const companion=snapshot?activeCompanion(snapshot):undefined;
  const companionWorld=snapshot&&companion?worldForLocation(snapshot,companion.current_location_id):undefined;
  const requestedWorld=worlds.find((item)=>item.slug===params.world);
  const selectedWorld=worlds.find((item)=>item.id===browsedWorldId)??requestedWorld??companionWorld??worlds[0];

  useEffect(()=>{if(requestedWorld&&requestedWorld.id!==browsedWorldId)setBrowsedWorldId(requestedWorld.id);},[requestedWorld?.id]);
  useEffect(()=>{if(!browsedWorldId&&selectedWorld)setBrowsedWorldId(selectedWorld.id);},[selectedWorld?.id,browsedWorldId]);
  useEffect(()=>{setCategory(null);},[selectedWorld?.id]);

  if(!snapshot)return <LoadingSkeleton label="Opening Explore…"/>;
  if(!selectedWorld)return <EmptyState title="Worlds are being prepared" body="Explore will fill in as worlds become available."/>;
  const context=buildExploreContext(snapshot,companion,selectedWorld.id);
  const categoryLocations=category?locationsForExploreCategory(context.locations,category):[];
  const visibleLocations=(category?categoryLocations:context.featuredLocations).slice(0,6);
  const currentWorld=Boolean(companionWorld?.id===selectedWorld.id);
  const handle=companion?.together_character_templates.public_handle??companion?.together_character_templates.slug;

  const openWorld=()=>router.push(`/(tabs)/worlds?world=${selectedWorld.slug}` as never);
  const planAt=(option:PlanOption)=>{const location=snapshot.locations.find((item)=>item.id===option.locationId);if(!location)return;router.push(`/(tabs)/chat-tab?${handle?`character=${handle}&`:''}plan=1&location=${location.slug}&world=${selectedWorld.slug}` as never);};
  const openLocation=(location:Location)=>router.push(`/location/${location.slug}?world=${selectedWorld.slug}` as never);

  return <Screen contentStyle={styles.content}>
    <View style={styles.heading}>
      <View><Text style={styles.brand}>Kivelle</Text><Text style={styles.pageTitle}>Explore</Text></View>
      <Pressable onPress={()=>setWorldPickerOpen((value)=>!value)} style={styles.worldSelect}><Image source={worldHeroAsset(selectedWorld.slug)} style={styles.worldSelectImage} contentFit="cover"/><Text numberOfLines={1} style={styles.worldSelectText}>{selectedWorld.name}</Text><ChevronDown size={16} color={colors.muted}/></Pressable>
    </View>

    {worldPickerOpen?<View style={styles.worldPicker}><Text style={styles.pickerKicker}>BROWSE A WORLD</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.worldPickerRow}>{worlds.map((world)=><Pressable key={world.id} onPress={()=>{setBrowsedWorldId(world.id);setWorldPickerOpen(false);router.setParams({world:world.slug} as never);}} style={[styles.worldPickerCard,world.id===selectedWorld.id&&styles.worldPickerCardActive]}><Image source={worldHeroAsset(world.slug)} style={styles.worldPickerImage} contentFit="cover"/><View style={styles.worldPickerShade}/><Text style={styles.worldPickerName}>{world.name}</Text><Text style={styles.worldPickerMeta}>{worldRole(world)}</Text></Pressable>)}</ScrollView></View>:null}

    <Pressable onPress={openWorld} style={styles.hero}>
      <Image source={worldHeroAsset(selectedWorld.slug)} style={StyleSheet.absoluteFill} contentFit="cover"/>
      <View style={styles.heroWash}/><View style={styles.heroBottomShade}/>
      <View style={styles.heroContent}>
        <View style={styles.heroStatus}><Compass size={13} color="#FFE0AE"/><Text style={styles.heroStatusText}>{currentWorld?'CURRENT WORLD':worldRole(selectedWorld).toUpperCase()}</Text></View>
        <Text style={styles.heroTitle}>{selectedWorld.name}</Text>
        <Text style={styles.heroCopy}>{worldFantasy(selectedWorld)}</Text>
        <View style={styles.heroAction}><Text style={styles.heroActionText}>Explore this world</Text><ChevronRight size={18} color="#24160B"/></View>
      </View>
    </Pressable>

    {context.recommendations.length?<Section title="For you" action="Plan something" onAction={()=>router.push(`/(tabs)/chat-tab?${handle?`character=${handle}&`:''}plan=1&world=${selectedWorld.slug}` as never)}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recommendationRow}>{context.recommendations.map((item)=><Pressable key={item.id} onPress={()=>planAt(item.option)} style={styles.recommendationCard}><Image source={locationHeroAsset(selectedWorld.slug,item.location.slug)} style={StyleSheet.absoluteFill} contentFit="cover"/><View style={styles.recommendationShade}/><View style={styles.recommendationIcon}><Sparkles size={16} color="#FFD5A0"/></View><View style={styles.recommendationContent}><Text style={styles.recommendationTitle}>{item.title}</Text><Text numberOfLines={2} style={styles.recommendationCopy}>{item.subtitle}</Text><View style={styles.roundArrow}><ChevronRight size={17} color="#fff"/></View></View></Pressable>)}</ScrollView></Section>:null}

    <Section title="Places" action={category?'Clear filter':'See all'} onAction={()=>category?setCategory(null):router.push(`/world/places?world=${selectedWorld.slug}` as never)}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>{context.categories.map((item)=>{const preview=locationsForExploreCategory(context.locations,item.id)[0];return <Pressable key={item.id} onPress={()=>setCategory((current)=>current===item.id?null:item.id)} style={[styles.categoryCard,category===item.id&&styles.categoryCardActive]}>{preview?<Image source={locationHeroAsset(selectedWorld.slug,preview.slug)} style={StyleSheet.absoluteFill} contentFit="cover"/>:null}<View style={styles.categoryShade}/><View style={styles.categoryIcon}>{categoryIcons[item.id]}</View><Text style={styles.categoryLabel}>{item.label}</Text></Pressable>;})}</ScrollView>
      {category?<View style={styles.filterLine}><Text style={styles.filterLabel}>{context.categories.find((item)=>item.id===category)?.label}</Text><Text style={styles.filterMeta}>{categoryLocations.length} places in {selectedWorld.name}</Text></View>:null}
      <View style={styles.locationGrid}>{visibleLocations.map((location)=><Pressable key={location.id} onPress={()=>openLocation(location)} style={styles.locationCard}><Image source={locationHeroAsset(selectedWorld.slug,location.slug)} style={StyleSheet.absoluteFill} contentFit="cover"/><View style={styles.locationShade}/><View style={styles.locationCopy}><Text style={styles.locationType}>{friendlyCategory(location.category)}</Text><Text style={styles.locationName}>{location.name}</Text><Text numberOfLines={1} style={styles.locationMeta}>{location.possible_activities.slice(0,3).join(' · ')}</Text></View></Pressable>)}</View>
    </Section>

    <Section title="Worlds" action="See all" onAction={()=>setWorldPickerOpen(true)}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.worldRow}>{worlds.filter((world)=>world.id!==selectedWorld.id).map((world)=><Pressable key={world.id} onPress={()=>{setBrowsedWorldId(world.id);router.setParams({world:world.slug} as never);}} style={styles.worldCard}><Image source={worldHeroAsset(world.slug)} style={StyleSheet.absoluteFill} contentFit="cover"/><View style={styles.worldCardShade}/><View style={styles.worldCardCopy}><Text style={styles.worldCardName}>{world.name}</Text><Text style={styles.worldCardMeta}>{worldRole(world)}</Text></View></Pressable>)}</ScrollView></Section>

    {context.worldEvents.length?<Section title="What’s happening" action="View world" onAction={openWorld}><View style={styles.eventStack}>{context.worldEvents.map((event)=><Pressable key={event.id} onPress={()=>handle&&router.push(`/(tabs)/chat-tab?character=${handle}&draft=${encodeURIComponent(`What's going on with ${event.title}?`)}` as never)} style={styles.eventCard}><View style={styles.eventIcon}><Sparkles size={16} color={colors.warm}/></View><View style={{flex:1}}><Text style={styles.eventTitle}>{event.title}</Text><Text numberOfLines={2} style={styles.eventCopy}>{event.narrative_summary}</Text></View><ChevronRight size={17} color={colors.muted}/></Pressable>)}</View></Section>:null}

    {context.people.length?<Section title={`People in ${selectedWorld.name}`} action="Discover people" onAction={()=>router.push('/(tabs)/singles' as never)}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.peopleRow}>{context.people.map((person)=><PersonCard key={person.id} person={person}/>)}</ScrollView></Section>:null}
  </Screen>;
}

function PersonCard({person}:{person:CharacterTemplate}){return <Pressable onPress={()=>router.push(`/character/${person.public_handle??person.slug}` as never)} style={styles.personCard}><View style={styles.personAvatar}><Text style={styles.personInitial}>{person.name[0]}</Text></View><Text style={styles.personName}>{person.name}</Text><Text numberOfLines={1} style={styles.personMeta}>{person.occupation}</Text></Pressable>}
function Section({title,action,onAction,children}:{title:string;action?:string;onAction?:()=>void;children:React.ReactNode}){return <View style={styles.section}><View style={styles.sectionHead}><Text style={styles.sectionTitle}>{title}</Text>{action&&onAction?<Pressable onPress={onAction} style={styles.sectionAction}><Text style={styles.sectionActionText}>{action}</Text><ChevronRight size={14} color="#F2C67D"/></Pressable>:null}</View>{children}</View>}
function worldRole(world:World){return world.world_role==='destination'?'Destination':world.world_role==='hybrid'?'Home + destination':'Home world'}
function worldFantasy(world:World){const value=world.metadata?.relationshipFantasy;return typeof value==='string'&&value.trim()?value:world.description}
function friendlyCategory(value:string){return value.replace(/_/g,' ').replace(/\b\w/g,(letter)=>letter.toUpperCase())}

const styles=StyleSheet.create({
  content:{paddingTop:22,gap:24},heading:{flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',gap:12},brand:{fontFamily:'Georgia',color:'#E8BF83',fontSize:16,letterSpacing:1.3},pageTitle:{fontFamily:'Georgia',fontSize:44,lineHeight:49,color:colors.text,marginTop:2},worldSelect:{maxWidth:'54%',minHeight:52,flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:10,borderRadius:radius.pill,borderWidth:1,borderColor:colors.borderBright,backgroundColor:'rgba(20,19,25,.88)'},worldSelectImage:{width:34,height:34,borderRadius:17},worldSelectText:{flexShrink:1,color:colors.text,fontSize:13,fontWeight:'800'},worldPicker:{gap:10,padding:12,borderRadius:radius.lg,backgroundColor:colors.elevated,borderWidth:1,borderColor:colors.border},pickerKicker:{fontSize:9,fontWeight:'900',letterSpacing:1.2,color:colors.dimmed},worldPickerRow:{gap:9},worldPickerCard:{width:148,height:90,borderRadius:radius.md,overflow:'hidden',justifyContent:'flex-end',borderWidth:1,borderColor:colors.border},worldPickerCardActive:{borderColor:'#E8BF83',borderWidth:2},worldPickerImage:{...StyleSheet.absoluteFill},worldPickerShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(10,9,16,.34)'},worldPickerName:{zIndex:1,color:'#fff',fontFamily:'Georgia',fontSize:17,paddingHorizontal:10},worldPickerMeta:{zIndex:1,color:'#EADCE4',fontSize:9,paddingHorizontal:10,paddingBottom:9},hero:{height:430,borderRadius:28,overflow:'hidden',borderWidth:1,borderColor:'rgba(240,198,125,.24)',justifyContent:'flex-end',shadowColor:'#000',shadowOpacity:.42,shadowRadius:24,shadowOffset:{width:0,height:14},elevation:8},heroWash:{...StyleSheet.absoluteFill,backgroundColor:'rgba(25,13,22,.08)'},heroBottomShade:{position:'absolute',left:0,right:0,bottom:0,height:'68%',backgroundColor:'rgba(10,9,16,.48)'},heroContent:{zIndex:1,padding:22,gap:8,maxWidth:560},heroStatus:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:9,paddingVertical:5,borderRadius:radius.pill,backgroundColor:'rgba(10,9,16,.62)'},heroStatusText:{color:'#FFE3B6',fontSize:8,fontWeight:'900',letterSpacing:1},heroTitle:{fontFamily:'Georgia',fontSize:42,lineHeight:46,color:'#fff',textShadowColor:'#000',textShadowRadius:12},heroCopy:{color:'#F4E8EB',fontSize:14,lineHeight:20,maxWidth:430,textShadowColor:'#000',textShadowRadius:7},heroAction:{alignSelf:'flex-start',marginTop:8,minHeight:50,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:18,borderRadius:radius.pill,backgroundColor:'#F1C67C'},heroActionText:{color:'#24160B',fontWeight:'900',fontSize:13},section:{gap:13},sectionHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},sectionTitle:{fontFamily:'Georgia',fontSize:27,color:colors.text},sectionAction:{flexDirection:'row',alignItems:'center',gap:2},sectionActionText:{color:'#F2C67D',fontSize:11,fontWeight:'800'},recommendationRow:{gap:11,paddingRight:8},recommendationCard:{width:280,height:190,borderRadius:radius.lg,overflow:'hidden',justifyContent:'flex-end',borderWidth:1,borderColor:colors.borderBright},recommendationShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(10,9,16,.36)'},recommendationIcon:{position:'absolute',top:13,left:13,width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(21,17,22,.72)',borderWidth:1,borderColor:'rgba(240,198,125,.32)'},recommendationContent:{padding:14,paddingRight:48},recommendationTitle:{fontFamily:'Georgia',fontSize:20,color:'#fff',textShadowColor:'#000',textShadowRadius:7},recommendationCopy:{color:'#E9DDE3',fontSize:11,lineHeight:15,marginTop:4},roundArrow:{position:'absolute',right:12,bottom:12,width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(30,27,32,.78)'},categoryRow:{gap:9,paddingRight:8},categoryCard:{width:118,height:100,borderRadius:radius.md,overflow:'hidden',justifyContent:'flex-end',borderWidth:1,borderColor:colors.border},categoryCardActive:{borderColor:'#F1C67C',borderWidth:2},categoryShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(8,8,12,.52)'},categoryIcon:{position:'absolute',top:11,left:11,width:32,height:32,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(14,13,18,.68)'},categoryLabel:{zIndex:1,color:'#fff',fontSize:11,fontWeight:'800',padding:10},filterLine:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},filterLabel:{color:colors.text,fontWeight:'900',fontSize:13},filterMeta:{color:colors.muted,fontSize:10},locationGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},locationCard:{width:'48.5%',minWidth:210,height:175,borderRadius:radius.lg,overflow:'hidden',justifyContent:'flex-end',borderWidth:1,borderColor:colors.border},locationShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(8,8,13,.37)'},locationCopy:{zIndex:1,padding:12},locationType:{color:'#F4C77E',fontSize:8,fontWeight:'900',letterSpacing:.9},locationName:{fontFamily:'Georgia',fontSize:19,color:'#fff',marginTop:2,textShadowColor:'#000',textShadowRadius:8},locationMeta:{color:'#E9DDE3',fontSize:9,marginTop:3,textTransform:'capitalize'},worldRow:{gap:11,paddingRight:8},worldCard:{width:180,height:220,borderRadius:radius.lg,overflow:'hidden',justifyContent:'flex-end',borderWidth:1,borderColor:colors.border},worldCardShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(10,9,16,.27)'},worldCardCopy:{zIndex:1,padding:13},worldCardName:{fontFamily:'Georgia',fontSize:21,color:'#fff',textShadowColor:'#000',textShadowRadius:7},worldCardMeta:{color:'#EADCE4',fontSize:9,marginTop:3},eventStack:{gap:9},eventCard:{minHeight:74,flexDirection:'row',alignItems:'center',gap:11,padding:12,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},eventIcon:{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(240,184,126,.10)'},eventTitle:{color:colors.text,fontSize:13,fontWeight:'900'},eventCopy:{color:colors.muted,fontSize:10,lineHeight:15,marginTop:2},peopleRow:{gap:10,paddingRight:8},personCard:{width:132,padding:12,alignItems:'center',borderRadius:radius.lg,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},personAvatar:{width:58,height:58,borderRadius:29,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(232,93,140,.12)',borderWidth:1,borderColor:'rgba(232,93,140,.24)'},personInitial:{fontFamily:'Georgia',fontSize:26,color:'#FFC0D5'},personName:{color:colors.text,fontSize:12,fontWeight:'900',marginTop:8},personMeta:{color:colors.muted,fontSize:9,marginTop:2,textAlign:'center'}
});
