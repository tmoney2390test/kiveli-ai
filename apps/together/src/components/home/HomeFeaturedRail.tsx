import {useRef,useState} from 'react';
import {Pressable,ScrollView,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {ArrowRight,ChevronLeft,ChevronRight} from 'lucide-react-native';
import {CompanionPortraitCard} from '../CompanionPortraitCard';
import {useCompanionGenderPreference} from '../CompanionGenderToggle';
import {homeFeaturedCompanions} from '../../lib/homeFeatured';
import type {FeaturedCompanion} from '../../lib/featuredCompanions';
import type {Snapshot} from '../../types';
import {colors,typography} from '../../theme';

export function HomeFeaturedRail({snapshot,worldId,activeTemplateId,onOpen,onViewAll,onToggleFavorite}:{snapshot:Snapshot;worldId?:string;activeTemplateId?:string;onOpen:(c:FeaturedCompanion)=>void;onViewAll:()=>void;onToggleFavorite:(c:FeaturedCompanion,favorite:boolean)=>Promise<void>}){
 const [gender]=useCompanionGenderPreference(),{width}=useWindowDimensions();
 const picks=homeFeaturedCompanions(snapshot,gender,worldId,activeTemplateId);
 const key=`${gender}:${worldId??''}`;
 const rail=useRef<ScrollView|null>(null),offset=useRef(0),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState('');
 const cardWidth=width>=1000?238:width>=700?226:216,step=cardWidth+12;
 if(!picks.length)return null;
 const favorite=async(c:FeaturedCompanion)=>{if(busy)return;setBusy(c.id);setError('');try{await onToggleFavorite(c,!(snapshot.favoriteCharacterTemplateIds??[]).includes(c.id));}catch{setError('Your favorite could not be saved. Try again.');}finally{setBusy(null);}};
 return <View style={s.section}>
  <View style={s.heading}><Text accessibilityRole="header" style={[s.title,width<700&&{fontSize:21}]} numberOfLines={1}>Featured companions</Text><Pressable accessibilityRole="button" accessibilityLabel="Explore all featured companions" onPress={onViewAll} style={s.action}><Text style={s.link}>View all</Text><ArrowRight size={14} color={colors.rose}/></Pressable></View>
  <Text style={s.subtitle}>From across the worlds, picked for you.</Text>
  <ScrollView key={key} ref={rail} horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={step} onScroll={e=>{offset.current=e.nativeEvent.contentOffset.x;}} scrollEventThrottle={100} onContentSizeChange={()=>{offset.current=0;}} contentContainerStyle={s.rail}>
   {picks.map(({companion,world})=><View key={companion.id} style={{width:cardWidth,gap:7}}><CompanionPortraitCard companion={companion} width={cardWidth} height={304} compact loading="lazy" subtitle={companion.occupation} badgeLabel={companion.discovery_metadata?.trending===true?'TRENDING':null} favorite={(snapshot.favoriteCharacterTemplateIds??[]).includes(companion.id)} favoriteBusy={busy!==null} onFavorite={()=>void favorite(companion)} onPress={()=>onOpen(companion)}/><Text numberOfLines={1} style={s.world}>{world.name}</Text></View>)}
  </ScrollView>
  {width>=700&&picks.length>3?<View style={s.controls}>{([-1,1] as const).map(direction=><Pressable key={direction} accessibilityRole="button" accessibilityLabel={direction<0?'Previous featured companions':'Next featured companions'} onPress={()=>rail.current?.scrollTo({x:Math.max(0,offset.current+direction*step*2),animated:true})} style={s.control}>{direction<0?<ChevronLeft size={18} color={colors.text}/>:<ChevronRight size={18} color={colors.text}/>}</Pressable>)}</View>:null}
  {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
 </View>;
}
const s=StyleSheet.create({section:{gap:10},heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},title:{flexShrink:1,color:colors.text,fontFamily:typography.display,fontSize:25,fontWeight:'600'},subtitle:{color:colors.muted,fontSize:12,lineHeight:18,marginTop:-6},action:{flexDirection:'row',gap:5,alignItems:'center',minHeight:44},link:{color:colors.rose,fontSize:12,fontWeight:'700'},rail:{gap:12,paddingBottom:4},world:{color:colors.muted,fontSize:12,lineHeight:18,paddingHorizontal:3},controls:{flexDirection:'row',justifyContent:'flex-end',gap:8},control:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.border,borderRadius:22},error:{color:colors.danger,fontSize:12}});
