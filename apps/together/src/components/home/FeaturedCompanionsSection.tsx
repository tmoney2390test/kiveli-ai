import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { ChevronLeft, ChevronRight, MapPin, Sparkles, Star } from 'lucide-react-native';
import { resolveCharacterPortraitSource } from '../ui';
import { DetailPreservingArtwork } from '../DetailPreservingArtwork';
import { SpiceBadge } from '../SpiceBadge';
import { colors, radius, typography } from '../../theme';
import { featuredCompanionRail, type FeaturedCompanion } from '../../lib/featuredCompanions';
import type { World } from '../../types';

export function FeaturedCompanionsSection({ companions, world, favoriteIds, onOpen, onViewWorld, onViewAll, onToggleFavorite }: {
  companions: FeaturedCompanion[];
  world: World;
  favoriteIds: string[];
  onOpen: (companion: FeaturedCompanion) => void;
  onViewWorld: () => void;
  onViewAll: () => void;
  onToggleFavorite: (companion: FeaturedCompanion, favorite: boolean) => Promise<void>;
}) {
  const { width } = useWindowDimensions();
  const rail = useRef<ScrollView | null>(null);
  const [index, setIndex] = useState(0);
  const [savingFavoriteId, setSavingFavoriteId] = useState<string | null>(null);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const featured = featuredCompanionRail(companions);
  const cardWidth = width >= 1000 ? 344 : width >= 700 ? 300 : Math.min(306, width - 58);
  const step = cardWidth + 12;

  useEffect(() => { setIndex(0); rail.current?.scrollTo({ x: 0, animated: false }); }, [world.id]);
  if (!featured.length) return null;

  const cycle = (direction: -1 | 1) => {
    const next = (index + direction + featured.length) % featured.length;
    setIndex(next);
    rail.current?.scrollTo({ x: next * step, animated: true });
  };
  const syncIndex = (event: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.min(featured.length - 1, Math.max(0, Math.round(event.nativeEvent.contentOffset.x / step))));
  const toggleFavorite = async (companion: FeaturedCompanion) => {
    if (savingFavoriteId) return;
    setSavingFavoriteId(companion.id);
    setFavoriteError(null);
    try {
      await onToggleFavorite(companion, !favoriteIds.includes(companion.id));
    } catch {
      setFavoriteError('That favorite could not be saved. Try again.');
    } finally {
      setSavingFavoriteId(null);
    }
  };

  return <View style={styles.section}>
    <View style={styles.headingRow}>
      <View style={styles.headingCopy}>
        <Text accessibilityRole="header" style={styles.heading}>Featured <Text style={styles.headingAccent}>Companions</Text></Text>
        <Text style={styles.subtitle}>Ten people to discover in {world.name}</Text>
      </View>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`View ${world.name}`} onPress={onViewWorld} style={styles.worldPill}><MapPin size={12} color={colors.warm} /><Text style={styles.worldPillText}>{world.name}</Text><ChevronRight size={13} color={colors.muted} /></Pressable>
    <View style={styles.railFrame}>
      <ScrollView ref={rail} horizontal decelerationRate="fast" snapToInterval={step} snapToAlignment="start" disableIntervalMomentum showsHorizontalScrollIndicator={false} onMomentumScrollEnd={syncIndex} contentContainerStyle={styles.rail}>
        {featured.map((companion) => <CompanionCard key={companion.id} companion={companion} width={cardWidth} favorite={favoriteIds.includes(companion.id)} favoriteBusy={savingFavoriteId === companion.id} onFavorite={() => void toggleFavorite(companion)} onPress={() => onOpen(companion)} />)}
      </ScrollView>
      {featured.length > 1 ? <>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous featured companion" onPress={() => cycle(-1)} style={({ pressed }) => [styles.imageArrow, styles.imageArrowLeft, pressed && styles.imageArrowPressed]}><ChevronLeft size={31} strokeWidth={2.4} color="#fff" /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Next featured companion" onPress={() => cycle(1)} style={({ pressed }) => [styles.imageArrow, styles.imageArrowRight, pressed && styles.imageArrowPressed]}><ChevronRight size={31} strokeWidth={2.4} color="#fff" /></Pressable>
      </> : null}
    </View>
    {favoriteError ? <Text accessibilityRole="alert" style={styles.favoriteError}>{favoriteError}</Text> : null}
    {featured.length > 1 ? <View style={styles.progress}><Text style={styles.progressText}>{index + 1} / {featured.length}</Text><View style={styles.dots}>{featured.map((item, position) => <View key={item.id} style={[styles.dot, position === index && styles.dotActive]} />)}</View></View> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={`View all characters in ${world.name}`} onPress={onViewAll} style={({ pressed }) => [styles.viewAll, pressed && styles.viewAllPressed]}><Text style={styles.viewAllText}>View all characters</Text><ChevronRight size={18} color="#F0BED1" /></Pressable>
  </View>;
}

function CompanionCard({ companion, width, favorite, favoriteBusy, onFavorite, onPress }: { companion: FeaturedCompanion; width: number; favorite: boolean; favoriteBusy: boolean; onFavorite: () => void; onPress: () => void }) {
  const source = resolveCharacterPortraitSource(companion, companion.together_character_versions, companion.slug);
  const label = companion.discovery_metadata?.trending === true ? 'TRENDING' : companion.discovery_metadata?.new === true ? 'NEW' : 'FEATURED';
  return <Pressable accessibilityRole="button" accessibilityLabel={`Meet ${companion.name}, ${companion.age}, ${companion.occupation}`} onPress={onPress} style={({ pressed }) => [styles.card, { width }, pressed && styles.cardPressed]}>
    {source ? <DetailPreservingArtwork accessibilityLabel={`${companion.name}, ${companion.occupation}`} source={source} contentPosition="top" dim={.10} /> : <View style={[StyleSheet.absoluteFill, styles.fallback]}><Text style={styles.fallbackInitial}>{companion.name[0]}</Text></View>}
    <View style={styles.cardShade} />
    <View style={styles.badge}><Sparkles size={11} color="#FFE1A8" /><Text style={styles.badgeText}>{label}</Text></View>
    <SpiceBadge level={companion.spice_level} overlay />
    <View style={styles.cardCopy}>
      <View style={styles.nameRow}>
        <Text numberOfLines={1} style={styles.name}>{companion.name} <Text style={styles.age}>{companion.age}</Text></Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${favorite ? 'Remove' : 'Add'} ${companion.name} ${favorite ? 'from' : 'to'} favorites`} accessibilityState={{ selected: favorite, disabled: favoriteBusy }} disabled={favoriteBusy} hitSlop={8} onPress={(event) => { event.stopPropagation(); onFavorite(); }} style={({ pressed }) => [styles.favoriteButton, favorite && styles.favoriteButtonActive, (pressed || favoriteBusy) && styles.favoriteButtonPressed]}>
          <Star size={19} strokeWidth={2.1} color={favorite ? '#FFD27A' : '#fff'} fill={favorite ? '#FFD27A' : 'transparent'} />
        </Pressable>
      </View>
      <Text numberOfLines={1} style={styles.occupation}>{companion.occupation}</Text>
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
  worldPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: 'rgba(242,162,127,.07)', borderWidth: 1, borderColor: 'rgba(242,162,127,.18)' },
  worldPillText: { color: '#F1D2C2', fontSize: 10, fontWeight: '900' },
  railFrame: { position: 'relative', minHeight: 390 },
  rail: { gap: 12, paddingHorizontal: 3, paddingRight: 18 },
  imageArrow: { position: 'absolute', zIndex: 8, top: 154, width: 52, height: 82, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(12,9,17,.78)', borderWidth: 1, borderColor: 'rgba(255,255,255,.32)', shadowColor: '#000', shadowOpacity: .48, shadowRadius: 15, shadowOffset: { width: 0, height: 7 }, elevation: 12 },
  imageArrowLeft: { left: 10, borderTopRightRadius: 26, borderBottomRightRadius: 26, borderTopLeftRadius: 13, borderBottomLeftRadius: 13 },
  imageArrowRight: { right: 10, borderTopLeftRadius: 26, borderBottomLeftRadius: 26, borderTopRightRadius: 13, borderBottomRightRadius: 13 },
  imageArrowPressed: { backgroundColor: 'rgba(124,61,154,.88)', transform: [{ scale: .96 }] },
  card: { height: 390, overflow: 'hidden', justifyContent: 'flex-end', borderRadius: 24, backgroundColor: colors.elevated, borderWidth: 1, borderColor: 'rgba(255,255,255,.13)', shadowColor: '#000', shadowOpacity: .28, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 7 },
  cardPressed: { opacity: .93, transform: [{ scale: .99 }] },
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.plum },
  fallbackInitial: { color: 'rgba(255,255,255,.22)', fontFamily: typography.display, fontSize: 110 },
  cardShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(9,7,12,.15)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(0deg, rgba(5,4,8,.92) 0%, rgba(6,5,9,.05) 64%)' } as never) : {}) },
  badge: { position: 'absolute', top: 13, left: 13, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(112,53,139,.84)', borderWidth: 1, borderColor: 'rgba(255,255,255,.16)' },
  badgeText: { color: '#fff', fontSize: 8, fontWeight: '900', letterSpacing: .7 },
  cardCopy: { zIndex: 1, gap: 3, padding: 16 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { flex: 1, color: '#fff', fontFamily: typography.display, fontSize: 29, lineHeight: 34, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 10 },
  age: { color: 'rgba(255,255,255,.72)' },
  favoriteButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,8,14,.64)', borderWidth: 1, borderColor: 'rgba(255,255,255,.28)' },
  favoriteButtonActive: { backgroundColor: 'rgba(103,62,22,.74)', borderColor: 'rgba(255,210,122,.68)' },
  favoriteButtonPressed: { opacity: .68, transform: [{ scale: .93 }] },
  occupation: { color: '#F6D6DF', fontSize: 12, fontWeight: '800' },
  meetLine: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 8 },
  meetText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  favoriteError: { color: '#FFB2C7', fontSize: 10, fontWeight: '700' },
  progress: { minHeight: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressText: { color: colors.dimmed, fontSize: 9, fontWeight: '800' },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.16)' },
  dotActive: { width: 18, backgroundColor: colors.violet },
  viewAll: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: radius.lg, backgroundColor: 'rgba(155,99,215,.08)', borderWidth: 1, borderColor: 'rgba(202,153,227,.24)' },
  viewAllPressed: { backgroundColor: 'rgba(155,99,215,.16)', transform: [{ scale: .995 }] },
  viewAllText: { color: '#F0BED1', fontSize: 12, fontWeight: '900' },
});
