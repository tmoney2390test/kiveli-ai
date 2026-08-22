import{useEffect,useState}from'react';
import{Platform,Pressable,StyleSheet,Text,View,useWindowDimensions}from'react-native';
import{Image}from'expo-image';
import{ArrowRight,ChevronRight,Globe2}from'lucide-react-native';
import{worldHeroAsset}from'../../assets';
import{colors,radius,typography}from'../../theme';
import type{World}from'../../types';

export function HomeWorldDiscoveryHero({worlds,onExplore}:{worlds:World[];onExplore:(world:World)=>void}){
  const{width,height}=useWindowDimensions();
  const[index,setIndex]=useState(0);
  const signature=worlds.map((world)=>world.id).join(':');
  useEffect(()=>{setIndex(0);},[signature]);
  if(!worlds.length)return null;
  const world=worlds[index%worlds.length]??worlds[0];
  if(!world)return null;
  const desktop=width>=900;
  const heroHeight=desktop?320:Math.min(325,Math.max(300,height*.36));
  const relationshipFantasy=world.metadata?.relationshipFantasy;
  const copy=typeof relationshipFantasy==='string'&&relationshipFantasy.trim()?relationshipFantasy:world.description;
  const next=()=>setIndex((current)=>(current+1)%worlds.length);

  return <View accessibilityLabel={`Discover ${world.name}`} style={[styles.hero,{height:heroHeight},desktop&&styles.heroDesktop]}>
    <Image accessibilityLabel={`${world.name} world`} source={worldHeroAsset(world.slug)} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" cachePolicy="memory-disk" transition={180}/>
    <View pointerEvents="none" style={[styles.scrim,Platform.OS==='web'?styles.webScrim:styles.nativeScrim]}/>
    <View style={styles.content}>
      <View style={styles.topRow}><View style={styles.kickerRow}><Globe2 size={13} strokeWidth={2.2} color="#FFE1AE"/><Text style={styles.kicker}>NEW WORLDS AVAILABLE</Text></View><Text style={styles.count}>{index+1} / {worlds.length}</Text></View>
      <View style={styles.bottom}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={styles.title}>{world.name}</Text>
        <Text numberOfLines={3} style={styles.copy}>{copy}</Text>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Explore ${world.name}`} onPress={()=>onExplore(world)} style={({pressed})=>[styles.cta,pressed&&styles.pressed]}><Text style={styles.ctaText}>Explore {world.name}</Text><ArrowRight size={18} color="#20140B"/></Pressable>
          {worlds.length>1?<Pressable accessibilityRole="button" accessibilityLabel="Show another world" onPress={next} style={({pressed})=>[styles.next,pressed&&styles.pressed]}><Text style={styles.nextText}>Next world</Text><ChevronRight size={16} color="#FFF4F8"/></Pressable>:null}
        </View>
      </View>
    </View>
  </View>;
}

const styles=StyleSheet.create({
  hero:{width:'100%',overflow:'hidden',borderRadius:29,backgroundColor:colors.elevated,borderWidth:1,borderColor:'rgba(240,198,125,.23)',shadowColor:'#C58C45',shadowOpacity:.15,shadowRadius:34,shadowOffset:{width:0,height:20},elevation:9},
  heroDesktop:{borderRadius:34},
  scrim:{...StyleSheet.absoluteFill},
  nativeScrim:{backgroundColor:'rgba(7,5,10,.48)'},
  webScrim:{backgroundImage:'linear-gradient(0deg, rgba(6,4,8,.94) 0%, rgba(7,5,10,.18) 76%), linear-gradient(90deg, rgba(7,5,10,.35), transparent 72%)'}as never,
  content:{flex:1,justifyContent:'space-between',padding:18},
  topRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
  kickerRow:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:9,paddingVertical:6,borderRadius:radius.pill,backgroundColor:'rgba(8,6,12,.62)',borderWidth:1,borderColor:'rgba(255,225,174,.18)'},
  kicker:{color:'#FFE1AE',fontSize:8,fontWeight:'900',letterSpacing:1.05},
  count:{color:'rgba(255,255,255,.74)',fontSize:9,fontWeight:'900',textShadowColor:'#000',textShadowRadius:8},
  bottom:{gap:7,maxWidth:520},
  title:{color:'#FFF9F6',fontFamily:typography.display,fontSize:39,lineHeight:43,fontWeight:'600',letterSpacing:-.8,textShadowColor:'#000',textShadowRadius:16},
  copy:{maxWidth:470,color:'rgba(255,248,244,.84)',fontSize:12,lineHeight:18,fontWeight:'600',textShadowColor:'#000',textShadowRadius:9},
  actions:{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap',marginTop:3},
  cta:{minHeight:46,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,paddingHorizontal:16,borderRadius:16,backgroundColor:'#F1C67C',borderWidth:1,borderColor:'rgba(255,255,255,.22)'},
  ctaText:{color:'#20140B',fontSize:12,fontWeight:'900'},
  next:{minHeight:44,flexDirection:'row',alignItems:'center',gap:3,paddingHorizontal:12,borderRadius:15,backgroundColor:'rgba(12,9,16,.64)',borderWidth:1,borderColor:'rgba(255,255,255,.2)'},
  nextText:{color:'#FFF4F8',fontSize:10,fontWeight:'900'},
  pressed:{opacity:.86,transform:[{scale:.985}]},
});
