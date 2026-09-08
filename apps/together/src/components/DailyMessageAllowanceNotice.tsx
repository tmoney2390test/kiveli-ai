import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DailyMessageAllowance } from '../types';
import { colors, radius } from '../theme';
import { dailyMessageAllowancePresentation } from '../lib/dailyMessageAllowance';

export function DailyMessageAllowanceNotice({allowance,onUpgrade}:{allowance?:DailyMessageAllowance;onUpgrade:()=>void}){
  const presentation=dailyMessageAllowancePresentation(allowance);
  if(!presentation)return null;
  const exhausted=presentation.exhausted;
  return <View accessibilityLiveRegion="polite" style={[styles.notice,exhausted&&styles.exhausted]}>
    <Text style={styles.copy}>{presentation.copy}</Text>
    <Pressable accessibilityRole="link" accessibilityLabel="Upgrade now for unlimited messages" onPress={onUpgrade} style={({pressed})=>[styles.action,pressed&&styles.pressed]}>
      <Text style={styles.actionText}>Upgrade now</Text>
    </Pressable>
  </View>;
}

const styles=StyleSheet.create({
  notice:{minHeight:44,marginHorizontal:12,marginBottom:6,paddingLeft:13,paddingRight:5,borderRadius:radius.md,borderWidth:1,borderColor:'rgba(216,62,234,.28)',backgroundColor:'rgba(216,62,234,.08)',flexDirection:'row',alignItems:'center',gap:8},
  exhausted:{borderColor:'rgba(255,179,92,.32)',backgroundColor:'rgba(255,179,92,.08)'},
  copy:{flex:1,color:colors.text,fontSize:11,lineHeight:16,fontWeight:'700'},
  action:{minHeight:36,paddingHorizontal:10,borderRadius:radius.pill,alignItems:'center',justifyContent:'center'},
  actionText:{color:colors.rose,fontSize:11,fontWeight:'900'},
  pressed:{opacity:.7},
});
