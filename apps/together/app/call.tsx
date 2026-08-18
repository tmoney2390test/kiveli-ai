import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Mic, MicOff, PhoneOff, Volume2, VolumeX } from 'lucide-react-native';
import { CharacterAvatar, ErrorState, LoadingSkeleton } from '../src/components';
import { characterAssets } from '../src/assets';
import { manageCall } from '../src/lib/api';
import { createClientRequestId } from '../src/lib/requestId';
import { useTogether } from '../src/store/useTogether';
import { colors, radius, spacing } from '../src/theme';
import type { VoiceCallSession } from '../src/types';

export default function CompanionCall(){
  const params=useLocalSearchParams<{character?:string;conversation?:string}>(),snapshot=useTogether((state)=>state.snapshot);
  const character=snapshot?.characters.find((item)=>item.id===params.character),conversation=snapshot?.conversations.find((item)=>item.id===params.conversation&&item.character_instance_id===character?.id);
  const[call,setCall]=useState<VoiceCallSession|null>(null),[unavailable,setUnavailable]=useState(''),[error,setError]=useState(''),[muted,setMuted]=useState(false),[speaker,setSpeaker]=useState(true),[elapsed,setElapsed]=useState(0);
  const requestId=useRef(createClientRequestId());
  useEffect(()=>{if(!character||!conversation)return;let cancelled=false;void manageCall({action:'create',characterInstanceId:character.id,conversationId:conversation.id,requestId:requestId.current}).then((result)=>{if(cancelled)return;if(result.status==='not_configured'){setUnavailable(result.message??"Live voice calls aren't connected yet.");return;}setCall(result.call??null);}).catch((caught)=>{if(!cancelled)setError(caught instanceof Error?caught.message:"The call couldn't connect.");});return()=>{cancelled=true;};},[character?.id,conversation?.id]);
  useEffect(()=>{if(call?.status!=='active')return;const started=new Date(call.connected_at??call.started_at??Date.now()).getTime(),timer=setInterval(()=>setElapsed(Math.max(0,Math.floor((Date.now()-started)/1000))),1000);return()=>clearInterval(timer);},[call?.id,call?.status]);
  if(!snapshot)return <LoadingSkeleton label="Preparing the call…"/>;
  if(!character||!conversation)return <ErrorState message="This call is not available in the current Kivelle Life."/>;
  const name=character.together_character_templates.name,slug=character.together_character_templates.slug;
  const end=async()=>{try{if(call?.id)await manageCall({action:'end',callSessionId:call.id});}finally{router.back();}};
  return <View style={styles.screen}>
    <Image source={characterAssets[slug]} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" blurRadius={Platform.OS==='web'?10:22}/><View style={styles.scrim}/>
    <View style={styles.content}><CharacterAvatar slug={slug} name={name} size={136} ring/><Text style={styles.name}>{name}</Text><Text style={styles.status}>{unavailable?'CALLS UNAVAILABLE':call?.status==='active'?'CONNECTED':error?'CALL FAILED':`CALLING ${name.toUpperCase()}…`}</Text><Text style={styles.context}>{character.current_activity} · {character.current_mood}</Text>{call?.status==='active'?<Text style={styles.duration}>{formatDuration(elapsed)}</Text>:null}{unavailable||error?<View style={styles.unavailable}><Text style={styles.unavailableTitle}>{unavailable||error}</Text><Text style={styles.unavailableCopy}>Text chat still has the same relationship, memories, plans, and world context.</Text></View>:null}</View>
    <View style={styles.controls}><Pressable accessibilityLabel={muted?'Unmute microphone':'Mute microphone'} disabled={call?.status!=='active'} onPress={()=>setMuted((value)=>!value)} style={[styles.control,call?.status!=='active'&&styles.disabled]}>{muted?<MicOff color={colors.text}/>:<Mic color={colors.text}/>}<Text style={styles.controlText}>{muted?'Unmute':'Mute'}</Text></Pressable><Pressable accessibilityLabel="End call" onPress={()=>void end()} style={[styles.control,styles.end]}><PhoneOff color="#fff"/><Text style={styles.endText}>{call?.status==='active'?'End':'Close'}</Text></Pressable><Pressable accessibilityLabel={speaker?'Turn speaker off':'Turn speaker on'} disabled={call?.status!=='active'} onPress={()=>setSpeaker((value)=>!value)} style={[styles.control,call?.status!=='active'&&styles.disabled]}>{speaker?<Volume2 color={colors.text}/>:<VolumeX color={colors.text}/>}<Text style={styles.controlText}>Speaker</Text></Pressable></View>
  </View>;
}

function formatDuration(seconds:number){return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
const styles=StyleSheet.create({screen:{flex:1,minHeight:'100%',backgroundColor:'#090912',alignItems:'center',justifyContent:'space-between',paddingTop:Platform.OS==='web'?70:90,paddingBottom:54,overflow:'hidden'},scrim:{position:'absolute',top:0,right:0,bottom:0,left:0,backgroundColor:'rgba(6,5,13,.76)'},content:{zIndex:1,alignItems:'center',paddingHorizontal:spacing.lg},name:{fontFamily:'Georgia',fontSize:38,color:colors.text,marginTop:20},status:{color:colors.rose,fontSize:10,fontWeight:'900',letterSpacing:1.8,marginTop:8},context:{color:colors.muted,fontSize:13,marginTop:9,textAlign:'center'},duration:{color:colors.text,fontSize:24,fontVariant:['tabular-nums'],marginTop:20},unavailable:{maxWidth:420,marginTop:28,padding:18,borderRadius:radius.lg,backgroundColor:'rgba(24,20,35,.82)',borderWidth:1,borderColor:colors.border,alignItems:'center'},unavailableTitle:{color:colors.text,fontSize:15,fontWeight:'900',textAlign:'center'},unavailableCopy:{color:colors.muted,fontSize:12,lineHeight:18,textAlign:'center',marginTop:7},controls:{zIndex:1,flexDirection:'row',alignItems:'center',gap:18},control:{width:78,height:78,borderRadius:39,alignItems:'center',justifyContent:'center',gap:4,backgroundColor:'rgba(255,255,255,.10)',borderWidth:1,borderColor:'rgba(255,255,255,.12)'},controlText:{color:colors.text,fontSize:10,fontWeight:'800'},end:{backgroundColor:'#D64557',borderColor:'#D64557'},endText:{color:'#fff',fontSize:10,fontWeight:'900'},disabled:{opacity:.38}});
