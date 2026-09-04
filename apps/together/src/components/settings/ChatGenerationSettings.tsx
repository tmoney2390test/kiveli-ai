import { forwardRef, useEffect, useMemo, useRef, useState, type ElementRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Info, X } from 'lucide-react-native';
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
  const dynamismHelp=mode==='group'?"Changes how the group expresses itself while preserving every character’s voice, memories, facts, safety, and reply length.":'Changes expression and spontaneity without changing memories, facts, safety, or reply length.';
  const reasoningHelp=mode==='group'?'Controls how deeply Kivelli plans each group response. Fast uses a quicker model and lighter reasoning.':'Controls how deeply Kivelli thinks through each reply. Fast uses a quicker model and lighter reasoning.';
  return <View style={styles.wrapper}>
    <SettingRow ref={dynamismRef} testID="chat-dynamism-setting" label="Chat Dynamism" value={chatDynamismLabel(chatDynamism)} tooltip={dynamismHelp} disabled={disabled} onPress={()=>setPicker('dynamism')}/>
    <SettingRow ref={reasoningRef} testID="reasoning-effort-setting" label="Reasoning Effort" value={reasoningPreferenceLabel(reasoningPreference)} tooltip={reasoningHelp} disabled={disabled} onPress={()=>setPicker('reasoning')}/>
    <ThemedSettingPicker visible={picker==='dynamism'} title="Chat Dynamism" description={dynamismHelp} choices={chatDynamismChoices} selected={chatDynamism} disabled={disabled} onSelect={onChatDynamismChange} onClose={()=>setPicker(null)} returnFocusRef={dynamismRef} testIDPrefix="chat-dynamism-option"/>
    <ThemedSettingPicker visible={picker==='reasoning'} title="Reasoning Effort" description={mode==='group'?"Applies to the whole group while preserving each character’s individual voice.":'Applies to this conversation.'} choices={reasoningChoices} selected={reasoningPreference} disabled={disabled} onSelect={onReasoningPreferenceChange} onLockedSelect={locked} onClose={()=>setPicker(null)} returnFocusRef={reasoningRef} testIDPrefix="reasoning-effort-option"/>
  </View>;
}

const SettingRow=forwardRef<ElementRef<typeof Pressable>,{testID:string;label:string;value:string;tooltip:string;disabled:boolean;onPress:()=>void}>(({testID,label,value,tooltip,disabled,onPress},ref)=>{
  const [tooltipVisible,setTooltipVisible]=useState(false);
  const infoRef=useRef<ElementRef<typeof Pressable>>(null);
  const wasVisible=useRef(false);
  useEffect(()=>{
    if(wasVisible.current&&!tooltipVisible)setTimeout(()=>infoRef.current?.focus?.(),0);
    wasVisible.current=tooltipVisible;
  },[tooltipVisible]);
  return <View style={styles.row}>
    <Pressable ref={infoRef} testID={`${testID}-info`} accessibilityRole="button" accessibilityLabel={`About ${label}`} accessibilityHint={`Opens a short explanation of ${label}`} onPress={()=>setTooltipVisible(true)} hitSlop={4} style={({pressed})=>[styles.infoButton,pressed&&styles.pressed]}>
      <Info size={18} color={colors.violet}/>
    </Pressable>
    <Pressable ref={ref} testID={testID} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} accessibilityHint={`Opens the ${label} choices`} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[styles.selector,pressed&&styles.pressed]}>
      <View style={styles.copy}><Text style={styles.label}>{label}</Text></View><Text style={styles.value}>{value}</Text><ChevronRight size={17} color={colors.muted}/>
    </Pressable>
    <SettingInfoTooltip visible={tooltipVisible} title={label} body={tooltip} onClose={()=>setTooltipVisible(false)} testID={`${testID}-tooltip`}/>
  </View>;
});
SettingRow.displayName='SettingRow';

function SettingInfoTooltip({visible,title,body,onClose,testID}:{visible:boolean;title:string;body:string;onClose:()=>void;testID:string}){
  return <Modal transparent visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <View style={styles.tooltipRoot}>
      <Pressable accessibilityLabel={`Close ${title} information`} onPress={onClose} style={StyleSheet.absoluteFill}/>
      <View testID={testID} accessibilityViewIsModal style={styles.tooltipCard}>
        <View style={styles.tooltipHeader}><View style={styles.tooltipMark}><Info size={18} color={colors.violet}/></View><Text style={styles.tooltipTitle}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={6} style={styles.tooltipClose}><X size={18} color={colors.muted}/></Pressable></View>
        <Text style={styles.tooltipBody}>{body}</Text>
      </View>
    </View>
  </Modal>;
}

const styles=StyleSheet.create({
  wrapper:{gap:10},
  row:{minHeight:64,flexDirection:'row',alignItems:'stretch',paddingHorizontal:7,borderRadius:radius.md,backgroundColor:'rgba(255,255,255,.035)',borderWidth:1,borderColor:'rgba(199,120,255,.25)'},
  infoButton:{width:44,minHeight:62,alignItems:'center',justifyContent:'center'},
  selector:{flex:1,minWidth:0,minHeight:62,flexDirection:'row',alignItems:'center',gap:10,paddingLeft:3,paddingRight:5},
  copy:{flex:1,minWidth:0},
  label:{color:colors.text,fontSize:13,fontWeight:'900'},
  value:{color:'#E1B5FF',fontSize:12,fontWeight:'900'},
  tooltipRoot:{flex:1,alignItems:'center',justifyContent:'center',padding:20,backgroundColor:'rgba(3,2,7,.66)'},
  tooltipCard:{width:'100%',maxWidth:380,padding:17,borderRadius:radius.lg,backgroundColor:'rgba(29,21,40,.99)',borderWidth:1,borderColor:'rgba(199,120,255,.42)'},
  tooltipHeader:{flexDirection:'row',alignItems:'center',gap:9},
  tooltipMark:{width:32,height:32,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(168,69,242,.13)'},
  tooltipTitle:{flex:1,color:colors.text,fontFamily:'Georgia',fontSize:20,fontWeight:'800'},
  tooltipClose:{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.05)'},
  tooltipBody:{color:colors.muted,fontSize:12,lineHeight:18,marginTop:12},
  pressed:{opacity:.78},
});
