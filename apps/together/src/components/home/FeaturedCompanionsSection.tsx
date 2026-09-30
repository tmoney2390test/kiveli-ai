import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { CompanionPortraitCard } from '../CompanionPortraitCard';
import { colors, radius, typography } from '../../theme';
import type { FeaturedCompanion } from '../../lib/featuredCompanions';
import type { NewCompanionSuggestion } from '../../lib/homeCompanionRecommendations';
import type { World } from '../../types';

export function FeaturedCompanionsSection({ companions, world, favoriteIds, onOpen, onExplore, onToggleFavorite, initialCount, totalCount, revealing, onRevealMore }: {
  companions: NewCompanionSuggestion[];
  world: World;
  favoriteIds: string[];
  onOpen: (companion: FeaturedCompanion) => void;
  onExplore: () => void;
  onToggleFavorite: (companion: FeaturedCompanion, favorite: boolean) => Promise<void>;
  initialCount: number;
  totalCount: number;
  revealing: boolean;
  onRevealMore: () => void;
}) {
  const { width } = useWindowDimensions();
  const [sectionWidth, setSectionWidth] = useState(Math.min(width - 40, width >= 900 ? 1116 : 800));
  const [savingFavoriteId, setSavingFavoriteId] = useState<string | null>(null);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReducedMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  const columns = sectionWidth >= 980 ? 4 : sectionWidth >= 680 ? 3 : sectionWidth < 310 ? 1 : 2;
  const cardWidth = (sectionWidth - (columns - 1) * 12) / columns;
  const cardHeight = cardWidth < 200 ? 258 : cardWidth < 270 ? 310 : 350;
  const remainingCount = Math.max(0, totalCount - companions.length);

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

  return <View style={styles.section} onLayout={(event) => setSectionWidth(event.nativeEvent.layout.width)}>
    <View style={styles.headingCopy}>
      <Text accessibilityRole="header" style={styles.heading}>Meet someone <Text style={styles.headingAccent}>new</Text></Text>
      <Text style={styles.subtitle}>People you haven’t met yet, starting in {world.name}.</Text>
    </View>
    {companions.length ? <View style={styles.grid}>
      {companions.map(({ companion, world: companionWorld }, index) => <CompanionReveal key={companion.id} animate={index >= initialCount && !reducedMotion} delay={(index % columns) * 45}><CompanionPortraitCard companion={companion} width={cardWidth} height={cardHeight} compact dense={cardWidth < 200} badgeLabel={companionWorld.id === world.id ? undefined : companionWorld.name} favorite={favoriteIds.includes(companion.id)} favoriteBusy={savingFavoriteId === companion.id} loading="lazy" onFavorite={() => void toggleFavorite(companion)} onPress={() => onOpen(companion)} /></CompanionReveal>)}
      {revealing ? <CompanionRowPlaceholder count={Math.min(initialCount, remainingCount)} width={cardWidth} height={cardHeight} reducedMotion={reducedMotion} /> : null}
    </View> : <View style={styles.emptyFilter}><Text style={styles.emptyFilterTitle}>You’ve met everyone here</Text><Text style={styles.emptyFilterCopy}>Explore more companions and worlds as they become available.</Text></View>}
    {favoriteError ? <Text accessibilityRole="alert" style={styles.favoriteError}>{favoriteError}</Text> : null}
    {remainingCount > 0 ? <>
      <Pressable accessibilityRole="button" accessibilityLabel="Show more companions" accessibilityState={{ busy: revealing, disabled: revealing }} disabled={revealing} onPress={onRevealMore} style={styles.moreHint}>
        <Text accessibilityLiveRegion="polite" style={styles.moreHintText}>{revealing ? 'Revealing more companions…' : 'Scroll to meet more'}</Text>
        {!revealing ? <ChevronDown size={16} color={colors.muted} /> : null}
      </Pressable>
    </> : <CompanionReveal animate={!reducedMotion} delay={0}><Pressable accessibilityRole="button" accessibilityLabel="Explore companions" onPress={onExplore} style={({ pressed }) => [styles.viewAll, pressed && styles.viewAllPressed]}><Text style={styles.viewAllText}>Explore companions</Text><ChevronRight size={18} color="#F0BED1" /></Pressable></CompanionReveal>}
  </View>;
}

function CompanionReveal({ children, animate, delay }: { children: ReactNode; animate: boolean; delay: number }) {
  const reveal = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) { reveal.setValue(1); return; }
    const animation = Animated.timing(reveal, { toValue: 1, duration: 320, delay, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' });
    animation.start();
    return () => animation.stop();
  }, [animate, delay, reveal]);
  return <Animated.View style={{ opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>{children}</Animated.View>;
}

function CompanionRowPlaceholder({ count, width, height, reducedMotion }: { count: number; width: number; height: number; reducedMotion: boolean }) {
  const opacity = useRef(new Animated.Value(.55)).current;
  useEffect(() => {
    if (reducedMotion) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: .95, duration: 650, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(opacity, { toValue: .55, duration: 650, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [opacity, reducedMotion]);
  return <>{Array.from({ length: count }, (_, index) => <Animated.View key={index} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.placeholder, { width, height, opacity }]}><View style={styles.placeholderName} /><View style={styles.placeholderOccupation} /></Animated.View>)}</>;
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  headingCopy: { gap: 4 },
  heading: { color: colors.text, fontFamily: typography.display, fontSize: 30, lineHeight: 35, fontWeight: '600', letterSpacing: -.55 },
  headingAccent: { color: '#AEA3F2' },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  moreHint: { minHeight: 50, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  moreHintText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  placeholder: { borderRadius: 24, justifyContent: 'flex-end', padding: 16, gap: 10, backgroundColor: colors.elevated, borderWidth: 1, borderColor: 'rgba(202,153,227,.14)' },
  placeholderName: { width: '76%', height: 21, borderRadius: 6, backgroundColor: 'rgba(202,153,227,.13)' },
  placeholderOccupation: { width: '52%', height: 11, borderRadius: 4, backgroundColor: 'rgba(202,153,227,.09)' },
  favoriteError: { color: '#FFB2C7', fontSize: 10, fontWeight: '700' },
  emptyFilter: { minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24, borderRadius: 24, backgroundColor: 'rgba(255,255,255,.025)', borderWidth: 1, borderColor: 'rgba(255,255,255,.09)' },
  emptyFilterTitle: { color: colors.text, fontFamily: typography.display, fontSize: 22, fontWeight: '600' },
  emptyFilterCopy: { maxWidth: 360, color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  viewAll: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: radius.lg, backgroundColor: 'rgba(155,99,215,.08)', borderWidth: 1, borderColor: 'rgba(202,153,227,.24)' },
  viewAllPressed: { backgroundColor: 'rgba(155,99,215,.16)', transform: [{ scale: .995 }] },
  viewAllText: { color: '#F0BED1', fontSize: 12, fontWeight: '900' },
});
