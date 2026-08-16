import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router as expoRouter } from 'expo-router';
import { CalendarDays, ChevronRight, Clock3, Coins, Heart, Home as HomeIcon, MapPin, MessageCircle, Sparkles, UserRound } from 'lucide-react-native';
import { CharacterAvatar, CompanionSwitcher, EmptyState, ErrorState, GradientButton, LoadingSkeleton, MomentCarousel, Screen, SectionHeader } from '../../src/components';
import { characterAssets } from '../../src/assets';
import { colors, radius, spacing, typography } from '../../src/theme';
import { useTogether } from '../../src/store/useTogether';
import { manageSubscription, markProactiveOpened } from '../../src/lib/api';
import { buildHomeViewModel, type HomeTargetAction, type HomeTimelineItem } from '../../src/lib/homeViewModel';
import type { CharacterInstance } from '../../src/types';
import type { SubscriptionStatus } from '../../src/lib/subscription';

const router = expoRouter as unknown as { push: (href: string) => void };

export default function Home() {
  const { snapshot, loading, error, refresh } = useTogether();
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const hasSnapshot = Boolean(snapshot);

  useEffect(() => {
    if (!hasSnapshot) return;
    let mounted = true;
    void manageSubscription<SubscriptionStatus>()
      .then((next) => { if (mounted) setSubscription(next); })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, [hasSnapshot]);

  if (loading && !snapshot) return <LoadingSkeleton />;
  if (error && !snapshot) return <ErrorState message={error} onRetry={() => void refresh()} />;
  if (!snapshot) return <EmptyState title="Opening your world" body="Your companion and first conversation are being prepared automatically." />;

  const model = buildHomeViewModel(snapshot);
  if (!model) return <Screen contentStyle={styles.emptyLife}><EmptyState title={`Start ${snapshot.activePersona?.display_name ?? 'your'}'s Kivelle Life`} body="Meet an official companion or create someone original. This Life will keep its own relationships, memories, plans, and history." /><GradientButton label="Choose who to meet" onPress={() => router.push('/(tabs)/singles')} /></Screen>;

  const { companion, message } = model;
  const handle = companion.together_character_templates.public_handle ?? companion.together_character_templates.slug;

  const openCompanion = async (proactiveMessageId?: string) => {
    if (proactiveMessageId) await markProactiveOpened(proactiveMessageId).catch(() => undefined);
    router.push('/(tabs)/chat-tab');
  };

  const runAction = async (action: HomeTargetAction) => {
    if (action.kind === 'chat') {
      await openCompanion(action.proactiveMessageId);
      return;
    }
    if (action.kind === 'plan') {
      router.push(`/plan/${action.id}`);
      return;
    }
    if (action.kind === 'date') {
      router.push(`/date/${action.id}`);
      return;
    }
    router.push('/(tabs)/chat-tab?plan=1');
  };

  const openLocation = () => {
    if (model.currentLocation && model.currentWorld) {
      router.push(`/location/${model.currentLocation.slug}?world=${model.currentWorld.slug}`);
      return;
    }
    router.push('/(tabs)/worlds');
  };

  const openTimelineItem = (item: HomeTimelineItem) => {
    if (item.kind === 'plan') {
      router.push(`/plan/${item.id.replace(/^plan:/, '')}`);
      return;
    }
    if (item.kind === 'date') {
      router.push(`/date/${item.id.replace(/^date:/, '')}`);
      return;
    }
    if (item.locationId) {
      const location = snapshot.locations.find((place) => place.id === item.locationId);
      const world = location ? snapshot.worlds.find((entry) => entry.id === location.world_id) : undefined;
      if (location && world) {
        router.push(`/location/${location.slug}?world=${world.slug}`);
        return;
      }
    }
    if (item.kind === 'event') router.push('/(tabs)/chat-tab');
  };

  return <Screen contentStyle={styles.content}>
    <View style={styles.top}>
      <Text style={styles.brand}>Kivelle.AI</Text>
      <View style={styles.topActions}>
        <CreditChip status={subscription} />
        <Pressable accessibilityLabel="Open your settings" onPress={() => router.push('/settings')} style={({ pressed }) => [styles.icon, pressed && styles.pressed]}><UserRound color={colors.text} size={19} /></Pressable>
      </View>
    </View>

    <HomeHero
      companion={companion}
      relationshipDay={model.relationshipDay}
      stage={model.hero.stage}
      statusLine={model.hero.statusLine}
      prompt={model.hero.prompt}
      notice={model.hero.notice}
      actionLabel={model.hero.action.label}
      onAction={() => void runAction(model.hero.action)}
      onProfile={() => router.push(`/character/${handle}`)}
      onLocation={openLocation}
    />

    {message ? <CompanionMessageCard
      companion={companion}
      content={message.content}
      time={message.time}
      onPress={() => void openCompanion(message.id)}
    /> : null}

    <View style={styles.worldHeader}>
      <View style={styles.worldTitleRow}><Sparkles size={18} color={colors.rose} /><Text style={styles.worldTitle}>Your world</Text></View>
    </View>
    <View style={styles.worldGrid}>
      <WorldCard
        eyebrow={model.upcoming.eyebrow}
        title={model.upcoming.title}
        meta={model.upcoming.meta}
        icon={<CalendarDays size={20} color={colors.warm} />}
        onPress={() => void runAction(model.upcoming.action)}
      />
      <WorldCard
        eyebrow={model.memory.eyebrow}
        title={model.memory.title}
        meta={model.memory.meta}
        icon={<Heart size={20} color={colors.rose} />}
        onPress={() => router.push(`/memories?character=${handle}`)}
      />
    </View>

    <SectionHeader title="Today" action="View world" onAction={() => router.push('/(tabs)/worlds')} />
    <View style={styles.timelineCard}>
      <View pointerEvents="none" style={styles.timelineRail} />
      {model.timeline.map((item, index) => <View key={item.id}>
        <HomeTimelineRow item={item} onPress={() => openTimelineItem(item)} />
        {index < model.timeline.length - 1 ? <View style={styles.rule} /> : null}
      </View>)}
    </View>

    {model.recentMoments.length ? <>
      <SectionHeader title="Recent moments" action="View all" onAction={() => router.push('/(tabs)/moments')} />
      <MomentCarousel moments={model.recentMoments} onPress={() => router.push('/(tabs)/moments')} />
    </> : null}
  </Screen>;
}

function HomeHero({ companion, relationshipDay, stage, statusLine, prompt, notice, actionLabel, onAction, onProfile, onLocation }: {
  companion: CharacterInstance;
  relationshipDay: number;
  stage: string;
  statusLine: string;
  prompt: string;
  notice: string | null;
  actionLabel: string;
  onAction: () => void;
  onProfile: () => void;
  onLocation: () => void;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= 720;
  const template = companion.together_character_templates;
  const asset = characterAssets[template.slug];
  return <View style={[styles.hero, wide && styles.heroWide]}>
    {asset ? <Image source={asset} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" /> : <View style={[StyleSheet.absoluteFill, styles.heroFallback]}><Text style={styles.heroFallbackText}>{template.name[0]}</Text></View>}
    <View pointerEvents="none" style={styles.heroWash} />
    <View pointerEvents="none" style={styles.heroScrimSoft} />
    <View pointerEvents="none" style={styles.heroScrimDeep} />
    {wide ? <View pointerEvents="none" style={styles.heroWideScrim} /> : null}
    <View style={styles.heroContent}>
      <View style={styles.heroTopRow}>
        <CompanionSwitcher active={companion} variant="overlay" />
        <View style={styles.dayPill}><View style={styles.dayDot} /><Text style={styles.dayPillText}>DAY {relationshipDay} · {stage.toUpperCase()}</Text></View>
      </View>
      <View style={[styles.heroBottom, wide && styles.heroBottomWide]}>
        {notice ? <View style={styles.heroNotice}><Sparkles size={12} color="#FFD5E3" /><Text numberOfLines={1} style={styles.heroNoticeText}>{notice}</Text></View> : null}
        <Pressable accessibilityLabel={`View ${template.name}'s profile`} onPress={onProfile}><Text style={[styles.heroName, wide && styles.heroNameWide]}>{template.name}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${statusLine}`} onPress={onLocation} style={({ pressed }) => [styles.heroStatusRow, pressed && styles.heroRowPressed]}>
          <MapPin size={15} color="#F1B28F" />
          <Text numberOfLines={1} style={styles.heroStatusText}>{statusLine}</Text>
          <ChevronRight size={14} color="rgba(255,255,255,.62)" />
        </Pressable>
        <Text numberOfLines={2} style={styles.heroPrompt}>{prompt}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onAction} style={({ pressed }) => [styles.heroAction, pressed && styles.heroActionPressed]}><MessageCircle size={18} color="#fff" /><Text style={styles.heroActionText}>{actionLabel}</Text></Pressable>
      </View>
    </View>
  </View>;
}

function CompanionMessageCard({ companion, content, time, onPress }: { companion: CharacterInstance; content: string; time: string; onPress: () => void }) {
  const template = companion.together_character_templates;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open message from ${template.name}`} onPress={onPress} style={({ pressed }) => [styles.messageCard, pressed && styles.messageCardPressed]}>
    <View style={styles.messageAvatarWrap}>
      <CharacterAvatar slug={template.slug} name={template.name} size={44} ring />
      <View style={styles.unreadDot} />
    </View>
    <View style={styles.messageBody}>
      <View style={styles.messageTop}><Text style={styles.messageName}>{template.name}</Text><Text style={styles.messageTime}>{time}</Text></View>
      <Text numberOfLines={2} style={styles.messageCopy}>{content}</Text>
    </View>
    <View style={styles.replyPill}><Text style={styles.replyText}>Reply</Text></View>
  </Pressable>;
}

function WorldCard({ eyebrow, title, meta, icon, onPress }: { eyebrow: string; title: string; meta: string; icon: ReactNode; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${eyebrow}: ${title}`} onPress={onPress} style={({ pressed }) => [styles.worldCard, pressed && styles.worldCardPressed]}>
    <View style={styles.worldCardTop}>
      <View style={styles.worldCardIcon}>{icon}</View>
      <ChevronRight size={17} color={colors.dimmed} />
    </View>
    <Text style={styles.worldEyebrow}>{eyebrow}</Text>
    <Text numberOfLines={3} style={styles.worldCardTitle}>{title}</Text>
    <Text numberOfLines={1} style={styles.worldMeta}>{meta}</Text>
  </Pressable>;
}

function HomeTimelineRow({ item, onPress }: { item: HomeTimelineItem; onPress: () => void }) {
  const icon = item.kind === 'now'
    ? <HomeIcon size={16} color={colors.violet} />
    : item.kind === 'plan'
      ? <CalendarDays size={16} color={colors.warm} />
      : item.kind === 'date'
        ? <Heart size={16} color={colors.rose} />
        : item.kind === 'event'
          ? <Sparkles size={16} color={colors.rose} />
          : <Clock3 size={16} color={colors.warm} />;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${item.time}, ${item.title}${item.detail ? `, ${item.detail}` : ''}`} onPress={onPress} style={({ pressed }) => [styles.timelineRow, pressed && styles.timelineRowPressed]}>
    <View style={[styles.timelineMarker, item.current && styles.timelineMarkerCurrent]}>{icon}</View>
    <View style={styles.timelineBody}>
      <Text numberOfLines={1} style={[styles.timelineTitle, item.current && styles.timelineTitleCurrent]}>{item.title}</Text>
      {item.detail ? <Text numberOfLines={2} style={styles.timelineDetail}>{item.detail}</Text> : null}
    </View>
    <Text style={[styles.timelineTime, item.current && styles.timelineTimeCurrent]}>{item.time}</Text>
  </Pressable>;
}

function CreditChip({ status }: { status: SubscriptionStatus | null }) {
  const total = status?.creditBalance.total;
  const tier = status?.tier === 'kivelle_plus' ? 'PLUS' : status?.tier === 'kivelle_max' ? 'MAX' : null;
  return <Pressable accessibilityLabel={status ? `${total?.toLocaleString()} Kivelle Credits. Open Subscription and Credits.` : 'Open Subscription and Credits'} onPress={() => router.push('/subscription')} style={({ pressed }) => [styles.creditChip, pressed && styles.creditChipPressed]}>
    <View style={styles.creditDot}><Coins size={13} color="#FFD3A9" /></View>
    <Text style={styles.creditValue}>{typeof total === 'number' ? total.toLocaleString() : 'Credits'}</Text>
    {tier ? <View style={[styles.tierPill, tier === 'MAX' && styles.tierPillMax]}><Text style={styles.tierPillText}>{tier}</Text></View> : null}
    {total === 0 ? <Text style={styles.creditAdd}>Add</Text> : null}
  </Pressable>;
}

const styles = StyleSheet.create({
  content: { gap: 15, paddingBottom: 154 },
  emptyLife: { flex: 1, justifyContent: 'center', gap: spacing.lg },
  top: { minHeight: 50, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  topActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 7, flexShrink: 1 },
  brand: { color: colors.rose, fontFamily: typography.display, fontSize: 24, fontWeight: '700', letterSpacing: -.4 },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  creditChip: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 6, paddingRight: 8, borderRadius: radius.pill, backgroundColor: 'rgba(37,26,41,.82)', borderWidth: 1, borderColor: 'rgba(232,93,140,.22)' },
  creditChipPressed: { opacity: .82, transform: [{ scale: .97 }] },
  creditDot: { width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(233,160,127,.10)' },
  creditValue: { color: colors.text, fontSize: 10, fontWeight: '900' },
  creditAdd: { color: '#F4BDD0', fontSize: 8, fontWeight: '900' },
  tierPill: { paddingHorizontal: 5, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: 'rgba(232,93,140,.16)' },
  tierPillMax: { backgroundColor: 'rgba(154,99,215,.19)' },
  tierPillText: { color: '#EACBDB', fontSize: 7, fontWeight: '900', letterSpacing: .5 },
  pressed: { transform: [{ scale: .96 }], opacity: .82 },

  hero: { height: 318, borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(248,241,234,.15)', backgroundColor: colors.elevated, shadowColor: '#000', shadowOpacity: .3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
  heroWide: { height: 330 },
  heroFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#30203B' },
  heroFallbackText: { fontFamily: typography.display, fontSize: 128, color: 'rgba(248,241,234,.28)' },
  heroWash: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(8,7,12,.06)' },
  heroScrimSoft: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '68%', backgroundColor: 'rgba(7,6,11,.35)' },
  heroScrimDeep: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '48%', backgroundColor: 'rgba(6,5,10,.62)' },
  heroWideScrim: { position: 'absolute', top: 0, right: 0, bottom: 0, width: '56%', backgroundColor: 'rgba(6,5,10,.69)' },
  heroContent: { flex: 1, justifyContent: 'space-between', padding: 14 },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  dayPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: 'rgba(8,8,14,.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,.15)' },
  dayDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.rose },
  dayPillText: { color: '#F8EAF0', fontSize: 8, fontWeight: '900', letterSpacing: .75 },
  heroBottom: { gap: 7 },
  heroBottomWide: { width: '49%', alignSelf: 'flex-end', paddingRight: 8, paddingBottom: 8 },
  heroNotice: { maxWidth: '92%', alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(232,93,140,.72)' },
  heroNoticeText: { flexShrink: 1, color: '#fff', fontSize: 9, fontWeight: '900' },
  heroName: { color: '#fff', fontFamily: typography.display, fontSize: 36, lineHeight: 39, fontWeight: '600', textShadowColor: 'rgba(0,0,0,.72)', textShadowRadius: 12 },
  heroNameWide: { fontSize: 42, lineHeight: 45 },
  heroStatusRow: { alignSelf: 'flex-start', maxWidth: '100%', minHeight: 25, flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroStatusText: { flexShrink: 1, color: 'rgba(255,255,255,.92)', fontSize: 12, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 7 },
  heroPrompt: { maxWidth: 520, color: 'rgba(255,255,255,.88)', fontSize: 13, lineHeight: 18, fontWeight: '500', textShadowColor: '#000', textShadowRadius: 8 },
  heroRowPressed: { opacity: .74 },
  heroAction: { minHeight: 48, marginTop: 2, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, backgroundColor: 'rgba(232,93,140,.95)', borderWidth: 1, borderColor: 'rgba(255,255,255,.16)', shadowColor: colors.rose, shadowOpacity: .22, shadowRadius: 14, shadowOffset: { width: 0, height: 7 } },
  heroActionPressed: { transform: [{ scale: .988 }], opacity: .9 },
  heroActionText: { color: '#fff', fontSize: 14, fontWeight: '900' },

  messageCard: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: radius.lg, backgroundColor: 'rgba(21,19,28,.94)', borderWidth: 1, borderColor: 'rgba(248,241,234,.11)', shadowColor: '#000', shadowOpacity: .22, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  messageCardPressed: { transform: [{ scale: .992 }], opacity: .9 },
  messageAvatarWrap: { position: 'relative' },
  unreadDot: { position: 'absolute', right: -1, bottom: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.rose, borderWidth: 2, borderColor: colors.surface },
  messageBody: { flex: 1, minWidth: 0 },
  messageTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  messageName: { color: colors.rose, fontSize: 14, fontWeight: '900' },
  messageTime: { color: colors.dimmed, fontSize: 9, fontWeight: '700' },
  messageCopy: { color: colors.text, fontSize: 13, lineHeight: 18, marginTop: 4 },
  replyPill: { minHeight: 34, paddingHorizontal: 13, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(232,93,140,.64)', alignItems: 'center', justifyContent: 'center' },
  replyText: { color: colors.text, fontSize: 11, fontWeight: '800' },

  worldHeader: { marginTop: 2 },
  worldTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  worldTitle: { color: colors.text, fontFamily: typography.display, fontSize: 21, fontWeight: '600' },
  worldGrid: { flexDirection: 'row', gap: 10 },
  worldCard: { flex: 1, minWidth: 0, minHeight: 152, padding: 13, borderRadius: radius.lg, backgroundColor: 'rgba(21,19,28,.92)', borderWidth: 1, borderColor: colors.border, justifyContent: 'flex-start' },
  worldCardPressed: { transform: [{ scale: .985 }], opacity: .88 },
  worldCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  worldCardIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: 'rgba(232,93,140,.09)', borderWidth: 1, borderColor: 'rgba(232,93,140,.15)', alignItems: 'center', justifyContent: 'center' },
  worldEyebrow: { color: '#F0A9C1', fontSize: 8, fontWeight: '900', letterSpacing: 1.15 },
  worldCardTitle: { color: colors.text, fontSize: 14, lineHeight: 18, fontWeight: '800', marginTop: 5 },
  worldMeta: { color: colors.muted, fontSize: 10, marginTop: 7 },

  timelineCard: { position: 'relative', overflow: 'hidden', borderRadius: radius.lg, backgroundColor: 'rgba(21,19,28,.92)', borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 5 },
  timelineRail: { position: 'absolute', left: 28, top: 24, bottom: 24, width: 1, backgroundColor: 'rgba(232,93,140,.25)' },
  timelineRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 8 },
  timelineRowPressed: { opacity: .72 },
  timelineMarker: { zIndex: 2, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.elevated, borderWidth: 1, borderColor: 'rgba(248,241,234,.10)', alignItems: 'center', justifyContent: 'center' },
  timelineMarkerCurrent: { borderColor: 'rgba(155,99,215,.46)', backgroundColor: 'rgba(155,99,215,.16)' },
  timelineBody: { flex: 1, minWidth: 0 },
  timelineTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  timelineTitleCurrent: { color: '#F1E6FF' },
  timelineDetail: { color: colors.muted, fontSize: 10.5, lineHeight: 15, marginTop: 3 },
  timelineTime: { color: colors.dimmed, fontSize: 9.5, fontWeight: '800' },
  timelineTimeCurrent: { color: '#C7A5EF' },
  rule: { height: 1, marginLeft: 43, backgroundColor: colors.border },
});
