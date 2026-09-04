import { useRef, useState, type ElementRef } from 'react';
import { ChevronRight, Flame } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DialogueContentMode } from '../types';
import { colors, radius } from '../theme';
import type { ChatGenerationChoice } from '../lib/chatGenerationOptions';
import { ThemedSettingPicker } from './settings/ThemedSettingPicker';

type Props={value:DialogueContentMode;onChange:(value:DialogueContentMode)=>void;disabled:boolean;eligible:boolean};
const baseOptions:ChatGenerationChoice<DialogueContentMode>[]=[
  {value:'standard',label:'Standard',description:''},
  {value:'mature',label:'Mature',description:''},
  {value:'explicit',label:'Explicit',description:''},
];

export function ChatContentModeControl({value,onChange,disabled,eligible}:Props){
  const [open,setOpen]=useState(false);
  const selectorRef=useRef<ElementRef<typeof Pressable>>(null);
  const normalized=value==='explicit'?'explicit':value==='standard'?'standard':'mature';
  const options=baseOptions.map((option)=>option.value==='explicit'?{...option,locked:!eligible}:option);
  const selectedLabel=options.find((option)=>option.value===normalized)?.label??'Mature';
  return <View>
    <Pressable
      ref={selectorRef}
      testID="conversation-spicyness-setting"
      accessibilityRole="button"
      accessibilityLabel={`Conversation Spicyness: ${selectedLabel}`}
      accessibilityHint="Opens the Conversation Spicyness choices"
      accessibilityState={{expanded:open,disabled}}
      disabled={disabled}
      onPress={()=>setOpen(true)}
      style={({pressed})=>[styles.selector,disabled&&styles.disabled,pressed&&styles.pressed]}
    >
      <View style={styles.icon}><Flame size={18} color={colors.violet}/></View>
      <Text style={styles.label}>Conversation Spicyness</Text>
      <Text style={styles.value}>{selectedLabel}</Text>
      <ChevronRight size={17} color={colors.muted}/>
    </Pressable>
    <ThemedSettingPicker
      visible={open}
      title="Conversation Spicyness"
      choices={options}
      selected={normalized}
      disabled={disabled}
      onSelect={onChange}
      onLockedSelect={()=>undefined}
      onClose={()=>setOpen(false)}
      returnFocusRef={selectorRef}
      testIDPrefix="conversation-spicyness-option"
      showChoiceDescriptions={false}
      lockedRequirement="Confirm your age in account settings first"
      lockedAccessibilityHint="Confirm your age in account settings before choosing Explicit"
    />
  </View>;
}

const styles=StyleSheet.create({selector:{minHeight:64,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:12,borderRadius:radius.md,backgroundColor:'rgba(255,255,255,.035)',borderWidth:1,borderColor:'rgba(199,120,255,.25)'},icon:{width:26,alignItems:'center'},label:{flex:1,minWidth:0,color:colors.text,fontSize:13,fontWeight:'900'},value:{color:'#E1B5FF',fontSize:12,fontWeight:'900'},disabled:{opacity:.48},pressed:{opacity:.74}});
