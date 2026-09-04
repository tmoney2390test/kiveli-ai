import { useEffect, useRef, type RefObject } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Check, LockKeyhole, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../../theme';
import { chatGenerationChoiceInteraction, type ChatGenerationChoice } from '../../lib/chatGenerationOptions';
import { FrostedSurface } from '../FrostedGlass';

type Props<T extends string|number>={
  visible:boolean;
  title:string;
  description?:string;
  choices:ChatGenerationChoice<T>[];
  selected:T;
  disabled?:boolean;
  onSelect:(value:T)=>void;
  onLockedSelect?:(choice:ChatGenerationChoice<T>)=>void;
  onClose:()=>void;
  returnFocusRef?:RefObject<{focus?:()=>void}|null>;
  testIDPrefix:string;
  showChoiceDescriptions?:boolean;
  lockedRequirement?:string;
  lockedAccessibilityHint?:string;
};

export function ThemedSettingPicker<T extends string|number>({visible,title,description,choices,selected,disabled=false,onSelect,onLockedSelect,onClose,returnFocusRef,testIDPrefix,showChoiceDescriptions=true,lockedRequirement='Requires an upgraded membership',lockedAccessibilityHint='Saves your current settings, then opens membership options.'}:Props<T>){
  const {width}=useWindowDimensions();
  const insets=useSafeAreaInsets();
  const wasVisible=useRef(false);
  useEffect(()=>{
    if(wasVisible.current&&!visible)setTimeout(()=>returnFocusRef?.current?.focus?.(),0);
    wasVisible.current=visible;
  },[returnFocusRef,visible]);
  const compact=width<640;
  return <Modal transparent visible={visible} animationType={compact?'slide':'fade'} statusBarTranslucent onRequestClose={onClose}>
    <View style={[styles.root,compact&&styles.rootCompact]}>
      <Pressable accessibilityLabel={`Close ${title} selector`} onPress={onClose} style={StyleSheet.absoluteFill}/>
      <FrostedSurface intensity={97} style={[styles.card,compact&&styles.cardCompact,{paddingBottom:Math.max(spacing.lg,insets.bottom+12)}]}>
        <View style={styles.header}><View style={styles.headerCopy}><Text style={styles.title}>{title}</Text>{description?<Text style={styles.description}>{description}</Text>:null}</View><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}><X size={19} color={colors.muted}/></Pressable></View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          <View accessibilityRole="radiogroup">
            {choices.map((choice)=>{
              const interaction=chatGenerationChoiceInteraction(choice,selected);
              const active=interaction.active;
              return <Pressable
                key={String(choice.value)}
                testID={`${testIDPrefix}-${choice.value}`}
                accessibilityRole={interaction.accessibilityRole}
                accessibilityLabel={[choice.label,choice.description,interaction.upgrade?lockedRequirement:''].filter(Boolean).join('. ')}
                accessibilityHint={interaction.upgrade?lockedAccessibilityHint:undefined}
                accessibilityState={interaction.accessibilityRole==='radio'?{checked:active,disabled}:{disabled}}
                disabled={disabled}
                onPress={()=>{if(interaction.action==='close'){onClose();return;}if(interaction.action==='upgrade'){onLockedSelect?.(choice);return;}onSelect(choice.value);onClose();}}
                style={({pressed})=>[styles.option,!showChoiceDescriptions&&styles.optionCompact,active&&styles.optionActive,pressed&&styles.pressed]}
              >
                <View style={styles.optionCopy}><View style={styles.optionTitleRow}><Text style={[styles.optionTitle,active&&styles.optionTitleActive]}>{choice.label}</Text>{choice.badge?<Text style={styles.badge}>{choice.badge}</Text>:null}</View>{showChoiceDescriptions&&choice.description?<Text style={styles.optionDescription}>{choice.description}</Text>:null}</View>
                {interaction.showCheck?<View style={styles.check}><Check size={13} color="#fff" strokeWidth={3}/></View>:interaction.showLock?<LockKeyhole size={18} color={colors.muted}/>:<View style={styles.radio}/>}
              </Pressable>;
            })}
          </View>
        </ScrollView>
      </FrostedSurface>
    </View>
  </Modal>;
}

const styles=StyleSheet.create({
  root:{flex:1,alignItems:'center',justifyContent:'center',padding:spacing.lg,backgroundColor:'rgba(3,2,7,.72)'},
  rootCompact:{justifyContent:'flex-end',padding:0},
  card:{width:'100%',maxWidth:480,maxHeight:'82%',overflow:'hidden',borderRadius:radius.xl,padding:spacing.lg,backgroundColor:'rgba(29,21,40,.99)',borderColor:'rgba(199,120,255,.38)'},
  cardCompact:{maxWidth:undefined,width:'100%',maxHeight:'88%',borderBottomLeftRadius:0,borderBottomRightRadius:0},
  header:{flexDirection:'row',alignItems:'center',gap:12,marginBottom:12},
  headerCopy:{flex:1,minWidth:0},
  title:{color:colors.text,fontFamily:typography.display,fontSize:25,fontWeight:'800'},
  description:{color:colors.muted,fontSize:11,lineHeight:16,marginTop:4},
  close:{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.05)'},
  list:{paddingBottom:2},
  option:{minHeight:72,flexDirection:'row',alignItems:'center',gap:12,paddingVertical:12,paddingHorizontal:13,borderRadius:radius.md,borderWidth:1,borderColor:'transparent'},
  optionCompact:{minHeight:54},
  optionActive:{backgroundColor:'rgba(112,55,139,.25)',borderColor:'rgba(199,120,255,.56)'},
  optionCopy:{flex:1,minWidth:0},
  optionTitleRow:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:7},
  optionTitle:{color:colors.textSecondary,fontSize:14,fontWeight:'900'},
  optionTitleActive:{color:colors.text},
  optionDescription:{color:colors.muted,fontSize:11,lineHeight:16,marginTop:4},
  badge:{overflow:'hidden',color:'#E4BBFF',fontSize:9,fontWeight:'900',textTransform:'uppercase',paddingHorizontal:7,paddingVertical:3,borderRadius:999,backgroundColor:'rgba(168,69,242,.2)'},
  radio:{width:20,height:20,borderRadius:10,borderWidth:2,borderColor:colors.dimmed},
  check:{width:22,height:22,borderRadius:11,alignItems:'center',justifyContent:'center',backgroundColor:colors.violet},
  pressed:{opacity:.8},
});
