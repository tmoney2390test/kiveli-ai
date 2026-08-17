import{useMemo,useState}from'react';
import{Pressable,StyleSheet,Text,TextInput,View}from'react-native';
import{Image}from'expo-image';
import{router,useLocalSearchParams}from'expo-router';
import{ArrowLeft,ChevronRight,MapPin,Search}from'lucide-react-native';
import{worldHeroAsset}from'../../src/assets';
import{EmptyState,LoadingSkeleton,Screen}from'../../src/components';
import{colors,radius}from'../../src/theme';
import{useTogether}from'../../src/store/useTogether';
import{childLocations,locationsForWorld}from'../../src/lib/place';

export default function Places(){
  const{world:worldSlug}=useLocalSearchParams<{world?:string}>(),snapshot=useTogether((state)=>state.snapshot),[query,setQuery]=useState('');
  if(!snapshot)return <LoadingSkeleton/>;
  const world=snapshot.worlds.find((item)=>item.slug===(worldSlug??''))??snapshot.worlds.find((item)=>item.published);
  if(!world)return <EmptyState title="World unavailable" body="No published world is available yet." action="Back" onAction={()=>router.back()}/>;
  const locations=locationsForWorld(snapshot,world.id),roots=locations.filter((item)=>!item.parent_location_id).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0));
  const visible=useMemo(()=>{const needle=query.trim().toLowerCase();if(!needle)return roots;return roots.filter((root)=>[root,...childLocations(snapshot,root.id)].some((item)=>`${item.name} ${item.description} ${item.possible_activities.join(' ')}`.toLowerCase().includes(needle)));},[query,roots,snapshot]);
  const role=String((world as unknown as {world_role?:string}).world_role??'home');
  return <Screen>
    <View style={styles.header}><Pressable onPress={()=>router.canGoBack()?router.back():router.replace(`/(tabs)/explore?world=${world.slug}`)} style={styles.back}><ArrowLeft color={colors.text}/></Pressable><View style={{flex:1}}><Text style={styles.kicker}>{role==='destination'?'DESTINATION WORLD':'HOME WORLD'}</Text><Text style={styles.title}>{world.name}</Text><Text style={styles.subtitle}>{locations.length} mapped places · {world.timezone}</Text></View></View>
    <Image source={worldHeroAsset(world.slug)} style={styles.hero} contentFit="cover"/>
    <View style={styles.search}><Search size={17} color={colors.muted}/><TextInput value={query} onChangeText={setQuery} placeholder={`Search ${world.name}`} placeholderTextColor={colors.muted} style={styles.searchInput}/></View>
    {visible.length?<View style={styles.groups}>{visible.map((root)=>{const children=childLocations(snapshot,root.id);return <View key={root.id} style={styles.group}><Pressable onPress={()=>router.push(`/location/${root.slug}?world=${world.slug}` as never)} style={styles.root}><View style={{flex:1}}><Text style={styles.rootType}>{root.location_type.toUpperCase()}</Text><Text style={styles.rootName}>{root.name}</Text><Text style={styles.rootCopy}>{root.description}</Text></View><ChevronRight color={colors.rose}/></Pressable>{children.length?<View style={styles.children}>{children.slice(0,8).map((child)=><Pressable key={child.id} onPress={()=>router.push(`/location/${child.slug}?world=${world.slug}` as never)} style={styles.child}><View style={styles.childIcon}><MapPin size={14} color={colors.violet}/></View><View style={{flex:1}}><Text style={styles.childName}>{child.name}</Text><Text style={styles.childMeta} numberOfLines={1}>{child.possible_activities.slice(0,3).join(' · ')||child.location_type}</Text></View><ChevronRight size={15} color={colors.muted}/></Pressable>)}</View>:null}</View>})}</View>:<EmptyState title="No places match" body="Try another name, activity, or neighborhood."/>}
  </Screen>;
}
const styles=StyleSheet.create({header:{flexDirection:'row',gap:12,alignItems:'flex-start'},back:{width:42,height:42,borderRadius:21,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},kicker:{color:colors.rose,fontSize:8,fontWeight:'900',letterSpacing:1.1},title:{fontFamily:'Georgia',fontSize:31,color:colors.text,marginTop:2},subtitle:{color:colors.muted,fontSize:11,marginTop:3},hero:{height:190,width:'100%',borderRadius:radius.xl,backgroundColor:colors.elevated},search:{minHeight:50,flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:13,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},searchInput:{flex:1,color:colors.text},groups:{gap:13},group:{borderRadius:radius.lg,overflow:'hidden',backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},root:{flexDirection:'row',alignItems:'center',gap:10,padding:14,backgroundColor:'rgba(232,93,140,.05)'},rootType:{color:colors.rose,fontSize:8,fontWeight:'900',letterSpacing:1},rootName:{fontFamily:'Georgia',fontSize:21,color:colors.text,marginTop:2},rootCopy:{color:colors.muted,fontSize:10,lineHeight:15,marginTop:4},children:{paddingHorizontal:8,paddingBottom:7},child:{minHeight:52,flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:7,borderTopWidth:1,borderTopColor:colors.border},childIcon:{width:29,height:29,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:colors.elevated},childName:{color:colors.text,fontSize:12,fontWeight:'800'},childMeta:{color:colors.muted,fontSize:9,marginTop:2}});
