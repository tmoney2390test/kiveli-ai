import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router as expoRouter } from 'expo-router';
import { CalendarDays, ChevronRight, Coffee, Heart, Sparkles, UserRound } from 'lucide-react-native';
import { ActionTile, CharacterHero, CompanionSwitcher, EmptyState, ErrorState, GlassCard, GradientButton, LoadingSkeleton, MessagePreview, MomentCarousel, Screen, SectionHeader } from '../../src/components';
import { colors, radius, spacing } from '../../src/theme';
import { useTogether } from '../../src/store/useTogether';
import { markProactiveOpened } from '../../src/lib/api';
import { buildCompanionLife, formatScheduleTime } from '../../src/lib/companionLife';
import { worldForLocation } from '../../src/lib/place';

const router=expoRouter as unknown as {push:(href:string)=>void};

export default function Home() {
  const { snapshot, loading, error, refresh } = useTogether();
  if (loading && !snapshot) return <LoadingSkeleton />;
  if (error && !snapshot) return <ErrorState message={error} onRetry={() => void refresh()} />;
  if (!snapshot) return <EmptyState title="Opening your world" body="Your companion and first conversation are being prepared automatically." />;

  const life = buildCompanionLife(snapshot);
  if (!life) return <Screen contentStyle={styles.emptyLife}><EmptyState title={`Start ${snapshot.activePersona?.display_name ?? 'your'}'s Kivelle Life`} body="Meet an official companion or create someone original. This Life will keep its own relationships, memories, plans, and history."/><GradientButton label="Choose who to meet" onPress={()=>router.push('/(tabs)/singles')}/></Screen>;
  const { companion, relationshipDay, location: currentLocation, recentEvents, upcomingSchedule, proactiveMessages, dates } = life;
  const name = companion.together_character_templates.name;
  const currentWorld=worldForLocation(snapshot,companion.current_location_id);const location = currentLocation?.name ?? currentWorld?.name ?? 'Current place';
  const relationshipCue = snapshot.relationshipCues?.[companion.id];
  const pendingMilestone = snapshot.relationshipMilestones?.find((item) => item.character_instance_id === companion.id);
  const latestProactive = proactiveMessages[0];
  const latest = latestProactive?.content ?? recentEvents[0]?.narrative_summary ?? `${name} is waiting to hear how your day is going.`;
  const latestSourceTitle=latestProactive?`New from ${name}`:recentEvents[0]?`${name}'s day`:'Continue your conversation';
  const catchUpEvents = recentEvents.filter((event) => Date.now() - new Date(event.starts_at).getTime() < 72 * 3600000).slice(0, 2);
  const date = dates[0];
  const plannedDate = dates.find((item) => ['active', 'upcoming', 'unlocked', 'deferred'].includes(item.status));
  const sharedPlan = (snapshot.sharedPlans??[]).filter((plan)=>plan.character_instance_id===companion.id&&(plan.status==='active'||plan.status==='scheduled'&&new Date(plan.starts_at).getTime()>Date.now())).sort((left,right)=>new Date(left.starts_at).getTime()-new Date(right.starts_at).getTime())[0];
  const openCompanion = async () => {
    if (latestProactive?.status === 'sent') await markProactiveOpened(latestProactive.id).catch(() => undefined);
    router.push('/(tabs)/chat-tab');
  };

  return <Screen contentStyle={styles.content}>
    <View style={styles.top}>
      <View style={{gap:8}}><Text style={styles.brand}>Kivelle.AI</Text><CompanionSwitcher active={companion}/><View style={styles.dayLine}><View style={styles.liveDot} /><Text style={styles.context}>Day {relationshipDay} · {labelStage(companion.relationship_stage)}</Text></View></View>
      <Pressable accessibilityLabel="Open your settings" onPress={() => router.push('/settings')} style={({ pressed }) => [styles.icon, pressed && styles.pressed]}><UserRound color={colors.text} size={20} /></Pressable>
    </View>

    <CharacterHero character={companion} location={location} onPress={() => router.push(`/character/${companion.together_character_templates.slug}` as never)} />
    <GradientButton label={`Talk to ${name}`} onPress={() => router.push('/(tabs)/chat-tab')} />

    {relationshipCue ? <Pressable onPress={() => router.push('/(tabs)/chat-tab')} style={({pressed})=>[styles.relationshipCue,pressed&&styles.pressed]}><View style={[styles.relationshipIcon,relationshipCue.tone==='tense'&&styles.relationshipIconTense]}><Heart size={18} color={relationshipCue.tone==='tense'?colors.warm:colors.rose}/></View><View style={{flex:1}}><Text style={styles.relationshipLabel}>{relationshipCue.label}</Text><Text style={styles.relationshipDetail}>{pendingMilestone?pendingMilestone.title:relationshipCue.detail}</Text></View>{pendingMilestone?<View style={styles.choicePill}><Text style={styles.choicePillText}>Your choice</Text></View>:<ChevronRight size={18} color={colors.muted}/>}</Pressable> : null}

    <View style={styles.actions}>
      <ActionTile title={plannedDate?.status === 'active' ? 'Continue date' : sharedPlan ? sharedPlan.status==='active'?`Together now · ${sharedPlan.title}`:`${new Date(sharedPlan.starts_at).toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'})} · ${sharedPlan.title}` : 'Plan something'} onPress={() => plannedDate?.status==='active' ? router.push(`/date/${plannedDate.id}` as never) : sharedPlan ? router.push(`/plan/${sharedPlan.id}` as never) : router.push('/(tabs)/chat-tab?plan=1')} icon={<CalendarDays color={colors.warm} size={21} />} />
      <ActionTile title="Memories" onPress={() => router.push('/memories')} icon={<Sparkles color={colors.violet} size={21} />} />
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
      {upcomingSchedule.map((item, index) => <View key={`${item.id}-${item.start_minute}`}><TimelineItem icon={<Coffee size={16} color={colors.warm} />} title={item.activity} detail={item.locationName} time={formatScheduleTime(item.startsAt)} />{index < upcomingSchedule.length - 1 ? <View style={styles.rule} /> : null}</View>)}
      {sharedPlan ? <><View style={upcomingSchedule.length ? styles.rule : undefined}/><TimelineItem icon={<CalendarDays size={16} color={colors.warm}/>} title={sharedPlan.title} detail={snapshot.locations.find((item)=>item.id===sharedPlan.location_id)?.name??currentWorld?.name??'Current place'} time={new Date(sharedPlan.starts_at).toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})}/></> : null}
      {date ? <><View style={upcomingSchedule.length ? styles.rule : undefined} /><TimelineItem icon={<CalendarDays size={16} color={colors.violet} />} title={date.together_date_templates.name} detail={date.status === 'locked' ? 'Keep getting closer to unlock it' : date.scheduled_for ? new Date(date.scheduled_for).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}) : 'Ready when you are'} time={date.status === 'locked' ? 'LOCKED' : 'PLAN'} /></> : null}
      {!upcomingSchedule.length && !date && !sharedPlan ? <Text style={styles.emptySchedule}>Nothing else is scheduled right now. The day is still unfolding.</Text> : null}
    </GlassCard>

    <SectionHeader title="Recent moments" action="View all" onAction={() => router.push('/(tabs)/moments')} />
    {life.moments.length ? <MomentCarousel moments={life.moments} onPress={() => router.push('/(tabs)/moments')} /> : <Pressable onPress={() => router.push('/(tabs)/chat-tab')} style={styles.storyEmpty}><Sparkles size={18} color={colors.rose} /><View style={{ flex: 1 }}><Text style={styles.storyTitle}>Your story with {name} is just beginning</Text><Text style={styles.storyCopy}>The moments that matter between you will collect here.</Text></View><ChevronRight color={colors.muted} size={18} /></Pressable>}

    <SectionHeader title={latestSourceTitle} />
    <MessagePreview content={latest} time={latestProactive ? relativeTime(latestProactive.eligible_at ?? new Date().toISOString()) : `At ${location}`} onPress={() => void openCompanion()} />
  </Screen>;
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

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  emptyLife:{flex:1,justifyContent:'center',gap:spacing.lg},
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayLine: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.rose },
  context: { color: colors.rose, fontSize: 13, fontWeight: '700' },
  brand: { color: colors.rose, fontFamily: 'Georgia', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  pressed: { transform: [{ scale: .94 }], opacity: .8 },
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
  emptySchedule:{color:colors.muted,fontSize:12,lineHeight:18,paddingVertical:10},
  rule: { height: 1, marginLeft: 43, backgroundColor: colors.border },
  storyEmpty: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(241,103,154,.08)', borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(241,103,154,.20)', padding: spacing.md },
  storyTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  storyCopy: { color: colors.muted, fontSize: 12, marginTop: 3 },
  relationshipCue:{flexDirection:'row',alignItems:'center',gap:11,padding:13,borderRadius:radius.lg,backgroundColor:'rgba(241,103,154,.07)',borderWidth:1,borderColor:'rgba(241,103,154,.18)'},
  relationshipIcon:{width:38,height:38,borderRadius:19,backgroundColor:'rgba(241,103,154,.12)',alignItems:'center',justifyContent:'center'},
  relationshipIconTense:{backgroundColor:'rgba(242,162,127,.12)'},
  relationshipLabel:{color:colors.text,fontSize:13,fontWeight:'900'},
  relationshipDetail:{color:colors.muted,fontSize:11,lineHeight:16,marginTop:2},
  choicePill:{paddingHorizontal:9,paddingVertical:6,borderRadius:radius.pill,backgroundColor:colors.rose},
  choicePillText:{color:'#fff',fontSize:9,fontWeight:'900'},
});
