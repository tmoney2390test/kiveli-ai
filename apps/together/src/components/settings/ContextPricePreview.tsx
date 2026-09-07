import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Info } from 'lucide-react-native';
import { contextPreferenceLabel } from '@together/domain/src/chat-context';
import type { useContextQuote } from '../../hooks/useContextQuote';
import { colors, radius } from '../../theme';

export function ContextPricePreview({pricing,onCredits}:{pricing:ReturnType<typeof useContextQuote>;onCredits:()=>void}){
  const [expanded,setExpanded]=useState(false);
  if(!pricing.visible)return null;
  const quote=pricing.quote;
  const label=pricing.included?'Included · No extra credits':pricing.loading?'Calculating message price…':quote?quote.maximumCredits?`${contextPreferenceLabel(pricing.selected)} · Up to ${quote.maximumCredits} credits`:'Included · No extra context needed':contextPreferenceLabel(pricing.selected);
  return <View style={styles.wrap}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}. About this price`} accessibilityState={{expanded}} onPress={()=>setExpanded((value)=>!value)} style={styles.row}><Info size={14} color={colors.violet}/><Text style={styles.label}>{label}</Text></Pressable>
    {expanded?<Text style={styles.help}>{quote?.maximumCredits?`About ${Math.ceil(quote.approximateInputTokens/1000)}K input tokens; up to ${quote.maximumReplies} ${quote.maximumReplies===1?'reply':'replies'}. `:''}Send authorizes this maximum. The final charge can be lower. More context, deeper reasoning, and more replies can cost more.</Text>:null}
    {pricing.error&&!pricing.included?<Text accessibilityRole="alert" style={styles.help}>{pricing.error}</Text>:null}
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" onPress={pricing.included?pricing.useSelected:pricing.useIncluded} hitSlop={6}><Text style={styles.action}>{pricing.included?'Use selected context':'Use Included for this message'}</Text></Pressable>
      {!pricing.included?<Pressable accessibilityRole="button" onPress={onCredits} hitSlop={6}><Text style={styles.action}>Credits</Text></Pressable>:null}
      {pricing.error&&!pricing.included?<Pressable accessibilityRole="button" onPress={pricing.retry} hitSlop={6}><Text style={styles.action}>Refresh price</Text></Pressable>:null}
    </View>
  </View>;
}
const styles=StyleSheet.create({wrap:{marginHorizontal:12,marginBottom:6,padding:10,gap:7,borderRadius:radius.md,borderWidth:1,borderColor:'rgba(199,120,255,.25)',backgroundColor:'rgba(255,255,255,.035)'},row:{flexDirection:'row',alignItems:'center',gap:7},label:{fontSize:12,fontWeight:'700',color:colors.text},help:{fontSize:12,lineHeight:17,color:colors.muted},actions:{flexDirection:'row',gap:16,flexWrap:'wrap'},action:{fontSize:11,color:'#E1B5FF',fontWeight:'600'}});
