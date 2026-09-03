import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CalendarDays, Clock3, Heart, MapPin, Sparkles } from 'lucide-react-native';
import { colors, typography } from '../../theme';
import type { HomeTimelineItem } from '../../lib/homeViewModel';
import { SectionTitle } from './FromCompanionSection';

export function HomeTimeline({ title, items, onViewWorld, onOpen, compact=false }: { title: string; items: HomeTimelineItem[]; onViewWorld: () => void; onOpen: (item: HomeTimelineItem) => void; compact?:boolean }) {
  return <View style={styles.section}>
    <SectionTitle title={title} action="Explore" onAction={onViewWorld} compact={compact} />
    {items.length ? <View style={styles.timeline}><View pointerEvents="none" style={[styles.rail,compact&&styles.railCompact]} />{items.map((item) => <TimelineEvent key={item.id} item={item} compact={compact} onPress={() => onOpen(item)} />)}</View> : <View style={styles.empty}><Sparkles size={18} color={colors.rose} /><View><Text style={styles.emptyTitle}>The rest of the day is open</Text><Text style={styles.emptyCopy}>Start a conversation and see where it goes.</Text></View></View>}
  </View>;
}

function TimelineEvent({ item, onPress, compact }: { item: HomeTimelineItem; onPress: () => void; compact:boolean }) {
  const icon = item.kind === 'plan' ? <CalendarDays size={15} color={colors.warm} /> : item.kind === 'date' ? <Heart size={15} color={colors.rose} /> : item.kind === 'event' ? <Sparkles size={15} color={colors.violet} /> : item.current ? <MapPin size={15} color="#fff" /> : <Clock3 size={15} color={colors.muted} />;
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row,compact&&styles.rowCompact, item.current && styles.rowCurrent, pressed && styles.pressed]}>
    <View style={[styles.node,compact&&styles.nodeCompact, item.current && styles.nodeCurrent]}>{icon}</View>
    <View style={styles.body}><Text style={[styles.time, item.current && styles.timeCurrent]}>{item.current ? 'NOW' : item.time.toUpperCase()}</Text><Text numberOfLines={2} style={[styles.title,compact&&styles.titleCompact, item.current && styles.titleCurrent,compact&&item.current&&styles.titleCurrentCompact]}>{item.title}</Text>{item.detail ? <Text numberOfLines={2} style={styles.detail}>{item.detail}</Text> : null}</View>
  </Pressable>;
}

const styles = StyleSheet.create({
  section: { gap: 13 },
  timeline: { position: 'relative', paddingVertical: 3 },
  rail: { position: 'absolute', left: 23, top: 25, bottom: 25, width: 2, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.10)' },
  railCompact:{left:19},
  row: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 11, paddingRight: 12, borderRadius: 18 },
  rowCompact:{minHeight:72,gap:12,paddingVertical:8},
  rowCurrent: { backgroundColor: 'rgba(95,38,76,.22)' },
  pressed: { opacity: .72 },
  node: { zIndex: 1, width: 47, height: 47, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,.10)' },
  nodeCompact:{width:39,height:39,borderRadius:20},
  nodeCurrent: { backgroundColor: colors.rose, borderColor: 'rgba(255,255,255,.24)', shadowColor: colors.rose, shadowOpacity: .55, shadowRadius: 15, shadowOffset: { width: 0, height: 3 } },
  body: { flex: 1, minWidth: 0 },
  time: { color: colors.dimmed, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  timeCurrent: { color: '#FFB8CE' },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 19, lineHeight: 23, marginTop: 3 },
  titleCompact:{fontSize:16,lineHeight:20},
  titleCurrent: { fontSize: 21 },
  titleCurrentCompact:{fontSize:18,lineHeight:21},
  detail: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  empty: { minHeight: 120, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 18, borderRadius: 22, backgroundColor: colors.surface },
  emptyTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18 },
  emptyCopy: { color: colors.muted, fontSize: 11, marginTop: 3 },
});
