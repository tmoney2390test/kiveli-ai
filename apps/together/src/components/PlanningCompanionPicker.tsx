import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronDown, Sparkles, X } from 'lucide-react-native';
import type { CharacterInstance, Snapshot } from '../types';
import { planningCompanionsForWorld } from '../lib/planningCompanions';
import { colors, radius, spacing, typography } from '../theme';
import { FrostedBackdrop, FrostedSurface } from './FrostedGlass';
import { CharacterAvatar } from './ui';

export function PlanningCompanionPicker({snapshot,worldId,worldName,active,onSelect}:{snapshot:Snapshot;worldId:string;worldName:string;active?:CharacterInstance;onSelect:(character:CharacterInstance)=>void}) {
  const [open,setOpen]=useState(false);
  const companions=useMemo(()=>planningCompanionsForWorld(snapshot,worldId),[snapshot,worldId]);
  if(!companions.length)return null;

  const choose=(character:CharacterInstance)=>{setOpen(false);onSelect(character);};
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Plan with ${active?.together_character_templates.name??'a different companion'}`} accessibilityState={{expanded:open}} onPress={()=>setOpen(true)} style={({pressed})=>[styles.trigger,pressed&&styles.pressed]}>
      {active?<CharacterAvatar slug={active.together_character_templates.slug} name={active.together_character_templates.name} template={active.together_character_templates} version={active.together_character_versions} size={34}/>:<View style={styles.placeholder}><Sparkles size={16} color={colors.rose}/></View>}
      <View style={styles.triggerCopy}><Text style={styles.label}>PLAN WITH</Text><Text numberOfLines={1} style={styles.activeName}>{active?.together_character_templates.name??'Choose a companion'}</Text></View>
      <ChevronDown size={17} color={colors.muted}/>
    </Pressable>

    <Modal visible={open} transparent animationType="fade" onRequestClose={()=>setOpen(false)}>
      <Pressable style={styles.backdrop} onPress={()=>setOpen(false)}>
        <FrostedBackdrop intensity={38}/>
        <Pressable style={styles.popupFrame} onPress={()=>undefined}>
          <FrostedSurface intensity={94} style={styles.popup}>
            <View style={styles.heading}><View style={styles.headingCopy}><Text style={styles.title}>Plan with</Text><Text style={styles.subtitle}>{worldName} companions · most recent first</Text></View><Pressable accessibilityLabel="Close companion picker" onPress={()=>setOpen(false)} style={styles.close}><X size={18} color={colors.text}/></Pressable></View>
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
              {companions.map((character)=><Pressable key={character.id} accessibilityRole="button" accessibilityState={{selected:character.id===active?.id}} onPress={()=>choose(character)} style={({pressed})=>[styles.row,character.id===active?.id&&styles.rowActive,pressed&&styles.pressed]}>
                <CharacterAvatar slug={character.together_character_templates.slug} name={character.together_character_templates.name} template={character.together_character_templates} version={character.together_character_versions} size={44}/>
                <View style={styles.rowCopy}><Text style={styles.rowName}>{character.together_character_templates.name}</Text><Text numberOfLines={1} style={styles.rowMeta}>{character.current_activity}</Text></View>
                {character.id===active?.id?<Check size={19} color={colors.rose}/>:null}
              </Pressable>)}
            </ScrollView>
          </FrostedSurface>
        </Pressable>
      </Pressable>
    </Modal>
  </>;
}

const styles=StyleSheet.create({
  trigger:{width:'100%',minHeight:54,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:11,paddingVertical:8,borderRadius:radius.lg,backgroundColor:'rgba(23,19,30,.78)',borderWidth:1,borderColor:'rgba(216,62,234,.28)'},pressed:{opacity:.86},placeholder:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(216,62,234,.12)'},triggerCopy:{flex:1},label:{color:colors.rose,fontSize:8,fontWeight:'900',letterSpacing:1.1},activeName:{color:colors.text,fontSize:14,fontWeight:'900',marginTop:2},
  backdrop:{flex:1,alignItems:'center',justifyContent:'center',padding:20},popupFrame:{width:'100%',maxWidth:440},popup:{padding:spacing.md,borderRadius:radius.xl,borderColor:colors.borderBright},heading:{flexDirection:'row',alignItems:'flex-start',gap:12,padding:4,paddingBottom:12},headingCopy:{flex:1},title:{fontFamily:typography.display,color:colors.text,fontSize:27},subtitle:{color:colors.muted,fontSize:10.5,marginTop:4},close:{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:colors.elevated},list:{maxHeight:410},listContent:{gap:7},row:{minHeight:62,flexDirection:'row',alignItems:'center',gap:11,padding:9,borderRadius:radius.md,backgroundColor:'rgba(255,255,255,.035)',borderWidth:1,borderColor:'transparent'},rowActive:{backgroundColor:'rgba(216,62,234,.10)',borderColor:'rgba(216,62,234,.30)'},rowCopy:{flex:1},rowName:{color:colors.text,fontSize:14,fontWeight:'900'},rowMeta:{color:colors.muted,fontSize:10.5,marginTop:3},
});
