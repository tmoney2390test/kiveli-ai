import { Image } from 'expo-image';
import { ArrowUpRight, Users, X } from 'lucide-react-native';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useEffect, useState } from 'react';
import type { FeaturedCompanion } from '../lib/featuredCompanions';
import { colors, radius, spacing, typography } from '../theme';
import { FrostedBackdrop, FrostedSurface } from './FrostedGlass';
import { resolveCharacterPortraitSource } from './ui';
import { naturalizeCharacterBiography } from '@together/domain/src/character-language';
import { SpiceBadge } from './SpiceBadge';

export function CharacterProfilePreviewModal({
  companion,
  onClose,
  onViewProfile,
  onInviteToGroup,
}: {
  companion: FeaturedCompanion | null;
  onClose: () => void;
  onViewProfile?: (companion: FeaturedCompanion) => void;
  onInviteToGroup?: (companion: FeaturedCompanion) => void | Promise<void>;
}) {
  const { width } = useWindowDimensions();
  const [inviteBusy, setInviteBusy] = useState(false);
  useEffect(() => setInviteBusy(false), [companion?.id]);
  if (!companion) return null;
  const portrait = resolveCharacterPortraitSource(
    companion,
    companion.together_character_versions,
    companion.slug,
  );
  const interests = companion.together_character_versions.interests.slice(0, 4);

  return <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <View style={[styles.root, width >= 720 ? styles.centered : styles.bottom]}>
      <FrostedBackdrop intensity={38} />
      <Pressable accessibilityLabel="Close character profile" onPress={onClose} style={StyleSheet.absoluteFill} />
      <FrostedSurface intensity={94} style={[styles.card, width >= 720 && styles.cardDesktop]}>
        <View style={styles.hero}>
          {portrait
            ? <Image source={portrait} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" cachePolicy="memory-disk" />
            : <View style={[StyleSheet.absoluteFill, styles.fallback]}><Text style={styles.initial}>{companion.name[0]}</Text></View>}
          <View pointerEvents="none" style={styles.shade} />
          <Pressable accessibilityRole="button" accessibilityLabel="Close profile" onPress={onClose} style={styles.close}>
            <X size={18} color="#fff" />
          </Pressable>
          <SpiceBadge level={companion.spice_level} overlay />
          <View style={styles.identity}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{companion.name} <Text style={styles.age}>{companion.age}</Text></Text>
              {onViewProfile ? <Pressable accessibilityRole="link" accessibilityLabel={`Open ${companion.name}'s full profile`} hitSlop={10} onPress={() => onViewProfile(companion)} style={styles.profileArrow}>
                <ArrowUpRight size={22} color="#fff" strokeWidth={2.2} />
              </Pressable> : null}
            </View>
            <Text style={styles.occupation}>{companion.occupation}</Text>
          </View>
        </View>
        <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={styles.bodyScroll} contentContainerStyle={styles.body}>
          <Text style={styles.biography}>{naturalizeCharacterBiography(companion.biography)}</Text>
          {interests.length ? <View style={styles.interests}>{interests.map((interest) => <View key={interest} style={styles.interest}><Text style={styles.interestText}>{interest}</Text></View>)}</View> : null}
          {onInviteToGroup ? <Pressable accessibilityRole="button" accessibilityLabel={`Invite ${companion.name} to a group chat`} accessibilityState={{disabled:inviteBusy,busy:inviteBusy}} disabled={inviteBusy} onPress={async()=>{if(inviteBusy)return;setInviteBusy(true);try{await onInviteToGroup(companion);}finally{setInviteBusy(false);}}} style={[styles.profileButton,inviteBusy&&styles.profileButtonBusy]}>
            <Users size={16} color="#fff" />
            <Text style={styles.profileButtonText}>{inviteBusy?'Preparing invite…':'Invite to group chat'}</Text>
          </Pressable> : null}
        </ScrollView>
      </FrostedSurface>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 12 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  bottom: { justifyContent: 'flex-end' },
  card: {
    width: '100%',
    maxHeight: '90%',
    borderRadius: 26,
    borderColor: 'rgba(255,221,241,.24)',
    shadowColor: '#000',
    shadowOpacity: .58,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 16 },
    elevation: 26,
  },
  cardDesktop: { maxWidth: 450 },
  hero: { height: 300, overflow: 'hidden', justifyContent: 'flex-end' },
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.plum },
  initial: { color: 'rgba(255,255,255,.2)', fontFamily: typography.display, fontSize: 96 },
  shade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(7,4,10,.18)',
    ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(0deg, rgba(10,6,15,.96), rgba(8,5,12,.02) 68%)' } as never) : {}),
  },
  close: { position: 'absolute', zIndex: 8, top: 12, left: 12, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,6,12,.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,.23)' },
  identity: { zIndex: 2, padding: spacing.lg },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  name: { flexShrink: 1, color: '#fff', fontFamily: typography.display, fontSize: 34, lineHeight: 39, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 12 },
  age: { color: 'rgba(255,255,255,.7)' },
  profileArrow: { alignItems: 'center', justifyContent: 'center', padding: 2 },
  occupation: { color: '#F7D8E4', fontSize: 12, lineHeight: 17, fontWeight: '800' },
  bodyScroll: { flexShrink: 1 },
  body: { gap: 13, padding: spacing.lg },
  biography: { color: '#F1E8ED', fontSize: 13, lineHeight: 19 },
  interests: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  interest: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(216,62,234,.11)', borderWidth: 1, borderColor: 'rgba(216,62,234,.2)' },
  interestText: { color: '#F1CBDF', fontSize: 10, fontWeight: '800' },
  profileButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: 'rgba(167,82,204,.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,.2)' },
  profileButtonBusy: { opacity: .72 },
  profileButtonText: { color: '#fff', fontSize: 12, fontWeight: '900' },
});
