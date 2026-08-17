import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { ImageContentPosition } from 'expo-image';
import { ArrowLeft, Check, MapPin, Sparkles } from 'lucide-react-native';
import {
  Body,
  CharacterAvatar,
  EmptyState,
  GradientButton,
  LoadingSkeleton,
  MoodBadge,
  RelationshipBadge,
  Screen,
  resolveCharacterPortraitSource,
} from '../../src/components';
import { DetailPreservingArtwork } from '../../src/components/DetailPreservingArtwork';
import { meetCompanion, setActiveCompanion } from '../../src/lib/api';
import { relationshipDaysKnown } from '../../src/lib/companionLife';
import { worldForLocation } from '../../src/lib/place';
import { selectPortraitVersion } from '../../src/lib/selectors';
import { useTogether } from '../../src/store/useTogether';
import { colors, radius, spacing, typography } from '../../src/theme';

export default function CharacterProfile() {
  const { slug, intro } = useLocalSearchParams<{ slug: string; intro?: string }>();
  const { width } = useWindowDimensions();
  const desktop = width >= 820;
  const { snapshot, setSnapshot } = useTogether();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [portraitFailed, setPortraitFailed] = useState(false);

  useEffect(() => setPortraitFailed(false), [slug]);

  if (!snapshot) return <LoadingSkeleton />;

  const instance = snapshot.characters.find((item) =>
    item.together_character_templates.slug === slug
    || item.together_character_templates.public_handle === slug
    || item.character_template_id === slug
  );
  const discoverable = snapshot.discoverableCharacters?.find((item) =>
    item.slug === slug || item.public_handle === slug || item.id === slug
  );
  const template = instance?.together_character_templates ?? discoverable;
  const baseVersion = instance?.together_character_versions ?? discoverable?.together_character_versions;

  if (!template || !baseVersion) {
    return <EmptyState
      title="You haven’t crossed paths yet"
      body="Some people enter your world through introductions and shared events."
      action="Back to Discover"
      onAction={() => router.replace('/(tabs)/singles')}
    />;
  }

  const version = instance ? selectPortraitVersion(snapshot, instance) : baseVersion;
  const asset = resolveCharacterPortraitSource(template, version, template.slug);
  const focal = (version.appearance_config?.hero_focal_position
    ?? template.discovery_metadata?.hero_focal_position
    ?? 'top') as ImageContentPosition;
  const known = Boolean(instance && (instance.contact_added_at || instance.introduced_at));
  const selectable = Boolean(template.can_be_selected);
  const active = instance?.id === snapshot.activeContinuity?.active_companion_instance_id;
  const locationRow = instance ? snapshot.locations.find((item) => item.id === instance.current_location_id) : undefined;
  const world = instance ? worldForLocation(snapshot, instance.current_location_id) : undefined;
  const location = locationRow?.name ?? world?.name ?? 'Current place';
  const moments = instance ? snapshot.moments.filter((item) => item.character_instance_id === instance.id) : [];
  const relationship = instance ? snapshot.relationships.find((item) => item.character_instance_id === instance.id) : undefined;
  const daysKnown = instance ? relationshipDaysKnown(relationship) : 0;
  const placesTogether = new Set(moments.map((item) => item.location_id).filter(Boolean)).size;
  const upcoming = instance
    ? snapshot.sharedPlans.filter((item) => item.character_instance_id === instance.id && ['scheduled', 'active'].includes(item.status)).length
    : 0;
  const handle = template.public_handle ?? template.slug;
  const canTalk = selectable || known;

  const goBack = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/home');
  const act = async () => {
    setBusy(true);
    setError('');
    try {
      if (!instance) {
        setSnapshot(await meetCompanion(template.id));
        router.replace(`/(tabs)/chat-tab?character=${handle}` as never);
        return;
      }
      if (selectable && !active) setSnapshot(await setActiveCompanion(instance.id, 'discover_profile'));
      router.push(`/(tabs)/chat-tab?character=${handle}` as never);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not continue right now.');
    } finally {
      setBusy(false);
    }
  };

  return <Screen contentStyle={desktop ? styles.pageDesktop : styles.pageMobile}>
    <View style={[styles.profile, desktop && styles.profileDesktop]}>
      <View style={[styles.portrait, desktop ? styles.portraitDesktop : styles.portraitMobile]}>
        <View style={styles.portraitFallback}>
          <CharacterAvatar
            slug={template.slug}
            name={template.name}
            template={template}
            version={portraitFailed ? { ...version, portrait_url: null, portrait_asset_key: '' } : version}
            size={112}
          />
        </View>
        {asset && !portraitFailed ? <DetailPreservingArtwork
          accessibilityLabel={`${template.name}, ${template.occupation}`}
          source={asset}
          contentPosition={focal}
          frameStyle={desktop ? styles.portraitFrameDesktop : styles.portraitFrameMobile}
          dim={.12}
          priority="high"
          onError={() => setPortraitFailed(true)}
        /> : null}
        <View pointerEvents="none" style={styles.portraitShade} />
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={goBack} style={styles.back}>
          <ArrowLeft size={20} color="#fff" />
        </Pressable>
        <View pointerEvents="none" style={styles.portraitTitle}>
          <Text style={styles.name}>{template.name}</Text>
          <Text style={styles.job}>{template.occupation}</Text>
        </View>
      </View>

      <View style={[styles.details, desktop && styles.detailsDesktop]}>
        {intro === '1' ? <View style={styles.welcome}>
          <Sparkles size={18} color={colors.rose} />
          <View style={styles.flex}>
            <Text style={styles.welcomeTitle}>Your story starts here</Text>
            <Text style={styles.welcomeCopy}>Say hello in your own words. {template.name} will remember what matters.</Text>
          </View>
        </View> : null}

        <View style={styles.badges}>
          {instance ? <MoodBadge mood={instance.current_mood} /> : null}
          {instance && known ? <RelationshipBadge stage={instance.relationship_stage} /> : <Text style={styles.newBadge}>NEW CONNECTION</Text>}
        </View>

        <Text style={styles.heading}>{known ? `Your relationship with ${template.name}` : `Meet ${template.name}`}</Text>
        <Body muted>{template.biography}</Body>

        {known ? <View style={styles.history}>
          <Stat value={String(daysKnown)} label="Days known" />
          <Stat value={String(moments.length)} label="Moments" />
          <Stat value={String(upcoming || placesTogether)} label={upcoming ? 'Upcoming' : 'Places together'} />
        </View> : null}

        <View style={styles.facts}>
          {instance ? <>
            <Info label="Right now" value={instance.current_activity} />
            <Info label="Location" value={location} />
          </> : null}
          <Info label="Occupation" value={template.occupation} />
          <Info label="Interests" value={(version.interests ?? []).join(', ') || 'Still discovering'} />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {canTalk ? <GradientButton
          disabled={busy}
          label={busy ? 'Opening your story…' : instance ? `Talk to ${template.name}` : `Meet ${template.name}`}
          onPress={() => void act()}
        /> : <View style={styles.notMet}>
          <MapPin size={18} color={colors.muted} />
          <Text style={styles.notMetText}>You haven’t been introduced yet. Their story will unfold through people, places, and events in their world.</Text>
        </View>}

        {known && instance && !active && selectable ? <Pressable
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            try { setSnapshot(await setActiveCompanion(instance.id, 'discover_profile')); }
            finally { setBusy(false); }
          }}
          style={styles.secondary}
        >
          <Check size={16} color={colors.rose} />
          <Text style={styles.secondaryText}>Make {template.name} active on Home</Text>
        </Pressable> : null}

        {known && instance ? <View style={styles.links}>
          <Pressable onPress={() => router.push(`/memories?character=${handle}` as never)}><Text style={styles.link}>What {template.name} remembers</Text></Pressable>
          <Pressable onPress={() => router.push(`/(tabs)/moments?character=${handle}` as never)}><Text style={styles.link}>Shared moments</Text></Pressable>
        </View> : null}
      </View>
    </View>
  </Screen>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <View style={styles.info}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  pageMobile: { padding: spacing.md, paddingBottom: 120, gap: 0 },
  pageDesktop: { padding: spacing.xl, paddingBottom: 120, gap: 0, maxWidth: 1040 },
  profile: { width: '100%', gap: spacing.md },
  profileDesktop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xl },
  portrait: { position: 'relative', overflow: 'hidden', backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.borderBright, borderRadius: radius.xl },
  portraitMobile: { width: '100%', height: 310 },
  portraitDesktop: { width: 330, height: 430, flexShrink: 0 },
  portraitFallback: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.plum },
  portraitFrameMobile: { top: 4, right: 4, bottom: 4, left: 4 },
  portraitFrameDesktop: { top: 5, right: 5, bottom: 5, left: 5 },
  portraitShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,6,12,.08)', borderBottomWidth: 90, borderBottomColor: 'rgba(6,4,9,.70)' },
  back: { position: 'absolute', top: 14, left: 14, zIndex: 3, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(8,11,19,.68)', borderWidth: 1, borderColor: 'rgba(255,255,255,.16)', alignItems: 'center', justifyContent: 'center' },
  portraitTitle: { position: 'absolute', right: 20, bottom: 18, left: 20 },
  name: { fontFamily: typography.display, fontSize: 36, lineHeight: 39, color: '#fff', fontWeight: '600', textShadowColor: '#000', textShadowRadius: 14 },
  job: { color: 'rgba(255,255,255,.88)', fontSize: 14, marginTop: 3, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 8 },
  details: { width: '100%', gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  detailsDesktop: { flex: 1, width: 'auto', minHeight: 430, backgroundColor: colors.glass },
  flex: { flex: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  newBadge: { color: colors.rose, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  heading: { fontFamily: typography.display, fontSize: 26, lineHeight: 31, color: colors.text, fontWeight: '600' },
  history: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, minWidth: 0, paddingHorizontal: 8, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  statValue: { fontFamily: typography.display, fontSize: 23, color: colors.text },
  statLabel: { fontSize: 9, color: colors.muted, fontWeight: '800', marginTop: 2, textAlign: 'center' },
  facts: { borderTopWidth: 1, borderTopColor: colors.border },
  info: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  label: { color: colors.muted, flexShrink: 0 },
  value: { flex: 1, color: colors.text, textAlign: 'right' },
  welcome: { flexDirection: 'row', gap: 10, padding: 13, borderRadius: radius.md, backgroundColor: 'rgba(232,93,140,.10)', borderWidth: 1, borderColor: 'rgba(232,93,140,.22)' },
  welcomeTitle: { color: colors.text, fontWeight: '900' },
  welcomeCopy: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  secondary: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  secondaryText: { color: colors.text, fontWeight: '800', textAlign: 'center' },
  notMet: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface },
  notMetText: { flex: 1, color: colors.muted, fontSize: 12, lineHeight: 18 },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', gap: 16, paddingVertical: 6 },
  link: { color: colors.rose, fontWeight: '800', fontSize: 12 },
  error: { color: colors.danger },
});
