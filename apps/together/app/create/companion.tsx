import { useEffect, useMemo, useState } from 'react';
import { hasOpenBuildWorldAccess } from '@together/domain/src/world-access';
import { Alert, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowRight, Check, Globe2, Sparkles, X } from 'lucide-react-native';
import { GradientButton, LoadingSkeleton, Screen } from '../../src/components';
import { createCreatorDraft, listCreatorDrafts } from '../../src/lib/api';
import { companionBasicsIssues } from '../../src/lib/creatorWizard';
import { createClientRequestId } from '../../src/lib/requestId';
import { useTogether } from '../../src/store/useTogether';
import { colors, radius, spacing } from '../../src/theme';

const genders = [
  { value: 'woman', label: 'Woman', pronouns: 'she/her' },
  { value: 'man', label: 'Man', pronouns: 'he/him' },
  { value: 'nonbinary', label: 'Nonbinary', pronouns: 'they/them' },
  { value: 'custom', label: 'Custom', pronouns: '' },
];
const goals = [
  { key: 'friendship', title: 'Friendship', detail: 'Build trust without romantic progression.' },
  { key: 'romance', title: 'Romance', detail: 'Let attraction develop naturally over time.' },
  { key: 'either', title: 'Let it develop', detail: 'Let the relationship find its own direction.' },
] as const;

export default function CreateCompanionEntry() {
  const params = useLocalSearchParams<{ template?: string }>();
  const snapshot = useTogether((state) => state.snapshot);
  const { width } = useWindowDimensions();
  const [name, setName] = useState('');
  const [ageText, setAgeText] = useState('28');
  const [genderChoice, setGenderChoice] = useState('');
  const [customGender, setCustomGender] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [description, setDescription] = useState('');
  const [worldId, setWorldId] = useState('');
  const [goal, setGoal] = useState<'friendship' | 'romance' | 'either'>('either');
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(Boolean(params.template));
  const worlds = useMemo(() => snapshot?.worlds.filter((world) => world.published && (hasOpenBuildWorldAccess(world.published) || world.access_type === 'free' || snapshot.userWorlds?.some((item) => item.world_id === world.id && item.access_status === 'unlocked'))) ?? [], [snapshot]);
  const selectedWorldId = worldId || worlds[0]?.id || '';
  const gender = genderChoice === 'custom' ? customGender : genderChoice;
  const age = Number(ageText);
  const issues = companionBasicsIssues({ name, age, gender, pronouns, worldId: selectedWorldId, description });

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

  const chooseGender = (value: string, suggestedPronouns: string) => {
    setGenderChoice(value);
    if (!pronouns || genders.some((item) => item.pronouns === pronouns)) setPronouns(suggestedPronouns);
  };
  const create = async () => {
    if (issues.length) { Alert.alert('Finish the required details', issues.join('\n')); return; }
    setBusy(true);
    try {
      const world = worlds.find((item) => item.id === selectedWorldId)?.name ?? 'their world';
      const concept = `${name.trim()} is an original fictional ${age}-year-old ${gender} adult who uses ${pronouns.trim()} pronouns and is a citizen of ${world}. ${description.trim() || 'Build a distinctive adult personality, career, interests, and independent life that fit this world.'}`;
      const { draft } = await createCreatorDraft({ concept, worldId: selectedWorldId, relationshipGoal: goal, requestId: createClientRequestId(), identitySeed: { name: name.trim(), age, gender, pronouns: pronouns.trim(), description: description.trim() || undefined } });
      router.replace(`/create/companion/${draft.id}` as never);
    } catch (error) {
      Alert.alert('Could not start this companion', error instanceof Error ? error.message : 'Your details are safe. Please try again.');
    } finally { setBusy(false); }
  };

  return <Screen contentStyle={styles.screen}>
    <View style={styles.scrim}><View style={[styles.modal, width < 700 && styles.modalMobile]}>
      <View style={styles.modalHeader}>
        <View style={styles.headerIcon}><Sparkles size={20} color={colors.rose} /></View>
        <View style={{ flex: 1 }}><Text style={styles.kicker}>CREATE A COMPANION</Text><Text style={styles.title}>Who are they?</Text><Text style={styles.subtitle}>Start with the facts Kivelle needs to keep their identity, world, and future media consistent.</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close companion creator" onPress={() => router.canGoBack() ? router.back() : router.replace('/singles')} style={styles.close}><X size={21} color={colors.text} /></Pressable>
      </View>
      <View style={styles.progress}><View style={[styles.progressPart, styles.progressActive]} /><View style={styles.progressPart} /><View style={styles.progressPart} /><View style={styles.progressPart} /><View style={styles.progressPart} /></View>
      <Text style={styles.stepLabel}>1 OF 5 · BASICS</Text>

      <View style={styles.form}>
        <View style={styles.row}><Field label="Name *" value={name} onChange={setName} placeholder="Their name" maxLength={50} /><Field label="Age *" value={ageText} onChange={(value) => setAgeText(value.replace(/\D/g, '').slice(0, 2))} placeholder="28" keyboard="number-pad" maxLength={2} /></View>
        <View style={styles.field}><Text style={styles.fieldLabel}>Gender *</Text><View style={styles.chips}>{genders.map((item) => <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ checked: genderChoice === item.value }} onPress={() => chooseGender(item.value, item.pronouns)} style={[styles.chip, genderChoice === item.value && styles.chipSelected]}><Text style={[styles.chipText, genderChoice === item.value && styles.chipTextSelected]}>{item.label}</Text></Pressable>)}</View></View>
        {genderChoice === 'custom' ? <Field label="Gender details *" value={customGender} onChange={setCustomGender} placeholder="How they describe their gender" maxLength={40} /> : null}
        <Field label="Pronouns *" value={pronouns} onChange={setPronouns} placeholder="she/her, he/him, they/them" maxLength={40} />
        <View style={styles.field}><Text style={styles.fieldLabel}>World citizenship *</Text><Text style={styles.fieldHelp}>Their home, work, schedule, and first meeting will use real places from this world.</Text><View style={styles.worldGrid}>{worlds.map((world) => <Pressable key={world.id} accessibilityRole="radio" accessibilityState={{ checked: selectedWorldId === world.id }} onPress={() => setWorldId(world.id)} style={[styles.world, selectedWorldId === world.id && styles.worldSelected]}><Globe2 size={17} color={selectedWorldId === world.id ? colors.rose : colors.violet} /><Text style={styles.worldName}>{world.name}</Text>{selectedWorldId === world.id ? <Check size={16} color={colors.rose} /> : null}</Pressable>)}</View></View>
        <View style={styles.field}><View style={styles.labelRow}><Text style={styles.fieldLabel}>Starting description</Text><Text style={styles.counter}>{description.length}/800</Text></View><Text style={styles.fieldHelp}>Optional for now. Describe the person you imagine; you will refine appearance and personality next.</Text><TextInput accessibilityLabel="Starting description" value={description} onChangeText={setDescription} maxLength={800} multiline textAlignVertical="top" style={[styles.input, styles.multiline]} placeholder="A perceptive architect with dry humor, strong opinions, and a softer side that takes time to show…" placeholderTextColor={colors.muted} /></View>
        <View style={styles.field}><Text style={styles.fieldLabel}>Relationship direction</Text><View style={styles.goalGrid}>{goals.map((item) => <Pressable key={item.key} accessibilityRole="radio" accessibilityState={{ checked: goal === item.key }} onPress={() => setGoal(item.key)} style={[styles.goal, goal === item.key && styles.goalSelected]}><Text style={styles.goalTitle}>{item.title}</Text><Text style={styles.goalDetail}>{item.detail}</Text></Pressable>)}</View></View>
      </View>

      {issues.length && (name || genderChoice || pronouns) ? <View style={styles.issueBox}><Text style={styles.issueTitle}>Still needed</Text>{issues.map((issue) => <Text key={issue} style={styles.issueText}>• {issue}</Text>)}</View> : null}
      <GradientButton label={busy ? 'Building their foundation…' : 'Continue to portrait'} icon={<ArrowRight size={18} color="#fff" />} disabled={busy || issues.length > 0} onPress={() => void create()} />
      <Text style={styles.privateNote}>This creates a private draft only. Nothing enters chat until you review and confirm the companion.</Text>
    </View></View>
  </Screen>;
}

function Field({ label, value, onChange, placeholder, maxLength, keyboard }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; maxLength?: number; keyboard?: 'number-pad' }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput accessibilityLabel={label.replace(' *', '')} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.muted} maxLength={maxLength} keyboardType={keyboard} style={styles.input} /></View>;
}

const styles = StyleSheet.create({
  screen: { maxWidth: 1400, paddingHorizontal: spacing.md }, scrim: { minHeight: '100%', alignItems: 'center', justifyContent: 'flex-start', paddingVertical: spacing.lg }, modal: { width: '100%', maxWidth: 820, gap: 16, padding: 24, borderRadius: 30, borderWidth: 1, borderColor: colors.borderBright, backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: .42, shadowRadius: 30, shadowOffset: { width: 0, height: 18 } }, modalMobile: { padding: 16, borderRadius: radius.xl }, modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 13 }, headerIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(216,62,234,.1)' }, close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.elevated }, kicker: { color: colors.rose, fontWeight: '900', fontSize: 10, letterSpacing: 1.3 }, title: { color: colors.text, fontFamily: 'Georgia', fontSize: 31, marginTop: 3 }, subtitle: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 4, maxWidth: 570 }, progress: { flexDirection: 'row', gap: 6 }, progressPart: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.border }, progressActive: { backgroundColor: colors.rose }, stepLabel: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, form: { gap: 15 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, field: { flex: 1, minWidth: 120, gap: 7 }, fieldLabel: { color: colors.text, fontSize: 11, fontWeight: '900' }, fieldHelp: { color: colors.muted, fontSize: 9, lineHeight: 14 }, input: { minHeight: 50, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.text, fontSize: 13 }, multiline: { minHeight: 112, paddingTop: 13 }, labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, counter: { color: colors.muted, fontSize: 10 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { flexGrow: 1, minWidth: 105, alignItems: 'center', paddingHorizontal: 13, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }, chipSelected: { borderColor: colors.rose, backgroundColor: 'rgba(216,62,234,.09)' }, chipText: { color: colors.muted, fontWeight: '800', fontSize: 11 }, chipTextSelected: { color: colors.text }, worldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, world: { flexGrow: 1, flexBasis: 220, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }, worldSelected: { borderColor: colors.rose, backgroundColor: 'rgba(216,62,234,.07)' }, worldName: { flex: 1, color: colors.text, fontWeight: '800', fontSize: 11 }, goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, goal: { flex: 1, minWidth: 150, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }, goalSelected: { borderColor: colors.rose, backgroundColor: 'rgba(216,62,234,.08)' }, goalTitle: { color: colors.text, fontWeight: '900', fontSize: 11 }, goalDetail: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 5 }, issueBox: { padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(242,162,127,.28)', backgroundColor: 'rgba(242,162,127,.07)' }, issueTitle: { color: colors.warm, fontWeight: '900', fontSize: 10 }, issueText: { color: colors.muted, fontSize: 9, marginTop: 4 }, privateNote: { color: colors.muted, fontSize: 9, textAlign: 'center', lineHeight: 14 },
});
