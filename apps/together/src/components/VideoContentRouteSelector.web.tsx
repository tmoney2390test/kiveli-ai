import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { VideoContentClass } from '../types';
import { colors, radius } from '../theme';

type Props={contentClass:VideoContentClass;hasAdultRoutes:boolean;onChange:(value:VideoContentClass)=>void};

export function VideoContentRouteSelector({contentClass,hasAdultRoutes,onChange}:Props){
  return <>
    <Text style={styles.help}>Safe-for-work uses WaveSpeed’s standard endpoints. Adult-capable endpoints appear only in an authorized adult website session.</Text>
    {hasAdultRoutes?<View accessibilityRole="radiogroup" accessibilityLabel="Video content route" style={styles.row}>
      <Option label="Safe for work" selected={contentClass==='sfw'} onPress={()=>onChange('sfw')}/>
      <Option label="Adult-capable" selected={contentClass==='adult_capable'} onPress={()=>onChange('adult_capable')}/>
    </View>:<View style={styles.notice}><Text style={styles.noticeText}>Safe-for-work models</Text></View>}
  </>;
}

function Option({label,selected,onPress}:{label:string;selected:boolean;onPress:()=>void}){return <Pressable accessibilityRole="radio" accessibilityState={{selected}} onPress={onPress} style={[styles.option,selected&&styles.selected]}><Text style={[styles.optionText,selected&&styles.selectedText]}>{label}</Text></Pressable>}

const styles=StyleSheet.create({help:{width:'100%',color:colors.textSecondary,fontSize:11,lineHeight:17,marginBottom:10},row:{width:'100%',flexDirection:'row',flexWrap:'wrap',gap:8},option:{minHeight:44,paddingHorizontal:14,borderRadius:radius.pill,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'rgba(203,168,255,.18)',backgroundColor:'rgba(255,255,255,.04)'},selected:{borderColor:'#A66CFF',backgroundColor:'rgba(117,69,245,.25)'},optionText:{color:colors.textSecondary,fontSize:12,fontWeight:'800'},selectedText:{color:'#fff'},notice:{width:'100%',minHeight:44,paddingHorizontal:13,borderRadius:radius.pill,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'rgba(121,230,180,.28)',backgroundColor:'rgba(121,230,180,.08)'},noticeText:{color:'#A7F2CF',fontSize:12,fontWeight:'900'}});
