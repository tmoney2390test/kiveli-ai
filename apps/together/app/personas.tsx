import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Check, ChevronRight, Pencil, Plus, Trash2, UserRound } from 'lucide-react-native';
import { EmptyState, GlassCard, LoadingSkeleton, PageTitle, Screen, SectionHeader } from '../src/components';
import { managePersona } from '../src/lib/api';
import { useTogether } from '../src/store/useTogether';
import { colors, radius } from '../src/theme';
import type { KivelleContinuity, Snapshot, UserPersona } from '../src/types';

export default function Personas() {
  const { snapshot, setSnapshot } = useTogether();
  const [busy, setBusy] = useState('');
  if (!snapshot) return <LoadingSkeleton label="Loading your Kivelle Lives…" />;
  const active = snapshot.activeContinuity;
  const lives = snapshot.continuities ?? [];
  const usedPersonaIds = new Set(lives.map((life) => life.persona_id));
  const unusedPersonas = (snapshot.personas ?? []).filter((persona) => !usedPersonaIds.has(persona.id));

  const switchLife = async (item: KivelleContinuity) => {
    if (item.id === active?.id) return;
    setBusy(item.id);
    try { setSnapshot(await managePersona<Snapshot>({ action: 'switch_life', continuityId: item.id })); }
    catch (error) { Alert.alert('Could not switch Life', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(''); }
  };
  const start = (persona: UserPersona) => Alert.alert(
    `Start ${persona.display_name}'s Life?`,
    `${persona.display_name} will begin with separate relationships, memories, plans, and history. Your current Life will stay exactly as it is.`,
    [{ text: 'Not now', style: 'cancel' }, { text: 'Start alternate life', onPress: async () => {
      setBusy(persona.id);
      try { setSnapshot(await managePersona<Snapshot>({ action: 'start_life', personaId: persona.id })); router.push('/(tabs)/singles'); }
      catch (error) { Alert.alert('Could not start Life', error instanceof Error ? error.message : 'Please try again.'); }
      finally { setBusy(''); }
    }}],
  );
  const removeLife = (life: KivelleContinuity) => Alert.alert(
    `Delete ${life.title}?`,
    'This permanently removes this Alternate Life and its relationships, memories, plans, Dates, Moments, Stories, and media state. Your Main Life is untouched.',
    [{ text: 'Keep Life', style: 'cancel' }, { text: 'Delete Life', style: 'destructive', onPress: async () => {
      setBusy(life.id);
      try { setSnapshot(await managePersona<Snapshot>({ action: 'delete_life', continuityId: life.id, confirmation: 'DELETE LIFE' })); }
      catch (error) { Alert.alert('Could not delete Life', error instanceof Error ? error.message : 'Please try again.'); }
      finally { setBusy(''); }
    }}],
  );

  return <Screen>
    <View style={styles.header}><Pressable onPress={() => router.back()}><ArrowLeft color={colors.text} /></Pressable><View style={{flex:1}}><PageTitle>You in Kivelle</PageTitle><Text style={styles.subtitle}>A Life keeps one identity, relationships, memories, plans, and history together.</Text></View></View>
    {active ? <GlassCard style={styles.activeSummary}><Text style={styles.activeKicker}>YOU'RE CURRENTLY HERE</Text><Text style={styles.activeName}>{active.together_user_personas?.display_name ?? active.title}</Text><Text style={styles.activeMeta}>{active.kind === 'main' ? 'Main Life' : active.title}{active.together_user_personas?.occupation ? ` · ${active.together_user_personas.occupation}` : ''}</Text></GlassCard> : null}

    <SectionHeader title="Your Lives" />
    {lives.length ? lives.map((life) => <LifeCard key={life.id} life={life} active={life.id === active?.id} busy={busy === life.id} onSwitch={() => void switchLife(life)} onEdit={() => router.push(`/persona-editor?persona=${life.persona_id}` as never)} onDelete={life.kind==='alternate'?() => removeLife(life):undefined} />) : <EmptyState title="Your Main Life is being prepared" body="Refresh Kivelle to finish account setup." />}

    {unusedPersonas.length ? <><SectionHeader title="Ready for a new Life" />{unusedPersonas.map((persona) => <View key={persona.id} style={styles.persona}><UserRound color={colors.violet} /><Pressable onPress={() => router.push(`/persona-editor?persona=${persona.id}` as never)} style={{ flex: 1 }}><Text style={styles.name}>{persona.display_name}</Text><Text style={styles.meta}>{[persona.occupation, persona.age].filter(Boolean).join(' · ') || 'Identity ready'}</Text></Pressable><Pressable onPress={() => start(persona)} style={styles.start}><Text style={styles.startText}>Start Life</Text><ChevronRight size={15} color={colors.rose} /></Pressable></View>)}</> : null}

    <Pressable onPress={() => router.push('/persona-editor')} style={styles.add}><Plus size={18} color={colors.rose} /><Text style={styles.addText}>Create another identity</Text></Pressable>
    <GlassCard><Text style={styles.empty}>Alternate Lives never merge relationship history. Switching Life changes who you are in Kivelle without rewriting another Life.</Text></GlassCard>
  </Screen>;
}

function LifeCard({ life, active, busy, onSwitch, onEdit, onDelete }: { life: KivelleContinuity; active: boolean; busy: boolean; onSwitch: () => void; onEdit: () => void; onDelete?: () => void }) {
  const persona = life.together_user_personas;
  return <View style={[styles.life, active && styles.active]}><Pressable onPress={onEdit} style={styles.avatar}><Text style={styles.initial}>{(persona?.display_name ?? 'Y')[0]}</Text></Pressable><Pressable onPress={onSwitch} disabled={busy} style={{ flex: 1 }}><Text style={styles.kicker}>{life.kind === 'main' ? 'MAIN LIFE' : 'ALTERNATE LIFE'}</Text><Text style={styles.name}>{persona?.display_name ?? life.title}</Text><Text style={styles.meta}>{busy ? 'Switching…' : active ? 'Currently active' : persona?.occupation ?? 'Tap to enter this Life'}</Text></Pressable>{active ? <View style={styles.pill}><Check size={13} color="#fff" /><Text style={styles.pillText}>ACTIVE</Text></View> : <Pressable accessibilityLabel={`Switch to ${persona?.display_name ?? life.title}`} onPress={onSwitch}><ChevronRight color={colors.muted} /></Pressable>}<Pressable accessibilityLabel={`Edit ${persona?.display_name ?? life.title}`} onPress={onEdit}><Pencil size={16} color={colors.muted} /></Pressable>{onDelete ? <Pressable accessibilityLabel={`Delete ${life.title}`} onPress={onDelete}><Trash2 size={16} color={colors.danger} /></Pressable> : null}</View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 }, subtitle: { color: colors.muted, fontSize: 12, marginTop: 3, lineHeight:18 },
  activeSummary:{gap:3,borderColor:'rgba(232,93,140,.30)'},activeKicker:{fontSize:9,fontWeight:'900',letterSpacing:1.1,color:colors.rose},activeName:{fontFamily:'Georgia',fontSize:24,color:colors.text},activeMeta:{color:colors.muted,fontSize:11},
  life: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, active: { borderColor: 'rgba(232,93,140,.55)', backgroundColor:'rgba(232,93,140,.05)' },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.elevated }, initial: { fontFamily: 'Georgia', fontSize: 24, color: colors.rose },
  kicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1, color: colors.rose }, name: { fontFamily: 'Georgia', fontSize: 20, color: colors.text, marginTop: 2 }, meta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  pill: { flexDirection: 'row', gap: 4, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20, backgroundColor: colors.rose }, pillText: { fontSize: 8, fontWeight: '900', color: '#fff' },
  persona: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, start: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 8 }, startText: { color: colors.rose, fontSize: 10, fontWeight: '900' },
  add: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }, addText: { color: colors.rose, fontWeight: '800' }, empty: { color: colors.muted, lineHeight: 19 },
});
