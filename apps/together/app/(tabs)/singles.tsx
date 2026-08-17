import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ArrowUpRight, CalendarDays, LockKeyhole, Palmtree, Plus, Sparkles, UserRound } from 'lucide-react-native';
import { CharacterAvatar, EmptyState, LoadingSkeleton, PageTitle, Screen, SectionHeader } from '../../src/components';
import { listCreatorDrafts } from '../../src/lib/api';
import { selectPortraitVersion } from '../../src/lib/selectors';
import { useTogether } from '../../src/store/useTogether';
import { colors, radius } from '../../src/theme';
import type { CreatorDraft, Snapshot } from '../../src/types';

type Tab = 'People' | 'Experiences';
const stageOrder = ['stranger', 'acquaintance', 'friend', 'flirting', 'dating', 'exclusive', 'long_term'];
const creatorSteps = ['identity', 'appearance', 'personality', 'life', 'connection', 'meeting', 'review'] as const;

export default function Discover() {
  const snapshot = useTogether((state) => state.snapshot);
  const [tab, setTab] = useState<Tab>('People');
  const [drafts, setDrafts] = useState<CreatorDraft[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);

  const loadDrafts = useCallback(async () => {
    setDraftsLoading(true);
    try {
      const result = await listCreatorDrafts();
      setDrafts(result.drafts.filter((draft) => draft.status !== 'archived' && draft.status !== 'finalized'));
    } catch {
      // Discover remains useful when the optional draft endpoint is unavailable.
    } finally {
      setDraftsLoading(false);
    }
  }, []);

  useEffect(() => { void loadDrafts(); }, [loadDrafts]);

  if (!snapshot) return <LoadingSkeleton label="Curating people and experiences…" />;
  return <Screen>
    <View>
      <PageTitle>Discover</PageTitle>
      <Text style={styles.subtitle}>Meet someone new, or find something meaningful to do together.</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Create someone" onPress={() => router.push('/create/companion')} style={styles.create}>
      <Sparkles size={19} color="#fff" />
      <View style={{ flex: 1 }}>
        <Text style={styles.createTitle}>Create someone</Text>
        <Text style={styles.createCopy}>Create a person with a real identity, routine, home, and first meeting.</Text>
      </View>
      <Plus size={19} color="#fff" />
    </Pressable>
    <View style={styles.tabs}>
      {(['People', 'Experiences'] as const).map((item) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabSelected]}><Text style={[styles.tabText, tab === item && styles.tabTextSelected]}>{item}</Text></Pressable>)}
    </View>
    {tab === 'People'
      ? <People snapshot={snapshot} drafts={drafts} draftsLoading={draftsLoading} />
      : <Experiences snapshot={snapshot} />}
  </Screen>;
}

function People({ snapshot, drafts, draftsLoading }: { snapshot: Snapshot; drafts: CreatorDraft[]; draftsLoading: boolean }) {
  const legacyDraftIds = useMemo(() => new Set(drafts.map((draft) => draft.legacy_template_id).filter(Boolean)), [drafts]);
  const creations = (snapshot.discoverableCharacters ?? []).filter((item) => Boolean(item.creator_id) && !legacyDraftIds.has(item.id));
  const official = (snapshot.discoverableCharacters ?? []).filter((item) => !item.creator_id);
  if (!official.length && !creations.length && !drafts.length && !draftsLoading) return <EmptyState title="New people are on the way" body="Your current relationships are still waiting on Home." />;
  return <>
    {drafts.length || creations.length || draftsLoading ? <>
      <SectionHeader title="Your creations" action={`${drafts.length + creations.length}`} />
      <View style={styles.stack}>
        {draftsLoading && !drafts.length ? <DraftSkeleton /> : null}
        {drafts.map((draft) => <DraftPerson key={draft.id} draft={draft} />)}
        {creations.map((template) => <Person key={template.id} template={template} snapshot={snapshot} />)}
      </View>
    </> : null}
    <SectionHeader title="People you might connect with" />
    <View style={styles.stack}>{official.map((template) => <Person key={template.id} template={template} snapshot={snapshot} />)}</View>
  </>;
}

function DraftPerson({ draft }: { draft: CreatorDraft }) {
  const identity = draft.identity_config;
  const currentIndex = Math.max(0, creatorSteps.indexOf(draft.current_step));
  const percent = Math.round(((currentIndex + 1) / creatorSteps.length) * 100);
  const world = draft.world?.name ?? 'Kivelle';
  return <Pressable accessibilityRole="button" accessibilityLabel={`Continue creating ${identity.name}`} onPress={() => router.push(`/create/companion/${draft.id}` as never)} style={({ pressed }) => [styles.person, pressed && styles.pressed]}>
    <View style={styles.draftPortrait}>
      {draft.portraitUrl ? <Image source={{ uri: draft.portraitUrl }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" /> : <UserRound size={28} color={colors.rose} />}
      <View style={styles.draftBadge}><Text style={styles.draftBadgeText}>DRAFT</Text></View>
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.personName}>{identity.name || 'New companion'}{identity.age ? `, ${identity.age}` : ''}</Text>
      <Text style={styles.personMeta}>{identity.occupation || 'Identity in progress'} · {world}</Text>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${percent}%` }]} /></View>
      <View style={styles.progressMeta}><Text style={styles.action}>Continue creating</Text><Text style={styles.stepCopy}>{draft.current_step.replace('_', ' ')} · {percent}%</Text></View>
    </View>
    <ArrowUpRight size={18} color={colors.rose} />
  </Pressable>;
}

function DraftSkeleton() {
  return <View style={styles.person}><View style={[styles.draftPortrait, styles.skeleton]} /><View style={{ flex: 1, gap: 8 }}><View style={[styles.skeletonLine, { width: '44%' }]} /><View style={[styles.skeletonLine, { width: '68%' }]} /></View></View>;
}

function Person({ template, snapshot }: { template: Snapshot['discoverableCharacters'][number]; snapshot: Snapshot }) {
  const instance = snapshot.characters.find((item) => item.character_template_id === template.id);
  const active = instance?.id === snapshot.activeContinuity?.active_companion_instance_id;
  const established = Boolean(instance?.contact_added_at || instance?.introduced_at);
  const action = active ? `Continue with ${template.name}` : established ? 'View your relationship' : `Meet ${template.name}`;
  const worldId = instance ? snapshot.locations.find((item) => item.id === instance.current_location_id)?.world_id : template.first_meeting?.world_id;
  const world = snapshot.worlds.find((item) => item.id === worldId)?.name ?? 'Available world';
  const handle = template.public_handle ?? template.slug;
  const portraitVersion = instance ? selectPortraitVersion(snapshot, instance) : template.together_character_versions;
  return <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={() => router.push(`/character/${handle}` as never)} style={({ pressed }) => [styles.person, pressed && styles.pressed]}>
    <CharacterAvatar slug={template.slug} name={template.name} template={template} version={portraitVersion} size={76} />
    <View style={{ flex: 1 }}>
      <Text style={styles.personName}>{template.name}, {template.age}</Text>
      <Text style={styles.personMeta}>{template.occupation} · {world}</Text>
      <Text style={styles.summary} numberOfLines={2}>{template.biography}</Text>
      <Text style={styles.interests}>{(template.together_character_versions?.interests ?? []).slice(0, 3).join(' · ')}</Text>
      <Text style={styles.action}>{action}</Text>
    </View>
    <ArrowUpRight size={18} color={colors.rose} />
  </Pressable>;
}

function Experiences({ snapshot }: { snapshot: Snapshot }) {
  const active = snapshot.characters.find((item) => item.id === snapshot.activeContinuity?.active_companion_instance_id);
  const stage = stageOrder.indexOf(active?.relationship_stage ?? 'stranger');
  return <>
    <SectionHeader title="Dates and shared experiences" />
    <View style={styles.stack}>
      {snapshot.dates.filter((item) => !active || item.character_instance_id === active.id).map((date) => {
        const locked = date.status === 'locked';
        return <Pressable key={date.id} disabled={locked} onPress={() => router.push(`/date/${date.id}` as never)} style={[styles.experience, locked && styles.locked]}>
          <View style={styles.icon}><CalendarDays size={21} color={colors.warm} /></View>
          <View style={{ flex: 1 }}><Text style={styles.kicker}>{locked ? 'GROW CLOSER TO UNLOCK' : date.status === 'completed' ? 'SHARED HISTORY' : 'AVAILABLE'}</Text><Text style={styles.experienceTitle}>{date.together_date_templates.name}</Text><Text style={styles.summary}>{date.together_date_templates.description}</Text></View>
          {locked ? <LockKeyhole size={17} color={colors.dimmed} /> : <ArrowUpRight size={18} color={colors.rose} />}
        </Pressable>;
      })}
      {(snapshot.trips ?? []).map((trip) => {
        const locked = stage < stageOrder.indexOf(trip.min_relationship_stage);
        return <View key={trip.slug} style={[styles.experience, locked && styles.locked]}><View style={styles.icon}><Palmtree size={21} color={colors.violet} /></View><View style={{ flex: 1 }}><Text style={styles.kicker}>{locked ? 'FUTURE EXPERIENCE' : 'COMING SOON'}</Text><Text style={styles.experienceTitle}>{trip.title}</Text><Text style={styles.summary}>{trip.description}</Text></View><LockKeyhole size={17} color={colors.dimmed} /></View>;
      })}
    </View>
  </>;
}

const styles = StyleSheet.create({
  subtitle: { color: colors.muted, marginTop: 5, lineHeight: 19 },
  create: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: colors.violet },
  createTitle: { color: '#fff', fontFamily: 'Georgia', fontSize: 20 }, createCopy: { color: 'rgba(255,255,255,.78)', fontSize: 11, marginTop: 2 },
  tabs: { flexDirection: 'row', gap: 7, padding: 4, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  tab: { flex: 1, minHeight: 40, justifyContent: 'center', alignItems: 'center', borderRadius: radius.sm }, tabSelected: { backgroundColor: colors.rose }, tabText: { color: colors.muted, fontSize: 12, fontWeight: '800' }, tabTextSelected: { color: '#fff' },
  stack: { gap: 10 }, person: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 13, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  personName: { fontFamily: 'Georgia', fontSize: 21, color: colors.text }, personMeta: { color: colors.rose, fontSize: 11, fontWeight: '700', marginTop: 2 }, summary: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 5 }, interests: { color: colors.text, fontSize: 10, marginTop: 5 }, action: { color: colors.rose, fontSize: 11, fontWeight: '900', marginTop: 7 },
  draftPortrait: { width: 76, height: 90, borderRadius: radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.elevated }, draftBadge: { position: 'absolute', left: 5, bottom: 5, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(8,11,19,.82)' }, draftBadgeText: { color: '#fff', fontSize: 7, fontWeight: '900', letterSpacing: .7 },
  progressTrack: { height: 3, marginTop: 9, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.border }, progressFill: { height: 3, backgroundColor: colors.rose }, progressMeta: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }, stepCopy: { color: colors.dimmed, fontSize: 8, textTransform: 'capitalize' },
  skeleton: { opacity: .65 }, skeletonLine: { height: 9, borderRadius: 5, backgroundColor: colors.elevated },
  experience: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, locked: { opacity: .68 }, icon: { width: 43, height: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.elevated }, kicker: { color: colors.rose, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, experienceTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 20, marginTop: 3 }, pressed: { opacity: .86, transform: [{ scale: .985 }] },
});
