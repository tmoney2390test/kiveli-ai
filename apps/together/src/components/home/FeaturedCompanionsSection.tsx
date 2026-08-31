import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useCompanionGenderPreference } from '../CompanionGenderToggle';
import { CompanionPortraitCard } from '../CompanionPortraitCard';
import { colors, radius, typography } from '../../theme';
import { featuredCompanionRail, type FeaturedCompanion } from '../../lib/featuredCompanions';
import type { World } from '../../types';

const HOME_FEATURED_LIMIT = 6;

export function FeaturedCompanionsSection({ companions, world, favoriteIds, onOpen, onViewAll, onToggleFavorite }: {
  companions: FeaturedCompanion[];
  world: World;
  favoriteIds: string[];
  onOpen: (companion: FeaturedCompanion) => void;
  onViewAll: () => void;
  onToggleFavorite: (companion: FeaturedCompanion, favorite: boolean) => Promise<void>;
}) {
  const { width } = useWindowDimensions();
  const rail = useRef<ScrollView | null>(null);
  const [index, setIndex] = useState(0);
  const [gender, chooseGender] = useCompanionGenderPreference();
  const [savingFavoriteId, setSavingFavoriteId] = useState<string | null>(null);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const featured = featuredCompanionRail(companions, gender, 0).slice(0, HOME_FEATURED_LIMIT);
  const visibleIndex = featured.length ? Math.min(index, featured.length - 1) : 0;
  const cardWidth = width >= 1000 ? 300 : width >= 700 ? 286 : Math.min(306, width - 58);
  const cardHeight = width >= 700 ? 342 : 330;
  const step = cardWidth + 12;

  useEffect(() => { setIndex(0); rail.current?.scrollTo({ x: 0, animated: false }); }, [gender, world.id]);
  useEffect(() => { rail.current?.scrollTo({ x: visibleIndex * step, animated: true }); }, [step, visibleIndex]);

  const cycle = (direction: -1 | 1) => {
    if (!featured.length) return;
    setIndex((visibleIndex + direction + featured.length) % featured.length);
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
    <View style={styles.headingCopy}>
      <Text accessibilityRole="header" style={styles.heading}>Meet someone <Text style={styles.headingAccent}>new</Text></Text>
      <Text style={styles.subtitle}>A few people worth discovering in {world.name}</Text>
    </View>
    {featured.length ? <>
      <ScrollView ref={rail} horizontal decelerationRate="fast" snapToInterval={step} snapToAlignment="start" disableIntervalMomentum showsHorizontalScrollIndicator={false} onMomentumScrollEnd={syncIndex} contentContainerStyle={styles.rail}>
        {featured.map((companion) => <CompanionPortraitCard key={companion.id} companion={companion} width={cardWidth} height={cardHeight} compact favorite={favoriteIds.includes(companion.id)} favoriteBusy={savingFavoriteId === companion.id} loading="lazy" onFavorite={() => void toggleFavorite(companion)} onPress={() => onOpen(companion)} />)}
      </ScrollView>
      {featured.length > 1 ? <View style={styles.progress}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous featured companion" accessibilityHint="Shows the previous portrait" onPress={() => cycle(-1)} style={({ pressed }) => [styles.control, pressed && styles.controlPressed]}><ChevronLeft size={23} strokeWidth={2.3} color="#F5DFE8" /></Pressable>
        <View style={styles.progressCenter}><Text style={styles.progressText}>{visibleIndex + 1} / {featured.length}</Text><View style={styles.dots}>{featured.map((item, position) => <View key={item.id} style={[styles.dot, position === visibleIndex && styles.dotActive]} />)}</View></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Next featured companion" accessibilityHint="Shows the next portrait" onPress={() => cycle(1)} style={({ pressed }) => [styles.control, pressed && styles.controlPressed]}><ChevronRight size={23} strokeWidth={2.3} color="#F5DFE8" /></Pressable>
      </View> : null}
    </> : <View style={styles.emptyFilter}><Text style={styles.emptyFilterTitle}>No {gender} companions here yet</Text><Text style={styles.emptyFilterCopy}>Show everyone or open Explore to adjust who you would like to meet.</Text><Pressable accessibilityRole="button" onPress={() => chooseGender('any')} style={styles.emptyFilterButton}><Text style={styles.emptyFilterButtonText}>Show everyone</Text></Pressable></View>}
    {favoriteError ? <Text accessibilityRole="alert" style={styles.favoriteError}>{favoriteError}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={`View all characters in ${world.name}`} onPress={onViewAll} style={({ pressed }) => [styles.viewAll, pressed && styles.viewAllPressed]}><Text style={styles.viewAllText}>Explore everyone in {world.name}</Text><ChevronRight size={18} color="#F0BED1" /></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  headingCopy: { gap: 4 },
  heading: { color: colors.text, fontFamily: typography.display, fontSize: 30, lineHeight: 35, fontWeight: '600', letterSpacing: -.55 },
  headingAccent: { color: '#AEA3F2' },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  rail: { gap: 12, paddingHorizontal: 3, paddingRight: 18 },
  favoriteError: { color: '#FFB2C7', fontSize: 10, fontWeight: '700' },
  emptyFilter: { minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24, borderRadius: 24, backgroundColor: 'rgba(255,255,255,.025)', borderWidth: 1, borderColor: 'rgba(255,255,255,.09)' },
  emptyFilterTitle: { color: colors.text, fontFamily: typography.display, fontSize: 22, fontWeight: '600' },
  emptyFilterCopy: { maxWidth: 360, color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  emptyFilterButton: { minHeight: 44, justifyContent: 'center', marginTop: 5, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: 'rgba(155,99,215,.15)', borderWidth: 1, borderColor: 'rgba(202,153,227,.28)' },
  emptyFilterButtonText: { color: '#F0BED1', fontSize: 10, fontWeight: '900' },
  progress: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  progressCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  progressText: { color: colors.dimmed, fontSize: 9, fontWeight: '800' },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.16)' },
  dotActive: { width: 18, backgroundColor: colors.violet },
  control: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.045)', borderWidth: 1, borderColor: 'rgba(255,255,255,.10)' },
  controlPressed: { opacity: .62, transform: [{ scale: .94 }] },
  viewAll: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: radius.lg, backgroundColor: 'rgba(155,99,215,.08)', borderWidth: 1, borderColor: 'rgba(202,153,227,.24)' },
  viewAllPressed: { backgroundColor: 'rgba(155,99,215,.16)', transform: [{ scale: .995 }] },
  viewAllText: { color: '#F0BED1', fontSize: 12, fontWeight: '900' },
});
