import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ArrowUpRight, CalendarDays, LockKeyhole, Palmtree, Plus, Sparkles, UserRound } from 'lucide-react-native';
import { EmptyState, LoadingSkeleton, PageTitle, Screen, SectionHeader, SpiceBadge } from '../../src/components';
import { CompanionGenderToggle, useCompanionGenderPreference } from '../../src/components/CompanionGenderToggle';
import { CompanionPortraitCard } from '../../src/components/CompanionPortraitCard';
import { listCreatorDrafts, setCharacterFavorite } from '../../src/lib/api';
import { companionGenderFromSignals, featuredCompanionGender, type FeaturedGenderFilter } from '../../src/lib/featuredCompanions';
import { characterCatalogForWorld } from '../../src/lib/place';
import { useTogether } from '../../src/store/useTogether';
import { colors, radius } from '../../src/theme';
import type { CreatorDraft, Snapshot } from '../../src/types';

type Tab = 'People' | 'Experiences';
const stageOrder = ['stranger', 'acquaintance', 'friend', 'flirting', 'dating', 'exclusive', 'long_term'];
const creatorSteps = ['identity', 'appearance', 'personality', 'life', 'connection', 'meeting', 'review'] as const;

export default function Discover() {
  const snapshot = useTogether((state) => state.snapshot);
  const { world: worldSlug } = useLocalSearchParams<{world?: string}>();
  const [tab, setTab] = useState<Tab>('People');
  const [gender, setGender] = useCompanionGenderPreference();
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
  const selectedWorld = worldSlug ? snapshot.worlds.find((world) => world.slug === worldSlug) : undefined;
  if (worldSlug && !selectedWorld) return <EmptyState title="That world is unavailable" body="Choose a published world from Explore to meet its residents." />;
  return <Screen>
    {selectedWorld ? <Pressable accessibilityRole="button" accessibilityLabel={`Back to Explore in ${selectedWorld.name}`} onPress={() => router.replace(`/(tabs)/explore?world=${selectedWorld.slug}` as never)} style={({ pressed }) => [styles.backToExplore, pressed && styles.backToExplorePressed]}><ArrowLeft size={17} color={colors.rose} /><Text style={styles.backToExploreText}>Back to Explore</Text></Pressable> : null}
    <View>
      <PageTitle>Discover</PageTitle>
      <Text style={styles.subtitle}>{selectedWorld ? `Meet every available character who calls ${selectedWorld.name} home.` : 'Meet someone new, or find something meaningful to do together.'}</Text>
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
      ? <><CompanionGenderToggle value={gender} onChange={setGender} /><People snapshot={snapshot} drafts={drafts} draftsLoading={draftsLoading} worldId={selectedWorld?.id} gender={gender} /></>
      : <Experiences snapshot={snapshot} />}
  </Screen>;
}

function People({ snapshot, drafts, draftsLoading, worldId, gender }: { snapshot: Snapshot; drafts: CreatorDraft[]; draftsLoading: boolean; worldId?: string; gender: FeaturedGenderFilter }) {
  const { width } = useWindowDimensions();
  const legacyDraftIds = useMemo(() => new Set(drafts.map((draft) => draft.legacy_template_id).filter(Boolean)), [drafts]);
  const worldCharacterIds = useMemo(() => worldId ? new Set(characterCatalogForWorld(snapshot, worldId).map((entry) => entry.template.id)) : null, [snapshot, worldId]);
  const worldDrafts = worldId ? drafts.filter((draft) => draft.world_id === worldId) : drafts;
  const visibleDrafts = worldDrafts.filter((draft) => gender === 'any' || companionGenderFromSignals(draft.identity_config.pronouns, draft.identity_config.biography, draft.appearance_config) === gender);
  const creations = (snapshot.discoverableCharacters ?? []).filter((item) => Boolean(item.creator_id) && !legacyDraftIds.has(item.id) && (!worldCharacterIds || worldCharacterIds.has(item.id))).filter((item) => gender === 'any' || featuredCompanionGender(item) === gender);
  const official = (snapshot.discoverableCharacters ?? []).filter((item) => !item.creator_id && (!worldCharacterIds || worldCharacterIds.has(item.id))).filter((item) => gender === 'any' || featuredCompanionGender(item) === gender);
  const contentWidth = Math.max(280, Math.min(width, 840) - 40);
  const columns = width >= 720 ? 2 : 1;
  const cardWidth = Math.floor((contentWidth - (columns - 1) * 12) / columns);
  const cardHeight = columns === 2 ? 430 : Math.max(410, Math.min(480, Math.round(cardWidth * 1.24)));
  if (!official.length && !creations.length && !visibleDrafts.length && !draftsLoading) {
    const worldName = snapshot.worlds.find((world) => world.id === worldId)?.name;
    return <EmptyState title={gender === 'any' ? 'New people are on the way' : `No ${gender} companions here yet`} body={gender === 'any' ? 'Your current relationships are still waiting on Home.' : `Try Any to see everyone${worldName ? ` available in ${worldName}` : ''}.`} />;
  }
  return <>
    {visibleDrafts.length || creations.length || draftsLoading ? <>
      <SectionHeader title="Your creations" action={`${visibleDrafts.length + creations.length}`} />
      <View style={styles.stack}>
        {draftsLoading && !visibleDrafts.length ? <DraftSkeleton /> : null}
        {visibleDrafts.map((draft) => <DraftPerson key={draft.id} draft={draft} />)}
        {creations.length ? <View style={styles.peopleGrid}>{creations.map((template) => <Person key={template.id} template={template} snapshot={snapshot} width={cardWidth} height={cardHeight} />)}</View> : null}
      </View>
    </> : null}
    <SectionHeader title="People you might connect with" />
    <View style={styles.peopleGrid}>{official.map((template) => <Person key={template.id} template={template} snapshot={snapshot} width={cardWidth} height={cardHeight} />)}</View>
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
      <SpiceBadge level={draft.connection_config.spiceLevel} overlay compact />
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

function Person({ template, snapshot, width, height }: { template: Snapshot['discoverableCharacters'][number]; snapshot: Snapshot; width: number; height: number }) {
  const setCoreState = useTogether((state) => state.setCoreState);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const instance = snapshot.characters.find((item) => item.character_template_id === template.id);
  const active = instance?.id === snapshot.activeContinuity?.active_companion_instance_id;
  const established = Boolean(instance?.contact_added_at || instance?.introduced_at);
  const action = active ? `Continue with ${template.name}` : established ? 'View your relationship' : `Meet ${template.name}`;
  const worldId = instance ? snapshot.locations.find((item) => item.id === instance.current_location_id)?.world_id : template.first_meeting?.world_id;
  const world = snapshot.worlds.find((item) => item.id === worldId)?.name ?? 'Available world';
  const handle = template.public_handle ?? template.slug;
  const favorite = (snapshot.favoriteCharacterTemplateIds ?? []).includes(template.id);
  const toggleFavorite = async () => {
    if (savingFavorite) return;
    const previous = snapshot.favoriteCharacterTemplateIds ?? [];
    const next = favorite ? previous.filter((id) => id !== template.id) : [...new Set([...previous, template.id])];
    setSavingFavorite(true);
    setCoreState({ favoriteCharacterTemplateIds: next });
    try {
      const result = await setCharacterFavorite(template.id, !favorite, 'discover');
      setCoreState({ favoriteCharacterTemplateIds: result.favoriteCharacterTemplateIds });
    } catch {
      setCoreState({ favoriteCharacterTemplateIds: previous });
    } finally {
      setSavingFavorite(false);
    }
  };
  return <CompanionPortraitCard companion={template} width={width} height={height} favorite={favorite} favoriteBusy={savingFavorite} subtitle={`${template.occupation} · ${world}`} actionLabel={action} onFavorite={() => void toggleFavorite()} onPress={() => router.push(`/character/${handle}` as never)} />;
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
  backToExplore: { alignSelf: 'flex-start', minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderBright, backgroundColor: colors.surface },
  backToExplorePressed: { opacity: .72, transform: [{ scale: .98 }] },
  backToExploreText: { color: colors.rose, fontSize: 11, fontWeight: '900' },
  subtitle: { color: colors.muted, marginTop: 5, lineHeight: 19 },
  create: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: colors.violet },
  createTitle: { color: '#fff', fontFamily: 'Georgia', fontSize: 20 }, createCopy: { color: 'rgba(255,255,255,.78)', fontSize: 11, marginTop: 2 },
  tabs: { flexDirection: 'row', gap: 7, padding: 4, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  tab: { flex: 1, minHeight: 40, justifyContent: 'center', alignItems: 'center', borderRadius: radius.sm }, tabSelected: { backgroundColor: colors.rose }, tabText: { color: colors.muted, fontSize: 12, fontWeight: '800' }, tabTextSelected: { color: '#fff' },
  stack: { gap: 10 }, person: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 13, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  peopleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, personName: { flex:1,fontFamily: 'Georgia', fontSize: 21, color: colors.text }, personMeta: { color: colors.rose, fontSize: 11, fontWeight: '700', marginTop: 2 }, summary: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 5 }, action: { color: colors.rose, fontSize: 11, fontWeight: '900', marginTop: 7 },
  draftPortrait: { width: 76, height: 90, borderRadius: radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.elevated }, draftBadge: { position: 'absolute', left: 5, bottom: 5, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(8,11,19,.82)' }, draftBadgeText: { color: '#fff', fontSize: 7, fontWeight: '900', letterSpacing: .7 },
  progressTrack: { height: 3, marginTop: 9, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.border }, progressFill: { height: 3, backgroundColor: colors.rose }, progressMeta: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }, stepCopy: { color: colors.dimmed, fontSize: 8, textTransform: 'capitalize' },
  skeleton: { opacity: .65 }, skeletonLine: { height: 9, borderRadius: 5, backgroundColor: colors.elevated },
  experience: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, locked: { opacity: .68 }, icon: { width: 43, height: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.elevated }, kicker: { color: colors.rose, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, experienceTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 20, marginTop: 3 }, pressed: { opacity: .86, transform: [{ scale: .985 }] },
});
