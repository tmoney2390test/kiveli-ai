import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ArrowRight, Check, Globe2, Sparkles, UserRound } from 'lucide-react-native';
import { GradientButton, GlassCard, LoadingSkeleton, PageTitle, Screen } from '../../src/components';
import { createCreatorDraft, listCreatorDrafts } from '../../src/lib/api';
import { createClientRequestId } from '../../src/lib/requestId';
import { useTogether } from '../../src/store/useTogether';
import { colors, radius, spacing } from '../../src/theme';

const prompts = [
  'A confident architect with dry humor who takes time to open up.',
  'A warm, adventurous photographer who loves live music and quiet mornings.',
  'A thoughtful chef with playful confidence and strong opinions about food.',
];
const goals = [
  { key: 'friendship', title: 'Friendship', detail: 'Build trust without romantic progression.' },
  { key: 'romance', title: 'Romance', detail: 'Let attraction develop naturally over time.' },
  { key: 'either', title: 'Either', detail: 'Let the relationship find its own direction.' },
] as const;

export default function CreateCompanionEntry() {
  const params = useLocalSearchParams<{ template?: string }>();
  const snapshot = useTogether((state) => state.snapshot);
  const { width } = useWindowDimensions();
  const [concept, setConcept] = useState('');
  const [worldId, setWorldId] = useState('');
  const [goal, setGoal] = useState<'friendship' | 'romance' | 'either'>('either');
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(Boolean(params.template));
  const worlds = useMemo(() => snapshot?.worlds.filter((world) => world.published && (world.access_type === 'free' || snapshot.userWorlds?.some((item) => item.world_id === world.id && item.access_status === 'unlocked'))) ?? [], [snapshot]);
  const selectedWorldId = worldId || worlds[0]?.id || '';

  useEffect(() => {
    if (!params.template) return;
    let active = true;
    void listCreatorDrafts().then(({ drafts }) => {
      if (!active) return;
      const draft = drafts.find((item) => item.legacy_template_id === params.template || item.finalized_template_id === params.template);
      if (draft) router.replace(`/create/companion/${draft.id}` as never);
      else setRecovering(false);
    }).catch(() => setRecovering(false));
    return () => { active = false; };
  }, [params.template]);

  if (!snapshot || recovering) return <LoadingSkeleton label={recovering ? 'Opening your character draft…' : 'Opening Creator Studio…'} />;

  const create = async () => {
    setBusy(true);
    try {
      const { draft } = await createCreatorDraft({ concept: concept.trim(), worldId: selectedWorldId, relationshipGoal: goal, requestId: createClientRequestId() });
      router.replace(`/create/companion/${draft.id}` as never);
    } catch (error) {
      Alert.alert('Could not create that person', error instanceof Error ? error.message : 'Try a different description.');
    } finally { setBusy(false); }
  };

  const desktop = width >= 900;
  return <Screen contentStyle={styles.screen}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.back}><ArrowLeft color={colors.text} size={21} /></Pressable>
      <View style={{ flex: 1 }}><Text style={styles.kicker}>KIVELLE CREATOR</Text><PageTitle>Create someone</PageTitle><Text style={styles.subtitle}>Describe a person. Kivelle will help you shape an identity, a life, and a real first meeting.</Text></View>
    </View>

    <View style={[styles.layout, desktop && styles.layoutDesktop]}>
      <View style={styles.editor}>
        <View>
          <Text style={styles.sectionLabel}>WHO DO YOU WANT TO MEET?</Text>
          <Text style={styles.sectionTitle}>Start with the idea.</Text>
          <Text style={styles.help}>You can change every detail before this person enters your Kivelle Life.</Text>
        </View>
        <TextInput
          accessibilityLabel="Character concept"
          value={concept}
          onChangeText={setConcept}
          multiline
          maxLength={1200}
          textAlignVertical="top"
          style={styles.concept}
          placeholder="A confident 29-year-old architect with dry humor. She loves jazz, travel and great food, but takes a while to genuinely open up."
          placeholderTextColor={colors.muted}
        />
        <View style={styles.suggestions}>{prompts.map((prompt) => <Pressable key={prompt} accessibilityRole="button" onPress={() => setConcept(prompt)} style={styles.suggestion}><Sparkles size={14} color={colors.violet} /><Text style={styles.suggestionText}>{prompt}</Text></Pressable>)}</View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Home world</Text>
          <View style={styles.choiceGrid}>{worlds.map((world) => <Pressable key={world.id} accessibilityRole="radio" accessibilityState={{ checked: selectedWorldId === world.id }} onPress={() => setWorldId(world.id)} style={[styles.worldChoice, selectedWorldId === world.id && styles.choiceSelected]}><Globe2 size={18} color={selectedWorldId === world.id ? '#fff' : colors.violet} /><View style={{ flex: 1 }}><Text style={[styles.choiceTitle, selectedWorldId === world.id && styles.choiceTitleSelected]}>{world.name}</Text><Text style={[styles.choiceDetail, selectedWorldId === world.id && styles.choiceDetailSelected]}>{world.access_type === 'free' ? 'Included world' : 'Unlocked world'}</Text></View>{selectedWorldId === world.id ? <Check size={17} color="#fff" /> : null}</Pressable>)}</View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Relationship direction</Text>
          <View style={styles.goalGrid}>{goals.map((item) => <Pressable key={item.key} accessibilityRole="radio" accessibilityState={{ checked: goal === item.key }} onPress={() => setGoal(item.key)} style={[styles.goal, goal === item.key && styles.goalSelected]}><Text style={styles.goalTitle}>{item.title}</Text><Text style={styles.goalDetail}>{item.detail}</Text>{goal === item.key ? <View style={styles.selectedDot}><Check size={12} color="#fff" /></View> : null}</Pressable>)}</View>
        </View>

        <GradientButton label={busy ? 'Creating Character DNA…' : 'Build Character DNA'} icon={<ArrowRight size={18} color="#fff" />} disabled={busy || concept.trim().length < 20 || !selectedWorldId} onPress={() => void create()} />
        <Text style={styles.privateNote}>Your draft stays private. No relationship or simulation begins until you choose Meet.</Text>
      </View>

      <GlassCard style={styles.preview}>
        <View style={styles.previewIcon}><UserRound size={34} color={colors.rose} /></View>
        <Text style={styles.previewKicker}>WHAT KIVELLE BUILDS</Text>
        <Text style={styles.previewTitle}>A person, not a prompt.</Text>
        {['A persistent identity and appearance', 'A personality with independent preferences', 'A home and weekly rhythm in a real world', 'A connection style that guides—not guarantees—the relationship', 'A canonical first meeting that flows into Chat'].map((item, index) => <View key={item} style={styles.previewRow}><View style={styles.previewNumber}><Text style={styles.previewNumberText}>{index + 1}</Text></View><Text style={styles.previewText}>{item}</Text></View>)}
        <View style={styles.meetingAs}><Text style={styles.meetingAsLabel}>MEETING AS</Text><Text style={styles.meetingAsName}>{snapshot.activePersona?.display_name ?? snapshot.profile?.display_name ?? 'You'}</Text><Text style={styles.meetingAsLife}>{snapshot.activeContinuity?.title ?? 'Main Life'}</Text></View>
      </GlassCard>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { maxWidth: 1120, paddingHorizontal: spacing.lg }, header: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 }, back: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, kicker: { color: colors.rose, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginBottom: 4 }, subtitle: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 5, maxWidth: 640 }, layout: { gap: 18 }, layoutDesktop: { flexDirection: 'row', alignItems: 'flex-start' }, editor: { flex: 1.7, gap: 18, padding: 18, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, sectionLabel: { color: colors.rose, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 }, sectionTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 28, marginTop: 5 }, help: { color: colors.muted, lineHeight: 19, marginTop: 6 }, concept: { minHeight: 172, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderBright, backgroundColor: colors.background, padding: 15, color: colors.text, fontSize: 15, lineHeight: 23 }, suggestions: { gap: 8 }, suggestion: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', padding: 11, borderRadius: radius.md, backgroundColor: colors.elevated }, suggestionText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 17 }, fieldGroup: { gap: 9 }, fieldLabel: { color: colors.text, fontSize: 12, fontWeight: '900' }, choiceGrid: { gap: 8 }, worldChoice: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }, choiceSelected: { backgroundColor: colors.violet, borderColor: colors.violet }, choiceTitle: { color: colors.text, fontWeight: '800' }, choiceTitleSelected: { color: '#fff' }, choiceDetail: { color: colors.muted, fontSize: 10, marginTop: 3 }, choiceDetailSelected: { color: 'rgba(255,255,255,.72)' }, goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, goal: { flex: 1, minWidth: 150, minHeight: 106, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }, goalSelected: { borderColor: colors.rose, backgroundColor: 'rgba(216,62,234,.08)' }, goalTitle: { color: colors.text, fontWeight: '900' }, goalDetail: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 7, paddingRight: 16 }, selectedDot: { position: 'absolute', right: 9, top: 9, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.rose }, privateNote: { color: colors.muted, fontSize: 10, lineHeight: 15, textAlign: 'center' }, preview: { flex: 1, minWidth: 280, gap: 13, padding: 20 }, previewIcon: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(216,62,234,.12)' }, previewKicker: { color: colors.violet, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }, previewTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 25 }, previewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, previewNumber: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.elevated }, previewNumberText: { color: colors.rose, fontSize: 10, fontWeight: '900' }, previewText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 17 }, meetingAs: { marginTop: 4, paddingTop: 15, borderTopWidth: 1, borderTopColor: colors.border }, meetingAsLabel: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }, meetingAsName: { color: colors.text, fontFamily: 'Georgia', fontSize: 21, marginTop: 4 }, meetingAsLife: { color: colors.rose, fontSize: 10, marginTop: 2 },
});
