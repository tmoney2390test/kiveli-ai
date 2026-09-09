import { useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { colors, radius } from '../theme';
import type { World } from '../types';
import { worldHeroAsset } from '../assets';
import { CreatorModal } from './CreatorPicker';
import { WorldChoiceCard } from './WorldChoiceCard';
export function CompanionWorldToggle({worlds,value,onChange}:{worlds:World[];value:string;onChange:(worldId:string)=>void}) {
 const [open,setOpen]=useState(false),options=worlds.filter(world=>world.published).sort((a,b)=>a.sort_order-b.sort_order),selected=options.find(world=>world.id===value)??options[0];
 if(!selected||options.length<2)return null;
 return <View><Pressable accessibilityRole="button" accessibilityLabel={`Showing companions in ${selected.name}. Change world.`} aria-expanded={open} accessibilityState={{expanded:open}} onPress={()=>setOpen(true)} style={styles.trigger}><Image source={worldHeroAsset(selected.slug)} style={styles.thumb} contentFit="cover"/><Text numberOfLines={1} style={styles.label}>{selected.name}</Text><ChevronDown size={14} color={colors.muted}/></Pressable><CreatorModal visible={open} title="Choose a world" onClose={()=>setOpen(false)}><View accessibilityRole="radiogroup" style={styles.grid}>{options.map(world=><WorldChoiceCard key={world.id} name={world.name} image={worldHeroAsset(world.slug)} selected={world.id===value} onPress={()=>{onChange(world.id);setOpen(false);}}/>)}</View></CreatorModal></View>;
}
const styles=StyleSheet.create({trigger:{minHeight:44,maxWidth:205,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:10,borderRadius:radius.pill,borderWidth:1,borderColor:'rgba(255,225,244,.26)',backgroundColor:colors.surface},thumb:{width:26,height:26,borderRadius:13},label:{flexShrink:1,color:colors.text,fontSize:11,fontWeight:'800'},grid:{flexDirection:'row',flexWrap:'wrap',gap:10}});
