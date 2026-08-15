import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronDown, Search, Sparkles } from 'lucide-react-native';
import { CharacterAvatar, EmptyState, GlassCard, MomentCard, PageTitle, Screen } from '../../src/components';
import { colors, radius } from '../../src/theme';
import { useTogether } from '../../src/store/useTogether';
import { selectActiveCompanion, selectCompanionMoments, selectPortraitVersion } from '../../src/lib/selectors';
import { worldForLocation } from '../../src/lib/place';

const filters = ['All', 'Milestones', 'Dates', 'Memories', 'Photos'] as const;
type Filter = typeof filters[number];

export default function MomentsTab() {
  const snapshot = useTogether((state) => state.snapshot);
  const active = snapshot ? selectActiveCompanion(snapshot) : undefined;
  const companions = snapshot?.characters.filter((item) => item.contact_added_at || item.introduced_at) ?? [];
  const [companionId, setCompanionId] = useState<string>(() => active?.id ?? 'all');
  const [showCompanions,setShowCompanions]=useState(false);
  useEffect(()=>{if(active?.id)setCompanionId(active.id);},[active?.id]);
  const [filter, setFilter] = useState<Filter>('All');
  const [query, setQuery] = useState('');
  const moments = snapshot ? companionId === 'all' ? snapshot.moments : selectCompanionMoments(snapshot, companionId) : [];
  const media = snapshot?.generatedMedia ?? [];
  const selected = companions.find((item) => item.id === companionId);
  const visible = useMemo(() => moments.filter((moment) => {
    const matchesFilter = filter === 'All' || filter === 'Photos' ? (filter !== 'Photos' || moment.media.length > 0 || media.some((item)=>item.moment_id===moment.id&&item.status==='ready')) : filter === 'Dates' ? /date/i.test(moment.moment_type) : filter === 'Milestones' ? /milestone|relationship|introduction/i.test(moment.moment_type) : /memory|conversation/i.test(moment.moment_type);
    if (!matchesFilter) return false;
    const place = snapshot?.locations.find((item) => item.id === moment.location_id);
    const world=place&&snapshot?worldForLocation(snapshot,place.id):undefined;
    const person=snapshot?.characters.find((item)=>item.id===moment.character_instance_id||moment.participant_instance_ids.includes(item.id));
    return !query.trim() || `${moment.title} ${moment.summary} ${place?.name ?? ''} ${world?.name??''} ${person?.together_character_templates.name??''}`.toLowerCase().includes(query.trim().toLowerCase());
  }), [filter, media, moments, query, snapshot]);
  const groups = groupMoments(visible);
  const name = selected?.together_character_templates.name;

  return <Screen>
    <View style={styles.header}><View style={{flex:1}}><PageTitle>Moments</PageTitle><Text style={styles.subtitle}>{name ? `Your shared history with ${name}.` : 'The parts of your stories worth keeping.'}</Text></View></View>
    {companions.length>1?<View style={styles.selectorWrap}><Pressable onPress={()=>setShowCompanions((value)=>!value)} style={styles.selector}>{selected?<CharacterAvatar slug={selected.together_character_templates.slug} name={selected.together_character_templates.name} template={selected.together_character_templates} version={snapshot?selectPortraitVersion(snapshot,selected):selected.together_character_versions} size={30}/>:<View style={styles.allAvatar}><Sparkles size={14} color={colors.rose}/></View>}<View style={{flex:1}}><Text style={styles.selectorLabel}>SHARED HISTORY</Text><Text style={styles.selectorName}>{name??'All companions'}</Text></View><ChevronDown size={17} color={colors.muted}/></Pressable>{showCompanions?<GlassCard style={styles.picker}><Pressable onPress={()=>{setCompanionId('all');setShowCompanions(false);}} style={styles.pickerRow}><View style={styles.allAvatar}><Sparkles size={14} color={colors.rose}/></View><Text style={styles.pickerName}>All companions</Text></Pressable>{companions.map((companion)=><Pressable key={companion.id} onPress={()=>{setCompanionId(companion.id);setShowCompanions(false);}} style={styles.pickerRow}><CharacterAvatar slug={companion.together_character_templates.slug} name={companion.together_character_templates.name} template={companion.together_character_templates} version={snapshot?selectPortraitVersion(snapshot,companion):companion.together_character_versions} size={32}/><Text style={styles.pickerName}>{companion.together_character_templates.name}</Text></Pressable>)}</GlassCard>:null}</View>:null}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{filters.map((item)=><Pressable key={item} onPress={()=>setFilter(item)} style={[styles.tab,filter===item&&styles.active]}><Text style={[styles.tabText,filter===item&&styles.activeText]}>{item}</Text></Pressable>)}</ScrollView>
    {moments.length >= 6 ? <View style={styles.search}><Search size={16} color={colors.muted}/><TextInput value={query} onChangeText={setQuery} placeholder="Search people, places, or memories" placeholderTextColor={colors.muted} style={styles.searchInput}/></View> : null}
    {visible.length ? groups.map((group)=><View key={group.label} style={styles.group}><Text style={styles.groupTitle}>{group.label}</Text><View style={styles.grid}>{group.items.map((moment)=>{const character=snapshot?.characters.find((item)=>item.id===moment.character_instance_id||moment.participant_instance_ids.includes(item.id)),place=snapshot?.locations.find((item)=>item.id===moment.location_id),world=place&&snapshot?worldForLocation(snapshot,place.id):undefined,meta=[companionId==='all'?character?.together_character_templates.name:null,place?.name,world?.name].filter(Boolean).join(' · ');return <View key={moment.id} style={styles.momentWrap}><MomentCard moment={moment} character={character} portraitVersion={snapshot&&character?selectPortraitVersion(snapshot,character):undefined} mediaUrl={media.find((item)=>item.moment_id===moment.id&&item.status==='ready')?.signed_url} onPress={()=>router.push(`/moment/${moment.id}` as never)}/>{meta?<Text style={styles.momentMeta} numberOfLines={1}>{meta}</Text>:null}</View>})}</View></View>) : <View style={styles.emptyWrap}><View style={styles.emptyIcon}><Sparkles size={24} color={colors.rose}/></View><EmptyState title={name?`You and ${name} haven't made a Moment yet`:`No ${filter.toLowerCase()} yet`} body={name?'When something genuinely meaningful happens between you, it will live here.':'Try another companion or filter.'}/></View>}
    <GlassCard style={styles.note}><Sparkles size={17} color={colors.warm}/><Text style={styles.noteText}>Moments are created only when something genuinely meaningful happens.</Text></GlassCard>
  </Screen>;
}

function groupMoments<T extends {occurred_at:string}>(moments:T[]){const now=new Date();const startOfWeek=new Date(now);startOfWeek.setHours(0,0,0,0);startOfWeek.setDate(startOfWeek.getDate()-6);const groups=new Map<string,T[]>();for(const moment of moments){const date=new Date(moment.occurred_at);const label=date>=startOfWeek?'THIS WEEK':date.toLocaleDateString([],{month:'long',year:'numeric'}).toUpperCase();groups.set(label,[...(groups.get(label)??[]),moment]);}return[...groups].map(([label,items])=>({label,items}));}

const styles=StyleSheet.create({header:{flexDirection:'row',alignItems:'flex-start'},subtitle:{color:colors.muted,fontSize:12,marginTop:3},selectorWrap:{gap:7},selector:{minHeight:56,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:12,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},selectorLabel:{color:colors.dimmed,fontSize:8,fontWeight:'900',letterSpacing:.8},selectorName:{color:colors.text,fontSize:14,fontWeight:'900',marginTop:2},allAvatar:{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(232,93,140,.10)'},picker:{paddingVertical:4},pickerRow:{minHeight:48,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:8,borderBottomWidth:1,borderBottomColor:colors.border},pickerName:{color:colors.text,fontWeight:'800',fontSize:12},tabs:{gap:7,paddingRight:10},tab:{paddingHorizontal:11,paddingVertical:8,borderRadius:99,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},active:{backgroundColor:'rgba(232,93,140,.16)',borderColor:'rgba(232,93,140,.45)'},tabText:{color:colors.muted,fontSize:11,fontWeight:'800'},activeText:{color:colors.rose},search:{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:12,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},searchInput:{flex:1,minHeight:44,color:colors.text},group:{gap:10},groupTitle:{color:colors.rose,fontSize:10,fontWeight:'900',letterSpacing:1.1},grid:{flexDirection:'row',flexWrap:'wrap',gap:12},momentWrap:{width:154,gap:5},momentMeta:{color:colors.muted,fontSize:9,paddingHorizontal:2},emptyWrap:{minHeight:330,justifyContent:'center',alignItems:'center'},emptyIcon:{width:58,height:58,borderRadius:29,backgroundColor:'rgba(232,93,140,.11)',alignItems:'center',justifyContent:'center',marginBottom:-36,zIndex:1},note:{flexDirection:'row',gap:10,alignItems:'center',paddingVertical:13},noteText:{flex:1,color:colors.muted,fontSize:12,lineHeight:17}});
