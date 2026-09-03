import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, Flag, X } from 'lucide-react-native';
import { reportMessage } from '../lib/api';
import { colors, radius, spacing } from '../theme';
import { FrostedBackdrop, FrostedSurface } from './FrostedGlass';

const reasons=[
  ['minor_safety','Minor safety'],
  ['nonconsensual_or_exploitative','Non-consensual or exploitative'],
  ['real_person_privacy','Real-person privacy'],
  ['threat_or_harm','Threat or harm'],
  ['harassment','Harassment'],
  ['unexpected_sexual_content','Unexpected sexual content'],
  ['other','Something else'],
] as const;
type Reason=typeof reasons[number][0];

export function ReportMessageModal({visible,messageId,onClose}:{visible:boolean;messageId:string;onClose:()=>void}){
  const[reason,setReason]=useState<Reason>('other'),[detail,setDetail]=useState(''),[busy,setBusy]=useState(false),[submitted,setSubmitted]=useState(false),[error,setError]=useState('');
  useEffect(()=>{if(!visible){setReason('other');setDetail('');setBusy(false);setSubmitted(false);setError('');}},[visible]);
  const submit=async()=>{if(busy)return;setBusy(true);setError('');try{await reportMessage(messageId,reason,detail.trim());setSubmitted(true);}catch(caught){setError(caught instanceof Error?caught.message:'Your report could not be sent.');}finally{setBusy(false);}};
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.root}><FrostedBackdrop/><FrostedSurface style={styles.card}>
    <View style={styles.header}><View style={styles.titleRow}><Flag size={18} color={colors.rose}/><Text style={styles.title}>{submitted?'Report received':'Report this response'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close report" onPress={onClose} style={styles.close}><X size={19} color={colors.text}/></Pressable></View>
    {submitted?<View style={styles.confirm}><View style={styles.confirmIcon}><Check size={22} color="#fff"/></View><Text style={styles.confirmTitle}>Thank you for telling us.</Text><Text style={styles.copy}>The report was submitted privately. It does not publish this message or unrelated conversation history.</Text><Pressable accessibilityRole="button" onPress={onClose} style={styles.primary}><Text style={styles.primaryText}>Done</Text></Pressable></View>:<>
      <Text style={styles.copy}>Choose the closest reason. Safety reviewers receive this response and the details you provide.</Text>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>{reasons.map(([value,label])=><Pressable key={value} accessibilityRole="radio" accessibilityState={{checked:reason===value}} onPress={()=>setReason(value)} style={[styles.option,reason===value&&styles.optionActive]}><Text style={styles.optionText}>{label}</Text>{reason===value?<Check size={16} color={colors.rose}/>:null}</Pressable>)}</ScrollView>
      <TextInput accessibilityLabel="Optional report details" multiline maxLength={1000} value={detail} onChangeText={setDetail} placeholder="Optional details" placeholderTextColor={colors.muted} style={styles.input}/>
      {error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}
      <Pressable accessibilityRole="button" accessibilityLabel="Submit report" disabled={busy} onPress={()=>void submit()} style={[styles.primary,busy&&styles.disabled]}>{busy?<ActivityIndicator color="#fff"/>:<Text style={styles.primaryText}>Submit report</Text>}</Pressable>
    </>}
  </FrostedSurface></View></Modal>;
}

const styles=StyleSheet.create({root:{flex:1,alignItems:'center',justifyContent:'center',padding:spacing.md},card:{width:'92%',maxWidth:500,maxHeight:'88%',padding:spacing.lg,gap:14,borderRadius:radius.xl},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},titleRow:{flexDirection:'row',alignItems:'center',gap:9},title:{color:colors.text,fontSize:18,fontWeight:'900'},close:{width:42,height:42,alignItems:'center',justifyContent:'center'},copy:{color:colors.textSecondary,fontSize:12,lineHeight:18},list:{maxHeight:290},listContent:{gap:7},option:{minHeight:48,paddingHorizontal:13,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:'rgba(255,255,255,.035)'},optionActive:{borderColor:colors.rose,backgroundColor:'rgba(216,62,234,.12)'},optionText:{color:colors.text,fontSize:13,fontWeight:'700'},input:{minHeight:84,maxHeight:130,textAlignVertical:'top',color:colors.text,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:12,backgroundColor:colors.surface},primary:{minHeight:48,alignItems:'center',justifyContent:'center',borderRadius:radius.md,backgroundColor:colors.violet},primaryText:{color:'#fff',fontWeight:'900'},disabled:{opacity:.55},error:{color:colors.danger,fontSize:12},confirm:{alignItems:'center',gap:11,paddingVertical:10},confirmIcon:{width:46,height:46,borderRadius:23,alignItems:'center',justifyContent:'center',backgroundColor:colors.violet},confirmTitle:{color:colors.text,fontSize:17,fontWeight:'900'}});
