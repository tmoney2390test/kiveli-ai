import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as Crypto from 'expo-crypto';
import { useVideoPlayer, VideoView } from 'expo-video';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, RefreshCw, Sparkles, Trash2 } from 'lucide-react-native';
import { ErrorState, LoadingSkeleton, MediaFeedbackControls } from '../../src/components';
import { colors, radius, spacing } from '../../src/theme';
import { useTogether } from '../../src/store/useTogether';
import { animateMedia, manageMedia } from '../../src/lib/api';
import { confirmAction } from '../../src/lib/dialogs';

export default function MediaViewer(){
  const {id}=useLocalSearchParams<{id:string}>();const{snapshot,refresh,removeMedia}=useTogether();const[animating,setAnimating]=useState(false);const[removing,setRemoving]=useState(false);const media=snapshot?.generatedMedia?.find((item)=>item.id===id);const character=snapshot?.characters.find((item)=>item.id===media?.character_instance_id);const player=useVideoPlayer(media?.media_type==='video'&&media.signed_url?media.signed_url:null,(instance)=>{instance.loop=true;});
  if(!snapshot)return <LoadingSkeleton label="Opening the photo…"/>;
  if(!media)return <ErrorState message="This photo is no longer part of your story."/>;
  const retry=async()=>{await manageMedia({action:'retry',mediaId:media.id});await refresh();};
  const remove=()=>confirmAction({
    title:`Remove this ${media.media_type==='video'?'video':'photo'}?`,
    message:'It will disappear from your Gallery and any Kivelle history that uses it.',
    confirmLabel:'Remove',
    destructive:true,
    onConfirm:async()=>{
      if(removing)return;
      setRemoving(true);
      try{
        await manageMedia({action:'remove',mediaId:media.id});
        removeMedia(media.id);
        router.back();
        void refresh();
      }catch(error){
        setRemoving(false);
        Alert.alert('Could not remove media',error instanceof Error?error.message:'Please try again.');
      }
    },
  });
  const animate=async()=>{setAnimating(true);try{const result=await animateMedia(media.id,Crypto.randomUUID());await refresh();router.replace(`/media/${result.media.id}` as never);}catch(error){Alert.alert('Video unavailable',error instanceof Error?error.message:'The video could not be started.');}finally{setAnimating(false);}};
  return <View style={styles.screen}><View style={styles.header}><Pressable onPress={()=>router.back()} style={styles.icon}><ArrowLeft color={colors.text}/></Pressable><View style={{flex:1}}><Text style={styles.name}>From {character?.together_character_templates.name??'your companion'}</Text><Text style={styles.meta}>{new Date(media.created_at).toLocaleString()}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Remove this ${media.media_type==='video'?'video':'photo'}`} disabled={removing} onPress={remove} style={[styles.icon,removing&&styles.disabled]}><Trash2 color={colors.danger}/></Pressable></View><View style={styles.stage}>{media.status==='ready'&&media.signed_url?(media.media_type==='video'?<VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls/>:<Image source={{uri:media.signed_url}} style={StyleSheet.absoluteFill} contentFit="contain"/>):<View style={styles.state}><Text style={styles.stateTitle}>{media.status==='failed'?`That ${media.media_type==='video'?'video':'photo'} didn’t come through`:media.media_type==='video'?'Bringing the moment to life…':'Photo on the way'}</Text><Text style={styles.meta}>{media.failure_reason_safe??'You can keep exploring while it finishes.'}</Text>{media.status==='failed'?<Pressable onPress={()=>void retry()} style={styles.retry}><RefreshCw size={16} color="#fff"/><Text style={styles.retryText}>Try again</Text></Pressable>:null}</View>}{media.media_type==='image'&&media.status==='ready'?<MediaFeedbackControls media={media} style={styles.mediaFeedback}/>:null}</View>{media.media_type==='image'&&media.status==='ready'?<View style={styles.details}><Pressable disabled={animating} onPress={()=>void animate()} style={[styles.animate,animating&&{opacity:.55}]}><Sparkles size={16} color="#fff"/><Text style={styles.retryText}>{animating?'Starting video…':'Bring this moment to life'}</Text></Pressable></View>:null}</View>;
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:'#05070D'},header:{paddingTop:48,paddingHorizontal:spacing.md,paddingBottom:12,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderBottomColor:colors.border},icon:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:colors.surface},disabled:{opacity:.45},name:{color:colors.text,fontWeight:'800'},meta:{color:colors.muted,fontSize:11,marginTop:3},stage:{flex:1,minHeight:360,alignItems:'center',justifyContent:'center'},mediaFeedback:{position:'absolute',right:18,bottom:18},state:{alignItems:'center',gap:10,padding:24},stateTitle:{color:colors.text,fontFamily:'Georgia',fontSize:24},retry:{marginTop:8,minHeight:44,paddingHorizontal:18,borderRadius:radius.pill,backgroundColor:colors.rose,flexDirection:'row',alignItems:'center',gap:8},animate:{minHeight:46,alignSelf:'flex-start',paddingHorizontal:18,borderRadius:radius.pill,backgroundColor:colors.rose,flexDirection:'row',alignItems:'center',gap:8},retryText:{color:'#fff',fontWeight:'800'},details:{padding:spacing.lg,paddingBottom:34,borderTopWidth:1,borderTopColor:colors.border}});
