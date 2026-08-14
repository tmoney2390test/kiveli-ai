import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { CalendarDays, ChevronRight, Clock3, MapPin, MessageCircle, Sparkles } from 'lucide-react-native';
import { characterAssets } from '../../src/assets';
import { Body, EmptyState, GlassCard, GradientButton, LoadingSkeleton, MediaGallery, MoodBadge, RelationshipBadge, Screen, SectionHeader } from '../../src/components';
import { colors, radius, spacing } from '../../src/theme';
import { useTogether } from '../../src/store/useTogether';
import { buildCompanionLife } from '../../src/lib/companionLife';

export default function CompanionProfile() {
  const snapshot = useTogether((state) => state.snapshot);
  if (!snapshot) return <LoadingSkeleton label="Finding your companion..." />;
  const life = buildCompanionLife(snapshot);
  if (!life) return <EmptyState title="Your companion is waiting" body="Finish your first visit to City Life to meet them." />;

  const { companion, relationshipDay, location, dates, moments, activeStories } = life;
  const template = companion.together_character_templates;
  const portrait = characterAssets[companion.together_character_versions.portrait_asset_key] ?? characterAssets[template.slug];
  const nextDate = dates.find((date) => date.status !== 'completed');
  const activeStory = activeStories[0];
  const companionMedia=(snapshot.generatedMedia??[]).filter((item)=>item.character_instance_id===companion.id);

  return <Screen contentStyle={{ paddingTop: 0 }}>
    <View style={styles.hero}>
      <Image source={portrait} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" accessibilityLabel={`${template.name}'s portrait`} />
      <View style={styles.shade} />
      <View style={styles.heroCopy}>
        <Text style={styles.kicker}>YOUR COMPANION</Text>
        <Text style={styles.name}>{template.name}</Text>
        <Text style={styles.job}>{template.occupation} · {template.age}</Text>
        <View style={styles.badges}><MoodBadge mood={companion.current_mood} /><RelationshipBadge stage={companion.relationship_stage} /></View>
      </View>
    </View>

    <View style={styles.primaryActions}>
      <GradientButton label={`Talk to ${template.name}`} icon={<MessageCircle size={18} color="#fff" />} onPress={() => router.push('/chat')} />
      <Pressable onPress={() => router.push('/chat?plan=1')} style={styles.plan}><CalendarDays size={18} color={colors.warm} /><Text style={styles.planText}>Plan something</Text></Pressable>
    </View>

    <Pressable disabled={!location} onPress={() => location && router.push(`/location/${location.slug}` as never)} accessibilityRole={location ? 'button' : undefined}>
      <GlassCard style={styles.status}>
        <View style={styles.statusIcon}><MapPin size={17} color={colors.warm} /></View>
        <View style={{ flex: 1 }}><Text style={styles.statusLabel}>RIGHT NOW</Text><Text style={styles.statusTitle}>{location?.name ?? 'City Life'}</Text><Text style={styles.statusCopy}>{companion.current_activity}</Text></View>
        {location ? <ChevronRight size={18} color={colors.muted} /> : null}
      </GlassCard>
    </Pressable>

    <SectionHeader title={`About ${template.name}`} />
    <Body muted>{template.biography}</Body>
    <View style={styles.traits}>{companion.together_character_versions.interests.slice(0, 4).map((interest) => <View key={interest} style={styles.trait}><Text style={styles.traitText}>{interest}</Text></View>)}</View>

    <View style={styles.info}>
      <Info icon={<Clock3 size={16} color={colors.violet} />} label="Your connection" value={`Day ${relationshipDay} · ${stageLabel(companion.relationship_stage)}`} />
      <View style={styles.rule} />
      <Info icon={<Sparkles size={16} color={colors.rose} />} label="Shared moments" value={moments.length ? `${moments.length} worth keeping` : 'The first one is waiting'} />
      <View style={styles.rule} />
      <Info icon={<CalendarDays size={16} color={colors.warm} />} label="Next experience" value={nextDate?.status === 'locked' ? `${nextDate.together_date_templates.name} · getting closer` : nextDate?.together_date_templates.name ?? 'Nothing planned yet'} />
    </View>

    <SectionHeader title={`${template.name}'s Gallery`} />
    <MediaGallery media={companionMedia} emptyText={`Photos ${template.name} sends and the ones from your Dates will collect here.`}/>

    {activeStory ? <Pressable onPress={() => router.push(`/story/${activeStory.id}` as never)} style={styles.story}><Text style={styles.statusLabel}>CURRENT STORY</Text><Text style={styles.storyTitle}>{activeStory.together_story_arc_templates?.title ?? 'A story in motion'}</Text><Text style={styles.statusCopy}>See what has unfolded so far.</Text><ChevronRight style={styles.storyChevron} size={18} color={colors.rose} /></Pressable> : null}

    <View style={styles.links}>
      <Pressable onPress={() => router.push('/memories')} style={styles.link}><Text style={styles.linkTitle}>What {template.name} remembers</Text><Text style={styles.linkCopy}>View and control the information that shapes your story.</Text><ChevronRight style={styles.linkChevron} size={19} color={colors.rose} /></Pressable>
      <Pressable onPress={() => router.push('/account')} style={styles.link}><Text style={styles.linkTitle}>Your Kivelle profile</Text><Text style={styles.linkCopy}>Account, privacy, and experience preferences.</Text><ChevronRight style={styles.linkChevron} size={19} color={colors.rose} /></Pressable>
    </View>
  </Screen>;
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <View style={styles.infoRow}><View style={styles.infoIcon}>{icon}</View><View style={{ flex: 1 }}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View></View>; }
function stageLabel(stage: string) { return ({ stranger: 'Just met', acquaintance: 'Getting acquainted', friend: 'Getting closer', flirting: 'There’s a spark', dating: 'Dating', exclusive: 'Exclusive', long_term: 'Building a life' } as Record<string, string>)[stage] ?? 'Getting closer'; }

const styles = StyleSheet.create({
  hero: { height: 415, marginHorizontal: -spacing.lg, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl, overflow: 'hidden', justifyContent: 'flex-end' }, shade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10,9,16,.35)' }, heroCopy: { zIndex: 1, padding: spacing.lg, gap: 5 }, kicker: { color: '#F8D4E0', fontSize: 10, fontWeight: '900', letterSpacing: 1.35 }, name: { fontFamily: 'Georgia', fontSize: 46, color: '#fff', fontWeight: '600' }, job: { color: '#F7E7EC', fontSize: 14 }, badges: { flexDirection: 'row', gap: 8, marginTop: 7 }, primaryActions: { gap: 10, marginTop: spacing.lg }, plan: { height: 48, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, planText: { color: colors.text, fontWeight: '800' }, status: { flexDirection: 'row', alignItems: 'center', gap: 12 }, statusIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(233,160,127,.12)', alignItems: 'center', justifyContent: 'center' }, statusLabel: { color: colors.rose, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, statusTitle: { color: colors.text, fontWeight: '800', fontSize: 15, marginTop: 2 }, statusCopy: { color: colors.muted, fontSize: 12, marginTop: 2 }, traits: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, trait: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.elevated }, traitText: { color: '#E9DDE5', fontSize: 11, fontWeight: '700' }, info: { borderRadius: radius.lg, paddingVertical: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, infoRow: { flexDirection: 'row', gap: 11, alignItems: 'center', padding: 11 }, infoIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.elevated }, infoLabel: { color: colors.muted, fontSize: 11 }, infoValue: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 2 }, rule: { height: 1, backgroundColor: colors.border, marginLeft: 54 }, story: { padding: 14, borderRadius: radius.md, backgroundColor: 'rgba(154,104,255,.08)', borderWidth: 1, borderColor: 'rgba(154,104,255,.2)', position: 'relative' }, storyTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 4 }, storyChevron: { position: 'absolute', right: 14, top: 26 }, links: { gap: 10 }, link: { minHeight: 78, padding: 14, paddingRight: 45, borderRadius: radius.md, backgroundColor: 'rgba(232,93,140,.07)', borderWidth: 1, borderColor: 'rgba(232,93,140,.18)', position: 'relative' }, linkTitle: { color: colors.text, fontSize: 14, fontWeight: '800' }, linkCopy: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 }, linkChevron: { position: 'absolute', right: 14, top: 28 }
});
