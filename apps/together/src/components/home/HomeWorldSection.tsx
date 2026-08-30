import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ImageSource } from 'expo-image';
import { ArrowRight, Heart, Sparkles } from 'lucide-react-native';
import { colors, typography } from '../../theme';
import { SectionTitle } from './FromCompanionSection';
import { DetailPreservingArtwork } from '../DetailPreservingArtwork';

export function HomeWorldSection({ wide, upcoming, relationship, hook, memory, upcomingSource, relationshipSource, onUpcoming, onRelationship }: {
  wide: boolean;
  upcoming: { eyebrow: string; title: string; meta: string };
  relationship: { eyebrow: string; title: string; meta: string };
  hook: string;
  memory?: { eyebrow: string; text: string };
  upcomingSource?: ImageSource | number;
  relationshipSource?: ImageSource | number;
  onUpcoming: () => void;
  onRelationship: () => void;
}) {
  return <View style={styles.section}>
    <SectionTitle title="Your world" />
    <Text style={styles.hook}>{hook}</Text>
    <View style={[styles.grid, !wide && styles.gridStack]}>
      <WorldImageCard source={upcomingSource} eyebrow={upcoming.eyebrow} title={upcoming.title} meta={upcoming.meta} icon={<Sparkles size={15} color={colors.warm} />} onPress={onUpcoming} />
      <WorldImageCard source={relationshipSource} eyebrow={relationship.eyebrow} title={relationship.title} meta={relationship.meta} icon={<Heart size={15} color="#FFB2CB" />} memory={memory} onPress={onRelationship} />
    </View>
  </View>;
}

function WorldImageCard({ source, eyebrow, title, meta, icon, memory, onPress }: { source?: ImageSource | number; eyebrow: string; title: string; meta: string; icon: React.ReactNode; memory?: { eyebrow: string; text: string }; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${eyebrow}, ${title}`} onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
    {source ? <DetailPreservingArtwork source={source} accessibilityLabel={title} contentPosition="center" dim={.13} priority="low" loading="lazy" /> : null}
    <View style={styles.shade} />
    <View style={styles.cardTop}><View style={styles.eyebrowRow}>{icon}<Text style={styles.eyebrow}>{eyebrow}</Text></View><ArrowRight size={18} color="rgba(255,255,255,.74)" /></View>
    <View style={styles.copy}><Text numberOfLines={3} style={styles.title}>{title}</Text><Text numberOfLines={2} style={styles.meta}>{meta}</Text>{memory ? <View style={styles.memory}><Text style={styles.memoryLabel}>{memory.eyebrow}</Text><Text numberOfLines={2} style={styles.memoryText}>{memory.text}</Text></View> : null}</View>
  </Pressable>;
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  hook: { maxWidth: 720, color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: -5 },
  grid: { flexDirection: 'row', gap: 14 },
  gridStack: { flexDirection: 'column' },
  card: { flex: 1, minWidth: 0, minHeight: 300, overflow: 'hidden', borderRadius: 25, padding: 18, justifyContent: 'space-between', backgroundColor: colors.elevated, borderWidth: 1, borderColor: 'rgba(255,255,255,.10)', shadowColor: '#000', shadowOpacity: .27, shadowRadius: 19, shadowOffset: { width: 0, height: 10 }, ...(Platform.OS === 'web' ? { transitionDuration: '180ms', transitionProperty: 'transform, border-color' } : {}) },
  pressed: { opacity: .94, transform: [{ scale: .99 }] },
  shade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,5,11,.38)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(0deg, rgba(7,4,10,.94) 0%, rgba(8,5,11,.20) 78%)' } as never) : {}) },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  eyebrow: { color: '#FFD2DF', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  copy: { gap: 6 },
  title: { maxWidth: 450, color: colors.text, fontFamily: typography.display, fontSize: 29, lineHeight: 32, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 11 },
  meta: { color: 'rgba(255,248,244,.76)', fontSize: 12, lineHeight: 17, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 8 },
  memory: { marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.13)' },
  memoryLabel: { color: '#FFB4CC', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  memoryText: { color: 'rgba(255,248,244,.80)', fontSize: 11, lineHeight: 16, marginTop: 3 },
});
