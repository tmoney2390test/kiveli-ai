import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { typography } from '../../theme';
import { joinPathFor } from '../../lib/sessionRouting';
import { PUBLIC_LANDING_COPY } from '../../lib/publicLanding';
import { publicLandingPrimaryHeroAsset } from './publicLandingAssets';
import { useWebHydrated } from '../../hooks/useWebHydrated';

const DESKTOP_BREAKPOINT = 900;

export function PublicLandingPage() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const hydrated = useWebHydrated();
  const desktop = hydrated && width >= DESKTOP_BREAKPOINT;
  const compact = width < 380;
  const minimumHeight = Math.max(height, desktop ? 620 : 720);
  const imageHeight = Math.max(350, Math.min(minimumHeight * 0.51, 570));

  const getStarted = () => router.push(joinPathFor() as never);
  const signIn = () => router.push('/auth?mode=signin');

  return <ScrollView
    bounces={false}
    showsVerticalScrollIndicator={false}
    style={styles.scroll}
    contentContainerStyle={[styles.page, { minHeight: minimumHeight }]}
  >
    <View style={[styles.layout, desktop ? styles.layoutDesktop : styles.layoutMobile]}>
      <View style={[styles.visual, desktop ? styles.visualDesktop : { height: imageHeight }]}>
        <Image
          accessible
          accessibilityLabel="Evelyn Harrow in her Vespormoor study"
          source={publicLandingPrimaryHeroAsset}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition={desktop ? 'center' : 'top'}
          loading="eager"
          priority="high"
          transition={0}
        />
        <View pointerEvents="none" style={styles.visualShade} />
        {Platform.OS === 'web'
          ? <View pointerEvents="none" style={[styles.fade, desktop ? styles.fadeDesktopWeb : styles.fadeMobileWeb]} />
          : <View pointerEvents="none" style={[styles.fade, desktop ? styles.fadeDesktopNative : styles.fadeMobileNative]} />}
        <Text
          accessibilityRole="header"
          accessibilityLabel="Kivelle"
          style={[
            styles.wordmark,
            desktop ? styles.wordmarkDesktop : styles.wordmarkMobile,
            !desktop && { top: Math.max(insets.top + 18, 28) },
          ]}
        >kivelle</Text>
      </View>

      <View style={[
        styles.content,
        desktop ? styles.contentDesktop : styles.contentMobile,
        !desktop && { paddingBottom: Math.max(insets.bottom + 24, 34) },
      ]}>
        <View style={styles.copy}>
          <Text accessibilityRole="header" style={[styles.title, desktop ? styles.titleDesktop : compact ? styles.titleCompact : styles.titleMobile]}>
            {PUBLIC_LANDING_COPY.title}
          </Text>
          <Text style={[styles.body, !desktop && styles.bodyMobile, compact && styles.bodyCompact]}>{PUBLIC_LANDING_COPY.body}</Text>
        </View>

        <View style={styles.actions}>
          <LandingAction label="Get started" onPress={getStarted} primary />
          <LandingAction label="Sign in" onPress={signIn} />
        </View>

        <View accessibilityLabel="Legal links" style={styles.legal}>
          <LegalLink label="Terms of Service" href="/terms" />
          <Text accessible={false} style={styles.legalDivider}>•</Text>
          <LegalLink label="Privacy Policy" href="/privacy-policy" />
        </View>
      </View>
    </View>
  </ScrollView>;
}

function LandingAction({ label, onPress, primary = false }: { label: string; onPress: () => void; primary?: boolean }) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={onPress}
    style={({ pressed }) => [styles.action, primary ? styles.actionPrimary : styles.actionSecondary, pressed && styles.actionPressed]}
  >
    {primary ? <>
      <View pointerEvents="none" style={styles.primaryLeft} />
      <View pointerEvents="none" style={styles.primaryRight} />
    </> : null}
    <Text style={[styles.actionLabel, !primary && styles.actionLabelSecondary]}>{label}</Text>
  </Pressable>;
}

function LegalLink({ label, href }: { label: string; href: '/terms' | '/privacy-policy' }) {
  return <Pressable
    accessibilityRole="link"
    accessibilityLabel={label}
    hitSlop={12}
    onPress={() => router.push(href)}
    style={({ pressed }) => pressed && styles.legalPressed}
  >
    <Text style={styles.legalText}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#05040A' },
  page: { width: '100%', backgroundColor: '#05040A' },
  layout: { flex: 1, width: '100%', overflow: 'hidden', backgroundColor: '#05040A' },
  layoutDesktop: { flexDirection: 'row' },
  layoutMobile: { flexDirection: 'column' },
  visual: { position: 'relative', overflow: 'hidden', backgroundColor: '#110D13' },
  visualDesktop: { width: '58%', minHeight: 620 },
  visualShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(6,3,7,0.08)' },
  fade: { position: 'absolute' },
  fadeDesktopWeb: {
    top: 0,
    right: 0,
    bottom: 0,
    width: 90,
    backgroundColor: 'transparent',
    backgroundImage: 'linear-gradient(90deg, rgba(5,4,10,0) 0%, #05040A 100%)',
  } as never,
  fadeMobileWeb: {
    left: 0,
    right: 0,
    bottom: 0,
    height: 118,
    backgroundColor: 'transparent',
    backgroundImage: 'linear-gradient(180deg, rgba(5,4,10,0) 0%, #05040A 100%)',
  } as never,
  fadeDesktopNative: { top: 0, right: 0, bottom: 0, width: 42, backgroundColor: 'rgba(5,4,10,0.66)' },
  fadeMobileNative: { left: 0, right: 0, bottom: 0, height: 70, backgroundColor: 'rgba(5,4,10,0.74)' },
  wordmark: {
    position: 'absolute',
    zIndex: 2,
    color: '#FFF9F4',
    fontFamily: typography.display,
    fontWeight: '400',
    letterSpacing: 7,
    textShadowColor: 'rgba(0,0,0,0.72)',
    textShadowRadius: 12,
  },
  wordmarkDesktop: { top: 30, left: 42, fontSize: 25, lineHeight: 31 },
  wordmarkMobile: { left: 0, right: 0, textAlign: 'center', fontSize: 23, lineHeight: 29 },
  content: { position: 'relative', backgroundColor: '#05040A' },
  contentDesktop: { flex: 1, minWidth: 390, justifyContent: 'center', paddingHorizontal: '6%', paddingVertical: 54 },
  contentMobile: { flex: 1, alignItems: 'center', marginTop: -2, paddingTop: 12, paddingHorizontal: 24 },
  copy: { width: '100%', maxWidth: 490 },
  title: { color: '#FFF9F4', fontFamily: typography.display, fontWeight: '500', letterSpacing: -1.4 },
  titleDesktop: { maxWidth: 440, fontSize: 64, lineHeight: 66 },
  titleMobile: { textAlign: 'center', fontSize: 54, lineHeight: 56 },
  titleCompact: { textAlign: 'center', fontSize: 47, lineHeight: 49, letterSpacing: -1.1 },
  body: { maxWidth: 430, color: '#BDB5C8', fontSize: 17, lineHeight: 24, marginTop: 18 },
  bodyMobile: { textAlign: 'center' },
  bodyCompact: { fontSize: 15, lineHeight: 22, marginTop: 14 },
  actions: { width: '100%', maxWidth: 420, gap: 12, marginTop: 30 },
  action: {
    position: 'relative',
    minHeight: 56,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    borderWidth: 1,
  },
  actionPrimary: { borderColor: '#C85BD7', backgroundColor: '#A625BD' },
  actionSecondary: { borderColor: '#AAA5BA', backgroundColor: 'transparent' },
  primaryLeft: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '58%', backgroundColor: '#AF28C2' },
  primaryRight: { position: 'absolute', top: 0, bottom: 0, right: 0, width: '48%', backgroundColor: '#A327C4', opacity: 0.78 },
  actionPressed: { opacity: 0.82, transform: [{ scale: 0.992 }] },
  actionLabel: { zIndex: 2, color: '#FFF', fontSize: 17, lineHeight: 22, fontWeight: '800' },
  actionLabelSecondary: { color: '#F8F4F8' },
  legal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 34 },
  legalText: { color: '#9E97AA', fontSize: 12, lineHeight: 18 },
  legalDivider: { color: '#777181', fontSize: 10 },
  legalPressed: { opacity: 0.58 },
});
