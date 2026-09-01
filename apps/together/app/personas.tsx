import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { ArrowLeft, Check, ChevronRight, Pencil, Plus, Trash2, UserRound } from 'lucide-react-native';
import { EmptyState, GlassCard, LoadingSkeleton, PageTitle, Screen, SectionHeader } from '../src/components';
import { managePersona } from '../src/lib/api';
import { useProfileAvatarUrl } from '../src/hooks/useProfileAvatarUrl';
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
  const locked = Boolean(busy);

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
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Back to settings" onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')} style={styles.iconButton}><ArrowLeft color={colors.text} /></Pressable><View style={{flex:1}}><PageTitle>You in Kivelle</PageTitle><Text style={styles.subtitle}>A Life keeps one identity, relationships, memories, plans, and history together.</Text></View></View>
    {active ? <GlassCard style={styles.activeSummary}><PersonaAvatar persona={active.together_user_personas}/><View style={{flex:1}}><Text style={styles.activeKicker}>YOU'RE CURRENTLY HERE</Text><Text style={styles.activeName}>{active.together_user_personas?.display_name ?? active.title}</Text><Text style={styles.activeMeta}>{active.kind === 'main' ? 'Main Life' : active.title}{active.together_user_personas?.occupation ? ` · ${active.together_user_personas.occupation}` : ''}</Text></View></GlassCard> : null}

    <SectionHeader title="Your Lives" />
    {lives.length ? lives.map((life) => <LifeCard key={life.id} life={life} active={life.id === active?.id} busy={busy === life.id} disabled={locked} onSwitch={() => void switchLife(life)} onEdit={() => router.push(`/persona-editor?persona=${life.persona_id}` as never)} onDelete={life.kind==='alternate'?() => removeLife(life):undefined} />) : <EmptyState title="Your Main Life is being prepared" body="Refresh Kivelle to finish account setup." />}

    {unusedPersonas.length ? <><SectionHeader title="Ready for a new Life" />{unusedPersonas.map((persona) => <View key={persona.id} style={[styles.persona,locked&&styles.disabled]}><PersonaAvatar persona={persona}/><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${persona.display_name}`} disabled={locked} onPress={() => router.push(`/persona-editor?persona=${persona.id}` as never)} style={{ flex: 1 }}><Text style={styles.name}>{persona.display_name}</Text><Text style={styles.meta}>{[persona.occupation, persona.age].filter(Boolean).join(' · ') || 'Identity ready'}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Start ${persona.display_name}'s Life`} disabled={locked} onPress={() => start(persona)} style={styles.start}><Text style={styles.startText}>{busy===persona.id?'Starting…':'Start Life'}</Text><ChevronRight size={15} color={colors.rose} /></Pressable></View>)}</> : null}

    <Pressable accessibilityRole="button" accessibilityLabel="Create another identity" disabled={locked} onPress={() => router.push('/persona-editor')} style={[styles.add,locked&&styles.disabled]}><Plus size={18} color={colors.rose} /><Text style={styles.addText}>Create another identity</Text></Pressable>
    <GlassCard><Text style={styles.empty}>Alternate Lives never merge relationship history. Switching Life changes who you are in Kivelle without rewriting another Life.</Text></GlassCard>
  </Screen>;
}

function LifeCard({ life, active, busy, disabled, onSwitch, onEdit, onDelete }: { life: KivelleContinuity; active: boolean; busy: boolean; disabled: boolean; onSwitch: () => void; onEdit: () => void; onDelete?: () => void }) {
  const persona = life.together_user_personas;
  return <View style={[styles.life,active&&styles.active,disabled&&!busy&&styles.disabled]}><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${persona?.display_name??life.title}`} disabled={disabled} onPress={onEdit} style={styles.avatarButton}><PersonaAvatar persona={persona}/></Pressable><Pressable accessibilityRole="button" accessibilityLabel={active?`${persona?.display_name??life.title} is active`:`Switch to ${persona?.display_name??life.title}`} onPress={onSwitch} disabled={disabled||active} style={{flex:1}}><Text style={styles.kicker}>{life.kind==='main'?'MAIN LIFE':'ALTERNATE LIFE'}</Text><Text style={styles.name}>{persona?.display_name??life.title}</Text><Text accessibilityLiveRegion="polite" style={styles.meta}>{busy?'Switching…':active?'Currently active':persona?.occupation??'Tap to enter this Life'}</Text></Pressable>{active?<View style={styles.pill}><Check size={13} color="#fff"/><Text style={styles.pillText}>ACTIVE</Text></View>:<Pressable accessibilityRole="button" accessibilityLabel={`Switch to ${persona?.display_name??life.title}`} disabled={disabled} onPress={onSwitch} style={styles.iconButton}><ChevronRight color={colors.muted}/></Pressable>}<Pressable accessibilityRole="button" accessibilityLabel={`Edit ${persona?.display_name??life.title}`} disabled={disabled} onPress={onEdit} style={styles.iconButton}><Pencil size={16} color={colors.muted}/></Pressable>{onDelete?<Pressable accessibilityRole="button" accessibilityLabel={`Delete ${life.title}`} disabled={disabled} onPress={onDelete} style={styles.iconButton}><Trash2 size={16} color={colors.danger}/></Pressable>:null}</View>;
}

function PersonaAvatar({persona}:{persona?:UserPersona}){const path=typeof persona?.appearance_config?.avatarPath==='string'?persona.appearance_config.avatarPath:null;const url=useProfileAvatarUrl(path);const[failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[url]);return <View style={styles.avatar}>{url&&!failed?<Image source={{uri:url}} style={StyleSheet.absoluteFill} contentFit="cover" onError={()=>setFailed(true)}/>:persona?<Text style={styles.initial}>{persona.display_name[0]?.toUpperCase()}</Text>:<UserRound size={22} color={colors.violet}/>}</View>;}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 }, iconButton:{width:44,height:44,alignItems:'center',justifyContent:'center',borderRadius:22},subtitle: { color: colors.muted, fontSize: 12, marginTop: 3, lineHeight:18 },
  activeSummary:{gap:12,borderColor:'rgba(216,62,234,.30)',flexDirection:'row',alignItems:'center'},activeKicker:{fontSize:9,fontWeight:'900',letterSpacing:1.1,color:colors.rose},activeName:{fontFamily:'Georgia',fontSize:24,color:colors.text},activeMeta:{color:colors.muted,fontSize:11},
  life: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, active: { borderColor: 'rgba(216,62,234,.55)', backgroundColor:'rgba(216,62,234,.05)' },
  avatarButton:{borderRadius:25},avatar: { width: 50, height: 50, borderRadius: 25, overflow:'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.elevated }, initial: { fontFamily: 'Georgia', fontSize: 24, color: colors.rose },
  kicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1, color: colors.rose }, name: { fontFamily: 'Georgia', fontSize: 20, color: colors.text, marginTop: 2 }, meta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  pill: { flexDirection: 'row', gap: 4, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20, backgroundColor: colors.rose }, pillText: { fontSize: 8, fontWeight: '900', color: '#fff' },
  persona: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, start: { minHeight:44,flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal:6 }, startText: { color: colors.rose, fontSize: 10, fontWeight: '900' },
  add: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }, addText: { color: colors.rose, fontWeight: '800' }, empty: { color: colors.muted, lineHeight: 19 },disabled:{opacity:.48},
});
