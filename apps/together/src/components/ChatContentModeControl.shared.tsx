import { Check, Flame, Heart, ShieldCheck } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DialogueContentMode } from '../types';
import { colors, radius } from '../theme';

type Props={value:DialogueContentMode;onChange:(value:DialogueContentMode)=>void;disabled:boolean;eligible:boolean};
const options:Array<{value:DialogueContentMode;label:string;detail:string;icon:'shield'|'heart'|'flame'}>=[
  {value:'standard',label:'Standard',detail:'Affection and romance without sexual detail',icon:'shield'},
  {value:'mature',label:'Mature',detail:'Stronger flirting and implied intimacy',icon:'heart'},
  {value:'explicit',label:'Explicit',detail:'Private text only, between eligible adults',icon:'flame'},
];

export function ChatContentModeControl({value,onChange,disabled,eligible}:Props){
  const normalized=value==='explicit'?'explicit':value==='standard'?'standard':'mature';
  return <View style={styles.section}>
    <View style={styles.label}><Heart size={16} color={colors.violet}/><Text style={styles.labelText}>Conversation boundaries</Text></View>
    <View accessibilityRole="radiogroup" style={styles.options}>{options.map((option)=>{
      const active=normalized===option.value,unavailable=option.value==='explicit'&&!eligible;
      const Icon=option.icon==='shield'?ShieldCheck:option.icon==='flame'?Flame:Heart;
      const detail=unavailable?'Confirm your age in account settings first':option.detail;
      return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{checked:active,disabled:disabled||unavailable}} accessibilityLabel={`${option.label}. ${detail}`} disabled={disabled||unavailable} onPress={()=>onChange(option.value)} style={({pressed})=>[styles.option,active&&styles.active,(disabled||unavailable)&&styles.disabled,pressed&&styles.pressed]}>
        <View style={styles.icon}><Icon size={18} color={active?'#F68BD8':colors.muted}/></View><View style={styles.copy}><Text style={[styles.optionLabel,active&&styles.optionLabelActive]}>{option.label}</Text><Text style={styles.detail}>{detail}</Text></View>{active?<View style={styles.check}><Check size={11} color="#fff" strokeWidth={3}/></View>:null}
      </Pressable>;
    })}</View>
    <Text style={styles.hint}>Applies only to this private text conversation. Media and public sharing have separate restrictions, and character consent and safety rules always apply.</Text>
  </View>;
}

const styles=StyleSheet.create({section:{gap:11},label:{flexDirection:'row',alignItems:'center',gap:7},labelText:{color:colors.text,fontSize:14,fontWeight:'900'},options:{gap:8},option:{minHeight:62,flexDirection:'row',alignItems:'center',gap:10,padding:12,borderRadius:radius.md,backgroundColor:'rgba(255,255,255,.035)',borderWidth:1,borderColor:colors.border},active:{backgroundColor:'rgba(112,55,139,.26)',borderColor:'#A845F2',borderWidth:2},icon:{width:28,alignItems:'center'},copy:{flex:1,minWidth:0},optionLabel:{color:colors.textSecondary,fontSize:13,fontWeight:'900'},optionLabelActive:{color:colors.text},detail:{color:colors.muted,fontSize:10,lineHeight:14,marginTop:2},check:{width:19,height:19,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:colors.violet},hint:{color:colors.muted,fontSize:10,lineHeight:15},disabled:{opacity:.48},pressed:{opacity:.74}});
