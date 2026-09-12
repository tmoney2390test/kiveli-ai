import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { CreatorWizardShell, GradientButton, LoadingSkeleton, Screen } from '../../src/components';
import { createCreatorDraft, listCreatorDrafts } from '../../src/lib/api';
import { companionBasicsIssues } from '../../src/lib/creatorWizard';
import { createClientRequestId } from '../../src/lib/requestId';
import { useTogether } from '../../src/store/useTogether';
import { canAccessWorld } from '../../src/lib/place';
import { CreatorPicker, creatorGenders, creatorPronouns } from '../../src/components/CreatorPicker';
import { worldHeroAsset } from '../../src/assets';
import { confirmAction, showActionAlert } from '../../src/lib/dialogs';
import { colors, radius, spacing } from '../../src/theme';

export default function CreateCompanionEntry() {
  const params = useLocalSearchParams<{ template?: string }>();
  const navigation = useNavigation();
  const snapshot = useTogether((state) => state.snapshot);
  const [name, setName] = useState('');
  const [ageText, setAgeText] = useState('28');
  const [gender, setGender] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [description, setDescription] = useState('');
  const [worldId, setWorldId] = useState('');
  const allowLeave = useRef(false);
  const createRequestId = useRef<string | null>(null);
  const creating = useRef(false);
  const dirty = Boolean(name || gender || pronouns || description || worldId || ageText !== '28');
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(Boolean(params.template));
  const worlds = useMemo(() => snapshot?.worlds.filter((world) => world.published && canAccessWorld(snapshot,world)) ?? [], [snapshot]);
  const selectedWorldId = worldId || worlds[0]?.id || '';
  const age = Number(ageText);
  const issues = companionBasicsIssues({ name, age, gender, pronouns, worldId: selectedWorldId, description });

  const leave = useCallback(() => {
    if (busy) return;
    const go = () => { allowLeave.current = true; if (router.canGoBack()) router.back(); else router.replace('/singles'); };
    if (!dirty) { go(); return; }
    confirmAction({ title: 'Leave companion creator?', message: 'Your progress on this step will be lost.', confirmLabel: 'Leave and discard', destructive: true, onConfirm: go });
  }, [busy, dirty]);
  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (allowLeave.current || !dirty) return;
    event.preventDefault();
    if (busy) return;
    confirmAction({ title: 'Leave companion creator?', message: 'Your progress on this step will be lost.', confirmLabel: 'Leave and discard', destructive: true, onConfirm: () => { allowLeave.current = true; navigation.dispatch(event.data.action); } });
  }), [navigation, dirty, busy]);
  useEffect(() => {
    if (!dirty) return;
    if (Platform.OS === 'web') {
      const warn = (event: BeforeUnloadEvent) => { if (!allowLeave.current) { event.preventDefault(); event.returnValue = ''; } };
      window.addEventListener('beforeunload', warn);
      return () => window.removeEventListener('beforeunload', warn);
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { leave(); return true; });
    return () => subscription.remove();
  }, [dirty, busy, leave]);

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

  if (!snapshot || recovering) return <LoadingSkeleton label={recovering ? 'Opening your companion draft…' : 'Opening companion creator…'} />;

  const chooseGender = (value: string) => {
    setGender(value);
    if (!pronouns || ['she/her', 'he/him', 'they/them'].includes(pronouns)) setPronouns(({ woman: 'she/her', man: 'he/him', nonbinary: 'they/them' } as Record<string, string>)[value] || pronouns);
  };
  const create = async () => {
    if (creating.current) return;
    if (issues.length) { showActionAlert('Finish the required details', issues.join('\n')); return; }
    creating.current = true;
    setBusy(true);
    try {
      const world = worlds.find((item) => item.id === selectedWorldId)?.name ?? 'their world';
      const concept = `${name.trim()} is an original fictional ${age}-year-old ${gender} adult who uses ${pronouns.trim()} pronouns and is a citizen of ${world}. ${description.trim() || 'Build a distinctive adult personality, career, interests, and independent life that fit this world.'}`;
      createRequestId.current ??= createClientRequestId();
      const { draft } = await createCreatorDraft({ concept, worldId: selectedWorldId, relationshipGoal: 'either', requestId: createRequestId.current, identitySeed: { name: name.trim(), age, gender, pronouns: pronouns.trim(), description: description.trim() || undefined } });
      allowLeave.current = true;
      router.replace(`/create/companion/${draft.id}` as never);
    } catch (error) {
      showActionAlert('Could not start this companion', error instanceof Error ? error.message : 'Your details are safe. Please try again.');
    } finally { creating.current = false; setBusy(false); }
  };

  return <Screen contentStyle={styles.screen}>
    <CreatorWizardShell title="Who are they?" subtitle="A name, a world, and the beginning of someone new." currentStep={1} totalSteps={7} stepLabel="Basics" onClose={leave} closeDisabled={busy}>
      <View style={styles.form}>
        <View style={styles.row}><Field label="Name *" value={name} onChange={setName} placeholder="Their name" maxLength={50} /><Field label="Age *" value={ageText} onChange={(value) => setAgeText(value.replace(/\D/g, '').slice(0, 2))} placeholder="28" keyboard="number-pad" maxLength={2} /></View>
        <View style={styles.row}><CreatorPicker label="Gender *" value={gender} options={creatorGenders} onChange={chooseGender} custom /><CreatorPicker label="Pronouns *" value={pronouns} options={creatorPronouns} onChange={setPronouns} custom /></View>
        <CreatorPicker label="World citizenship *" title="Choose their world" value={selectedWorldId} options={worlds.map((world) => ({ value: world.id, label: world.name, image: worldHeroAsset(world.slug) }))} onChange={setWorldId} />
        <View style={styles.field}><View style={styles.labelRow}><Text style={styles.fieldLabel}>Starting description</Text><Text style={styles.counter}>{description.length}/800</Text></View><Text style={styles.fieldHelp}>Optional for now. Describe the person you imagine; you will refine appearance and personality next.</Text><TextInput accessibilityLabel="Starting description" value={description} onChangeText={setDescription} maxLength={800} multiline textAlignVertical="top" style={[styles.input, styles.multiline]} placeholder="A perceptive architect with dry humor, strong opinions, and a softer side that takes time to show…" placeholderTextColor={colors.muted} /></View>
      </View>

      {issues.length && (name || gender || pronouns) ? <View style={styles.issueBox}><Text style={styles.issueTitle}>Still needed</Text>{issues.map((issue) => <Text key={issue} style={styles.issueText}>• {issue}</Text>)}</View> : null}
      <GradientButton label={busy ? 'Building their foundation…' : 'Continue to portrait'} icon={<ArrowRight size={18} color="#fff" />} disabled={busy || issues.length > 0} onPress={() => void create()} />
    </CreatorWizardShell>
  </Screen>;
}

function Field({ label, value, onChange, placeholder, maxLength, keyboard }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; maxLength?: number; keyboard?: 'number-pad' }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput accessibilityLabel={label.replace(' *', '')} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.muted} maxLength={maxLength} keyboardType={keyboard} style={styles.input} /></View>;
}

const styles = StyleSheet.create({
  screen: { maxWidth: 1400, paddingHorizontal: spacing.md }, form: { gap: 15 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, field: { flexGrow: 1, flexShrink: 0, minWidth: 120, gap: 7 }, fieldLabel: { color: colors.text, fontSize: 13, fontWeight: '900' }, fieldHelp: { color: colors.muted, fontSize: 12, lineHeight: 18 }, input: { minHeight: 50, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.text, fontSize: 13 }, multiline: { minHeight: 112, paddingTop: 13 }, labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, counter: { color: colors.muted, fontSize: 10 }, issueBox: { padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(242,162,127,.28)', backgroundColor: 'rgba(242,162,127,.07)' }, issueTitle: { color: colors.warm, fontWeight: '900', fontSize: 10 }, issueText: { color: colors.muted, fontSize: 9, marginTop: 4 },
});
