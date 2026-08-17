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
  const main = snapshot.continuities?.find((item) => item.kind === 'main');
  const alternates = snapshot.continuities?.filter((item) => item.kind === 'alternate') ?? [];
  const usedPersonaIds = new Set((snapshot.continuities ?? []).map((life) => life.persona_id));

  const switchLife = async (item: KivelleContinuity) => {
    if (item.id === active?.id) return;
    setBusy(item.id);
    try { setSnapshot(await managePersona<Snapshot>({ action: 'switch_life', continuityId: item.id })); }
    catch (error) { Alert.alert('Could not switch Life', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(''); }
  };
  const start = (persona: UserPersona) => Alert.alert(
    `Start ${persona.display_name}'s Life?`,
    `${persona.display_name} will begin with separate relationships, memories, plans, and history. Your Main Life will stay exactly as it is.`,
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
    <View style={styles.header}><Pressable onPress={() => router.back()}><ArrowLeft color={colors.text} /></Pressable><View><PageTitle>You in Kivelle</PageTitle><Text style={styles.subtitle}>Each Life keeps its own relationships and history.</Text></View></View>
    <SectionHeader title="Main Life" />
    {main ? <LifeCard life={main} active={main.id === active?.id} busy={busy === main.id} onSwitch={() => void switchLife(main)} onEdit={() => router.push(`/persona-editor?persona=${main.persona_id}` as never)} /> : <EmptyState title="Main Life is being prepared" body="Refresh Kivelle to finish account migration." />}
    <SectionHeader title="Alternate Lives" />
    {alternates.map((life) => <LifeCard key={life.id} life={life} active={life.id === active?.id} busy={busy === life.id} onSwitch={() => void switchLife(life)} onEdit={() => router.push(`/persona-editor?persona=${life.persona_id}` as never)} onDelete={() => removeLife(life)} />)}
    {!alternates.length ? <GlassCard><Text style={styles.empty}>Alternate Lives let another Persona meet companions with completely separate memories and history.</Text></GlassCard> : null}
    <SectionHeader title="Personas" />
    {(snapshot.personas ?? []).map((persona) => <View key={persona.id} style={styles.persona}><UserRound color={colors.violet} /><Pressable onPress={() => router.push(`/persona-editor?persona=${persona.id}` as never)} style={{ flex: 1 }}><Text style={styles.name}>{persona.display_name}</Text><Text style={styles.meta}>{[persona.occupation, persona.age].filter(Boolean).join(' · ') || (persona.is_default ? 'Main Persona' : 'Ready for an Alternate Life')}</Text></Pressable>{!usedPersonaIds.has(persona.id) ? <Pressable onPress={() => start(persona)} style={styles.start}><Text style={styles.startText}>Start Life</Text><ChevronRight size={15} color={colors.rose} /></Pressable> : <Pressable accessibilityLabel={`Edit ${persona.display_name}`} onPress={() => router.push(`/persona-editor?persona=${persona.id}` as never)}><Pencil size={16} color={colors.muted} /></Pressable>}</View>)}
    <Pressable onPress={() => router.push('/persona-editor')} style={styles.add}><Plus size={18} color={colors.rose} /><Text style={styles.addText}>Create persona</Text></Pressable>
  </Screen>;
}

function LifeCard({ life, active, busy, onSwitch, onEdit, onDelete }: { life: KivelleContinuity; active: boolean; busy: boolean; onSwitch: () => void; onEdit: () => void; onDelete?: () => void }) {
  const persona = life.together_user_personas;
  return <View style={[styles.life, active && styles.active]}><Pressable onPress={onEdit} style={styles.avatar}><Text style={styles.initial}>{(persona?.display_name ?? 'Y')[0]}</Text></Pressable><Pressable onPress={onSwitch} disabled={busy} style={{ flex: 1 }}><Text style={styles.kicker}>{life.kind === 'main' ? 'MAIN LIFE' : 'ALTERNATE LIFE'}</Text><Text style={styles.name}>{persona?.display_name ?? life.title}</Text><Text style={styles.meta}>{busy ? 'Switching…' : active ? 'Currently active' : persona?.occupation ?? life.title}</Text></Pressable>{active ? <View style={styles.pill}><Check size={13} color="#fff" /><Text style={styles.pillText}>ACTIVE</Text></View> : <Pressable onPress={onSwitch}><ChevronRight color={colors.muted} /></Pressable>}{onDelete ? <Pressable accessibilityLabel={`Delete ${life.title}`} onPress={onDelete}><Trash2 size={16} color={colors.danger} /></Pressable> : null}</View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 }, subtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  life: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, active: { borderColor: 'rgba(232,93,140,.55)' },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.elevated }, initial: { fontFamily: 'Georgia', fontSize: 24, color: colors.rose },
  kicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1, color: colors.rose }, name: { fontFamily: 'Georgia', fontSize: 20, color: colors.text, marginTop: 2 }, meta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  pill: { flexDirection: 'row', gap: 4, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20, backgroundColor: colors.rose }, pillText: { fontSize: 8, fontWeight: '900', color: '#fff' },
  persona: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, start: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 8 }, startText: { color: colors.rose, fontSize: 10, fontWeight: '900' },
  add: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }, addText: { color: colors.rose, fontWeight: '800' }, empty: { color: colors.muted, lineHeight: 19 },
});
