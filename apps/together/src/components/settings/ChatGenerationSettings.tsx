import { forwardRef, useMemo, useRef, useState, type ElementRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Brain, ChevronRight, Sparkles } from 'lucide-react-native';
import { chatDynamismLabel, reasoningPreferenceLabel, type ChatDynamism, type ReasoningPreference } from '@together/domain/src/chat-generation';
import { chatDynamismChoices, reasoningChoicesForTier } from '../../lib/chatGenerationOptions';
import { colors, radius } from '../../theme';
import { ThemedSettingPicker } from './ThemedSettingPicker';

type Props={
  mode:'direct'|'group';
  chatDynamism:ChatDynamism;
  reasoningPreference:ReasoningPreference;
  tier:unknown;
  disabled?:boolean;
  onChatDynamismChange:(value:ChatDynamism)=>void;
  onReasoningPreferenceChange:(value:ReasoningPreference)=>void;
  onUpgrade:()=>void;
};

export function ChatGenerationSettings({mode,chatDynamism,reasoningPreference,tier,disabled=false,onChatDynamismChange,onReasoningPreferenceChange,onUpgrade}:Props){
  const [picker,setPicker]=useState<'dynamism'|'reasoning'|null>(null);
  const dynamismRef=useRef<ElementRef<typeof Pressable>>(null);
  const reasoningRef=useRef<ElementRef<typeof Pressable>>(null);
  const reasoningChoices=useMemo(()=>reasoningChoicesForTier(tier),[tier]);
  const locked=()=>{setPicker(null);onUpgrade();};
  return <View style={styles.wrapper}>
    <SettingRow ref={dynamismRef} testID="chat-dynamism-setting" icon={<Sparkles size={18} color={colors.violet}/>} label="Chat Dynamism" value={chatDynamismLabel(chatDynamism)} helper="Changes expression and spontaneity—not memory, facts, safety, or response length." disabled={disabled} onPress={()=>setPicker('dynamism')}/>
    <SettingRow ref={reasoningRef} testID="reasoning-effort-setting" icon={<Brain size={18} color={colors.violet}/>} label="Reasoning Effort" value={reasoningPreferenceLabel(reasoningPreference)} helper={mode==='group'?'Controls how deeply Kivelli plans each group response.':'Controls how deeply Kivelli thinks through each reply.'} disabled={disabled} onPress={()=>setPicker('reasoning')}/>
    <ThemedSettingPicker visible={picker==='dynamism'} title="Chat Dynamism" description={mode==='group'?"Changes how the group expresses itself while preserving every character’s voice, memories, facts, safety, and reply length.":'Changes expression and spontaneity without changing memories, facts, safety, or reply length.'} choices={chatDynamismChoices} selected={chatDynamism} disabled={disabled} onSelect={onChatDynamismChange} onClose={()=>setPicker(null)} returnFocusRef={dynamismRef} testIDPrefix="chat-dynamism-option"/>
    <ThemedSettingPicker visible={picker==='reasoning'} title="Reasoning Effort" description={mode==='group'?"Applies to the whole group while preserving each character’s individual voice.":'Applies to this conversation.'} choices={reasoningChoices} selected={reasoningPreference} disabled={disabled} onSelect={onReasoningPreferenceChange} onLockedSelect={locked} onClose={()=>setPicker(null)} returnFocusRef={reasoningRef} testIDPrefix="reasoning-effort-option"/>
  </View>;
}

const SettingRow=forwardRef<ElementRef<typeof Pressable>,{testID:string;icon:React.ReactNode;label:string;value:string;helper:string;disabled:boolean;onPress:()=>void}>(({testID,icon,label,value,helper,disabled,onPress},ref)=>
  <Pressable ref={ref} testID={testID} accessibilityRole="button" accessibilityLabel={`${label}: ${value}. ${helper}`} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[styles.row,pressed&&styles.pressed]}>
    <View style={styles.icon}>{icon}</View><View style={styles.copy}><Text style={styles.label}>{label}</Text><Text style={styles.helper}>{helper}</Text></View><Text style={styles.value}>{value}</Text><ChevronRight size={17} color={colors.muted}/>
  </Pressable>
);
SettingRow.displayName='SettingRow';

const styles=StyleSheet.create({
  wrapper:{gap:10},
  row:{minHeight:76,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:12,paddingVertical:11,borderRadius:radius.md,backgroundColor:'rgba(255,255,255,.035)',borderWidth:1,borderColor:'rgba(199,120,255,.25)'},
  icon:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(168,69,242,.13)'},
  copy:{flex:1,minWidth:0},
  label:{color:colors.text,fontSize:13,fontWeight:'900'},
  helper:{color:colors.muted,fontSize:10,lineHeight:15,marginTop:3},
  value:{color:'#E1B5FF',fontSize:12,fontWeight:'900'},
  pressed:{opacity:.78},
});
