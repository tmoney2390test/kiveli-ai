import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { ChevronLeft, ChevronRight, MapPin, Sparkles } from 'lucide-react-native';
import { resolveCharacterPortraitSource } from '../ui';
import { DetailPreservingArtwork } from '../DetailPreservingArtwork';
import { colors, radius, typography } from '../../theme';
import type { FeaturedCompanion } from '../../lib/featuredCompanions';
import type { World } from '../../types';

export function FeaturedCompanionsSection({ companions, world, onOpen, onViewWorld }: {
  companions: FeaturedCompanion[];
  world: World;
  onOpen: (companion: FeaturedCompanion) => void;
  onViewWorld: () => void;
}) {
  const { width } = useWindowDimensions();
  const rail = useRef<ScrollView | null>(null);
  const [index, setIndex] = useState(0);
  const cardWidth = width >= 1000 ? 344 : width >= 700 ? 300 : Math.min(306, width - 58);
  const step = cardWidth + 12;

  useEffect(() => { setIndex(0); rail.current?.scrollTo({ x: 0, animated: false }); }, [world.id]);
  if (!companions.length) return null;

  const cycle = (direction: -1 | 1) => {
    const next = (index + direction + companions.length) % companions.length;
    setIndex(next);
    rail.current?.scrollTo({ x: next * step, animated: true });
  };
  const syncIndex = (event: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.min(companions.length - 1, Math.max(0, Math.round(event.nativeEvent.contentOffset.x / step))));

  return <View style={styles.section}>
    <View style={styles.headingRow}>
      <View style={styles.headingCopy}>
        <Text accessibilityRole="header" style={styles.heading}>Featured <Text style={styles.headingAccent}>Companions</Text></Text>
        <Text style={styles.subtitle}>People you can meet in {world.name}</Text>
      </View>
      <View style={styles.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous featured companion" onPress={() => cycle(-1)} style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}><ChevronLeft size={19} color={colors.text} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Next featured companion" onPress={() => cycle(1)} style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}><ChevronRight size={19} color={colors.text} /></Pressable>
      </View>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`View ${world.name}`} onPress={onViewWorld} style={styles.worldPill}><MapPin size={12} color={colors.warm} /><Text style={styles.worldPillText}>{world.name}</Text><ChevronRight size={13} color={colors.muted} /></Pressable>
    <ScrollView ref={rail} horizontal decelerationRate="fast" snapToInterval={step} snapToAlignment="start" disableIntervalMomentum showsHorizontalScrollIndicator={false} onMomentumScrollEnd={syncIndex} contentContainerStyle={styles.rail}>
      {companions.map((companion) => <CompanionCard key={companion.id} companion={companion} width={cardWidth} onPress={() => onOpen(companion)} />)}
    </ScrollView>
    {companions.length > 1 ? <View style={styles.progress}><Text style={styles.progressText}>{index + 1} / {companions.length}</Text><View style={styles.dots}>{companions.map((item, position) => <View key={item.id} style={[styles.dot, position === index && styles.dotActive]} />)}</View></View> : null}
  </View>;
}

function CompanionCard({ companion, width, onPress }: { companion: FeaturedCompanion; width: number; onPress: () => void }) {
  const source = resolveCharacterPortraitSource(companion, companion.together_character_versions, companion.slug);
  const traits = Array.isArray(companion.discovery_metadata?.traits) ? companion.discovery_metadata.traits.map(String) : companion.together_character_versions.interests;
  const label = companion.discovery_metadata?.trending === true ? 'TRENDING' : companion.discovery_metadata?.new === true ? 'NEW' : 'FEATURED';
  return <Pressable accessibilityRole="button" accessibilityLabel={`Meet ${companion.name}, ${companion.age}, ${companion.occupation}`} onPress={onPress} style={({ pressed }) => [styles.card, { width }, pressed && styles.cardPressed]}>
    {source ? <DetailPreservingArtwork accessibilityLabel={`${companion.name}, ${companion.occupation}`} source={source} contentPosition="top" dim={.10} /> : <View style={[StyleSheet.absoluteFill, styles.fallback]}><Text style={styles.fallbackInitial}>{companion.name[0]}</Text></View>}
    <View style={styles.cardShade} />
    <View style={styles.badge}><Sparkles size={11} color="#FFE1A8" /><Text style={styles.badgeText}>{label}</Text></View>
    <View style={styles.cardCopy}>
      <Text numberOfLines={1} style={styles.name}>{companion.name} <Text style={styles.age}>{companion.age}</Text></Text>
      <Text numberOfLines={1} style={styles.occupation}>{companion.occupation}</Text>
      {traits.length ? <Text numberOfLines={1} style={styles.traits}>{traits.slice(0, 3).join(' · ')}</Text> : null}
      <View style={styles.meetLine}><Text style={styles.meetText}>View profile</Text><ChevronRight size={15} color="#fff" /></View>
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  headingCopy: { flex: 1, gap: 4 },
  heading: { color: colors.text, fontFamily: typography.display, fontSize: 32, lineHeight: 37, fontWeight: '600', letterSpacing: -.6 },
  headingAccent: { color: '#AEA3F2' },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  controls: { flexDirection: 'row', gap: 7 },
  arrow: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderBright },
  pressed: { opacity: .72, transform: [{ scale: .97 }] },
  worldPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: 'rgba(242,162,127,.07)', borderWidth: 1, borderColor: 'rgba(242,162,127,.18)' },
  worldPillText: { color: '#F1D2C2', fontSize: 10, fontWeight: '900' },
  rail: { gap: 12, paddingRight: 18 },
  card: { height: 390, overflow: 'hidden', justifyContent: 'flex-end', borderRadius: 24, backgroundColor: colors.elevated, borderWidth: 1, borderColor: 'rgba(255,255,255,.13)', shadowColor: '#000', shadowOpacity: .28, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 7 },
  cardPressed: { opacity: .93, transform: [{ scale: .99 }] },
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.plum },
  fallbackInitial: { color: 'rgba(255,255,255,.22)', fontFamily: typography.display, fontSize: 110 },
  cardShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(9,7,12,.15)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(0deg, rgba(5,4,8,.92) 0%, rgba(6,5,9,.05) 64%)' } as never) : {}) },
  badge: { position: 'absolute', top: 13, left: 13, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(112,53,139,.84)', borderWidth: 1, borderColor: 'rgba(255,255,255,.16)' },
  badgeText: { color: '#fff', fontSize: 8, fontWeight: '900', letterSpacing: .7 },
  cardCopy: { zIndex: 1, gap: 3, padding: 16 },
  name: { color: '#fff', fontFamily: typography.display, fontSize: 29, lineHeight: 32, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 10 },
  age: { color: 'rgba(255,255,255,.72)' },
  occupation: { color: '#F6D6DF', fontSize: 12, fontWeight: '800' },
  traits: { color: 'rgba(255,255,255,.70)', fontSize: 10, marginTop: 2 },
  meetLine: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 8 },
  meetText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  progress: { minHeight: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressText: { color: colors.dimmed, fontSize: 9, fontWeight: '800' },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.16)' },
  dotActive: { width: 18, backgroundColor: colors.violet },
});
