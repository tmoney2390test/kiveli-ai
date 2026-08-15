import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router as expoRouter } from 'expo-router';
import { CalendarDays, ChevronRight, Coffee, Coins, MapPin, MessageCircle, Sparkles, UserRound } from 'lucide-react-native';
import { ActionTile, CompanionSwitcher, EmptyState, ErrorState, GlassCard, GradientButton, LoadingSkeleton, MessagePreview, MoodBadge, MomentCarousel, Screen, SectionHeader } from '../../src/components';
import { characterAssets } from '../../src/assets';
import { colors, radius, spacing } from '../../src/theme';
import { useTogether } from '../../src/store/useTogether';
import { manageSubscription, markProactiveOpened } from '../../src/lib/api';
import { buildCompanionLife, formatScheduleTime } from '../../src/lib/companionLife';
import { worldForLocation } from '../../src/lib/place';
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

  const life = buildCompanionLife(snapshot);
  if (!life) return <Screen contentStyle={styles.emptyLife}><EmptyState title={`Start ${snapshot.activePersona?.display_name ?? 'your'}'s Kivelle Life`} body="Meet an official companion or create someone original. This Life will keep its own relationships, memories, plans, and history." /><GradientButton label="Choose who to meet" onPress={() => router.push('/(tabs)/singles')} /></Screen>;

  const { companion, relationshipDay, location: currentLocation, recentEvents, upcomingSchedule, proactiveMessages, dates } = life;
  const name = companion.together_character_templates.name;
  const handle = companion.together_character_templates.public_handle ?? companion.together_character_templates.slug;
  const currentWorld = worldForLocation(snapshot, companion.current_location_id);
  const location = currentLocation?.name ?? currentWorld?.name ?? 'Current place';
  const relationshipCue = snapshot.relationshipCues?.[companion.id];
  const pendingMilestone = snapshot.relationshipMilestones?.find((item) => item.character_instance_id === companion.id);
  const latestProactive = proactiveMessages[0];
  const latest = latestProactive?.content ?? recentEvents[0]?.narrative_summary ?? `${name} is waiting to hear how your day is going.`;
  const latestSourceTitle = latestProactive ? `New from ${name}` : recentEvents[0] ? `${name}'s day` : 'Continue your conversation';
  const catchUpEvents = recentEvents.filter((event) => Date.now() - new Date(event.starts_at).getTime() < 72 * 3600000).slice(0, 2);
  const activeDate = dates.find((item) => item.status === 'active');
  const plannedDate = dates.find((item) => ['active', 'upcoming', 'unlocked', 'deferred'].includes(item.status));
  const sharedPlan = (snapshot.sharedPlans ?? [])
    .filter((plan) => plan.character_instance_id === companion.id && (plan.status === 'active' || plan.status === 'scheduled' && new Date(plan.starts_at).getTime() > Date.now()))
    .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime())[0];
  const activePlan = sharedPlan?.status === 'active' ? sharedPlan : undefined;
  const todayPlan = sharedPlan?.status === 'scheduled' && isToday(sharedPlan.starts_at) ? sharedPlan : undefined;
  const todayDate = dates.find((item) => item.status === 'upcoming' && item.scheduled_for && isToday(item.scheduled_for));

  const openCompanion = async () => {
    if (latestProactive?.status === 'sent') await markProactiveOpened(latestProactive.id).catch(() => undefined);
    router.push('/(tabs)/chat-tab');
  };

  const heroAction = activeDate
    ? { label: 'Continue date', onPress: () => router.push(`/date/${activeDate.id}`) }
    : activePlan
      ? { label: 'Continue together', onPress: () => router.push(`/plan/${activePlan.id}`) }
      : pendingMilestone
        ? { label: `Answer ${name}`, onPress: () => router.push('/(tabs)/chat-tab') }
        : latestProactive?.status === 'sent'
          ? { label: `Open ${name}'s message`, onPress: () => void openCompanion() }
          : relationshipCue?.tone === 'tense'
            ? { label: 'Talk it through', onPress: () => router.push('/(tabs)/chat-tab') }
            : { label: `Talk to ${name}`, onPress: () => router.push('/(tabs)/chat-tab') };

  const heroNotice = activeDate
    ? `Together now · ${activeDate.together_date_templates.name}`
    : activePlan
      ? `Together now · ${activePlan.title}`
      : pendingMilestone
        ? pendingMilestone.title
        : latestProactive?.status === 'sent'
          ? `New message from ${name}`
          : relationshipCue?.tone === 'tense'
            ? relationshipCue.detail
            : null;

  const openLocation = () => {
    if (currentLocation && currentWorld) {
      router.push(`/location/${currentLocation.slug}?world=${currentWorld.slug}`);
      return;
    }
    router.push('/(tabs)/worlds');
  };
  const askAboutNow = () => router.push(`/(tabs)/chat-tab?draft=${encodeURIComponent(`How's ${lowerFirst(companion.current_activity)} going?`)}`);

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
      relationshipDay={relationshipDay}
      stage={labelStage(companion.relationship_stage)}
      location={location}
      notice={heroNotice}
      actionLabel={heroAction.label}
      onAction={heroAction.onPress}
      onProfile={() => router.push(`/character/${handle}`)}
      onLocation={openLocation}
      onActivity={askAboutNow}
    />

    <View style={styles.actions}>
      <ActionTile
        title={plannedDate?.status === 'active' ? 'Continue date' : sharedPlan ? sharedPlan.status === 'active' ? `Together now · ${sharedPlan.title}` : `${new Date(sharedPlan.starts_at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })} · ${sharedPlan.title}` : 'Plan something'}
        onPress={() => plannedDate?.status === 'active' ? router.push(`/date/${plannedDate.id}`) : sharedPlan ? router.push(`/plan/${sharedPlan.id}`) : router.push('/(tabs)/chat-tab?plan=1')}
        icon={<CalendarDays color={colors.warm} size={21} />}
      />
      <ActionTile title="Memories" onPress={() => router.push(`/memories?character=${handle}`)} icon={<Sparkles color={colors.violet} size={21} />} />
    </View>

    {catchUpEvents.length ? <>
      <SectionHeader title="While you were away" />
      <GlassCard style={styles.catchUpCard}>
        {catchUpEvents.map((event, index) => <View key={event.id}>
          {index ? <View style={styles.rule} /> : null}
          <Pressable onPress={() => router.push('/(tabs)/chat-tab')} style={({ pressed }) => [styles.catchUpEvent, pressed && styles.pressed]}>
            <View style={styles.eventDot}><Sparkles size={14} color={colors.rose} /></View>
            <View style={{ flex: 1 }}><Text style={styles.timelineTitle}>{event.title}</Text><Text style={styles.eventSummary}>{event.narrative_summary}</Text></View>
            <Text style={styles.eventTime}>{relativeTime(event.starts_at)}</Text>
          </Pressable>
        </View>)}
      </GlassCard>
    </> : null}

    <SectionHeader title="Today" action="View world" onAction={() => router.push('/(tabs)/worlds')} />
    <GlassCard style={styles.todayCard}>
      {upcomingSchedule.map((item, index) => <View key={`${item.id}-${item.start_minute}`}><TimelineItem icon={<Coffee size={16} color={colors.warm} />} title={item.activity} detail={item.locationName} time={formatScheduleTime(item.startsAt)} />{index < upcomingSchedule.length - 1 || todayPlan || todayDate ? <View style={styles.rule} /> : null}</View>)}
      {todayPlan ? <><TimelineItem icon={<CalendarDays size={16} color={colors.warm} />} title={todayPlan.title} detail={snapshot.locations.find((item) => item.id === todayPlan.location_id)?.name ?? currentWorld?.name ?? 'Current place'} time={new Date(todayPlan.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} />{todayDate ? <View style={styles.rule} /> : null}</> : null}
      {todayDate ? <TimelineItem icon={<CalendarDays size={16} color={colors.violet} />} title={todayDate.together_date_templates.name} detail={todayDate.scheduled_for ? new Date(todayDate.scheduled_for).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Ready when you are'} time="DATE" /> : null}
      {!upcomingSchedule.length && !todayDate && !todayPlan ? <Text style={styles.emptySchedule}>Nothing else is scheduled right now. The day is still unfolding.</Text> : null}
    </GlassCard>

    <SectionHeader title="Recent moments" action="View all" onAction={() => router.push('/(tabs)/moments')} />
    {life.moments.length ? <MomentCarousel moments={life.moments} onPress={() => router.push('/(tabs)/moments')} /> : <Pressable onPress={() => router.push('/(tabs)/chat-tab')} style={styles.storyEmpty}><Sparkles size={18} color={colors.rose} /><View style={{ flex: 1 }}><Text style={styles.storyTitle}>Your story with {name} is just beginning</Text><Text style={styles.storyCopy}>The moments that matter between you will collect here.</Text></View><ChevronRight color={colors.muted} size={18} /></Pressable>}

    <SectionHeader title={latestSourceTitle} />
    <MessagePreview content={latest} time={latestProactive ? relativeTime(latestProactive.eligible_at ?? new Date().toISOString()) : `At ${location}`} onPress={() => void openCompanion()} />
  </Screen>;
}

function HomeHero({ companion, relationshipDay, stage, location, notice, actionLabel, onAction, onProfile, onLocation, onActivity }: { companion: CharacterInstance; relationshipDay: number; stage: string; location: string; notice: string | null; actionLabel: string; onAction: () => void; onProfile: () => void; onLocation: () => void; onActivity: () => void }) {
  const template = companion.together_character_templates;
  const asset = characterAssets[template.slug];
  return <View style={styles.hero}>
    {asset ? <Image source={asset} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" /> : <View style={[StyleSheet.absoluteFill, styles.heroFallback]}><Text style={styles.heroFallbackText}>{template.name[0]}</Text></View>}
    <View pointerEvents="none" style={styles.heroWash} />
    <View pointerEvents="none" style={styles.heroScrimSoft} />
    <View pointerEvents="none" style={styles.heroScrimDeep} />
    <View style={styles.heroContent}>
      <View style={styles.heroTopRow}>
        <CompanionSwitcher active={companion} variant="overlay" />
        <View style={styles.dayPill}><View style={styles.dayDot} /><Text style={styles.dayPillText}>DAY {relationshipDay} · {stage.toUpperCase()}</Text></View>
      </View>
      <View style={styles.heroBottom}>
        {notice ? <View style={styles.heroNotice}><Sparkles size={13} color="#FFD5E3" /><Text numberOfLines={1} style={styles.heroNoticeText}>{notice}</Text></View> : null}
        <Pressable accessibilityLabel={`View ${template.name}'s profile`} onPress={onProfile}><Text style={styles.heroName}>{template.name}</Text></Pressable>
        <MoodBadge mood={companion.current_mood} />
        <Pressable onPress={onLocation} style={({ pressed }) => [styles.heroLocation, pressed && styles.heroRowPressed]}><MapPin size={16} color="#F1B28F" /><Text style={styles.heroLocationText}>{location}</Text><ChevronRight size={15} color="rgba(255,255,255,.68)" /></Pressable>
        <Pressable onPress={onActivity} style={({ pressed }) => [styles.heroActivity, pressed && styles.heroRowPressed]}><Text numberOfLines={1} style={styles.heroActivityText}>{sentence(companion.current_activity)}</Text><ChevronRight size={15} color="rgba(255,255,255,.62)" /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onAction} style={({ pressed }) => [styles.heroAction, pressed && styles.heroActionPressed]}><MessageCircle size={18} color="#fff" /><Text style={styles.heroActionText}>{actionLabel}</Text></Pressable>
      </View>
    </View>
  </View>;
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

function TimelineItem({ icon, title, detail, time }: { icon: React.ReactNode; title: string; detail: string; time: string }) {
  return <View style={styles.timelineItem}><View style={styles.timelineIcon}>{icon}</View><View style={{ flex: 1 }}><Text style={styles.timelineTitle}>{title}</Text><Text style={styles.timelineDetail}>{detail}</Text></View><Text style={styles.time}>{time}</Text></View>;
}

function labelStage(stage: string) {
  const labels: Record<string, string> = { stranger: 'Just met', acquaintance: 'Getting acquainted', friend: 'Getting closer', flirting: 'There’s a spark', dating: 'Dating', exclusive: 'Exclusive', long_term: 'Building a life' };
  return labels[stage] ?? 'Getting closer';
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 2) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}
function sentence(value: string) { return value ? value[0]!.toUpperCase() + value.slice(1) : value; }
function lowerFirst(value: string) { return value ? value[0]!.toLowerCase() + value.slice(1) : value; }

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 154 },
  emptyLife: { flex: 1, justifyContent: 'center', gap: spacing.lg },
  top: { minHeight: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  topActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 7, flexShrink: 1 },
  brand: { color: colors.rose, fontFamily: 'Georgia', fontSize: 20, fontWeight: '700' },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  creditChip: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 6, paddingRight: 8, borderRadius: radius.pill, backgroundColor: 'rgba(37,26,41,.94)', borderWidth: 1, borderColor: 'rgba(232,93,140,.27)', shadowColor: '#9B63D7', shadowOpacity: .14, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
  creditChipPressed: { opacity: .82, transform: [{ scale: .97 }] },
  creditDot: { width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(233,160,127,.10)' },
  creditValue: { color: colors.text, fontSize: 10, fontWeight: '900' },
  creditAdd: { color: '#F4BDD0', fontSize: 8, fontWeight: '900' },
  tierPill: { paddingHorizontal: 5, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: 'rgba(232,93,140,.16)' },
  tierPillMax: { backgroundColor: 'rgba(154,99,215,.19)' },
  tierPillText: { color: '#EACBDB', fontSize: 7, fontWeight: '900', letterSpacing: .5 },
  pressed: { transform: [{ scale: .96 }], opacity: .82 },

  hero: { height: 372, borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(248,241,234,.16)', backgroundColor: colors.elevated, shadowColor: '#000', shadowOpacity: .28, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
  heroFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#30203B' },
  heroFallbackText: { fontFamily: 'Georgia', fontSize: 128, color: 'rgba(248,241,234,.28)' },
  heroWash: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(8,7,12,.08)' },
  heroScrimSoft: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '58%', backgroundColor: 'rgba(7,6,11,.42)' },
  heroScrimDeep: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '34%', backgroundColor: 'rgba(6,5,10,.56)' },
  heroContent: { flex: 1, justifyContent: 'space-between', padding: 14 },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  dayPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: 'rgba(8,8,14,.58)', borderWidth: 1, borderColor: 'rgba(255,255,255,.16)' },
  dayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.rose },
  dayPillText: { color: '#F8EAF0', fontSize: 8, fontWeight: '900', letterSpacing: .7 },
  heroBottom: { gap: 8 },
  heroNotice: { maxWidth: '90%', alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: 'rgba(232,93,140,.76)' },
  heroNoticeText: { flexShrink: 1, color: '#fff', fontSize: 10, fontWeight: '900' },
  heroName: { color: '#fff', fontFamily: 'Georgia', fontSize: 38, lineHeight: 42, fontWeight: '600', textShadowColor: 'rgba(0,0,0,.72)', textShadowRadius: 12 },
  heroLocation: { alignSelf: 'flex-start', maxWidth: '100%', minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroLocationText: { flexShrink: 1, color: '#fff', fontSize: 14, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 7 },
  heroActivity: { alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 5, paddingRight: 5 },
  heroActivityText: { flexShrink: 1, color: 'rgba(255,255,255,.88)', fontSize: 12, lineHeight: 17, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 6 },
  heroRowPressed: { opacity: .74 },
  heroAction: { minHeight: 46, marginTop: 2, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, backgroundColor: 'rgba(232,93,140,.94)', borderWidth: 1, borderColor: 'rgba(255,255,255,.18)', shadowColor: colors.rose, shadowOpacity: .24, shadowRadius: 14, shadowOffset: { width: 0, height: 7 } },
  heroActionPressed: { transform: [{ scale: .988 }], opacity: .9 },
  heroActionText: { color: '#fff', fontSize: 14, fontWeight: '900' },

  actions: { flexDirection: 'row', gap: 9 },
  catchUpCard: { paddingVertical: 5 },
  catchUpEvent: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingVertical: 11 },
  eventDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(241,103,154,.10)', alignItems: 'center', justifyContent: 'center' },
  eventSummary: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  eventTime: { color: colors.dimmed, fontSize: 10, fontWeight: '800', paddingTop: 2 },
  todayCard: { paddingVertical: 8 },
  timelineItem: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10 },
  timelineIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.elevated, alignItems: 'center', justifyContent: 'center' },
  timelineTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  timelineDetail: { color: colors.muted, fontSize: 11, marginTop: 2 },
  time: { color: colors.dimmed, fontSize: 10, fontWeight: '800' },
  emptySchedule: { color: colors.muted, fontSize: 12, lineHeight: 18, paddingVertical: 10 },
  rule: { height: 1, marginLeft: 43, backgroundColor: colors.border },
  storyEmpty: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(241,103,154,.08)', borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(241,103,154,.20)', padding: spacing.md },
  storyTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  storyCopy: { color: colors.muted, fontSize: 12, marginTop: 3 },
});
