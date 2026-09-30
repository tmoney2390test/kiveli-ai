import { isComingSoonWorld } from '../../lib/comingSoonWorlds';
import{useEffect,useState}from'react';
import{AccessibilityInfo,AppState,Platform,Pressable,StyleSheet,Text,View,useWindowDimensions}from'react-native';
import{Image}from'expo-image';
import{CatalogImage}from'../CatalogImage';
import{Globe2}from'lucide-react-native';
import{worldHeroAsset}from'../../assets';
import{advanceHomeWorldIndex,shouldAutoRotateHomeWorlds}from'../../lib/homeWorldDiscovery';
import{colors,radius,typography}from'../../theme';
import type{World}from'../../types';

export function HomeWorldDiscoveryHero({worlds,onExplore,fill=false}:{worlds:World[];onExplore:(world:World)=>void;fill?:boolean}){
  const{width}=useWindowDimensions();
  const[index,setIndex]=useState(0);
  const[reducedMotion,setReducedMotion]=useState(false);
  const[appActive,setAppActive]=useState(AppState.currentState==='active');
  const[documentVisible,setDocumentVisible]=useState(()=>Platform.OS!=='web'||typeof document==='undefined'||document.visibilityState==='visible');
  const signature=worlds.map((world)=>world.id).join(':');
  useEffect(()=>{setIndex(0);},[signature]);
  useEffect(()=>{
    let mounted=true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled)=>{if(mounted)setReducedMotion(enabled);});
    const subscription=AccessibilityInfo.addEventListener('reduceMotionChanged',setReducedMotion);
    return()=>{mounted=false;subscription.remove();};
  },[]);
  useEffect(()=>{
    const subscription=AppState.addEventListener('change',(state)=>setAppActive(state==='active'));
    return()=>subscription.remove();
  },[]);
  useEffect(()=>{
    if(Platform.OS!=='web'||typeof document==='undefined')return;
    const sync=()=>setDocumentVisible(document.visibilityState==='visible');
    document.addEventListener('visibilitychange',sync);
    return()=>document.removeEventListener('visibilitychange',sync);
  },[]);
  useEffect(()=>{
    if(!shouldAutoRotateHomeWorlds({count:worlds.length,reducedMotion,appActive,documentVisible}))return;
    const timer=setTimeout(()=>setIndex((current)=>advanceHomeWorldIndex(current,worlds.length)),8_000);
    return()=>clearTimeout(timer);
  },[appActive,documentVisible,index,reducedMotion,signature,worlds.length]);
  useEffect(()=>{
    if(worlds.length<2)return;
    const upcoming=worlds[advanceHomeWorldIndex(index,worlds.length)];
    const upcomingUri=upcoming?worldHeroAsset(upcoming.slug).uri:undefined;
    if(upcomingUri)void Image.prefetch(upcomingUri,'memory-disk').catch(()=>undefined);
  },[index,signature,worlds]);
  if(!worlds.length)return null;
  const world=worlds[index%worlds.length]??worlds[0];
  if(!world)return null;
  const desktop=width>=900;
  const comingSoon=isComingSoonWorld(world);

  return <Pressable accessibilityRole="button" accessibilityLabel={comingSoon?`${world.name}, coming soon`:`Explore ${world.name}`} accessibilityState={{disabled:comingSoon}} disabled={comingSoon} onPress={()=>onExplore(world)} style={({pressed})=>[styles.hero,desktop&&styles.heroDesktop,fill&&styles.fill,pressed&&styles.pressed]}>
    <CatalogImage accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" alt="" source={worldHeroAsset(world.slug)} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" cachePolicy="memory-disk" loading="lazy" priority="low" transition={180}/>
    <View pointerEvents="none" style={[styles.scrim,Platform.OS==='web'?styles.webScrim:styles.nativeScrim]}/>
    <View pointerEvents="none" style={styles.content}>
      <View style={styles.topRow}><View style={styles.kickerRow}><Globe2 size={13} strokeWidth={2.2} color="#FFE1AE"/><Text style={styles.kicker}>{isComingSoonWorld(world)?"COMING SOON":"NEW WORLDS AVAILABLE"}</Text></View><Text style={styles.count}>{index+1} / {worlds.length}</Text></View>
      <View style={styles.bottom}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={styles.title}>{world.name}</Text>
      </View>
    </View>
  </Pressable>;
}

const styles=StyleSheet.create({
  hero:{width:'100%',minHeight:218,overflow:'hidden',borderRadius:25,backgroundColor:colors.elevated,borderWidth:1,borderColor:'rgba(240,198,125,.23)',shadowColor:'#C58C45',shadowOpacity:.15,shadowRadius:28,shadowOffset:{width:0,height:16},elevation:8},
  heroDesktop:{borderRadius:34},
  fill:{height:'100%'},
  scrim:{...StyleSheet.absoluteFill},
  nativeScrim:{backgroundColor:'rgba(7,5,10,.48)'},
  webScrim:{backgroundImage:'linear-gradient(0deg, rgba(6,4,8,.94) 0%, rgba(7,5,10,.18) 76%), linear-gradient(90deg, rgba(7,5,10,.35), transparent 72%)'}as never,
  content:{flex:1,minHeight:218,justifyContent:'space-between',padding:18,paddingRight:18},
  topRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
  kickerRow:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:9,paddingVertical:6,borderRadius:radius.pill,backgroundColor:'rgba(8,6,12,.62)',borderWidth:1,borderColor:'rgba(255,225,174,.18)'},
  kicker:{color:'#FFE1AE',fontSize:8,fontWeight:'900',letterSpacing:1.05},
  count:{color:'rgba(255,255,255,.74)',fontSize:9,fontWeight:'900',textShadowColor:'#000',textShadowRadius:8},
  bottom:{gap:7,maxWidth:520},
  title:{color:'#FFF9F6',fontFamily:typography.display,fontSize:34,lineHeight:38,fontWeight:'600',letterSpacing:-.7,textShadowColor:'#000',textShadowRadius:16},
  pressed:{opacity:.9},
});
