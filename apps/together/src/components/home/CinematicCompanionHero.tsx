import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image, type ImageContentPosition, type ImageSource } from 'expo-image';
import { ArrowRight, MapPin } from 'lucide-react-native';
import { SpiceBadge } from '../SpiceBadge';
import { colors, typography } from '../../theme';
import type { CharacterInstance, CharacterVersion } from '../../types';

export function CinematicCompanionHero({ companion, portraitVersion, source, location, world, onContinue, onProfile }: {
  companion: CharacterInstance;
  portraitVersion: CharacterVersion;
  source?: ImageSource | number;
  location?: string;
  world?: string;
  onContinue: () => void;
  onProfile: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const desktop = width >= 900;
  const compact = width < 520;
  const heroHeight = desktop ? 320 : Math.min(325, Math.max(300, height * .36));
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
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
  const placeLine = [location, world].filter(Boolean).join(' · ');

  return <View style={[styles.hero, { height: heroHeight }, desktop && styles.heroDesktop]}>
    {source
      ? <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale }] }]}><Image accessibilityLabel={`${firstName} portrait`} source={source} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={focal} cachePolicy="memory-disk" priority="high" transition={180} /></Animated.View>
      : <View style={[StyleSheet.absoluteFill, styles.fallback]}><Text style={styles.fallbackInitial}>{firstName[0]}</Text></View>}
    <View pointerEvents="none" style={styles.tint} />
    <View pointerEvents="none" style={[styles.scrim, Platform.OS === 'web' ? styles.webScrim : styles.nativeScrim]} />
    <View pointerEvents="none" style={[styles.vignette, Platform.OS === 'web' ? styles.webVignette : undefined]} />
    <SpiceBadge level={template.spice_level} overlay />
    <View style={[styles.content, compact && styles.contentCompact]}>
      <View style={[styles.bottom, desktop && styles.bottomDesktop]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`View ${firstName}'s profile`} onPress={onProfile}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.heading, compact && styles.headingCompact]}>{firstName}</Text>
        </Pressable>
        {placeLine ? <View style={styles.placeLine}><MapPin size={13} strokeWidth={2.1} color="#F6C5D7" /><Text numberOfLines={1} style={styles.placeText}>{placeLine}</Text></View> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={`Continue with ${firstName}`} onPress={onContinue} style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}>
          <Text style={styles.ctaText}>Continue with {firstName}</Text><ArrowRight size={19} color="#fff" />
        </Pressable>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  hero: { width: '100%', overflow: 'hidden', borderRadius: 29, backgroundColor: colors.elevated, borderWidth: 1, borderColor: 'rgba(255,255,255,.13)', shadowColor: '#B93467', shadowOpacity: .16, shadowRadius: 38, shadowOffset: { width: 0, height: 22 }, elevation: 10 },
  heroDesktop: { borderRadius: 34 },
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.plum },
  fallbackInitial: { color: 'rgba(255,255,255,.22)', fontFamily: typography.display, fontSize: 180 },
  tint: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(73,18,52,.07)' },
  scrim: { ...StyleSheet.absoluteFill },
  nativeScrim: { backgroundColor: 'rgba(7,5,10,.39)' },
  webScrim: { backgroundImage: 'linear-gradient(90deg, rgba(5,4,8,.92) 0%, rgba(8,6,11,.62) 42%, rgba(8,6,11,.08) 72%), linear-gradient(0deg, rgba(5,4,8,.90) 0%, transparent 62%)' } as never,
  vignette: { ...StyleSheet.absoluteFill, borderWidth: 1, borderColor: 'rgba(255,255,255,.04)' },
  webVignette: { backgroundImage: 'radial-gradient(circle at 66% 32%, transparent 15%, rgba(5,3,8,.48) 110%)' } as never,
  content: { flex: 1, justifyContent: 'flex-end', padding: 18 },
  contentCompact: { padding: 15 },
  bottom: { maxWidth: 690, gap: 12 },
  bottomDesktop: { paddingBottom: 4 },
  heading: { color: colors.text, fontFamily: typography.display, fontSize: 44, lineHeight: 47, fontWeight: '600', letterSpacing: -1.1, textShadowColor: 'rgba(0,0,0,.9)', textShadowRadius: 18 },
  headingCompact: { fontSize: 34, lineHeight: 37, letterSpacing: -.7 },
  placeLine: { maxWidth: '100%', alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 },
  placeText: { flexShrink: 1, color: '#F5E8ED', fontSize: 12, fontWeight: '700', textShadowColor: 'rgba(0,0,0,.9)', textShadowRadius: 9 },
  cta: { alignSelf: 'flex-start', minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 18, marginTop: 2, borderRadius: 16, backgroundColor: colors.rose, borderWidth: 1, borderColor: 'rgba(255,255,255,.2)', shadowColor: colors.rose, shadowOpacity: .35, shadowRadius: 20, shadowOffset: { width: 0, height: 9 } },
  ctaPressed: { opacity: .9, transform: [{ translateY: 1 }, { scale: .988 }] },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '900' },
});
