import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { BookOpen } from 'lucide-react-native';
import type { Scenario } from '../lib/scenarioCatalog';
import { scenarioAssets } from '../scenario-assets';
import { colors } from '../theme';

export function ScenarioArtwork({ scenario, priority = 'normal' }: { scenario: Scenario; priority?: 'normal' | 'high' }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');
  return <View style={styles.frame}>
    {state !== 'loaded' ? <View style={styles.placeholder}>{state === 'error' ? <><BookOpen size={26} color={colors.violet} /><Text style={styles.label}>Artwork unavailable</Text></> : <ActivityIndicator size="small" color={colors.dimmed} />}</View> : null}
    <Image source={scenarioAssets[scenario.id]} accessibilityLabel={`${scenario.title}, with ${scenario.leadName} at ${scenario.locationName}`} contentFit="cover" cachePolicy="memory-disk" priority={priority} recyclingKey={scenario.id} onLoad={() => setState('loaded')} onError={() => setState('error')} style={StyleSheet.absoluteFill} />
  </View>;
}
const styles = StyleSheet.create({ frame: { width: '100%', aspectRatio: 1.5, backgroundColor: colors.elevated }, placeholder: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: 10 }, label: { fontSize: 12, color: colors.muted } });
