import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { EmptyState, GlassCard, MomentCard, PageTitle, Screen } from '../../src/components';
import { colors } from '../../src/theme';
import { useTogether } from '../../src/store/useTogether';

const filters = ['All', 'Milestones', 'Dates', 'Memories', 'Photos'] as const;
type Filter = typeof filters[number];
export default function MomentsTab() {
  const moments = useTogether((state) => state.snapshot?.moments ?? []);
  const [filter, setFilter] = useState<Filter>('All');
  const visible = useMemo(() => moments.filter((moment) => filter === 'All' || filter === 'Photos' ? (filter !== 'Photos' || moment.media.length > 0) : filter === 'Dates' ? /date/i.test(moment.moment_type) : filter === 'Milestones' ? /milestone|relationship|introduction/i.test(moment.moment_type) : /memory|conversation/i.test(moment.moment_type)), [filter, moments]);
  return <Screen><View style={styles.header}><View style={{flex:1}}><PageTitle>Moments</PageTitle><Text style={styles.subtitle}>The parts of your story worth keeping.</Text></View></View><View style={styles.tabs}>{filters.map((item)=><Pressable key={item} onPress={() => setFilter(item)} style={[styles.tab,filter===item&&styles.active]}><Text style={[styles.tabText,filter===item&&styles.activeText]}>{item}</Text></Pressable>)}</View>{visible.length ? <View style={styles.grid}>{visible.map((moment)=><MomentCard key={moment.id} moment={moment} onPress={() => router.push(`/moment/${moment.id}` as never)} />)}</View> : <View style={styles.emptyWrap}><View style={styles.emptyIcon}><Sparkles size={24} color={colors.rose}/></View><EmptyState title={filter==='All'?'Your story is just beginning':`No ${filter.toLowerCase()} yet`} body="When something genuinely meaningful happens, it will live here." /></View>}<GlassCard style={styles.note}><Sparkles size={17} color={colors.warm}/><Text style={styles.noteText}>Moments are created only when something genuinely meaningful happens.</Text></GlassCard></Screen>;
}
const styles=StyleSheet.create({header:{flexDirection:'row',alignItems:'flex-start'},subtitle:{color:colors.muted,fontSize:12,marginTop:3},tabs:{flexDirection:'row',gap:7,flexWrap:'wrap'},tab:{paddingHorizontal:11,paddingVertical:8,borderRadius:99,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},active:{backgroundColor:'rgba(232,93,140,.16)',borderColor:'rgba(232,93,140,.45)'},tabText:{color:colors.muted,fontSize:11,fontWeight:'800'},activeText:{color:colors.rose},grid:{flexDirection:'row',flexWrap:'wrap',gap:12},emptyWrap:{minHeight:330,justifyContent:'center',alignItems:'center'},emptyIcon:{width:58,height:58,borderRadius:29,backgroundColor:'rgba(232,93,140,.11)',alignItems:'center',justifyContent:'center',marginBottom:-36,zIndex:1},note:{flexDirection:'row',gap:10,alignItems:'center',paddingVertical:13},noteText:{flex:1,color:colors.muted,fontSize:12,lineHeight:17}});
