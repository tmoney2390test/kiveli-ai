import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image, type ImageContentPosition, type ImageSource } from 'expo-image';
import { ArrowRight, MapPin } from 'lucide-react-native';
import { colors, typography } from '../../theme';
import type { CharacterInstance, CharacterVersion } from '../../types';
import { KIVELLI_IMAGE_PLACEHOLDER } from '../../lib/imageWarmup';

export function CinematicCompanionHero({ companion, portraitVersion, source, location, world, actionLabel, notice, prompt, onContinue, onProfile, onVisualReady }: {
  companion: CharacterInstance;
  portraitVersion: CharacterVersion;
  source?: ImageSource | number;
  location?: string;
  world?: string;
  actionLabel: string;
  notice?: string | null;
  prompt?: string | null;
  onContinue: () => void;
  onProfile: () => void;
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
        Animated.timing(scale, { toValue: 1.015, duration: 9000, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 9000, useNativeDriver: true }),
      ]));
      scaleLoop.start();
    });
    return () => { alive = false; scaleLoop?.stop(); };
  }, [scale]);

  const template = companion.together_character_templates;
  const firstName = template.name.trim().split(/\s+/)[0] || template.name;
  const focal = (portraitVersion.appearance_config?.hero_focal_position ?? template.discovery_metadata?.hero_focal_position ?? 'top') as ImageContentPosition;
  // A portrait-oriented focal point is useful on narrow cards, but the wide desktop
  // hero otherwise crops the companion below the fold. Center the source at that
  // aspect ratio while retaining the authored focal point on phone/tablet layouts.
  const heroFocal = desktop ? 'center' : focal;
  const placeLine = [location, world].filter(Boolean).join(' · ');

  return <View style={[styles.hero, { height: heroHeight }, desktop && styles.heroDesktop]}>
    {source
      ? <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale }] }]}><Image accessibilityLabel={`${firstName} portrait`} source={source} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={heroFocal} cachePolicy="memory-disk" loading="eager" priority="high" placeholder={KIVELLI_IMAGE_PLACEHOLDER} placeholderContentFit="cover" transition={180} onLoad={onVisualReady}/></Animated.View>
      : <View style={[StyleSheet.absoluteFill, styles.fallback]}><Text style={styles.fallbackInitial}>{firstName[0]}</Text></View>}
    <View pointerEvents="none" style={styles.tint} />
    <View pointerEvents="none" style={[styles.scrim, Platform.OS === 'web' ? styles.webScrim : styles.nativeScrim]} />
    <View pointerEvents="none" style={[styles.vignette, Platform.OS === 'web' ? styles.webVignette : undefined]} />
    <View style={[styles.content, compact && styles.contentCompact]}>
      <View style={[styles.bottom, desktop && styles.bottomDesktop]}>
        {notice ? <View style={styles.notice}><Text numberOfLines={1} style={styles.noticeText}>{notice}</Text></View> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={`View ${firstName}'s profile`} onPress={onProfile}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.heading, compact && styles.headingCompact]}>{firstName}</Text>
        </Pressable>
        {placeLine ? <View style={styles.placeLine}><MapPin size={13} strokeWidth={2.1} color="#F6C5D7" /><Text numberOfLines={1} style={styles.placeText}>{placeLine}</Text></View> : null}
        {prompt ? <Text numberOfLines={2} style={styles.prompt}>{prompt}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onContinue} style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}>
          <Text numberOfLines={1} style={styles.ctaText}>{actionLabel}</Text><ArrowRight size={15} color="#F5DDE6" />
        </Pressable>
      </View>
    </View>
  </View>;
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
  prompt: { maxWidth: 520, color: 'rgba(255,248,244,.82)', fontSize: 12, lineHeight: 17, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 9 },
  cta: { alignSelf: 'flex-start', minHeight: 44, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 15, marginTop: 2, borderRadius: 13, backgroundColor: 'rgba(14,9,18,.78)', borderWidth: 1, borderColor: 'rgba(231,149,183,.38)' },
  ctaPressed: { opacity: .82, transform: [{ translateY: 1 }, { scale: .988 }] },
  ctaText: { flexShrink: 1, color: '#F8EAF0', fontSize: 12, fontWeight: '800' },
});
