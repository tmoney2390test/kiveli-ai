import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Plus, Sparkles } from 'lucide-react-native';
import { EmptyState, GlassCard, MomentCard, PageTitle, Screen } from '../src/components';
import { colors } from '../src/theme';
import { useTogether } from '../src/store/useTogether';

export default function Moments() {
  const moments = useTogether((state) => state.snapshot?.moments ?? []);
  return <Screen>
    <View style={styles.header}><Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><ArrowLeft color={colors.text} size={20} /></Pressable><View style={{ flex: 1 }}><PageTitle>Moments</PageTitle><Text style={styles.subtitle}>The parts of your story worth keeping.</Text></View><View style={styles.add}><Plus color={colors.rose} size={19} /></View></View>
    <View style={styles.tabs}><Text style={styles.active}>All</Text><Text style={styles.tab}>Milestones</Text><Text style={styles.tab}>Dates</Text><Text style={styles.tab}>Memories</Text></View>
    {moments.length ? <View style={styles.grid}>{moments.map((moment) => <MomentCard key={moment.id} moment={moment} />)}</View> : <View style={styles.emptyWrap}><View style={styles.emptyIcon}><Sparkles size={24} color={colors.rose} /></View><EmptyState title="Your story is just beginning" body="Dates, introductions, and truly important conversations will turn into Moments here." /></View>}
    {moments.length ? <GlassCard style={styles.note}><Sparkles size={17} color={colors.warm} /><Text style={styles.noteText}>Moments are created only when something genuinely meaningful happens.</Text></GlassCard> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  back: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  add: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(241,103,154,.12)', borderWidth: 1, borderColor: 'rgba(241,103,154,.25)', marginTop: 2 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, textAlign: 'center', color: colors.muted, paddingVertical: 12, fontSize: 11, fontWeight: '700' },
  active: { flex: 1, textAlign: 'center', color: colors.rose, paddingVertical: 12, fontSize: 11, fontWeight: '800', borderBottomWidth: 2, borderBottomColor: colors.rose },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  emptyWrap: { minHeight: 390, justifyContent: 'center', alignItems: 'center' },
  emptyIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(241,103,154,.11)', alignItems: 'center', justifyContent: 'center', marginBottom: -36, zIndex: 1 },
  note: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 13 },
  noteText: { flex: 1, color: colors.muted, fontSize: 12, lineHeight: 17 },
});
