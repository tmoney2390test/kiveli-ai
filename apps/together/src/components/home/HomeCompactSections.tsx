import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ArrowRight, BookOpen, CalendarDays, CalendarPlus, ChevronRight, ImageIcon, LockKeyhole, Play, Sparkles } from 'lucide-react-native';
import { colors, typography } from '../../theme';
import type { HomeSharedItem, homeNextItem } from '../../lib/compactHome';
import { DetailPreservingArtwork } from '../DetailPreservingArtwork';

export function HomeNextRow({ next, onOpen, onPlan }: { next: ReturnType<typeof homeNextItem>; onOpen: () => void; onPlan: () => void }) {
  const narrow = useWindowDimensions().width < 520;
  return <View style={styles.next}>
    <View style={styles.nextHeading}><View style={styles.icon}>{next.kind === 'scenario' ? <BookOpen size={18} color={colors.rose} /> : <CalendarDays size={18} color={colors.rose} />}</View><View style={styles.nextCopy}><Text style={styles.eyebrow}>{next.eyebrow}</Text><Text numberOfLines={2} style={styles.nextTitle}>{next.title}</Text><View style={styles.metaRow}>{next.kind === 'scenario' ? <LockKeyhole size={11} color={colors.muted} /> : null}<Text numberOfLines={2} style={styles.meta}>{next.meta}</Text></View></View></View>
    <View style={[styles.nextActions, narrow && styles.nextActionsNarrow]}><Pressable accessibilityRole="button" onPress={onOpen} style={styles.action}><Text style={styles.actionText}>{next.label}</Text><ArrowRight size={14} color={colors.rose} /></Pressable>{next.kind !== 'planning' ? <Pressable accessibilityRole="button" accessibilityLabel="Plan an event" onPress={onPlan} style={styles.plan}><CalendarPlus size={19} color={colors.rose} /></Pressable> : null}</View>
  </View>;
}

export function HomeRecentSection({ items, onOpen, onViewAll }: { items: HomeSharedItem[]; onOpen: (item: HomeSharedItem) => void; onViewAll: () => void }) {
  const narrow = useWindowDimensions().width < 760;
  if (!items.length) return null;
  return <View style={styles.section}><View style={styles.sectionHeading}><Text accessibilityRole="header" style={styles.sectionTitle}>Recently shared</Text><Pressable accessibilityRole="button" accessibilityLabel="View all recently shared moments" onPress={onViewAll} style={styles.action}><Text style={styles.actionText}>View all</Text><ArrowRight size={14} color={colors.rose} /></Pressable></View><View style={styles.sharedGrid}>{items.map(entry => {
    const media = entry.kind === 'media' ? entry.item : undefined;
    const timestamp = media?.timestamp ?? (entry.kind === 'moment' ? entry.item.occurred_at : '');
    const label = `${media?.locked ? 'Locked media: ' : ''}${entry.item.title}`;
    return <Pressable key={`${entry.kind}:${entry.item.id}`} accessibilityRole="button" accessibilityLabel={label} onPress={() => onOpen(entry)} style={({ pressed }) => [styles.sharedItem, { width: narrow ? '100%' : '49%' }, pressed && styles.pressed]}>
      <View style={styles.thumbnail}>{media?.thumbnailUrl ? <DetailPreservingArtwork source={{ uri: media.thumbnailUrl, cacheKey: media.cacheKey }} accessibilityLabel={entry.item.title} dim={0} blurRadius={media.locked ? 20 : 0} priority="low" loading="lazy" recyclingKey={media.id} /> : entry.kind === 'moment' ? <Sparkles size={21} color={colors.rose} /> : <ImageIcon size={21} color={colors.rose} />}{media?.locked ? <View style={styles.mediaIcon}><LockKeyhole size={14} color="white" /></View> : media?.type === 'video' ? <View style={styles.mediaIcon}><Play size={14} color="white" /></View> : null}</View>
      <View style={styles.sharedCopy}><Text numberOfLines={2} style={styles.sharedTitle}>{entry.item.title}</Text><Text numberOfLines={1} style={styles.meta}>{media ? media.type === 'video' ? 'Video' : 'Photo' : 'Shared moment'} · {new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}</Text></View><ChevronRight size={15} color={colors.muted} />
    </Pressable>;
  })}</View></View>;
}
const styles = StyleSheet.create({
  next: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.border },
  nextHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 220 },
  nextCopy: { flex: 1, gap: 3 },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#29202F', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.1, color: '#EDB1CB' },
  nextTitle: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  meta: { fontSize: 11, lineHeight: 16, color: colors.muted, flexShrink: 1 },
  nextActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nextActionsNarrow: { width: '100%', paddingLeft: 52, justifyContent: 'space-between' },
  action: { flexDirection: 'row', minHeight: 44, alignItems: 'center', gap: 7 },
  actionText: { color: '#EDB1CB', fontSize: 12, fontWeight: '700' },
  plan: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  section: { gap: 10 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  sectionTitle: { fontFamily: typography.display, fontSize: 24, lineHeight: 30, color: colors.text, fontWeight: '600' },
  sharedGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  sharedItem: { minHeight: 86, flexDirection: 'row', gap: 12, alignItems: 'center', borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: '#18121D', overflow: 'hidden', paddingRight: 12 },
  thumbnail: { width: 76, height: 86, backgroundColor: '#241A2B', alignItems: 'center', justifyContent: 'center' },
  mediaIcon: { position: 'absolute', right: 5, bottom: 5, padding: 5, backgroundColor: 'rgba(0,0,0,.7)', borderRadius: 10 },
  sharedCopy: { flex: 1, gap: 6 },
  sharedTitle: { fontSize: 13, lineHeight: 18, color: colors.text, fontWeight: '600' },
  pressed: { opacity: .8 },
});
