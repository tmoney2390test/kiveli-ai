import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { typography } from '../../theme';
import { joinPathFor } from '../../lib/sessionRouting';
import { PUBLIC_LANDING_COPY } from '../../lib/publicLanding';
import { KivelleLogo } from '../KivelleLogo';
import { publicLandingPrimaryHeroAsset } from './publicLandingAssets';
import { useWebHydrated } from '../../hooks/useWebHydrated';

const DESKTOP_BREAKPOINT = 900;

export function PublicLandingPage() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const hydrated = useWebHydrated();
  const desktop = hydrated && width >= DESKTOP_BREAKPOINT;
  const compact = width < 380;
  const shortViewport = !desktop && height < 700;
  const safeAreaReserve = Math.max(0, insets.bottom - 6);
  const mobileContentReserve = (shortViewport ? 312 : 362) + safeAreaReserve;
  const imageHeight = Math.max(120, Math.min(height * 0.54, height - mobileContentReserve));

  const getStarted = () => router.push(joinPathFor() as never);
  const signIn = () => router.push('/auth?mode=signin');

  return <View style={[styles.page, { height }]}>
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
      </View>

      <View style={[
        styles.content,
        desktop ? styles.contentDesktop : [styles.contentMobile, shortViewport && styles.contentMobileShort],
        !desktop && { paddingBottom: Math.max(insets.bottom + (shortViewport ? 10 : 18), shortViewport ? 16 : 24) },
      ]}>
        <View style={styles.copy}>
          <Text accessibilityRole="header" style={[
            styles.title,
            desktop ? styles.titleDesktop : compact ? styles.titleCompact : styles.titleMobile,
            shortViewport && styles.titleShort,
          ]}>
            {PUBLIC_LANDING_COPY.title}
          </Text>
        </View>

        <View style={[styles.actions, shortViewport && styles.actionsShort]}>
          <LandingAction label="Get started" onPress={getStarted} primary />
          <LandingAction label="Sign in" onPress={signIn} />
        </View>

        <KivelleLogo height={shortViewport ? 20 : desktop ? 29 : 24} style={[styles.logo, shortViewport && styles.logoShort]} />

        <View accessibilityLabel="Legal agreement" style={[styles.legal, shortViewport && styles.legalShort]}>
          <Text style={styles.legalText}>
            By continuing, you agree to the{' '}
            <Text accessibilityRole="link" onPress={() => router.push('/terms')} style={styles.legalLink}>Terms of Service</Text>
            {' '}and{' '}
            <Text accessibilityRole="link" onPress={() => router.push('/privacy-policy')} style={styles.legalLink}>Privacy Policy</Text>.
          </Text>
        </View>
      </View>
    </View>
  </View>;
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

const styles = StyleSheet.create({
  page: { flex: 1, width: '100%', overflow: 'hidden', backgroundColor: '#05040A' },
  layout: { flex: 1, width: '100%', overflow: 'hidden', backgroundColor: '#05040A' },
  layoutDesktop: { flexDirection: 'row' },
  layoutMobile: { flexDirection: 'column' },
  visual: { position: 'relative', overflow: 'hidden', backgroundColor: '#110D13' },
  visualDesktop: { width: '58%', height: '100%' },
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
  content: { position: 'relative', backgroundColor: '#05040A' },
  contentDesktop: { flex: 1, minWidth: 390, justifyContent: 'center', alignItems: 'center', paddingHorizontal: '6%', paddingVertical: 42 },
  contentMobile: { flex: 1, alignItems: 'center', marginTop: -2, paddingTop: 10, paddingHorizontal: 24 },
  contentMobileShort: { paddingTop: 6 },
  copy: { width: '100%', maxWidth: 490 },
  title: { color: '#FFF9F4', fontFamily: typography.display, fontWeight: '500', letterSpacing: -1.4 },
  titleDesktop: { maxWidth: 440, fontSize: 56, lineHeight: 58 },
  titleMobile: { textAlign: 'center', fontSize: 46, lineHeight: 48 },
  titleCompact: { textAlign: 'center', fontSize: 42, lineHeight: 44, letterSpacing: -1.1 },
  titleShort: { fontSize: 40, lineHeight: 42 },
  actions: { width: '100%', maxWidth: 420, gap: 10, marginTop: 22 },
  actionsShort: { gap: 8, marginTop: 16 },
  action: {
    position: 'relative',
    minHeight: 52,
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
  logo: { marginTop: 20 },
  logoShort: { marginTop: 12 },
  legal: { width: '100%', maxWidth: 430, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  legalShort: { marginTop: 10 },
  legalText: { color: '#9E97AA', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  legalLink: { color: '#D3CBDC', textDecorationLine: 'underline' },
});
