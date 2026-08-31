import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Camera, ChevronDown } from 'lucide-react-native';
import type { CharacterInstance } from '../types';
import type { PlanHistory, PlanHistoryMedia, PlanTranscriptMessage } from '../lib/commitments';
import { colors, radius, spacing, typography } from '../theme';
import { ImageLightbox } from './ImageLightbox';

export function PlanHistoryPanel({history,characters,primaryCharacterId,loading=false,showTranscript=true}:{history?:PlanHistory|null;characters:CharacterInstance[];primaryCharacterId:string;loading?:boolean;showTranscript?:boolean}){
  const[expanded,setExpanded]=useState(false),[selected,setSelected]=useState<PlanHistoryMedia|null>(null);
  if(loading&&!history)return <View style={styles.loading}><ActivityIndicator color={colors.rose}/><Text style={styles.loadingText}>Gathering this plan’s conversation…</Text></View>;
  if(!history)return null;
  if(!history.media.length&&!showTranscript)return null;
  const count=history.transcript.length;
  return <View style={styles.root}>
    {history.media.length?<View style={styles.section}><View style={styles.sectionHeading}><Camera size={16} color={colors.rose}/><Text style={styles.sectionTitle}>Photos from this plan</Text></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaRow}>{history.media.map((item)=><Pressable key={`${item.source}:${item.id}`} accessibilityRole="imagebutton" accessibilityLabel={`Open photo from ${formatPlanTime(item.created_at)}`} onPress={()=>setSelected(item)} style={({pressed})=>[styles.mediaTile,pressed&&styles.pressed]}><Image source={{uri:item.signed_url,cacheKey:`plan-history:${item.source}:${item.id}`}} style={StyleSheet.absoluteFill} contentFit="cover" transition={160} cachePolicy="memory-disk"/><View style={styles.mediaShade}/><Text style={styles.mediaLabel}>{item.source==='shared'?'Shared in chat':'Created during the plan'}</Text><Text style={styles.mediaTime}>{formatPlanTime(item.created_at)}</Text></Pressable>)}</ScrollView></View>:null}
    {showTranscript?<View style={styles.transcriptCard}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${expanded?'Collapse':'Expand'} Plan Transcript`} accessibilityState={{expanded,disabled:count===0}} disabled={count===0} onPress={()=>setExpanded((current)=>!current)} style={({pressed})=>[styles.transcriptHeader,pressed&&styles.pressed]}><View style={styles.headerCopy}><Text style={styles.transcriptTitle}>Plan Transcript</Text><Text style={styles.transcriptMeta}>{count?`${count} ${count===1?'message':'messages'} · ${expanded?'Tap to collapse':'Tap to read'}`:'No conversation was recorded during this plan'}</Text></View>{count?<ChevronDown size={19} color={colors.muted} style={expanded?styles.chevronExpanded:undefined}/>:null}</Pressable>
      {expanded?<View style={styles.transcript}>{history.transcript.map((message)=><TranscriptTurn key={message.id} message={message} characters={characters} primaryCharacterId={primaryCharacterId}/>) }{history.transcript_truncated?<Text style={styles.truncated}>This unusually long plan has more conversation than can be shown here.</Text>:null}</View>:null}
    </View>:null}
    <ImageLightbox visible={Boolean(selected)} source={{uri:selected?.signed_url??''}} accessibilityLabel="Photo from this plan" onClose={()=>setSelected(null)}/>
  </View>;
}

function TranscriptTurn({message,characters,primaryCharacterId}:{message:PlanTranscriptMessage;characters:CharacterInstance[];primaryCharacterId:string}){
  const user=message.role==='user',speakerId=message.speaker_character_instance_id??message.character_instance_id??primaryCharacterId,speaker=characters.find((item)=>item.id===speakerId)?.together_character_templates.name??'Companion';
  return <View style={[styles.turn,user?styles.userTurn:styles.companionTurn]}><Text style={[styles.speaker,user&&styles.userSpeaker]}>{user?'YOU':speaker.toUpperCase()}</Text><Text style={styles.message}>{message.content||'Shared a photo'}</Text><Text style={styles.messageTime}>{formatPlanTime(message.created_at)}</Text></View>;
}

function formatPlanTime(value:string){const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'';}

const styles=StyleSheet.create({
  root:{gap:spacing.md},section:{gap:10},sectionHeading:{flexDirection:'row',alignItems:'center',gap:8},sectionTitle:{color:colors.text,fontFamily:typography.display,fontSize:20,fontWeight:'600'},mediaRow:{gap:10,paddingRight:spacing.lg},mediaTile:{width:148,height:184,borderRadius:radius.lg,overflow:'hidden',justifyContent:'flex-end',padding:11,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.borderBright},mediaShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(8,7,13,.22)'},mediaLabel:{color:colors.text,fontSize:11,fontWeight:'900',textShadowColor:'#000',textShadowRadius:8},mediaTime:{color:'#EADDE7',fontSize:9,fontWeight:'700',marginTop:3,textShadowColor:'#000',textShadowRadius:6},transcriptCard:{borderRadius:radius.lg,overflow:'hidden',backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},transcriptHeader:{minHeight:68,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:15,paddingVertical:12},headerCopy:{flex:1},transcriptTitle:{color:colors.text,fontFamily:typography.display,fontSize:19,fontWeight:'600'},transcriptMeta:{color:colors.muted,fontSize:10.5,marginTop:4},chevronExpanded:{transform:[{rotate:'180deg'}]},transcript:{gap:9,padding:12,paddingTop:5,borderTopWidth:1,borderTopColor:colors.border},turn:{maxWidth:'88%',paddingHorizontal:12,paddingVertical:10,borderRadius:16,borderWidth:1},userTurn:{alignSelf:'flex-end',backgroundColor:'rgba(216,62,234,.12)',borderColor:'rgba(216,62,234,.25)',borderBottomRightRadius:5},companionTurn:{alignSelf:'flex-start',backgroundColor:colors.background,borderColor:colors.border,borderBottomLeftRadius:5},speaker:{color:colors.violet,fontSize:8,fontWeight:'900',letterSpacing:.8,marginBottom:5},userSpeaker:{color:colors.rose},message:{color:colors.text,fontSize:13,lineHeight:19},messageTime:{color:colors.dimmed,fontSize:8.5,marginTop:6,alignSelf:'flex-end'},truncated:{color:colors.muted,fontSize:10,lineHeight:15,textAlign:'center',padding:8},loading:{minHeight:68,flexDirection:'row',alignItems:'center',gap:10,padding:14,borderRadius:radius.lg,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},loadingText:{color:colors.muted,fontSize:11},pressed:{opacity:.82},
});
