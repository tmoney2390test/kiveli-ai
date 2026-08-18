import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Camera, Play, RefreshCw } from 'lucide-react-native';
import { router } from 'expo-router';
import type { GeneratedMedia } from '../types';
import { colors, radius } from '../theme';

export function MediaTile({media,style,onRetry}:{media:GeneratedMedia;style?:ViewStyle;onRetry?:()=>void}){
  const meta=media.metadata??{};
  const noun=media.media_type==='video'?'Video':'Photo';
  if(media.status==='queued'||media.status==='generating')return <View style={[styles.tile,styles.pending,style]}><ActivityIndicator color={colors.rose}/><Text style={styles.pendingTitle}>{media.media_type==='video'?'Bringing the moment to life…':media.status==='queued'?'Photo on the way':'Taking the photo…'}</Text><Text style={styles.caption}>You can keep chatting.</Text></View>;
  if(media.status==='failed')return <View style={[styles.tile,styles.pending,style]}><Camera color={colors.muted}/><Text style={styles.pendingTitle}>That {noun.toLowerCase()} didn’t come through</Text><Text style={styles.caption}>{media.failure_reason_safe??'Ask again or retry.'}</Text>{onRetry?<Pressable onPress={onRetry} style={styles.retry}><RefreshCw size={14} color={colors.rose}/><Text style={styles.retryText}>Try again</Text></Pressable>:null}</View>;
  if(!media.signed_url)return null;
  return <Pressable accessibilityRole="imagebutton" accessibilityLabel={`Open ${noun.toLowerCase()}`} onPress={()=>router.push(`/media/${media.id}` as never)} style={[styles.tile,style]}>{media.media_type==='video'&&media.parent_media_id?<VideoPoster/>:<Image source={{uri:media.signed_url}} style={StyleSheet.absoluteFill} contentFit="cover" transition={180}/>}<View style={styles.shade}/>{media.media_type==='video'?<View style={styles.play}><Play size={20} color="#fff" fill="#fff"/></View>:null}<View style={styles.footer}><Text style={styles.caption} numberOfLines={1}>{String(meta.sceneSummary??'From your story')}</Text><Text style={styles.place}>{String(meta.timeOfDay??'')}</Text></View></Pressable>;
}
function VideoPoster(){return <View style={[StyleSheet.absoluteFill,styles.videoPoster]}><Play size={34} color={colors.rose}/><Text style={styles.pendingTitle}>Shared video</Text></View>}

export function MediaGallery({media,emptyText='Photos from your story will appear here.'}:{media:GeneratedMedia[];emptyText?:string}){
  const ready=media.filter((item)=>item.status==='ready'&&item.signed_url);
  if(!ready.length)return <View style={styles.empty}><Camera size={20} color={colors.rose}/><Text style={styles.emptyText}>{emptyText}</Text></View>;
  return <View style={styles.grid}>{ready.map((item)=><MediaTile key={item.id} media={item} style={styles.gridTile}/>)}</View>;
}

const styles=StyleSheet.create({tile:{height:238,borderRadius:radius.lg,overflow:'hidden',backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,justifyContent:'flex-end'},pending:{alignItems:'center',justifyContent:'center',gap:7,padding:18},pendingTitle:{color:colors.text,fontSize:13,fontWeight:'800',textAlign:'center'},caption:{color:'#F3EAF0',fontSize:11,lineHeight:15},shade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(8,11,19,.18)'},play:{position:'absolute',left:'50%',top:'44%',width:48,height:48,marginLeft:-24,marginTop:-24,borderRadius:24,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(10,8,17,.72)',borderWidth:1,borderColor:'rgba(255,255,255,.3)'},videoPoster:{alignItems:'center',justifyContent:'center',gap:8,backgroundColor:colors.elevated},footer:{padding:11,backgroundColor:'rgba(8,11,19,.68)'},place:{color:colors.muted,fontSize:9,marginTop:3,textTransform:'capitalize'},retry:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:11,paddingVertical:7,borderRadius:radius.pill,backgroundColor:'rgba(241,103,154,.10)'},retryText:{color:colors.rose,fontWeight:'800',fontSize:11},grid:{flexDirection:'row',flexWrap:'wrap',gap:10},gridTile:{width:'31.5%',minWidth:118,height:180},empty:{minHeight:100,alignItems:'center',justifyContent:'center',gap:8,padding:16,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface},emptyText:{color:colors.muted,fontSize:12,textAlign:'center'}});
