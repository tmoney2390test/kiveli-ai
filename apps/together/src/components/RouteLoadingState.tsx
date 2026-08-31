import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { colors, radius } from '../theme';
import { routeLoadingKind, type RouteLoadingKind } from '../lib/routeLoading';
import { characterAssets } from '../assets';
import { characterNameFromSlug } from '../lib/characterProfilePresentation';

export function RouteLoadingState({ pathname, label }: { pathname: string; label?: string }) {
  const kind = routeLoadingKind(pathname);
  const { width } = useWindowDimensions();
  if (kind === 'character') return <CharacterProfileLoadingState pathname={pathname} label={label} desktop={width >= 820}/>;
  return <View accessibilityLabel={label ?? loadingLabel(kind)} accessibilityLiveRegion="polite" style={styles.root}>
    <View style={styles.frame}>
      <View style={styles.top}><View style={styles.brand}/><View style={styles.chip}/></View>
      {kind === 'home' || kind === 'explore' ? <View style={styles.hero}><View style={styles.heroCopy}><View style={styles.eyebrow}/><View style={styles.title}/><View style={styles.line}/><View style={styles.button}/></View></View> : null}
      {kind === 'messages' ? <View style={styles.messages}><View style={styles.avatar}/><View style={styles.messageColumn}><View style={styles.messageIncoming}/><View style={styles.messageOutgoing}/><View style={styles.messageIncomingShort}/></View></View> : null}
      {kind === 'moments' ? <View style={styles.filterRow}>{[0,1,2,3].map((item)=><View key={item} style={styles.filter}/>)}</View> : null}
      <View style={styles.sectionTitle}/>
      <View style={styles.grid}>{[0,1,2].map((item)=><View key={item} style={[styles.card, kind === 'moments' && styles.momentCard]}/>)}</View>
      <Text style={styles.label}>{label ?? loadingLabel(kind)}</Text>
    </View>
  </View>;
}

function loadingLabel(kind: RouteLoadingKind) {
  if (kind === 'home') return 'Opening your world…';
  if (kind === 'explore') return 'Opening Explore…';
  if (kind === 'moments') return 'Opening Moments…';
  if (kind === 'messages') return 'Opening Messages…';
  if (kind === 'character') return 'Opening character profile…';
  return 'Opening Kivelle…';
}

function CharacterProfileLoadingState({ pathname, label, desktop }: { pathname: string; label?: string; desktop: boolean }) {
  const rawSlug = pathname.split('/character/')[1]?.split(/[/?#]/, 1)[0] ?? '';
  const slug = decodeURIComponent(rawSlug);
  const name = characterNameFromSlug(slug);
  const source = characterAssets[slug];
  return <View accessibilityLabel={label ?? `Opening ${name}’s profile…`} accessibilityLiveRegion="polite" accessibilityState={{busy:true}} style={styles.root}>
    <View style={[styles.profileFrame, desktop && styles.profileFrameDesktop]}>
      <View style={[styles.profilePortrait, desktop ? styles.profilePortraitDesktop : styles.profilePortraitMobile]}>
        {source ? <Image accessible={false} source={source} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" cachePolicy="memory-disk" priority="high"/> : null}
        <View style={styles.profileShade}/>
        <Text numberOfLines={2} style={styles.profileName}>{name}</Text>
      </View>
      <View style={[styles.profileDetails, desktop && styles.profileDetailsDesktop]}>
        <View style={styles.profileBadges}><View style={styles.profileBadge}/><View style={styles.profileBadgeShort}/></View>
        <View style={styles.profileHeading}/>
        <View style={styles.profileLine}/><View style={[styles.profileLine,{width:'84%'}]}/><View style={[styles.profileLine,{width:'63%'}]}/>
        <View style={styles.profileStats}>{[0,1,2].map((item)=><View key={item} style={styles.profileStat}/>)}</View>
        <View style={styles.profileSchedule}/>
        <Text style={styles.label}>{label ?? `Opening ${name}’s profile…`}</Text>
      </View>
    </View>
  </View>;
}

const styles=StyleSheet.create({root:{flex:1,minHeight:420,backgroundColor:colors.background},frame:{width:'100%',maxWidth:1180,alignSelf:'center',paddingHorizontal:20,paddingTop:28,gap:22},top:{height:44,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brand:{width:132,height:25,borderRadius:8,backgroundColor:colors.surface},chip:{width:90,height:36,borderRadius:18,backgroundColor:colors.surface},hero:{height:290,borderRadius:radius.xl,overflow:'hidden',justifyContent:'flex-end',padding:20,backgroundColor:'#20131E'},heroCopy:{gap:10,maxWidth:540},eyebrow:{width:106,height:9,borderRadius:5,backgroundColor:'rgba(255,255,255,.12)'},title:{width:'72%',height:45,borderRadius:12,backgroundColor:'rgba(255,255,255,.11)'},line:{width:'54%',height:14,borderRadius:7,backgroundColor:'rgba(255,255,255,.08)'},button:{width:190,height:44,borderRadius:22,backgroundColor:'rgba(216,62,234,.24)'},filterRow:{flexDirection:'row',gap:8},filter:{width:84,height:36,borderRadius:18,backgroundColor:colors.surface},sectionTitle:{width:176,height:28,borderRadius:8,backgroundColor:colors.surface},grid:{flexDirection:'row',gap:12,overflow:'hidden'},card:{width:248,height:300,borderRadius:radius.lg,backgroundColor:colors.surface},momentCard:{width:154,height:205},label:{color:colors.muted,fontSize:11},messages:{minHeight:260,flexDirection:'row',alignItems:'flex-start',gap:12,paddingTop:10},avatar:{width:42,height:42,borderRadius:21,backgroundColor:colors.surface},messageColumn:{flex:1,gap:14},messageIncoming:{width:'68%',height:72,borderRadius:18,backgroundColor:colors.surface},messageOutgoing:{width:'58%',height:58,borderRadius:18,backgroundColor:'rgba(216,62,234,.15)',alignSelf:'flex-end'},messageIncomingShort:{width:'45%',height:52,borderRadius:18,backgroundColor:colors.surface},profileFrame:{width:'100%',maxWidth:1040,alignSelf:'center',padding:16,paddingTop:28,gap:16},profileFrameDesktop:{padding:32,flexDirection:'row',alignItems:'flex-start',gap:32},profilePortrait:{overflow:'hidden',justifyContent:'flex-end',padding:20,borderRadius:radius.xl,borderWidth:1,borderColor:'rgba(255,255,255,.12)',backgroundColor:'#211321'},profilePortraitMobile:{width:'100%',height:310},profilePortraitDesktop:{width:330,height:430},profileShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(8,6,12,.34)'},profileName:{color:'#fff',fontFamily:'Georgia',fontSize:34,lineHeight:38,fontWeight:'700',textShadowColor:'#000',textShadowRadius:12},profileDetails:{gap:14,padding:20,borderRadius:radius.xl,borderWidth:1,borderColor:colors.border,backgroundColor:colors.background},profileDetailsDesktop:{flex:1,minHeight:430,backgroundColor:colors.glass},profileBadges:{flexDirection:'row',gap:8},profileBadge:{width:78,height:25,borderRadius:13,backgroundColor:'rgba(216,62,234,.18)'},profileBadgeShort:{width:58,height:25,borderRadius:13,backgroundColor:'rgba(154,104,255,.18)'},profileHeading:{width:'72%',height:32,borderRadius:8,backgroundColor:colors.surface},profileLine:{width:'100%',height:12,borderRadius:6,backgroundColor:colors.surface},profileStats:{flexDirection:'row',gap:8},profileStat:{flex:1,height:62,borderRadius:radius.md,backgroundColor:colors.surface},profileSchedule:{height:118,borderRadius:radius.lg,backgroundColor:colors.surface}});
