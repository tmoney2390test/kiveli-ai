import { StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import type { VideoContentClass } from '../types';
import { radius } from '../theme';

type Props={contentClass:VideoContentClass;hasAdultRoutes:boolean;hasSafeRoutes?:boolean;onChange:(value:VideoContentClass)=>void};

export function VideoContentRouteSelector(_props:Props){
  void _props;
  return <View accessibilityLabel="Safe-for-work video models" style={styles.notice}><Check size={14} color="#79E6B4"/><Text style={styles.text}>Safe-for-work models</Text></View>;
}

const styles=StyleSheet.create({notice:{width:'100%',minHeight:44,paddingHorizontal:13,borderRadius:radius.pill,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,borderWidth:1,borderColor:'rgba(121,230,180,.28)',backgroundColor:'rgba(121,230,180,.08)'},text:{color:'#A7F2CF',fontSize:12,fontWeight:'900'}});
