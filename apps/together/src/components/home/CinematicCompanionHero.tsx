import { CatalogImage as Image } from '../CatalogImage';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { type ImageContentPosition, type ImageSource } from 'expo-image';
import { MapPin } from 'lucide-react-native';
import { colors, typography } from '../../theme';
import type { CharacterInstance, CharacterVersion } from '../../types';
import { KIVELLI_IMAGE_PLACEHOLDER } from '../../lib/imageWarmup';
import { SpiceBadge } from '../SpiceBadge';

export function CinematicCompanionHero({ companion, portraitVersion, source, location, world, actionLabel, notice, onContinue, onVisualReady }: {
  companion: CharacterInstance;
  portraitVersion: CharacterVersion;
  source?: ImageSource | number;
  location?: string;
  world?: string;
  actionLabel: string;
  notice?: string | null;
  onContinue: () => void;
  onVisualReady?:()=>void;
}) {
  const { width, height } = useWindowDimensions();
  const desktop = width >= 900;
  const compact = width < 520;
  const heroHeight = desktop ? 320 : Math.min(325, Math.max(300, height * .36));
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let alive = true;
    let scaleLoop: Animated.CompositeAnimation | undefined;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!alive || reduced) return;
      scaleLoop = Animated.loop(Animated.sequence([
        Animated.timing(scale, { toValue: 1.015, duration: 9000, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(scale, { toValue: 1, duration: 9000, useNativeDriver: Platform.OS !== 'web' }),
      ]));
      scaleLoop.start();
    });
    return () => { alive = false; scaleLoop?.stop(); };
  }, [scale]);

  const template = companion.together_character_templates;
  const firstName = template.name.trim().split(/\s+/)[0] || template.name;
  const focal = (portraitVersion.appearance_config?.hero_focal_position ?? template.discovery_metadata?.hero_focal_position ?? 'top') as ImageContentPosition;
  // A portrait-oriented focal point is useful on narrow cards, but the wide desktop
  // hero otherwise crops the companion below the fold. Bias the wide crop toward
  // the face while retaining the authored focal point on phone/tablet layouts.
  const heroFocal: ImageContentPosition = desktop ? { top: '22%', left: '50%' } : focal;
  const placeLine = [location, world].filter(Boolean).join(' · ');

  return <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onContinue} style={({ pressed }) => [styles.hero, { height: heroHeight }, desktop && styles.heroDesktop, pressed && styles.pressed]}>
    {source
      ? <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale }] }]}><Image accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" alt="" source={source} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={heroFocal} cachePolicy="memory-disk" loading="eager" priority="high" placeholder={KIVELLI_IMAGE_PLACEHOLDER} placeholderContentFit="cover" transition={180} onLoad={onVisualReady}/></Animated.View>
      : <View style={[StyleSheet.absoluteFill, styles.fallback]}><Text style={styles.fallbackInitial}>{firstName[0]}</Text></View>}
    <View pointerEvents="none" style={styles.tint} />
    <View pointerEvents="none" style={[styles.scrim, Platform.OS === 'web' ? styles.webScrim : styles.nativeScrim]} />
    <View pointerEvents="none" style={[styles.vignette, Platform.OS === 'web' ? styles.webVignette : undefined]} />
    <SpiceBadge level={template.spice_level} overlay />
    <View pointerEvents="none" style={[styles.content, compact && styles.contentCompact]}>
      <View style={[styles.bottom, desktop && styles.bottomDesktop]}>
        {notice ? <View style={styles.notice}><Text numberOfLines={1} style={styles.noticeText}>{notice}</Text></View> : null}
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.heading, compact && styles.headingCompact]}>{firstName}</Text>
        {placeLine ? <View style={styles.placeLine}><MapPin size={13} strokeWidth={2.1} color="#F6C5D7" /><Text numberOfLines={1} style={styles.placeText}>{placeLine}</Text></View> : null}
      </View>
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  hero: { width: '100%', overflow: 'hidden', borderRadius: 29, backgroundColor: colors.elevated, borderWidth: 1, borderColor: 'rgba(255,255,255,.13)', shadowColor: '#A52EB6', shadowOpacity: .16, shadowRadius: 38, shadowOffset: { width: 0, height: 22 }, elevation: 10 },
  heroDesktop: { borderRadius: 34 },
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.plum },
  fallbackInitial: { color: 'rgba(255,255,255,.22)', fontFamily: typography.display, fontSize: 180 },
  tint: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(73,18,52,.025)' },
  scrim: { ...StyleSheet.absoluteFill },
  nativeScrim: { backgroundColor: 'rgba(7,5,10,.23)' },
  webScrim: { backgroundImage: 'linear-gradient(90deg, rgba(5,4,8,.45) 0%, rgba(8,6,11,.16) 42%, transparent 72%), linear-gradient(0deg, rgba(5,4,8,.56) 0%, rgba(8,6,11,.10) 44%, transparent 70%)' } as never,
  vignette: { ...StyleSheet.absoluteFill, borderWidth: 1, borderColor: 'rgba(255,255,255,.04)' },
  webVignette: { backgroundImage: 'radial-gradient(circle at 66% 32%, transparent 28%, rgba(5,3,8,.12) 115%)' } as never,
  content: { flex: 1, justifyContent: 'flex-end', padding: 18 },
  contentCompact: { padding: 15 },
  bottom: { maxWidth: 690, gap: 9 },
  bottomDesktop: { paddingBottom: 4 },
  notice: { alignSelf: 'flex-start', maxWidth: '100%', minHeight: 28, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 999, backgroundColor: 'rgba(107,35,88,.72)', borderWidth: 1, borderColor: 'rgba(255,181,213,.28)' },
  noticeText: { color: '#FFD4E3', fontSize: 9, fontWeight: '900', letterSpacing: .85, textTransform: 'uppercase' },
  heading: { color: colors.text, fontFamily: typography.display, fontSize: 44, lineHeight: 47, fontWeight: '600', letterSpacing: -1.1, textShadowColor: 'rgba(0,0,0,.9)', textShadowRadius: 18 },
  headingCompact: { fontSize: 34, lineHeight: 37, letterSpacing: -.7 },
  placeLine: { maxWidth: '100%', alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 },
  placeText: { flexShrink: 1, color: '#F5E8ED', fontSize: 12, fontWeight: '700', textShadowColor: 'rgba(0,0,0,.9)', textShadowRadius: 9 },
  pressed: { opacity: .9 },
});
