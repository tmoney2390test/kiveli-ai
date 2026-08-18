import{useEffect,useMemo,useState}from'react';
import{Pressable,StyleSheet,Text,TextInput,View,useWindowDimensions}from'react-native';
import{Image}from'expo-image';
import{router,useLocalSearchParams}from'expo-router';
import{ArrowLeft,ArrowUpRight,ChevronDown,ChevronRight,Search}from'lucide-react-native';
import{locationHeroAsset,worldHeroAsset}from'../../src/assets';
import{EmptyState,LoadingSkeleton,PlaceCategoryFilters,Screen}from'../../src/components';
import{type ExploreCategoryId}from'../../src/lib/explore';
import{buildWorldPlaceDirectory,type WorldPlaceDirectorySection}from'../../src/lib/worldPlaceDirectory';
import{useTogether}from'../../src/store/useTogether';
import{colors,radius,typography}from'../../src/theme';
import type{Location,World}from'../../src/types';

export default function Places(){
  const{world:worldSlug}=useLocalSearchParams<{world?:string}>();
  const snapshot=useTogether((state)=>state.snapshot);
  const{width}=useWindowDimensions();
  const[query,setQuery]=useState('');
  const[category,setCategory]=useState<ExploreCategoryId|null>(null);
  const[expanded,setExpanded]=useState<Set<string>>(new Set());

  const world=snapshot?.worlds.find((item)=>item.slug===(worldSlug??''))??snapshot?.worlds.find((item)=>item.published);
  const baseDirectory=useMemo(()=>world&&snapshot?buildWorldPlaceDirectory(snapshot.locations,world.id):null,[snapshot,world]);
  const directory=useMemo(()=>world&&snapshot?buildWorldPlaceDirectory(snapshot.locations,world.id,{query,category}):null,[snapshot,world,query,category]);

  useEffect(()=>{
    const first=baseDirectory?.sections[0]?.id;
    setExpanded(first?new Set([first]):new Set());
  },[world?.id,baseDirectory?.sections[0]?.id]);

  if(!snapshot)return <LoadingSkeleton label="Mapping places…"/>;
  if(!world||!directory||!baseDirectory)return <EmptyState title="World unavailable" body="No published world is available yet." action="Back" onAction={()=>router.back()}/>;

  const contentWidth=Math.max(280,Math.min(width,840)-40);
  const placeGridWidth=Math.max(240,contentWidth-26);
  const cardWidth=Math.floor((placeGridWidth-12)/2);
  const cardHeight=Math.max(250,Math.min(330,Math.round(cardWidth*1.45)));
  const filtering=Boolean(query.trim()||category);
  const role=String(world.world_role??'home');
  const toggle=(id:string)=>setExpanded((current)=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});

  return <Screen contentStyle={styles.content}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Explore" onPress={()=>router.canGoBack()?router.back():router.replace(`/(tabs)/explore?world=${world.slug}`)} style={styles.back}><ArrowLeft size={20} color={colors.text}/></Pressable>
      <View style={styles.headerCopy}><Text style={styles.kicker}>{role==='destination'?'DESTINATION WORLD':'EXPLORE THE WORLD'}</Text><Text style={styles.title}>{world.name}</Text><Text style={styles.subtitle}>{baseDirectory.totalPlaceCount} places across {districtCountLabel(baseDirectory.sections.filter((section)=>section.kind==='district').length)}</Text></View>
    </View>

    <View style={styles.hero}>
      <Image source={worldHeroAsset(world.slug)} style={StyleSheet.absoluteFill} contentFit="cover"/>
      <View style={styles.heroShade}/>
      <View style={styles.heroCopy}><Text style={styles.heroKicker}>PLACE DIRECTORY</Text><Text style={styles.heroTitle}>Find your corner of {world.name}</Text><Text numberOfLines={2} style={styles.heroSubtitle}>Browse by mood, then open a district to see the places that actually belong there.</Text></View>
    </View>

    <View style={styles.controls}>
      <View style={styles.search}><Search size={17} color={colors.muted}/><TextInput accessibilityLabel={`Search places in ${world.name}`} value={query} onChangeText={setQuery} placeholder={`Search ${world.name}`} placeholderTextColor={colors.muted} style={styles.searchInput}/>{query?<Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={()=>setQuery('')}><Text style={styles.clear}>Clear</Text></Pressable>:null}</View>
      <PlaceCategoryFilters categories={baseDirectory.categories} value={category} onChange={setCategory}/>
      <View style={styles.resultsLine}><Text style={styles.resultsTitle}>{category?baseDirectory.categories.find((item)=>item.id===category)?.label:'All places'}</Text><Text style={styles.resultsMeta}>{directory.visiblePlaceCount} {directory.visiblePlaceCount===1?'place':'places'}</Text></View>
    </View>

    {directory.sections.length?<View style={styles.sections}>{directory.sections.map((section)=>{
      const isOpen=filtering||expanded.has(section.id);
      return <DistrictSection key={section.id} section={section} world={world} isOpen={isOpen} onToggle={()=>toggle(section.id)} cardWidth={cardWidth} cardHeight={cardHeight}/>;
    })}</View>:<EmptyState title="No places match" body="Try another name, activity, or category."/>}
  </Screen>;
}

function DistrictSection({section,world,isOpen,onToggle,cardWidth,cardHeight}:{section:WorldPlaceDirectorySection;world:World;isOpen:boolean;onToggle:()=>void;cardWidth:number;cardHeight:number}){
  const district=section.district;
  const name=district?.name??`Around ${world.name}`;
  const description=district?.canonical_lore?.summary??district?.description??'Places that belong to the wider city rather than one authored district.';
  const shown=section.places.length;
  return <View style={styles.section}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${isOpen?'Collapse':'Expand'} ${name}, ${section.totalPlaceCount} places`} accessibilityState={{expanded:isOpen}} onPress={onToggle} style={({pressed})=>[styles.districtHero,pressed&&styles.pressed]}>
      <Image source={district?locationHeroAsset(world.slug,district.slug):worldHeroAsset(world.slug)} style={StyleSheet.absoluteFill} contentFit="cover"/>
      <View style={styles.districtShade}/>
      <View style={styles.districtCopy}>
        <Text style={styles.districtKicker}>{district?'DISTRICT':'CITYWIDE'}</Text>
        <Text style={styles.districtName}>{name}</Text>
        <Text numberOfLines={2} style={styles.districtDescription}>{description}</Text>
        <Text style={styles.districtCount}>{shown===section.totalPlaceCount?`${section.totalPlaceCount} mapped ${section.totalPlaceCount===1?'place':'places'}`:`${shown} of ${section.totalPlaceCount} places`}</Text>
      </View>
      <View style={styles.expandButton}>{isOpen?<ChevronDown size={21} color="#fff"/>:<ChevronRight size={21} color="#fff"/>}</View>
    </Pressable>

    {isOpen?<View style={styles.expanded}>
      {district?<View style={styles.districtActions}><Text style={styles.insideLabel}>INSIDE {district.name.toUpperCase()}</Text><Pressable accessibilityRole="link" onPress={()=>router.push(`/location/${district.slug}?world=${world.slug}` as never)} style={styles.detailsLink}><Text style={styles.detailsLinkText}>District details</Text><ArrowUpRight size={14} color={colors.rose}/></Pressable></View>:<Text style={styles.citywideNote}>These places are visible now and can move into a district as the world map becomes more detailed.</Text>}
      {section.places.length?<View style={styles.placeGrid}>{section.places.map((place)=><PlaceCard key={place.id} place={place} world={world} width={cardWidth} height={cardHeight} districtName={district?.name}/>)}</View>:<View style={styles.emptyDistrict}><Text style={styles.emptyDistrictTitle}>No matching places here</Text><Text style={styles.emptyDistrictCopy}>Try another filter to explore this district.</Text></View>}
    </View>:null}
  </View>;
}

function PlaceCard({place,world,width,height,districtName}:{place:Location;world:World;width:number;height:number;districtName?:string}){
  const activities=place.possible_activities.slice(0,3).map(friendly).join(' · ');
  return <Pressable accessibilityRole="link" accessibilityLabel={`Open ${place.name}${districtName?` in ${districtName}`:''}`} onPress={()=>router.push(`/location/${place.slug}?world=${world.slug}` as never)} style={({pressed})=>[styles.placeCard,{width,height},pressed&&styles.placeCardPressed]}>
    <Image source={locationHeroAsset(world.slug,place.slug)} style={StyleSheet.absoluteFill} contentFit="cover"/>
    <View style={styles.placeShade}/>
    <View style={styles.placeTop}><Text style={styles.placeType}>{friendly(place.category)}</Text></View>
    <View style={styles.placeCopy}>
      {districtName?<Text numberOfLines={1} style={styles.placeDistrict}>{districtName}</Text>:null}
      <Text numberOfLines={2} style={styles.placeName}>{place.name}</Text>
      <Text numberOfLines={1} style={styles.placeMeta}>{activities||friendly(place.location_type)}</Text>
      <View style={styles.openPlace}><Text style={styles.openPlaceText}>Explore place</Text><ChevronRight size={15} color="#fff"/></View>
    </View>
  </Pressable>;
}

function friendly(value:string){return value.replace(/_/g,' ').replace(/\b\w/g,(letter)=>letter.toUpperCase());}
function districtCountLabel(count:number){return`${count} ${count===1?'district':'districts'}`;}

const styles=StyleSheet.create({
  content:{paddingTop:22,gap:20},
  header:{flexDirection:'row',gap:12,alignItems:'flex-start'},headerCopy:{flex:1},
  back:{width:42,height:42,borderRadius:21,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  kicker:{color:colors.rose,fontSize:8,fontWeight:'900',letterSpacing:1.2},title:{fontFamily:typography.display,fontSize:34,color:colors.text,marginTop:2},subtitle:{color:colors.muted,fontSize:11,marginTop:4},
  hero:{height:220,width:'100%',borderRadius:radius.xl,overflow:'hidden',justifyContent:'flex-end',backgroundColor:colors.elevated,borderWidth:1,borderColor:colors.borderBright},heroShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(7,6,12,.38)'},heroCopy:{zIndex:1,padding:18,maxWidth:540},heroKicker:{color:'#FFD5E2',fontSize:8,fontWeight:'900',letterSpacing:1.25},heroTitle:{fontFamily:typography.display,fontSize:29,lineHeight:33,color:'#fff',marginTop:3,textShadowColor:'#000',textShadowRadius:10},heroSubtitle:{color:'#F0E5EA',fontSize:11,lineHeight:16,marginTop:5,textShadowColor:'#000',textShadowRadius:7},
  controls:{gap:13},search:{minHeight:50,flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:13,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},searchInput:{flex:1,color:colors.text},clear:{color:colors.rose,fontSize:10,fontWeight:'900'},resultsLine:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},resultsTitle:{color:colors.text,fontSize:13,fontWeight:'900'},resultsMeta:{color:colors.muted,fontSize:10},
  sections:{gap:16},section:{borderRadius:radius.xl,overflow:'hidden',backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},districtHero:{height:180,justifyContent:'flex-end'},districtShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(8,7,13,.43)'},districtCopy:{zIndex:1,padding:16,paddingRight:64},districtKicker:{color:'#FFD3DF',fontSize:8,fontWeight:'900',letterSpacing:1.2},districtName:{fontFamily:typography.display,color:'#fff',fontSize:27,lineHeight:31,marginTop:2,textShadowColor:'#000',textShadowRadius:9},districtDescription:{color:'#F0E3E8',fontSize:10,lineHeight:15,marginTop:4,textShadowColor:'#000',textShadowRadius:6},districtCount:{color:'#FFD7E2',fontSize:9,fontWeight:'800',marginTop:7},expandButton:{position:'absolute',right:15,bottom:15,width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(12,9,16,.72)',borderWidth:1,borderColor:'rgba(255,255,255,.24)'},pressed:{opacity:.92},
  expanded:{padding:12,gap:12},districtActions:{minHeight:32,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},insideLabel:{flex:1,color:colors.dimmed,fontSize:8,fontWeight:'900',letterSpacing:1},detailsLink:{flexDirection:'row',alignItems:'center',gap:3},detailsLinkText:{color:colors.rose,fontSize:10,fontWeight:'900'},citywideNote:{color:colors.muted,fontSize:10,lineHeight:15},placeGrid:{flexDirection:'row',flexWrap:'wrap',gap:12},
  placeCard:{overflow:'hidden',justifyContent:'flex-end',borderRadius:22,backgroundColor:colors.elevated,borderWidth:1,borderColor:'rgba(255,255,255,.13)',shadowColor:'#000',shadowOpacity:.24,shadowRadius:16,shadowOffset:{width:0,height:9},elevation:5},placeCardPressed:{opacity:.93,transform:[{scale:.99}]},placeShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(7,5,10,.25)'},placeTop:{position:'absolute',top:13,left:13,paddingHorizontal:9,paddingVertical:6,borderRadius:radius.pill,backgroundColor:'rgba(12,9,16,.72)',borderWidth:1,borderColor:'rgba(255,255,255,.17)'},placeType:{color:'#fff',fontSize:8,fontWeight:'900',letterSpacing:.75},placeCopy:{zIndex:1,padding:16},placeDistrict:{color:'#FFD1DD',fontSize:8,fontWeight:'900',letterSpacing:.9,textTransform:'uppercase'},placeName:{fontFamily:typography.display,fontSize:28,lineHeight:32,color:'#fff',marginTop:2,textShadowColor:'#000',textShadowRadius:10},placeMeta:{color:'#F2E3E8',fontSize:10,fontWeight:'700',marginTop:4,textTransform:'capitalize'},openPlace:{flexDirection:'row',alignItems:'center',gap:2,marginTop:9},openPlaceText:{color:'#fff',fontSize:10,fontWeight:'900'},emptyDistrict:{paddingVertical:22,alignItems:'center'},emptyDistrictTitle:{color:colors.text,fontWeight:'900'},emptyDistrictCopy:{color:colors.muted,fontSize:10,marginTop:3},
});
