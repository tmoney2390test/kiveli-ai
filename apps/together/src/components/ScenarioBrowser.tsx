import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { BookOpen, Check, ChevronRight, LockKeyhole, MapPin, Search, X } from 'lucide-react-native';
import { CreatorModal } from './CreatorPicker';
import { ScenarioArtwork } from './ScenarioArtwork';
import { scenarios, type Scenario } from '../lib/scenarioCatalog';
import { scenarioAvailable, startScenario, type ScenarioSession } from '../lib/scenarios';
import { manageScenario } from '../lib/api';
import { useTogether } from '../store/useTogether';
import { colors } from '../theme';
import { navigateLocalRouteOnWeb } from '../lib/appNavigation';

type ProgressFilter = 'all' | 'continue' | 'completed';
const progressFilters: { value: ProgressFilter; label: string }[] = [
  { value: 'all', label: 'All stories' }, { value: 'continue', label: 'To continue' }, { value: 'completed', label: 'Completed' },
];
const statusLabel = (session?: ScenarioSession) => session?.status === 'active' ? 'In progress' : session?.status === 'paused' ? 'Paused' : session ? 'Completed' : '';

export function ScenarioBrowser({ worldId, gender = 'any', onboarding = false, limit, query: externalQuery }: { worldId: string; gender?: string; onboarding?: boolean; limit?: number; query?: string }) {
  const snapshot = useTogether(s => s.snapshot), scope = snapshot?.activeContinuity?.id;
  const [selected, setSelected] = useState<Scenario | null>(null), [query, setQuery] = useState('');
  const [sessions, setSessions] = useState<ScenarioSession[]>([]), [progress, setProgress] = useState<ProgressFilter>('all');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [loading, setLoading] = useState(!onboarding), [loadError, setLoadError] = useState(false), [reload, setReload] = useState(0);
  const [gridWidth, setGridWidth] = useState(0), [hoveredId, setHoveredId] = useState<string | null>(null);
  const saving = useRef(false), scopeRef = useRef(scope); scopeRef.current = scope;
  useFocusEffect(useCallback(() => {
    let live = true;
    setSessions([]); setSelected(null); setError(''); setLoadError(false); setLoading(!onboarding);
    if (!onboarding) void manageScenario<{ sessions: ScenarioSession[] }>({ action: 'list' })
      .then(r => { if (live) setSessions(r.sessions); })
      .catch(() => { if (live) setLoadError(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [scope, onboarding, reload]));
  if (!snapshot) return null;
  const term = (externalQuery ?? query).trim().toLowerCase();
  const matches = scenarios.filter(s => s.worldId === worldId && (gender === 'any' || gender === 'all' || s.gender === (gender === 'women' || gender === 'woman' ? 'female' : gender === 'men' || gender === 'man' ? 'male' : gender)) && (!term || [s.title, s.leadName, s.locationName, ...s.themes, s.setup].join(' ').toLowerCase().includes(term)));
  const showProgress = !limit && !onboarding;
  const choices = matches.filter(s => {
    const session = sessions.find(p => p.scenario_id === s.id);
    return !showProgress || progress === 'all' || (progress === 'completed' ? session?.status === 'completed' : session && session.status !== 'completed');
  });
  const columns = Math.max(1, Math.min(limit ?? 4, 4, Math.floor((gridWidth + 16) / 286)));
  const cardWidth = gridWidth ? (gridWidth - (columns - 1) * 16) / columns : undefined;
  const existing = selected ? sessions.find(s => s.scenario_id === selected.id) : undefined;
  const available = selected ? scenarioAvailable(selected, snapshot) : false;
  const actionLabel = existing?.status === 'completed' ? 'Reopen scenario' : existing ? 'Continue scenario' : 'Start scenario';
  const start = async () => {
    if (!selected || saving.current || loading) return;
    const currentScope = scopeRef.current; saving.current = true; setBusy(true); setError('');
    try {
      const href = await startScenario(selected, onboarding, existing);
      if (scopeRef.current === currentScope) {
        setSelected(null);
        if (Platform.OS !== 'web' || !navigateLocalRouteOnWeb(href, 'replace')) router.replace(href as never);
      }
    } catch (e) {
      if (scopeRef.current === currentScope) setError(e instanceof Error ? e.message : 'The scenario could not start. Please try again.');
    } finally { saving.current = false; setBusy(false); }
  };
  const closePreview = () => { if (!saving.current) setSelected(null); };
  return <View style={styles.browser}>
    {!limit && externalQuery === undefined ? <View style={styles.searchBox}>
      <Search size={18} color={colors.dimmed} />
      <TextInput accessibilityLabel="Search scenarios" placeholder="Search stories, people or places" placeholderTextColor={colors.dimmed} value={query} onChangeText={setQuery} autoCorrect={false} returnKeyType="search" style={styles.search} />
      {query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear scenario search" onPress={() => setQuery('')} style={styles.iconButton}><X size={18} color={colors.muted} /></Pressable> : null}
    </View> : null}
    {showProgress ? <View style={styles.tabs}>{progressFilters.map(filter => <Pressable key={filter.value} accessibilityRole="tab" accessibilityState={{ selected: progress === filter.value }} onPress={() => setProgress(filter.value)} style={[styles.tab, progress === filter.value && styles.tabSelected]}><Text style={[styles.tabText, progress === filter.value && styles.tabTextSelected]}>{filter.label}</Text></Pressable>)}</View> : null}
    {loadError ? <View style={styles.loadNotice}><Text style={styles.noticeText}>Saved progress couldn’t load. Your stories are still saved.</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry loading scenario progress" onPress={() => setReload(v => v + 1)} style={styles.retry}><Text style={styles.link}>Retry</Text></Pressable></View> : null}
    {!limit ? <Text accessibilityLiveRegion="polite" style={styles.count}>{loading ? 'Loading your progress…' : `${choices.length} ${choices.length === 1 ? 'scenario' : 'scenarios'}${term ? ' found' : ''}`}</Text> : null}
    <View onLayout={e => setGridWidth(e.nativeEvent.layout.width)} style={styles.grid}>{choices.slice(0, limit ?? 80).map(s => {
      const session = sessions.find(p => p.scenario_id === s.id), locked = !scenarioAvailable(s, snapshot);
      return <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={`Scenario: ${s.title}. ${s.leadName}. ${s.locationName}${session ? `. ${statusLabel(session)}` : locked ? '. Locked' : ''}`} onPress={() => { setSelected(s); setError(''); }} onHoverIn={() => setHoveredId(s.id)} onHoverOut={() => setHoveredId(null)} style={({ pressed }) => [styles.card, cardWidth ? { width: cardWidth } : styles.cardFallback, hoveredId === s.id && styles.cardHovered, pressed && styles.pressed]}>
        <View><ScenarioArtwork scenario={s} />{session || locked ? <View style={styles.badge}>{locked ? <LockKeyhole size={12} color={colors.text} /> : session?.status === 'completed' ? <Check size={12} color={colors.success} /> : <BookOpen size={12} color={colors.text} />}<Text style={styles.badgeText}>{session ? statusLabel(session) : 'Story unlock'}</Text></View> : null}</View>
        <View style={styles.copy}>
          <Text style={styles.themes} numberOfLines={1}>{s.themes.slice(0, 2).join(' · ')}</Text>
          <Text style={styles.title} numberOfLines={2}>{s.title}</Text>
          <Text style={styles.lead}>With {s.leadName}</Text>
          <Text style={styles.setup} numberOfLines={2}>{s.setup}</Text>
          <View style={styles.bottom}><MapPin size={13} color={colors.dimmed} /><Text style={styles.location} numberOfLines={1}>{s.locationName}</Text><ChevronRight size={17} color={colors.rose} /></View>
        </View>
      </Pressable>;
    })}</View>
    {!choices.length && !(loading && progress !== 'all') ? <View style={styles.empty}><BookOpen size={28} color={colors.violet} /><Text style={styles.emptyTitle}>{progress === 'continue' ? 'Your next chapter awaits' : progress === 'completed' ? 'Stories still to be told' : 'No matching scenarios'}</Text><Text style={styles.emptyCopy}>{progress === 'continue' ? 'Stories you start or pause will appear here. Try All stories or choose another world.' : progress === 'completed' ? 'Scenarios you mark complete will appear here. Try another world or browse All stories.' : 'Try another name, place or theme, or change the filters above.'}</Text>{query || progress !== 'all' ? <Pressable accessibilityRole="button" onPress={() => { setQuery(''); setProgress('all'); }} style={styles.retry}><Text style={styles.link}>{progress !== 'all' ? 'Browse all stories' : 'Clear search'}</Text></Pressable> : null}</View> : null}
    <CreatorModal visible={Boolean(selected)} title={selected?.title ?? 'Scenario'} onClose={closePreview} footer={selected ? <>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} accessibilityState={{ disabled: busy || loading || !available, busy }} disabled={busy || loading || !available} onPress={() => void start()} style={({ pressed }) => [styles.start, (busy || loading || !available) && styles.disabled, pressed && styles.pressed]}>{busy || loading ? <ActivityIndicator color="#fff" /> : !available ? <LockKeyhole size={18} color="#fff" /> : <BookOpen size={18} color="#fff" />}<Text style={styles.startText}>{busy ? 'Opening your story…' : loading ? 'Loading your progress…' : !available ? 'Discover companion to unlock' : actionLabel}</Text></Pressable>
    </> : undefined}>
      {selected ? <View style={styles.previewContent}>
        <View style={styles.preview}><ScenarioArtwork key={selected.id} scenario={selected} priority="high" /></View>
        <Text style={styles.themes}>{selected.themes.join(' · ')}</Text>
        <Text style={styles.previewLead}>With {selected.leadName}</Text>
        <View style={styles.place}><MapPin size={15} color={colors.muted} /><Text style={styles.lead}>{selected.locationName}</Text></View>
        <Text style={styles.premise}>{selected.setup}</Text>
        <Text style={styles.hint}>{existing?.status === 'completed' ? 'Reopen this story from where you left it. Your conversation stays intact.' : existing ? 'Pick up where you left off. Your conversation is saved.' : 'You choose what happens next.'}</Text>
        {!available ? <View style={styles.lockNotice}><LockKeyhole size={18} color={colors.warm} /><Text style={styles.lockText}>Discover {selected.leadName} through their world story to unlock this scenario.</Text></View> : null}
      </View> : null}
    </CreatorModal>
  </View>;
}

const styles = StyleSheet.create({
  browser: { gap: 16 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  card: { borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, cardFallback: { width: '100%' }, cardHovered: { borderColor: colors.borderBright, backgroundColor: colors.elevated }, pressed: { opacity: .86 },
  badge: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, backgroundColor: 'rgba(8,7,13,.88)' }, badgeText: { fontSize: 11, color: colors.text, fontWeight: '700' },
  copy: { flex: 1, padding: 16, gap: 8 }, themes: { fontSize: 11, lineHeight: 17, color: colors.rose, fontWeight: '800' }, title: { fontSize: 20, lineHeight: 25, color: colors.text, fontWeight: '800' }, lead: { fontSize: 13, lineHeight: 19, color: colors.muted, flexShrink: 1 }, setup: { fontSize: 13, lineHeight: 19, color: colors.muted, marginBottom: 8 }, bottom: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 'auto', paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }, location: { flex: 1, fontSize: 11, color: colors.muted },
  searchBox: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, gap: 10 }, search: { flex: 1, minWidth: 0, minHeight: 48, fontSize: 16, color: colors.text, paddingVertical: 12, paddingRight: 12 }, iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, tab: { minHeight: 44, paddingHorizontal: 13, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' }, tabSelected: { borderBottomColor: colors.rose }, tabText: { fontSize: 13, color: colors.muted, fontWeight: '600' }, tabTextSelected: { color: colors.text }, count: { fontSize: 12, color: colors.dimmed },
  previewContent: { gap: 12 }, preview: { borderRadius: 16, overflow: 'hidden' }, previewLead: { fontSize: 20, fontWeight: '700', color: colors.text }, place: { flexDirection: 'row', gap: 6, alignItems: 'center' }, premise: { fontSize: 16, lineHeight: 25, color: colors.text, marginTop: 4 }, hint: { fontSize: 13, lineHeight: 20, color: colors.muted }, lockNotice: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 12, backgroundColor: colors.elevated }, lockText: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.muted },
  start: { minHeight: 50, borderRadius: 15, paddingHorizontal: 14, backgroundColor: colors.rose, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 }, startText: { color: '#fff', fontWeight: '800', fontSize: 15, flexShrink: 1, textAlign: 'center' }, disabled: { opacity: .5 },
  empty: { padding: 28, alignItems: 'center', gap: 12, borderRadius: 20, backgroundColor: colors.surface }, emptyTitle: { fontSize: 19, color: colors.text, fontWeight: '700', textAlign: 'center' }, emptyCopy: { maxWidth: 400, fontSize: 14, lineHeight: 21, color: colors.muted, textAlign: 'center' }, loadNotice: { flexDirection: 'row', alignItems: 'center', gap: 8 }, noticeText: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.muted }, retry: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }, link: { color: colors.rose, fontSize: 13, fontWeight: '700' }, error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
});
