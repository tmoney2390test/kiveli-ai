import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { ArrowRight, MapPin, Sparkles } from 'lucide-react-native';
import { CompanionSwitcher } from '../CompanionSwitcher';
import { colors, radius, typography } from '../../theme';
import type { CharacterInstance, CharacterVersion } from '../../types';

export function CinematicCompanionHero({ companion, portraitVersion, source, relationshipDay, stage, eyebrow, heading, activity, location, quote, notice, onContinue, onProfile, onLocation }: {
  companion: CharacterInstance;
  portraitVersion: CharacterVersion;
  source?: ImageSource | number;
  relationshipDay: number;
  stage: string;
  eyebrow: string;
  heading: string;
  activity: string;
  location: string;
  quote: string;
  notice?: string | null;
  onContinue: () => void;
  onProfile: () => void;
  onLocation: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const desktop = width >= 900;
  const compact = width < 520;
  const heroHeight = desktop ? 590 : Math.min(610, Math.max(500, height * .69));
  const scale = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(.5)).current;
  useEffect(() => {
    let alive = true;
    let scaleLoop: Animated.CompositeAnimation | undefined;
    let pulseLoop: Animated.CompositeAnimation | undefined;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!alive || reduced) return;
      scaleLoop = Animated.loop(Animated.sequence([
        Animated.timing(scale, { toValue: 1.015, duration: 9000, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 9000, useNativeDriver: true }),
      ]));
      pulseLoop = Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: .5, duration: 1800, useNativeDriver: true }),
      ]));
      scaleLoop.start(); pulseLoop.start();
    });
    return () => { alive = false; scaleLoop?.stop(); pulseLoop?.stop(); };
  }, [pulse, scale]);
  const template = companion.together_character_templates;
  const focal = portraitVersion.appearance_config?.hero_focal_position ?? template.discovery_metadata?.hero_focal_position ?? (desktop ? 'top' : 'center');
  const displayQuote = /^[â€œ"]/.test(quote.trim()) ? quote : `â€œ${quote}â€`;
  return <View style={[styles.hero, { height: heroHeight }, desktop && styles.heroDesktop]}>
    {source ? <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale }] }]}><Image accessibilityLabel={`${template.name} in ${location}`} source={source} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={focal} transition={250} cachePolicy="memory-disk" priority="high" /></Animated.View> : <View style={[StyleSheet.absoluteFill, styles.fallback]}><Text style={styles.fallbackInitial}>{template.name[0]}</Text></View>}
    <View pointerEvents="none" style={styles.tint} />
    <View pointerEvents="none" style={[styles.scrim, Platform.OS === 'web' ? styles.webScrim : styles.nativeScrim]} />
    <View pointerEvents="none" style={[styles.vignette, Platform.OS === 'web' ? styles.webVignette : undefined]} />
    <View style={[styles.content, compact && styles.contentCompact]}>
      <View style={styles.topRow}>
        <CompanionSwitcher active={companion} variant="overlay" />
        <View style={styles.dayPill}><Animated.View style={[styles.liveDot, { opacity: pulse }]} /><Text numberOfLines={1} style={styles.dayText}>DAY {relationshipDay} Â· {stage.toUpperCase()}</Text></View>
      </View>
      <View style={[styles.bottom, desktop && styles.bottomDesktop]}>
        {notice ? <View style={styles.notice}><Sparkles size={12} color="#FFD8E5" /><Text numberOfLines={1} style={styles.noticeText}>{notice}</Text></View> : null}
        <Text style={styles.eyebrow}>âœ¦ {eyebrow}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`View ${template.name}'s profile`} onPress={onProfile}><Text numberOfLines={2} adjustsFontSizeToFit style={[styles.heading, compact && styles.headingCompact]}>{heading}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${activity}, ${location}`} onPress={onLocation} style={({ pressed }) => [styles.sceneLine, pressed && styles.muted]}><MapPin size={15} color={colors.warm} /><Text numberOfLines={1} style={styles.sceneText}>{activity} Â· {location}</Text></Pressable>
        <Text numberOfLines={3} style={styles.quote}>{displayQuote}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Continue with ${template.name}`} onPress={onContinue} style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}><Text style={styles.ctaText}>Continue with {template.name}</Text><ArrowRight size={19} color="#fff" /></Pressable>
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
  content: { flex: 1, justifyContent: 'space-between', padding: 22 },
  contentCompact: { padding: 16 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  dayPill: { maxWidth: '48%', minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: 'rgba(8,6,12,.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,.14)' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.rose, shadowColor: colors.rose, shadowOpacity: .85, shadowRadius: 8 },
  dayText: { flexShrink: 1, color: '#F9EAF0', fontSize: 9, fontWeight: '900', letterSpacing: .8 },
  bottom: { maxWidth: 690, gap: 10 },
  bottomDesktop: { paddingBottom: 12 },
  notice: { alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: 'rgba(133,43,84,.66)', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)' },
  noticeText: { flexShrink: 1, color: '#FFF3F7', fontSize: 10, fontWeight: '800' },
  eyebrow: { color: '#FFB5CB', fontSize: 10, fontWeight: '900', letterSpacing: 1.7, textShadowColor: '#000', textShadowRadius: 8 },
  heading: { color: colors.text, fontFamily: typography.display, fontSize: 58, lineHeight: 61, fontWeight: '600', letterSpacing: -1.6, textShadowColor: 'rgba(0,0,0,.9)', textShadowRadius: 18 },
  headingCompact: { fontSize: 39, lineHeight: 42, letterSpacing: -.8 },
  sceneLine: { alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 24 },
  sceneText: { flexShrink: 1, color: '#F6E9ED', fontSize: 14, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 9 },
  quote: { maxWidth: 580, color: 'rgba(255,248,244,.87)', fontFamily: typography.display, fontSize: 17, lineHeight: 24, fontStyle: 'italic', textShadowColor: '#000', textShadowRadius: 10 },
  cta: { alignSelf: 'flex-start', minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 21, marginTop: 3, borderRadius: 18, backgroundColor: colors.rose, borderWidth: 1, borderColor: 'rgba(255,255,255,.2)', shadowColor: colors.rose, shadowOpacity: .35, shadowRadius: 20, shadowOffset: { width: 0, height: 9 } },
  ctaPressed: { opacity: .9, transform: [{ translateY: 1 }, { scale: .988 }] },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  muted: { opacity: .74 },
});

