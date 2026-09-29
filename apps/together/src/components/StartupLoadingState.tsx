import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { AccessibilityInfo, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

const animatedLogo = require('../../assets/startup/loading-kivelli.webp');
const stillLogo = require('../../assets/startup/loading-kivelli-still.png');

function prefersReducedMotion() {
  return Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    : false;
}

export function StartupLoadingState() {
  const { width, height } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(prefersReducedMotion);
  const [animationFailed, setAnimationFailed] = useState(false);
  const artworkSize = Math.min(128, Math.max(96, width * .28));

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);

  return <View accessibilityLabel="Loading Kivelli" accessibilityLiveRegion="polite" accessibilityState={{ busy: true }} style={[styles.root, { minHeight: height }]}>
    <View style={styles.content}>
      <Image
        accessible={false}
        source={reduceMotion || animationFailed ? stillLogo : animatedLogo}
        style={{ width: artworkSize, height: artworkSize }}
        contentFit="contain"
        autoplay={!reduceMotion}
        onError={() => setAnimationFailed(true)}
      />
      <Text style={[styles.label, { marginTop: -artworkSize * .09 }]}>Loading Kivelli…</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#010015' },
  content: { alignItems: 'center', justifyContent: 'center' },
  label: { color: '#DED6EA', fontSize: 14, fontWeight: '600', letterSpacing: 1.2, textAlign: 'center' },
});
