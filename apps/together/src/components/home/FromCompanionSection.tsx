import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { ArrowRight, Camera, LockKeyhole, Play } from 'lucide-react-native';
import { colors, radius, typography } from '../../theme';
import type { CompanionMediaItem } from '../../lib/homePresentation';
import { DetailPreservingArtwork } from '../DetailPreservingArtwork';

export function FromCompanionSection({ name, items, fallbackSource, onViewAll, onOpen, onAsk }: { name: string; items: CompanionMediaItem[]; fallbackSource?: ImageSource | number; onViewAll: () => void; onOpen: (item: CompanionMediaItem) => void; onAsk: () => void }) {
  return <View style={styles.section}>
    <SectionTitle title={`From ${name}`} action={items.length ? 'View all' : undefined} onAction={onViewAll} />
    {items.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>{items.slice(0, 8).map((item) => <MediaCard key={item.id} item={item} onPress={() => onOpen(item)} />)}</ScrollView> : <Pressable accessibilityRole="button" accessibilityLabel={`Ask ${name} for a photo`} onPress={onAsk} style={({ pressed }) => [styles.empty, pressed && styles.cardPressed]}>{fallbackSource ? <Image source={fallbackSource} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" blurRadius={10} loading="lazy" priority="low" /> : null}<View style={styles.emptyShade} /><View style={styles.emptyContent}><View style={styles.camera}><Camera size={20} color={colors.rose} /></View><View style={{ flex: 1 }}><Text style={styles.emptyTitle}>Nothing new here yet</Text><Text style={styles.emptyCopy}>Ask {name} for a photo and it’ll appear here when it’s ready.</Text></View><ArrowRight size={19} color={colors.text} /></View></Pressable>}
  </View>;
}

function MediaCard({ item, onPress }: { item: CompanionMediaItem; onPress: () => void }) {
  const date = new Date(item.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
  return <Pressable accessibilityRole="button" accessibilityLabel={`${item.locked ? 'Locked media' : item.title}, ${item.subtitle}`} onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
    {item.thumbnailUrl || item.type !== 'video' ? <DetailPreservingArtwork source={{ uri: item.thumbnailUrl ?? item.url, cacheKey: item.cacheKey }} accessibilityLabel={item.title} blurRadius={item.locked ? 15 : 0} dim={.08} priority="low" loading="lazy" recyclingKey={item.id} /> : <View style={styles.videoFallback}><Play size={28} color="rgba(255,255,255,.72)" fill="rgba(255,255,255,.72)" /></View>}
    <View style={styles.cardShade} />
    {item.locked ? <View style={styles.lock}><LockKeyhole size={13} color="#FFF4F7" /><Text style={styles.lockText}>PRIVATE</Text></View> : item.type === 'video' ? <View style={styles.play}><Play size={15} color="#fff" fill="#fff" /></View> : null}
    <View style={styles.cardCopy}><Text style={styles.kicker}>{item.context ?? 'FROM HER'} · {date.toUpperCase()}</Text><Text numberOfLines={2} style={styles.title}>{item.title}</Text><Text numberOfLines={1} style={styles.subtitle}>{item.locked ? 'Something for you' : item.subtitle}</Text></View>
  </Pressable>;
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <View style={styles.sectionTitleRow}><Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>{action && onAction ? <Pressable accessibilityRole="button" accessibilityLabel={action} hitSlop={6} onPress={onAction} style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}><Text style={styles.action}>{action} →</Text></Pressable> : null}</View>;
}

const styles = StyleSheet.create({
  section: { gap: 13 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { color: colors.text, fontFamily: typography.display, fontSize: 30, fontWeight: '600', letterSpacing: -.5 },
  action: { color: '#E8A2BA', fontSize: 12, fontWeight: '800' },
  actionButton: { minWidth: 64, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center', paddingLeft: 10 },
  actionPressed: { opacity: .7 },
  rail: { gap: 13, paddingRight: 18 },
  card: { width: 248, height: 322, borderRadius: 23, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,.10)', shadowColor: '#000', shadowOpacity: .3, shadowRadius: 16, shadowOffset: { width: 0, height: 9 }, ...(Platform.OS === 'web' ? { transitionDuration: '180ms', transitionProperty: 'transform, border-color' } : {}) },
  cardPressed: { transform: [{ scale: .985 }], opacity: .94 },
  videoFallback: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#211421' },
  cardShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,5,11,.20)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(0deg, rgba(7,4,10,.92) 0%, transparent 64%)' } as never) : {}) },
  cardCopy: { padding: 17, gap: 4 },
  kicker: { color: '#FFB9CE', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 22, lineHeight: 25, fontWeight: '600' },
  subtitle: { color: 'rgba(255,248,244,.72)', fontSize: 11, fontWeight: '700' },
  lock: { position: 'absolute', top: 13, right: 13, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: 'rgba(9,6,11,.65)', borderWidth: 1, borderColor: 'rgba(255,255,255,.13)' },
  lockText: { color: '#FFF4F7', fontSize: 8, fontWeight: '900', letterSpacing: .9 },
  play: { position: 'absolute', top: 14, right: 14, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,5,10,.62)' },
  empty: { minHeight: 158, overflow: 'hidden', borderRadius: 23, borderWidth: 1, borderColor: 'rgba(255,255,255,.09)', backgroundColor: colors.surface, justifyContent: 'center' },
  emptyShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,6,12,.78)' },
  emptyContent: { padding: 20, flexDirection: 'row', alignItems: 'center', gap: 13 },
  camera: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(232,82,137,.12)', borderWidth: 1, borderColor: 'rgba(232,82,137,.18)' },
  emptyTitle: { color: colors.text, fontFamily: typography.display, fontSize: 20 },
  emptyCopy: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
});
