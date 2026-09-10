import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { BookOpen, Check, ChevronRight, Pause } from 'lucide-react-native';
import { manageScenario } from '../lib/api';
import type { ScenarioSession } from '../lib/scenarios';
import { scenarios, type Scenario } from '../lib/scenarioCatalog';
import { CreatorModal } from './CreatorPicker';
import { ScenarioArtwork } from './ScenarioArtwork';
import { colors } from '../theme';
import {useTogether} from '../store/useTogether';

export function ScenarioConversationBanner({ conversationId, scope, onScenarioChange }: { conversationId: string; scope: string; onScenarioChange: (scenario: Scenario | null) => void }) {
  const scenarioRevision=useTogether(s=>s.snapshot?.characters.find(c=>c.id===s.snapshot?.conversations.find(v=>v.id===conversationId)?.character_instance_id)?.scenario_state?.sessionId);
  const [session, setSession] = useState<ScenarioSession | null>(null), [open, setOpen] = useState(false);
  const [pending, setPending] = useState<'pause' | 'complete' | null>(null), [error, setError] = useState('');
  const [loadError, setLoadError] = useState(false), [reload, setReload] = useState(0);
  const generation = useRef(0), saving = useRef(false);
  useFocusEffect(useCallback(() => {
    const current = ++generation.current;
    setSession(null); setOpen(false); setError(''); setLoadError(false); setPending(null); saving.current = false;
    void manageScenario<{ sessions: ScenarioSession[] }>({ action: 'list' }).then(r => {
      if (generation.current === current) setSession(r.sessions.find(s => s.conversation_id === conversationId && s.status === 'active') ?? null);
    }).catch(() => { if (generation.current === current) setLoadError(true); });
    return () => { generation.current++; };
  }, [conversationId, scope, reload, scenarioRevision]));
  const scenario = scenarios.find(s => s.id === session?.scenario_id);
  useEffect(() => { onScenarioChange(scenario ?? null); }, [scenario, onScenarioChange]);
  if (loadError) return <Pressable accessibilityRole="button" accessibilityLabel="Retry loading scenario controls" onPress={() => setReload(v => v + 1)} style={styles.banner}><BookOpen size={16} color={colors.rose} /><Text style={styles.label}>Scenario controls couldn’t load</Text><Text style={styles.manage}>Retry</Text></Pressable>;
  if (!scenario || !session) return null;
  const save = async (action: 'pause' | 'complete') => {
    if (saving.current) return;
    const current = generation.current; saving.current = true; setPending(action); setError('');
    try {
      await manageScenario({ action, sessionId: session.id });
      if (generation.current === current) { setSession(null); setOpen(false); void useTogether.getState().refresh({force:true}); }
    } catch (e) {
      if (generation.current === current) setError(e instanceof Error ? e.message : 'Your scenario could not be saved. Please try again.');
    } finally { if (generation.current === current) { saving.current = false; setPending(null); } }
  };
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Scenario: ${scenario.title}. Open scenario controls.`} accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} style={styles.banner}><BookOpen size={16} color={colors.rose} /><Text numberOfLines={1} style={styles.label}>{scenario.title}</Text><Text style={styles.manage}>In progress</Text><ChevronRight size={15} color={colors.muted} /></Pressable>
    <CreatorModal visible={open} title={scenario.title} onClose={() => { if (!saving.current) setOpen(false); }} footer={<>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Pause scenario" accessibilityState={{ disabled: Boolean(pending), busy: pending === 'pause' }} disabled={Boolean(pending)} onPress={() => void save('pause')} style={[styles.action, pending && styles.disabled]}>{pending === 'pause' ? <ActivityIndicator size="small" color={colors.text} /> : <Pause size={17} color={colors.text} />}<Text style={styles.actionText}>{pending === 'pause' ? 'Saving…' : 'Pause scenario'}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Mark complete" accessibilityState={{ disabled: Boolean(pending), busy: pending === 'complete' }} disabled={Boolean(pending)} onPress={() => void save('complete')} style={[styles.action, styles.complete, pending && styles.disabled]}>{pending === 'complete' ? <ActivityIndicator size="small" color={colors.text} /> : <Check size={17} color={colors.text} />}<Text style={styles.actionText}>{pending === 'complete' ? 'Saving…' : 'Mark complete'}</Text></Pressable>
      </View>
    </>}>
      <View style={styles.content}><View style={styles.artwork}><ScenarioArtwork key={scenario.id} scenario={scenario} priority="high" /></View><Text style={styles.with}>With {scenario.leadName} · {scenario.locationName}</Text><Text style={styles.copy}>{scenario.setup}</Text><Text style={styles.note}>Pause to return to ordinary chat, or mark this story complete when it feels finished. Your conversation stays saved, and you can continue from Scenarios anytime.</Text></View>
    </CreatorModal>
  </>;
}
const styles = StyleSheet.create({ banner: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }, label: { flex: 1, fontSize: 13, color: colors.text, fontWeight: '700' }, manage: { fontSize: 11, color: colors.muted }, content: { gap: 16 }, artwork: { borderRadius: 16, overflow: 'hidden' }, with: { fontSize: 13, lineHeight: 20, color: colors.muted }, copy: { fontSize: 16, lineHeight: 25, color: colors.text }, note: { fontSize: 13, lineHeight: 20, color: colors.muted }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, action: { flexGrow: 1, flexBasis: 140, minHeight: 48, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.borderBright, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }, actionText: { color: colors.text, fontSize: 13, fontWeight: '700' }, complete: { backgroundColor: colors.wine }, disabled: { opacity: .6 }, error: { color: colors.danger, fontSize: 13, lineHeight: 19 } });
