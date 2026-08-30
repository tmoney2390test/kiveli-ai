import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { ChevronRight, Sparkles, Star } from 'lucide-react-native';
import { colors, typography } from '../theme';
import type { FeaturedCompanion } from '../lib/featuredCompanions';
import { resolveCharacterPortraitSource } from './ui';
import { DetailPreservingArtwork } from './DetailPreservingArtwork';

export function CompanionPortraitCard({ companion, width, height = 390, favorite, favoriteBusy, subtitle, actionLabel = 'View profile', loading = 'eager', badgeLabel, compact=false, preserveArtwork=true, onFavorite, onPress }: {
  companion: FeaturedCompanion;
  width: number;
  height?: number;
  favorite: boolean;
  favoriteBusy: boolean;
  subtitle?: string;
  actionLabel?: string;
  loading?: 'eager' | 'lazy';
  badgeLabel?: string|null;
  compact?: boolean;
  preserveArtwork?: boolean;
  onFavorite: () => void;
  onPress: () => void;
}) {
  const source = resolveCharacterPortraitSource(companion, companion.together_character_versions, companion.slug);
  const derivedLabel = companion.discovery_metadata?.trending === true ? 'TRENDING' : companion.discovery_metadata?.new === true ? 'NEW' : 'FEATURED';
  const label=badgeLabel===undefined?derivedLabel:badgeLabel;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${actionLabel}: ${companion.name}, ${companion.age}, ${companion.occupation}`} onPress={onPress} style={({ pressed }) => [styles.card, { width, height }, pressed && styles.cardPressed]}>
    {source ? preserveArtwork?<DetailPreservingArtwork accessibilityLabel={`${companion.name}, ${companion.occupation}`} source={source} contentPosition="top" foregroundFit="cover" dim={.1} loading={loading} />:<Image accessibilityLabel={`${companion.name}, ${companion.occupation}`} source={source} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" cachePolicy="memory-disk" loading={loading} priority={loading==='eager'?'normal':'low'}/>:<View style={[StyleSheet.absoluteFill, styles.fallback]}><Text style={styles.fallbackInitial}>{companion.name[0]}</Text></View>}
    <View style={styles.cardShade} />
    {label?<View style={styles.badge}><Sparkles size={11} color="#FFE1A8" /><Text style={styles.badgeText}>{label}</Text></View>:null}
    <View style={[styles.cardCopy,compact&&styles.cardCopyCompact]}>
      <View style={styles.nameRow}>
        <Text numberOfLines={compact?2:1} style={[styles.name,compact&&styles.nameCompact]}>{companion.name} <Text style={styles.age}>{companion.age}</Text></Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${favorite ? 'Remove' : 'Add'} ${companion.name} ${favorite ? 'from' : 'to'} favorites`} accessibilityState={{ selected: favorite, disabled: favoriteBusy }} disabled={favoriteBusy} hitSlop={8} onPress={(event) => { event.stopPropagation(); onFavorite(); }} style={({ pressed }) => [styles.favoriteButton, favorite && styles.favoriteButtonActive, (pressed || favoriteBusy) && styles.favoriteButtonPressed]}>
          <Star size={19} strokeWidth={2.1} color={favorite ? '#FFD27A' : '#fff'} fill={favorite ? '#FFD27A' : 'transparent'} />
        </Pressable>
      </View>
      <Text numberOfLines={1} style={styles.occupation}>{subtitle ?? companion.occupation}</Text>
      <View style={styles.action}><Text style={styles.actionText}>{actionLabel}</Text><ChevronRight size={15} color="#fff" /></View>
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', justifyContent: 'flex-end', borderRadius: 24, backgroundColor: colors.elevated, borderWidth: 1, borderColor: 'rgba(255,255,255,.13)', shadowColor: '#000', shadowOpacity: .28, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 7 },
  cardPressed: { opacity: .93, transform: [{ scale: .99 }] },
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.plum },
  fallbackInitial: { color: 'rgba(255,255,255,.22)', fontFamily: typography.display, fontSize: 110 },
  cardShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(9,7,12,.15)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(0deg, rgba(5,4,8,.94) 0%, rgba(6,5,9,.08) 68%)' } as never) : {}) },
  badge: { position: 'absolute', top: 13, left: 13, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(112,53,139,.84)', borderWidth: 1, borderColor: 'rgba(255,255,255,.16)' },
  badgeText: { color: '#fff', fontSize: 8, fontWeight: '900', letterSpacing: .7 },
  cardCopy: { zIndex: 1, gap: 3, padding: 16 },
  cardCopyCompact:{padding:14},
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { flex: 1, color: '#fff', fontFamily: typography.display, fontSize: 29, lineHeight: 34, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 10 },
  nameCompact:{fontSize:24,lineHeight:27},
  age: { color: 'rgba(255,255,255,.72)' },
  favoriteButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,8,14,.64)', borderWidth: 1, borderColor: 'rgba(255,255,255,.28)' },
  favoriteButtonActive: { backgroundColor: 'rgba(103,62,22,.74)', borderColor: 'rgba(255,210,122,.68)' },
  favoriteButtonPressed: { opacity: .68, transform: [{ scale: .93 }] },
  occupation: { color: '#F6D6DF', fontSize: 12, fontWeight: '800' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 8 },
  actionText: { color: '#fff', fontSize: 11, fontWeight: '900' },
});
