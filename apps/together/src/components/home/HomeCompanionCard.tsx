import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image, type ImageContentPosition, type ImageSource } from 'expo-image';
import { ArrowRight, ChevronRight, Heart, MapPin } from 'lucide-react-native';
import type { CharacterInstance, CharacterVersion } from '../../types';
import { colors, typography } from '../../theme';
import { KIVELLI_IMAGE_PLACEHOLDER } from '../../lib/imageWarmup';
import { formatCompanionMessage } from '../../lib/companionMessageFormatting';
import { SpiceBadge } from '../SpiceBadge';

export function HomeCompanionCard({ companion, portraitVersion, source, location, world, prompt, notice, relationship, onContinue, onProfile, onVisualReady }: {
  companion: CharacterInstance; portraitVersion: CharacterVersion; source?: ImageSource | number;
  location?: string; world?: string; prompt: string; notice?: string | null; relationship: string;
  onContinue: () => void; onProfile: () => void; onVisualReady?: () => void;
}) {
  const narrow = useWindowDimensions().width < 700;
  const name = companion.together_character_templates.name;
  const firstName = name.trim().split(/\s+/)[0] || name;
  const focal = (portraitVersion.appearance_config?.hero_focal_position ?? companion.together_character_templates.discovery_metadata?.hero_focal_position ?? 'top') as ImageContentPosition;
  return <View style={[styles.hero, narrow && styles.narrow]}>
    {source ? <Image accessible={false} alt="" source={source} style={[styles.image, narrow && styles.imageNarrow]} contentFit="cover" contentPosition={narrow ? focal : { top: '18%', left: '50%' }} placeholder={KIVELLI_IMAGE_PLACEHOLDER} cachePolicy="memory-disk" loading="eager" priority="high" onLoad={onVisualReady} /> : null}
    <View pointerEvents="none" style={[styles.shade, Platform.OS === 'web' ? styles.webShade : styles.nativeShade, narrow && Platform.OS === 'web' && styles.webShadeNarrow]} />
    <SpiceBadge level={companion.together_character_templates.spice_level} overlay />
    <View style={[styles.copy, narrow && styles.copyNarrow]}>
      <Text numberOfLines={1} style={styles.eyebrow}>{notice || 'PICK UP WHERE YOU LEFT OFF'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`View profile: ${name}`} onPress={onProfile}><Text numberOfLines={1} adjustsFontSizeToFit style={styles.name}>{firstName}</Text></Pressable>
      <View style={styles.location}><MapPin size={13} color="#EDC3D7" /><Text numberOfLines={1} style={styles.locationText}>{[location, world].filter(Boolean).join(' · ') || 'Your companion'}</Text></View>
      <Text numberOfLines={3} style={styles.prompt}>{formatCompanionMessage(prompt, { speakerName: name }).map((span, i) => <Text key={i} style={span.italic ? styles.italic : undefined}>{span.text}</Text>)}</Text>
      <Pressable accessibilityRole="button" onPress={onContinue} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}><Text style={styles.ctaText}>Continue chat</Text><ArrowRight size={16} color="#321626" /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Relationship with ${name}: ${relationship}. View profile`} onPress={onProfile} style={styles.relationship}><Heart size={13} color="#E4BFD2" /><Text numberOfLines={1} style={styles.relationshipText}>{relationship}</Text><ChevronRight size={13} color="#E4BFD2" /></Pressable>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  hero: { minHeight: 294, borderRadius: 25, overflow: 'hidden', borderWidth: 1, borderColor: '#4D3848', backgroundColor: '#211620' },
  narrow: { minHeight: 310, borderRadius: 23 },
  image: { position: 'absolute', top: 0, right: 0, width: '64%', height: '100%' },
  imageNarrow: { width: '100%', right: '-16%' },
  shade: { ...StyleSheet.absoluteFill },
  webShade: { backgroundImage: 'linear-gradient(90deg,#211620 0%,#211620 37%,rgba(33,22,32,.85) 44%,rgba(33,22,32,.12) 70%,transparent 100%)' } as never,
  webShadeNarrow: { backgroundImage: 'linear-gradient(90deg,rgba(25,14,24,.94),rgba(25,14,24,.62) 46%,rgba(25,14,24,.04)),linear-gradient(0deg,rgba(25,14,24,.65),transparent 75%)' } as never,
  nativeShade: { backgroundColor: 'rgba(25,14,24,.55)' },
  copy: { width: '58%', padding: 26, gap: 8 },
  copyNarrow: { width: '87%', padding: 20 },
  eyebrow: { color: '#EDB1CB', fontSize: 9, lineHeight: 14, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', paddingRight: 12 },
  name: { fontFamily: typography.display, fontSize: 43, lineHeight: 47, color: colors.text, fontWeight: '600', letterSpacing: -1 },
  location: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  locationText: { flexShrink: 1, color: '#E4D2DF', fontSize: 11, lineHeight: 16 },
  prompt: { color: '#F3E4ED', fontSize: 13, lineHeight: 19, maxWidth: 300, marginVertical: 3 },
  italic: { fontStyle: 'italic' },
  cta: { alignSelf: 'flex-start', flexDirection: 'row', gap: 10, minHeight: 44, paddingHorizontal: 17, alignItems: 'center', backgroundColor: '#E6A3C6', borderRadius: 12 },
  ctaText: { color: '#321626', fontSize: 12, fontWeight: '800' },
  relationship: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '100%' },
  relationshipText: { flexShrink: 1, color: '#E4BFD2', fontSize: 11 },
  pressed: { opacity: .8 },
});
