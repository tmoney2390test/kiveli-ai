import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import { ArrowUpRight, Check, ChevronDown, Clock3, History, MapPin, MessageCircle, MoreVertical, Pin, Sparkles, Trash2 } from 'lucide-react-native';
import type { MemoryCenterInsights, MemoryCenterItem } from '../../types';
import { colors } from '../../theme';
import { presentMemoryText } from '../../lib/memoryPresentation';
import { memoryJournalLabel, presentInsightText } from '../../lib/memoryCenter';
import { FrostedSurface } from '../FrostedGlass';
import { styles } from './memoryStyles';

export function MemoryJournalRow({memory,name,privacyMode,selectionMode,selected,busy,onOpen,onToggle,onForget,onSource}:{memory:MemoryCenterItem;name:string;privacyMode:boolean;selectionMode:boolean;selected:boolean;busy:boolean;onOpen:()=>void;onToggle:()=>void;onForget:()=>void;onSource?:()=>void}){
  const sourceAction=(event:GestureResponderEvent)=>{event.stopPropagation();onSource?.();};
  const openAction=(event:GestureResponderEvent)=>{event.stopPropagation();onOpen();};
  const forgetAction=(event:GestureResponderEvent)=>{event.stopPropagation();onForget();};
  const due=memory.memory_type==='open_thread'&&memory.expectedAt?new Date(memory.expectedAt):null;
  const sourceLabel=memory.knowledgeKind==='inferred'?`${name.split(' ')[0]} noticed`:`You told ${name.split(' ')[0]}`;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${memoryJournalLabel(memory)}. ${presentMemoryText(memory.canonical_text,name)}`} disabled={busy} onLongPress={onToggle} onPress={selectionMode?onToggle:privacyMode?undefined:onOpen} style={({pressed})=>[styles.memoryRow,selected&&styles.memoryRowSelected,pressed&&(!privacyMode||selectionMode)&&styles.memoryRowPressed]}>
    <View style={styles.memoryMetaLine}>
      {selectionMode?<View style={[styles.selectionBox,selected&&styles.selectionBoxActive]}>{selected?<Check size={13} strokeWidth={3} color="#fff"/>:null}</View>:null}
      <Text style={styles.memoryCategory}>{memoryJournalLabel(memory)}</Text>
      <View style={styles.memoryActions}>{memory.pinned?<Pin size={17} color="#E79DCA" fill="#E79DCA"/>:null}{privacyMode?<Pressable accessibilityLabel="Forget this memory" disabled={busy} onPress={forgetAction} style={styles.rowAction}>{busy?<ActivityIndicator size="small" color={colors.danger}/>:<Trash2 size={18} color={colors.danger}/>}</Pressable>:!selectionMode?<Pressable accessibilityLabel="Open memory options" onPress={openAction} style={styles.rowAction}><MoreVertical size={20} color={colors.muted}/></Pressable>:null}</View>
    </View>
    <Text style={styles.memoryText}>{presentMemoryText(memory.canonical_text,name)}</Text>
    {due?<View style={styles.contextRow}><Clock3 size={13} color={colors.warm}/><Text style={styles.dueText}>{relativeDue(due)}</Text></View>:memory.sourceContext?<Pressable disabled={!onSource} onPress={sourceAction} style={styles.contextRow}>{memory.locationName?<MapPin size={13} color={colors.violet}/>:<History size={13} color={colors.violet}/>}<Text numberOfLines={2} style={[styles.sourceText,onSource&&styles.sourceLink]}>{memory.sourceContext}</Text>{onSource?<ArrowUpRight size={13} color={colors.violet}/>:null}</Pressable>:null}
    <View style={styles.memoryDivider}/>
    <View style={styles.memoryFoot}><View style={styles.sourceIdentity}>{memory.knowledgeKind==='inferred'?<Sparkles size={18} color="#E79DCA"/>:<MessageCircle size={18} color="#E79DCA"/>}<Text style={styles.sourceIdentityText}>{sourceLabel}</Text></View><Text style={styles.memoryDate}>{new Date(memory.updated_at).toLocaleDateString(undefined,{month:'short',day:'numeric',year:new Date(memory.updated_at).getFullYear()===new Date().getFullYear()?undefined:'numeric'})}</Text></View>
  </Pressable>;
}

export function MemoryInsightsPanel({name,insights,expandedByDefault=false}:{name:string;insights:MemoryCenterInsights|null;expandedByDefault?:boolean}){
  const[expanded,setExpanded]=useState(expandedByDefault);
  if(!insights||(!insights.relationshipSummary&&!insights.sharedReferences.length&&!insights.learnedPatterns.length&&!insights.recalledReferences.length))return null;
  return <FrostedSurface intensity={76} style={styles.insights}>
    <Pressable onPress={()=>setExpanded((value)=>!value)} style={styles.insightsHeader}><View style={styles.insightIcon}><Sparkles size={18} color={colors.warm}/></View><View style={{flex:1}}><Text style={styles.insightsKicker}>KIVELLE MAX</Text><Text style={styles.insightsTitle}>How {name.split(' ')[0]} understands you</Text></View><ChevronDown size={18} color={colors.muted} style={{transform:[{rotate:expanded?'180deg':'0deg'}]}}/></Pressable>
    {expanded?<View style={styles.insightsContent}>{insights.relationshipSummary?<InsightSection title="YOUR RELATIONSHIP" values={[insights.relationshipSummary]} name={name}/>:null}{insights.learnedPatterns.length?<InsightSection title="PATTERNS NOTICED" values={insights.learnedPatterns.map((item)=>item.summary)} name={name}/>:null}{insights.sharedReferences.length?<InsightSection title="SHARED REFERENCES" values={insights.sharedReferences} name={name}/>:null}{insights.recalledReferences.length?<InsightSection title="RECALLED NATURALLY" values={insights.recalledReferences} name={name}/>:null}</View>:null}
  </FrostedSurface>;
}
function InsightSection({title,values,name}:{title:string;values:string[];name:string}){return <View style={styles.insightSection}><Text style={styles.insightLabel}>{title}</Text>{values.slice(0,5).map((value,index)=><View key={`${title}:${index}`} style={styles.insightRow}><View style={styles.insightDot}/><Text style={styles.insightText}>{presentInsightText(value,name)}</Text></View>)}</View>;}

function relativeDue(value:Date){const days=Math.ceil((value.getTime()-Date.now())/86400000);if(days<0)return'Follow-up overdue';if(days===0)return'Due today';if(days===1)return'Due tomorrow';return`Due ${value.toLocaleDateString(undefined,{month:'short',day:'numeric'})}`;}
