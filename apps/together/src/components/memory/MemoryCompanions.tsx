import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ChevronRight, Search } from 'lucide-react-native';
import type { CharacterInstance } from '../../types';
import { colors } from '../../theme';
import { CharacterAvatar } from '../ui';
import { FrostedSurface } from '../FrostedGlass';
import { styles } from './memoryStyles';

export function MemoryCompanionRail({companions,activeId,counts,onChoose}:{companions:CharacterInstance[];activeId?:string;counts:Record<string,number>;onChoose:(companion:CharacterInstance)=>void}){
  const[query,setQuery]=useState('');
  const filtered=useMemo(()=>companions.filter((item)=>item.together_character_templates.name.toLowerCase().includes(query.trim().toLowerCase())),[companions,query]);
  return <FrostedSurface intensity={76} style={styles.companionRail}>
    <Text style={styles.railKicker}>COMPANIONS</Text>
    <View style={styles.railSearch}><Search size={15} color={colors.muted}/><TextInput value={query} onChangeText={setQuery} placeholder="Find someone" placeholderTextColor={colors.dimmed} style={styles.railSearchInput}/></View>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.railList}>{filtered.map((item)=><Pressable key={item.id} onPress={()=>onChoose(item)} style={[styles.companionRow,item.id===activeId&&styles.companionRowActive]}><CharacterAvatar slug={item.together_character_templates.slug} name={item.together_character_templates.name} template={item.together_character_templates} version={item.together_character_versions} size={38}/><View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={[styles.companionName,item.id===activeId&&styles.companionNameActive]}>{item.together_character_templates.name}</Text><Text style={styles.companionCount}>{counts[item.id]??0} remembered</Text></View><ChevronRight size={15} color={item.id===activeId?colors.rose:colors.dimmed}/></Pressable>)}</ScrollView>
  </FrostedSurface>;
}

export function MemoryCompanionStrip({companions,activeId,counts,onChoose}:{companions:CharacterInstance[];activeId?:string;counts:Record<string,number>;onChoose:(companion:CharacterInstance)=>void}){return <ScrollView horizontal style={styles.companionStripScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.companionStrip}>{companions.map((item)=><Pressable key={item.id} accessibilityRole="button" accessibilityState={{selected:item.id===activeId}} accessibilityLabel={`${item.together_character_templates.name}, ${counts[item.id]??0} remembered`} onPress={()=>onChoose(item)} style={[styles.companionChip,item.id===activeId&&styles.companionChipActive]}><CharacterAvatar slug={item.together_character_templates.slug} name={item.together_character_templates.name} template={item.together_character_templates} version={item.together_character_versions} size={32}/><View style={styles.chipCopy}><Text numberOfLines={1} style={[styles.chipName,item.id===activeId&&styles.companionNameActive]}>{item.together_character_templates.name.split(' ')[0]}</Text><Text style={styles.chipCount}>{counts[item.id]??0}</Text></View></Pressable>)}</ScrollView>;}
