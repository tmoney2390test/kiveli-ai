import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { CompanionGenderToggle, useCompanionGenderPreference } from '../CompanionGenderToggle';
import { CompanionWorldToggle } from '../CompanionWorldToggle';
import { CompanionPortraitCard } from '../CompanionPortraitCard';
import { colors, radius, typography } from '../../theme';
import { FEATURED_COMPANION_LIMIT, featuredCompanionRail, featuredCompanionsMatchingGender, type FeaturedCompanion } from '../../lib/featuredCompanions';
import type { World } from '../../types';

export function FeaturedCompanionsSection({ companions, world, worlds, favoriteIds, onOpen, onViewAll, onSelectWorld, onToggleFavorite }: {
  companions: FeaturedCompanion[];
  world: World;
  worlds: World[];
  favoriteIds: string[];
  onOpen: (companion: FeaturedCompanion) => void;
  onViewAll: () => void;
  onSelectWorld: (worldId: string) => void;
  onToggleFavorite: (companion: FeaturedCompanion, favorite: boolean) => Promise<void>;
}) {
  const { width } = useWindowDimensions();
  const rail = useRef<ScrollView | null>(null);
  const [index, setIndex] = useState(0);
  const [gender, chooseGender] = useCompanionGenderPreference();
  const [savingFavoriteId, setSavingFavoriteId] = useState<string | null>(null);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const matching = featuredCompanionsMatchingGender(companions, gender);
  const visibleIndex = matching.length ? Math.min(index, matching.length - 1) : 0;
  const page = matching.length ? Math.floor(visibleIndex / FEATURED_COMPANION_LIMIT) : 0;
  const featured = featuredCompanionRail(companions, gender, page);
  const localIndex = visibleIndex - page * FEATURED_COMPANION_LIMIT;
  const cardWidth = width >= 1000 ? 344 : width >= 700 ? 300 : Math.min(306, width - 58);
  const step = cardWidth + 12;

  useEffect(() => { setIndex(0); rail.current?.scrollTo({ x: 0, animated: false }); }, [gender, world.id]);
  useEffect(() => { rail.current?.scrollTo({ x: localIndex * step, animated: true }); }, [localIndex, step]);
  if (!companions.length) return null;

  const cycle = (direction: -1 | 1) => {
    const next = (visibleIndex + direction + matching.length) % matching.length;
    setIndex(next);
  };
  const syncIndex = (event: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(page * FEATURED_COMPANION_LIMIT + Math.min(featured.length - 1, Math.max(0, Math.round(event.nativeEvent.contentOffset.x / step))));
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
        <Text style={styles.subtitle}>People to discover in {world.name}</Text>
      </View>
    </View>
    <View style={styles.filters}>
      <CompanionGenderToggle value={gender} onChange={chooseGender} />
      <CompanionWorldToggle worlds={worlds} value={world.id} onChange={onSelectWorld} />
    </View>
    {featured.length ? <View style={styles.railFrame}>
      <ScrollView ref={rail} horizontal decelerationRate="fast" snapToInterval={step} snapToAlignment="start" disableIntervalMomentum showsHorizontalScrollIndicator={false} onMomentumScrollEnd={syncIndex} contentContainerStyle={styles.rail}>
        {featured.map((companion) => <CompanionPortraitCard key={companion.id} companion={companion} width={cardWidth} favorite={favoriteIds.includes(companion.id)} favoriteBusy={savingFavoriteId === companion.id} onFavorite={() => void toggleFavorite(companion)} onPress={() => onOpen(companion)} />)}
      </ScrollView>
      {matching.length > 1 ? <>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous featured companion" accessibilityHint="Shows the previous portrait" hitSlop={{ top: 2, bottom: 2, left: 4, right: 4 }} onPress={() => cycle(-1)} style={({ pressed }) => [styles.imageArrow, styles.imageArrowLeft, width < 700 && styles.imageArrowCompact, pressed && styles.imageArrowPressed]}>
          <ChevronLeft size={42} strokeWidth={3} color="rgba(255,255,255,.96)" />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Next featured companion" accessibilityHint="Shows the next portrait" hitSlop={{ top: 2, bottom: 2, left: 4, right: 4 }} onPress={() => cycle(1)} style={({ pressed }) => [styles.imageArrow, styles.imageArrowRight, width < 700 && styles.imageArrowCompact, pressed && styles.imageArrowPressed]}>
          <ChevronRight size={42} strokeWidth={3} color="rgba(255,255,255,.96)" />
        </Pressable>
      </> : null}
    </View> : <View style={styles.emptyFilter}><Text style={styles.emptyFilterTitle}>No {gender} companions here yet</Text><Text style={styles.emptyFilterCopy}>Try Any to see everyone currently featured in {world.name}.</Text><Pressable accessibilityRole="button" onPress={() => chooseGender('any')} style={styles.emptyFilterButton}><Text style={styles.emptyFilterButtonText}>Show everyone</Text></Pressable></View>}
    {favoriteError ? <Text accessibilityRole="alert" style={styles.favoriteError}>{favoriteError}</Text> : null}
    {matching.length > 1 ? <View style={styles.progress}><Text style={styles.progressText}>{visibleIndex + 1} / {matching.length}</Text><View style={styles.dots}>{featured.map((item, position) => <View key={item.id} style={[styles.dot, position === localIndex && styles.dotActive]} />)}</View></View> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={`View all characters in ${world.name}`} onPress={onViewAll} style={({ pressed }) => [styles.viewAll, pressed && styles.viewAllPressed]}><Text style={styles.viewAllText}>View all characters</Text><ChevronRight size={18} color="#F0BED1" /></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  headingCopy: { flex: 1, gap: 4 },
  heading: { color: colors.text, fontFamily: typography.display, fontSize: 32, lineHeight: 37, fontWeight: '600', letterSpacing: -.6 },
  headingAccent: { color: '#AEA3F2' },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  filters: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', zIndex: 30 },
  railFrame: { position: 'relative', minHeight: 390 },
  rail: { gap: 12, paddingHorizontal: 3, paddingRight: 18 },
  imageArrow: { position: 'absolute', zIndex: 8, top: 0, bottom: 0, width: 58, alignItems: 'center', justifyContent: 'center' },
  imageArrowCompact: { width: 46 },
  imageArrowLeft: { left: 3 },
  imageArrowRight: { right: 0 },
  imageArrowPressed: { opacity: .58, transform: [{ scale: .94 }] },
  favoriteError: { color: '#FFB2C7', fontSize: 10, fontWeight: '700' },
  emptyFilter: { minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24, borderRadius: 24, backgroundColor: 'rgba(255,255,255,.025)', borderWidth: 1, borderColor: 'rgba(255,255,255,.09)' },
  emptyFilterTitle: { color: colors.text, fontFamily: typography.display, fontSize: 22, fontWeight: '600' },
  emptyFilterCopy: { maxWidth: 360, color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  emptyFilterButton: { minHeight: 38, justifyContent: 'center', marginTop: 5, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: 'rgba(155,99,215,.15)', borderWidth: 1, borderColor: 'rgba(202,153,227,.28)' },
  emptyFilterButtonText: { color: '#F0BED1', fontSize: 10, fontWeight: '900' },
  progress: { minHeight: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressText: { color: colors.dimmed, fontSize: 9, fontWeight: '800' },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.16)' },
  dotActive: { width: 18, backgroundColor: colors.violet },
  viewAll: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: radius.lg, backgroundColor: 'rgba(155,99,215,.08)', borderWidth: 1, borderColor: 'rgba(202,153,227,.24)' },
  viewAllPressed: { backgroundColor: 'rgba(155,99,215,.16)', transform: [{ scale: .995 }] },
  viewAllText: { color: '#F0BED1', fontSize: 12, fontWeight: '900' },
});
