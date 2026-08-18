import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Coins, MapPin, RefreshCw, Sparkles, Trash2, UserRound } from 'lucide-react-native';
import { ErrorState, GradientButton, GlassCard, LoadingSkeleton, Screen, SpiceBadge } from '../../../src/components';
import { archiveCreatorDraft, finalizeCreatorDraft, generateCreatorAppearance, getCreatorDraft, meetCompanion, regenerateCreatorDraftSection, selectCreatorAppearance, selectCreatorFirstMeeting, updateCreatorDraftSection } from '../../../src/lib/api';
import { creatorSampleMessages } from '../../../src/lib/creator';
import { normalizeSpiceLevel } from '../../../src/lib/spice';
import { createClientRequestId } from '../../../src/lib/requestId';
import { mappedLocationAsset } from '../../../src/location-assets';
import { useTogether } from '../../../src/store/useTogether';
import { colors, radius, spacing } from '../../../src/theme';
import type { CreatorCommunicationConfig, CreatorConnectionConfig, CreatorDraft, CreatorIdentityConfig, CreatorLifeConfig, CreatorPersonalityConfig, CreatorRoutineBlock, CreatorStep, SpiceLevel } from '../../../src/types';

const steps: Array<{ key: CreatorStep; label: string; short: string }> = [
  { key: 'identity', label: 'Identity', short: 'Who they are' },
  { key: 'appearance', label: 'Appearance', short: 'Their canonical look' },
  { key: 'personality', label: 'Personality', short: 'How they think and talk' },
  { key: 'life', label: 'Life', short: 'Where and how they live' },
  { key: 'connection', label: 'Connection', short: 'How closeness develops' },
  { key: 'meeting', label: 'First meeting', short: 'How your story begins' },
  { key: 'review', label: 'Review', short: 'Meet them in Kivelle' },
];
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function CreatorStudioRoute() {
  const { draftId } = useLocalSearchParams<{ draftId: string }>();
  const { width } = useWindowDimensions();
  const setSnapshot = useTogether((state) => state.setSnapshot);
  const [draft, setDraft] = useState<CreatorDraft | null>(null);
  const [identity, setIdentity] = useState<CreatorIdentityConfig | null>(null);
  const [personality, setPersonality] = useState<CreatorPersonalityConfig | null>(null);
  const [communication, setCommunication] = useState<CreatorCommunicationConfig | null>(null);
  const [connection, setConnection] = useState<CreatorConnectionConfig | null>(null);
  const [life, setLife] = useState<CreatorLifeConfig | null>(null);
  const [routine, setRoutine] = useState<CreatorRoutineBlock[]>([]);
  const [appearanceDescription, setAppearanceDescription] = useState('');
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const applyDraft = useCallback((next: CreatorDraft, initializeStep = false) => {
    const normalizedConnection = { ...next.connection_config, spiceLevel: normalizeSpiceLevel(next.connection_config?.spiceLevel) };
    setDraft({ ...next, connection_config: normalizedConnection }); setIdentity(next.identity_config); setPersonality(next.personality_config); setCommunication(next.communication_config);
    setConnection(normalizedConnection); setLife(next.life_config); setRoutine(next.routine_config?.blocks ?? []);
    setAppearanceDescription(next.appearance_config?.description ?? '');
    if (initializeStep) setStepIndex(Math.max(0, steps.findIndex((step) => step.key === next.current_step)));
  }, []);

  const load = useCallback(async () => {
    if (!draftId) return;
    setError('');
    try { const result = await getCreatorDraft(draftId); applyDraft(result.draft, true); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'This character draft could not be opened.'); }
  }, [applyDraft, draftId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!draft?.assets.some((asset) => asset.status === 'queued' || asset.status === 'generating')) return;
    const timer = setTimeout(() => {
      if (!draftId) return;
      void getCreatorDraft(draftId).then((result) => applyDraft(result.draft)).catch(() => undefined);
    }, 4000);
    return () => clearTimeout(timer);
  }, [applyDraft, draft?.assets, draftId]);

  const saveSection = async (targetStep?: CreatorStep): Promise<CreatorDraft> => {
    if (!draft || !identity || !personality || !communication || !connection || !life) throw new Error('Creator Studio is still loading.');
    let current = draft;
    const update = async (section: 'identity' | 'appearance' | 'personality' | 'communication' | 'connection' | 'life' | 'routine', config: Record<string, unknown>, relationshipGoal?: CreatorDraft['relationship_goal']) => {
      const result = await updateCreatorDraftSection({ draftId: current.id, section, config, expectedRevision: current.revision, currentStep: targetStep, relationshipGoal });
      current = result.draft;
    };
    const active = steps[stepIndex]?.key;
    if (active === 'identity') await update('identity', identity);
    if (active === 'appearance') await update('appearance', { description: appearanceDescription });
    if (active === 'personality') { await update('personality', personality); await update('communication', communication); }
    if (active === 'life') { await update('life', life); await update('routine', { blocks: routine, source: 'creator_studio_user' }); }
    if (active === 'connection') await update('connection', connection, current.relationship_goal);
    applyDraft(current);
    return current;
  };

  const advance = async () => {
    if (!draft || stepIndex >= steps.length - 1) return;
    setBusy('save');
    try { await saveSection(steps[stepIndex + 1]!.key); setStepIndex((value) => value + 1); }
    catch (caught) { Alert.alert('Check this section', caught instanceof Error ? caught.message : 'These changes could not be saved.'); }
    finally { setBusy(''); }
  };

  const generateLooks = async () => {
    if (!draft) return;
    setBusy('appearance');
    try {
      const saved = await saveSection('appearance');
      const result = await generateCreatorAppearance(saved.id, createClientRequestId());
      applyDraft(result.draft);
    } catch (caught) { Alert.alert('Could not generate looks', caught instanceof Error ? caught.message : 'Please try again.'); }
    finally { setBusy(''); }
  };

  const chooseLook = async (assetId: string) => {
    if (!draft) return;
    setBusy(`look:${assetId}`);
    try { const result = await selectCreatorAppearance(draft.id, assetId); applyDraft(result.draft); }
    catch (caught) { Alert.alert('Could not use that appearance', caught instanceof Error ? caught.message : 'Please try again.'); }
    finally { setBusy(''); }
  };

  const regenerateRoutine = async () => {
    if (!draft) return;
    setBusy('routine');
    try {
      const saved = await saveSection('life');
      const result = await regenerateCreatorDraftSection(saved.id, 'routine'); applyDraft(result.draft);
    } catch (caught) { Alert.alert('Could not rebuild the routine', caught instanceof Error ? caught.message : 'Please try again.'); }
    finally { setBusy(''); }
  };

  const regenerateMeetings = async () => {
    if (!draft) return;
    setBusy('meeting');
    try { const result = await regenerateCreatorDraftSection(draft.id, 'first_meetings'); applyDraft(result.draft); }
    catch (caught) { Alert.alert('Could not create new introductions', caught instanceof Error ? caught.message : 'Please try again.'); }
    finally { setBusy(''); }
  };

  const chooseMeeting = async (meetingId: string) => {
    if (!draft) return;
    setBusy(`meeting:${meetingId}`);
    try { const result = await selectCreatorFirstMeeting(draft.id, meetingId); applyDraft(result.draft); }
    catch (caught) { Alert.alert('Could not choose that meeting', caught instanceof Error ? caught.message : 'Please try again.'); }
    finally { setBusy(''); }
  };

  const finalize = async () => {
    if (!draft) return;
    setBusy('finalize');
    try {
      const finalization = await finalizeCreatorDraft(draft.id, createClientRequestId());
      applyDraft(finalization.draft);
      const snapshot = await meetCompanion(finalization.result.characterTemplateId);
      setSnapshot(snapshot);
      router.replace(`/chat?character=${finalization.result.publicHandle}` as never);
    } catch (caught) { Alert.alert('Could not begin this relationship', caught instanceof Error ? caught.message : 'Your draft is safe. Please try again.'); }
    finally { setBusy(''); }
  };

  const archive = () => {
    if (!draft) return;
    Alert.alert('Archive this draft?', 'The unfinished character will leave Your Creations. No relationship history exists yet.', [
      { text: 'Keep draft', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: () => void archiveCreatorDraft(draft.id).then(() => router.replace('/(tabs)/singles')).catch((caught) => Alert.alert('Could not archive draft', caught instanceof Error ? caught.message : 'Please try again.')) },
    ]);
  };

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!draft || !identity || !personality || !communication || !connection || !life) return <LoadingSkeleton label="Opening Creator Studio…" />;
  const desktop = width >= 980;
  const activeStep = steps[stepIndex]!;
  const home = draft.locations?.find((location) => location.id === life.homeLocationId);
  const selectedMeeting = draft.first_meeting_config.options.find((option) => option.id === draft.first_meeting_config.selectedId);
  const hasAppearance = Boolean(draft.assets.some((asset) => asset.selected && asset.status === 'ready') || draft.appearance_config.referenceStoragePaths?.length);
  const reviewReady = hasAppearance && routine.length > 0 && Boolean(selectedMeeting);

  return <Screen contentStyle={styles.screen}>
    <View style={styles.topbar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Discover" onPress={() => router.push('/(tabs)/singles')} style={styles.iconButton}><ArrowLeft size={20} color={colors.text} /></Pressable>
      <View style={{ flex: 1 }}><Text style={styles.kicker}>CREATOR STUDIO</Text><Text style={styles.title}>{identity.name}</Text><Text style={styles.subtitle}>{draft.world?.name ?? 'Kivelle'} · Private draft</Text></View>
      {draft.status !== 'finalized' ? <Pressable accessibilityRole="button" accessibilityLabel="Archive character draft" onPress={archive} style={styles.iconButton}><Trash2 size={18} color={colors.muted} /></Pressable> : null}
    </View>

    <View style={styles.mobileProgress}><Text style={styles.progressLabel}>{stepIndex + 1} OF {steps.length} · {activeStep.label.toUpperCase()}</Text><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${((stepIndex + 1) / steps.length) * 100}%` }]} /></View></View>

    <View style={[styles.workspace, desktop && styles.workspaceDesktop]}>
      {desktop ? <View style={styles.stepRail}>{steps.map((step, index) => <Pressable key={step.key} accessibilityRole="button" accessibilityState={{ selected: stepIndex === index }} onPress={() => setStepIndex(index)} style={[styles.step, stepIndex === index && styles.stepActive]}><View style={[styles.stepDot, index < stepIndex && styles.stepDone, index === stepIndex && styles.stepCurrent]}>{index < stepIndex ? <Check size={12} color="#fff" /> : <Text style={styles.stepNumber}>{index + 1}</Text>}</View><View style={{ flex: 1 }}><Text style={[styles.stepLabel, stepIndex === index && styles.stepLabelActive]}>{step.label}</Text><Text style={styles.stepShort}>{step.short}</Text></View></Pressable>)}</View> : null}

      <View style={styles.editor}>
        <SectionIntro step={activeStep.label} title={sectionTitle(activeStep.key, identity.name)} body={sectionBody(activeStep.key)} />
        {activeStep.key === 'identity' ? <IdentityEditor value={identity} onChange={setIdentity} /> : null}
        {activeStep.key === 'appearance' ? <AppearanceEditor draft={draft} description={appearanceDescription} onDescription={setAppearanceDescription} busy={busy} onGenerate={() => void generateLooks()} onChoose={(id) => void chooseLook(id)} /> : null}
        {activeStep.key === 'personality' ? <PersonalityEditor personality={personality} communication={communication} onPersonality={setPersonality} onCommunication={setCommunication} name={identity.name} /> : null}
        {activeStep.key === 'life' ? <LifeEditor draft={draft} identity={identity} life={life} routine={routine} onLife={setLife} onRoutine={setRoutine} busy={busy === 'routine'} onRegenerate={() => void regenerateRoutine()} /> : null}
        {activeStep.key === 'connection' ? <ConnectionEditor goal={draft.relationship_goal} value={connection} onChange={setConnection} onGoal={(goal) => setDraft((current) => current ? { ...current, relationship_goal: goal } : current)} /> : null}
        {activeStep.key === 'meeting' ? <MeetingEditor draft={draft} busy={busy} onChoose={(id) => void chooseMeeting(id)} onRegenerate={() => void regenerateMeetings()} /> : null}
        {activeStep.key === 'review' ? <Review draft={draft} identity={identity} home={home?.name} selectedMeeting={selectedMeeting} ready={reviewReady} onFinalize={() => void finalize()} busy={busy === 'finalize'} /> : null}

        <View style={styles.navigation}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous creator section" disabled={stepIndex === 0 || Boolean(busy)} onPress={() => setStepIndex((value) => Math.max(0, value - 1))} style={[styles.secondaryButton, stepIndex === 0 && styles.disabled]}><ChevronLeft size={18} color={colors.text} /><Text style={styles.secondaryButtonText}>Back</Text></Pressable>
          {stepIndex < steps.length - 1 ? <Pressable accessibilityRole="button" accessibilityLabel={`Continue to ${steps[stepIndex + 1]!.label}`} disabled={Boolean(busy)} onPress={() => void advance()} style={[styles.primaryButton, Boolean(busy) && styles.disabled]}><Text style={styles.primaryButtonText}>{busy === 'save' ? 'Saving…' : 'Save & continue'}</Text><ChevronRight size={18} color="#fff" /></Pressable> : null}
        </View>
      </View>

      <CreatorPreview draft={draft} identity={identity} personality={personality} connection={connection} homeName={home?.name} meetingTitle={selectedMeeting?.title} />
    </View>
  </Screen>;
}

function SectionIntro({ step, title, body }: { step: string; title: string; body: string }) { return <View><Text style={styles.sectionKicker}>{step.toUpperCase()}</Text><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionBody}>{body}</Text></View>; }

function IdentityEditor({ value, onChange }: { value: CreatorIdentityConfig; onChange: (next: CreatorIdentityConfig) => void }) {
  return <View style={styles.form}>
    <View style={styles.twoColumn}><Field label="Name" value={value.name} onChange={(name) => onChange({ ...value, name })} /><Field label="Age" value={String(value.age)} keyboard="number-pad" onChange={(age) => onChange({ ...value, age: Number(age.replace(/\D/g, '')) || 18 })} /></View>
    <View style={styles.twoColumn}><Field label="Pronouns" value={value.pronouns} placeholder="she/her" onChange={(pronouns) => onChange({ ...value, pronouns })} /><Field label="Occupation" value={value.occupation} onChange={(occupation) => onChange({ ...value, occupation })} /></View>
    <Field label="Biography" value={value.biography} multiline onChange={(biography) => onChange({ ...value, biography })} />
    <TagField label="Interests" values={value.interests} onChange={(interests) => onChange({ ...value, interests })} placeholder="Jazz, food, travel" />
    <TagField label="Defining traits" values={value.traits} onChange={(traits) => onChange({ ...value, traits })} placeholder="Confident, perceptive, ambitious" />
    <TagField label="Ambitions" values={value.ambitions} onChange={(ambitions) => onChange({ ...value, ambitions })} placeholder="Build a meaningful design career" />
  </View>;
}

function AppearanceEditor({ draft, description, onDescription, busy, onGenerate, onChoose }: { draft: CreatorDraft; description: string; onDescription: (value: string) => void; busy: string; onGenerate: () => void; onChoose: (id: string) => void }) {
  return <View style={styles.form}>
    <Field label="Canonical appearance brief" value={description} multiline onChange={onDescription} help="Describe physical identity and enduring style. Outfits and scenes can change later; core identity stays consistent." />
    <Pressable accessibilityRole="button" accessibilityLabel="Generate three appearance options for 40 Kivelle Credits" disabled={Boolean(busy)} onPress={onGenerate} style={[styles.generateButton, Boolean(busy) && styles.disabled]}><Sparkles size={18} color={colors.rose} /><View style={{ flex: 1 }}><Text style={styles.generateTitle}>{busy === 'appearance' ? 'Generating three identities…' : draft.assets.length ? 'Generate another set' : 'Generate three appearance options'}</Text><Text style={styles.generateDetail}>Explicit action · failed generations are refunded</Text></View><View style={styles.credit}><Coins size={13} color={colors.warm} /><Text style={styles.creditText}>40</Text></View></Pressable>
    {draft.assets.some((asset) => asset.status === 'queued' || asset.status === 'generating') ? <GlassCard style={styles.emptyAppearance}><Sparkles size={30} color={colors.rose} /><Text style={styles.emptyTitle}>Creating their identity…</Text><Text style={styles.emptyCopy}>You can keep editing while Kivelle prepares three canonical looks. This updates automatically.</Text></GlassCard> : null}
    {draft.assets.some((asset) => asset.status === 'failed') && !draft.assets.some((asset) => asset.status === 'queued' || asset.status === 'generating' || asset.status === 'ready') ? <GlassCard style={styles.emptyAppearance}><RefreshCw size={30} color={colors.muted} /><Text style={styles.emptyTitle}>Those looks could not be created</Text><Text style={styles.emptyCopy}>Your Credits were returned. Generate another set when you’re ready.</Text></GlassCard> : null}
    {draft.assets.length ? <View style={styles.lookGrid}>{draft.assets.filter((asset) => asset.asset_type === 'appearance_candidate' && asset.status === 'ready').map((asset) => <Pressable key={asset.id} accessibilityRole="radio" accessibilityLabel={`${asset.label} appearance`} accessibilityState={{ checked: asset.selected }} onPress={() => onChoose(asset.id)} style={[styles.lookCard, asset.selected && styles.lookSelected]}>{asset.signedUrl ? <Image source={{ uri: asset.signedUrl }} style={styles.lookImage} contentFit="cover" contentPosition="top" /> : <View style={[styles.lookImage, styles.fallback]}><UserRound size={30} color={colors.rose} /></View>}<View style={styles.lookInfo}><Text style={styles.lookLabel}>{asset.label}</Text><Text style={styles.lookDescription} numberOfLines={3}>{asset.description}</Text>{asset.selected ? <View style={styles.selectedPill}><Check size={12} color="#fff" /><Text style={styles.selectedPillText}>IDENTITY SELECTED</Text></View> : <Text style={styles.chooseText}>{busy === `look:${asset.id}` ? 'Selecting…' : 'Use this identity'}</Text>}</View></Pressable>)}</View> : <GlassCard style={styles.emptyAppearance}><UserRound size={36} color={colors.violet} /><Text style={styles.emptyTitle}>No canonical face yet</Text><Text style={styles.emptyCopy}>Generate and select one identity before meeting this companion. Kivelle will use that reference across future photos.</Text></GlassCard>}
  </View>;
}

function PersonalityEditor({ personality, communication, onPersonality, onCommunication, name }: { personality: CreatorPersonalityConfig; communication: CreatorCommunicationConfig; onPersonality: (value: CreatorPersonalityConfig) => void; onCommunication: (value: CreatorCommunicationConfig) => void; name: string }) {
  const traits: Array<[keyof CreatorPersonalityConfig, string, string, string]> = [['warmth', 'Warmth', 'Reserved', 'Warm'], ['humor', 'Humor', 'Serious', 'Playful'], ['directness', 'Directness', 'Gentle', 'Direct'], ['independence', 'Independence', 'Attached', 'Independent'], ['spontaneity', 'Spontaneity', 'Planner', 'Spontaneous'], ['socialEnergy', 'Social energy', 'Private', 'Social']];
  const samples = creatorSampleMessages({ name, warmth: personality.warmth, humor: personality.humor, directness: personality.directness, messageLength: communication.messageLength });
  return <View style={styles.form}>
    <GlassCard>{traits.map(([key, label, low, high]) => <Scale key={String(key)} label={label} low={low} high={high} value={Number(personality[key] ?? .5)} onChange={(value) => onPersonality({ ...personality, [key]: value })} />)}</GlassCard>
    <Field label="Anything else?" value={personality.note ?? ''} multiline onChange={(note) => onPersonality({ ...personality, note })} placeholder="Professionally confident, but awkward when something becomes genuinely romantic." />
    <ChoiceField label="Message style" value={communication.messageLength} options={['concise', 'balanced', 'expressive']} onChange={(messageLength) => onCommunication({ ...communication, messageLength: messageLength as CreatorCommunicationConfig['messageLength'] })} />
    <ChoiceField label="Humor style" value={communication.humorStyle} options={['subtle', 'dry', 'natural', 'playful']} onChange={(humorStyle) => onCommunication({ ...communication, humorStyle: humorStyle as CreatorCommunicationConfig['humorStyle'] })} />
    <Scale label="Conversation initiative" low="Lets you lead" high="Initiates" value={communication.initiative} onChange={(initiative) => onCommunication({ ...communication, initiative })} />
    <Scale label="Emotional openness" low="Guarded" high="Open" value={communication.emotionalOpenness} onChange={(emotionalOpenness) => onCommunication({ ...communication, emotionalOpenness })} />
    <GlassCard style={styles.samples}><Text style={styles.cardKicker}>HOW TALKING TO {name.toUpperCase()} MAY FEEL</Text>{samples.map((sample) => <View key={sample} style={styles.sampleBubble}><Text style={styles.sampleText}>{sample.replace(`${name}: `, '')}</Text></View>)}<Text style={styles.previewDisclaimer}>Examples demonstrate style only. They are not scripted dialogue.</Text></GlassCard>
  </View>;
}

function LifeEditor({ draft, identity, life, routine, onLife, onRoutine, busy, onRegenerate }: { draft: CreatorDraft; identity: CreatorIdentityConfig; life: CreatorLifeConfig; routine: CreatorRoutineBlock[]; onLife: (value: CreatorLifeConfig) => void; onRoutine: (value: CreatorRoutineBlock[]) => void; busy: boolean; onRegenerate: () => void }) {
  const locations = draft.locations ?? [];
  const homeAreas = locations.filter((location) => ['region', 'district', 'neighborhood'].includes(location.location_type));
  const workPlaces = locations.filter((location) => !['residence', 'region', 'district', 'neighborhood', 'transit'].includes(location.location_type));
  const grouped = [...routine].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute);
  const changeTime = (id: string, edge: 'start' | 'end', delta: number) => onRoutine(routine.map((block) => block.id === id ? { ...block, [edge === 'start' ? 'startMinute' : 'endMinute']: Math.max(edge === 'start' ? 0 : block.startMinute + 30, Math.min(edge === 'start' ? block.endMinute - 30 : 1440, block[edge === 'start' ? 'startMinute' : 'endMinute'] + delta)) } : block));
  return <View style={styles.form}>
    <View style={styles.contextBanner}><MapPin size={18} color={colors.rose} /><View style={{ flex: 1 }}><Text style={styles.contextTitle}>{draft.world?.name}</Text><Text style={styles.contextCopy}>Home is a canonical area—not another companion’s private residence.</Text></View></View>
    <ChoiceCards label="Home area" items={homeAreas.map((location) => ({ id: location.id, title: location.name, detail: location.description }))} selected={life.homeLocationId} onChange={(homeLocationId) => onLife({ ...life, homeLocationId })} />
    <ChoiceCards label="Work or regular daytime place" items={[{ id: '', title: 'Private / flexible', detail: `Works around ${homeAreas.find((location) => location.id === life.homeLocationId)?.name ?? 'their home area'}.` }, ...workPlaces.map((location) => ({ id: location.id, title: location.name, detail: `${location.category} · ${location.description}` }))]} selected={life.workLocationId ?? ''} onChange={(workLocationId) => onLife({ ...life, workLocationId: workLocationId || null })} />
    <Field label="Typical lifestyle" value={life.lifestyle} multiline onChange={(lifestyle) => onLife({ ...life, lifestyle })} />
    <TagField label="Preferred activities" values={life.preferredActivities} onChange={(preferredActivities) => onLife({ ...life, preferredActivities })} placeholder={identity.interests.join(', ')} />
    <View style={styles.routineHeader}><View style={{ flex: 1 }}><Text style={styles.fieldLabel}>Weekly rhythm</Text><Text style={styles.fieldHelp}>Broad blocks keep their life believable without turning this into a calendar.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Regenerate weekly routine" disabled={busy} onPress={onRegenerate} style={styles.smallAction}><RefreshCw size={15} color={colors.violet} /><Text style={styles.smallActionText}>{busy ? 'Building…' : 'Regenerate'}</Text></Pressable></View>
    <View style={styles.routineList}>{grouped.map((block) => { const location = locations.find((item) => item.id === block.locationId); return <View key={block.id} style={styles.routineCard}><View style={styles.routineTop}><Text style={styles.routineDay}>{dayNames[block.dayOfWeek]}</Text><Text style={styles.routineTime}>{time(block.startMinute)}–{time(block.endMinute)}</Text></View><TextInput accessibilityLabel={`${dayNames[block.dayOfWeek]} activity`} value={block.activity} onChangeText={(activity) => onRoutine(routine.map((item) => item.id === block.id ? { ...item, activity } : item))} style={styles.routineInput} /><View style={styles.routineBottom}><Text style={styles.routinePlace}>{location?.name ?? 'Canonical place'}</Text><View style={styles.timeControls}><Pressable accessibilityLabel="Start 30 minutes earlier" onPress={() => changeTime(block.id, 'start', -30)} style={styles.timeButton}><Text style={styles.timeButtonText}>−30</Text></Pressable><Pressable accessibilityLabel="End 30 minutes later" onPress={() => changeTime(block.id, 'end', 30)} style={styles.timeButton}><Text style={styles.timeButtonText}>+30</Text></Pressable></View></View></View>; })}</View>
  </View>;
}

function ConnectionEditor({ goal, value, onChange, onGoal }: { goal: CreatorDraft['relationship_goal']; value: CreatorConnectionConfig; onChange: (value: CreatorConnectionConfig) => void; onGoal: (value: CreatorDraft['relationship_goal']) => void }) {
  return <View style={styles.form}>
    <ChoiceField label="Relationship direction" value={goal} options={['friendship', 'romance', 'either']} onChange={(next) => onGoal(next as CreatorDraft['relationship_goal'])} />
    <SpicePicker value={value.spiceLevel} onChange={(spiceLevel) => onChange({ ...value, spiceLevel })} />
    <GlassCard><Scale label="Romantic pace" low="Slow burn" high="Fast-moving" value={value.pace} onChange={(pace) => onChange({ ...value, pace })} /><Scale label="Affection" low="Reserved" high="Affectionate" value={value.affection} onChange={(affection) => onChange({ ...value, affection })} /><Scale label="Initiative" low="Lets you lead" high="Initiates" value={value.initiative} onChange={(initiative) => onChange({ ...value, initiative })} /></GlassCard>
    <ChoiceField label="Conflict style" value={value.conflictStyle} options={['gentle', 'direct', 'reflective', 'needs_space']} labels={{ needs_space: 'Needs space' }} onChange={(conflictStyle) => onChange({ ...value, conflictStyle: conflictStyle as CreatorConnectionConfig['conflictStyle'] })} />
    <TagField label="Personal boundaries" values={value.boundaries} onChange={(boundaries) => onChange({ ...value, boundaries })} placeholder="Needs time after conflict, values privacy" />
    <GlassCard style={styles.autonomy}><Text style={styles.cardKicker}>RELATIONSHIP AUTONOMY</Text><Text style={styles.cardTitle}>You define their style—not their devotion.</Text><Text style={styles.cardCopy}>Trust, attraction, commitment and relationship stage still grow from what actually happens between you.</Text></GlassCard>
  </View>;
}

function SpicePicker({ value, onChange }: { value: SpiceLevel; onChange: (value: SpiceLevel) => void }) {
  const choices: Array<{ level: SpiceLevel; title: string; detail: string }> = [
    { level: 1, title: 'Mild', detail: 'Reserved chemistry and subtle flirting.' },
    { level: 2, title: 'Flirty', detail: 'Playful attraction with a natural build.' },
    { level: 3, title: 'Bold', detail: 'Confident, direct romantic energy.' },
  ];
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>Spiciness</Text>
    <Text style={styles.fieldHelp}>Sets romantic boldness—not consent, relationship progress, or content permissions.</Text>
    <View style={styles.spiceChoices}>{choices.map((choice) => <Pressable key={choice.level} accessibilityRole="radio" accessibilityState={{ checked: value === choice.level }} accessibilityLabel={`${choice.title}. ${choice.level} of 3 peppers. ${choice.detail}`} onPress={() => onChange(choice.level)} style={[styles.spiceChoice, value === choice.level && styles.spiceChoiceSelected]}><SpiceBadge level={choice.level} compact /><Text style={styles.spiceTitle}>{choice.title}</Text><Text style={styles.spiceDetail}>{choice.detail}</Text></Pressable>)}</View>
  </View>;
}

function MeetingEditor({ draft, busy, onChoose, onRegenerate }: { draft: CreatorDraft; busy: string; onChoose: (id: string) => void; onRegenerate: () => void }) {
  return <View style={styles.form}>
    <View style={styles.routineHeader}><Text style={styles.fieldHelp}>Each introduction uses a real place and becomes canonical relationship history.</Text><Pressable accessibilityRole="button" accessibilityLabel="Generate new first meeting options" disabled={busy === 'meeting'} onPress={onRegenerate} style={styles.smallAction}><RefreshCw size={15} color={colors.violet} /><Text style={styles.smallActionText}>{busy === 'meeting' ? 'Building…' : 'Try new scenes'}</Text></Pressable></View>
    <View style={styles.meetingList}>{draft.first_meeting_config.options.map((option) => { const location = draft.locations?.find((item) => item.id === option.locationId); const source = mappedLocationAsset(draft.world?.slug, location?.slug); const selected = option.id === draft.first_meeting_config.selectedId; return <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={`${option.title}. ${option.setup}`} onPress={() => onChoose(option.id)} style={[styles.meetingCard, selected && styles.meetingSelected]}>{source ? <Image source={source} style={styles.meetingImage} contentFit="cover" contentPosition="center" /> : <View style={[styles.meetingImage, styles.fallback]}><MapPin size={30} color={colors.rose} /></View>}<View style={styles.meetingContent}><Text style={styles.cardKicker}>{draft.world?.name?.toUpperCase()}</Text><Text style={styles.meetingTitle}>{option.title}</Text><Text style={styles.meetingSetup}>{option.setup}</Text><View style={styles.openingLine}><Text style={styles.openingLabel}>THEIR FIRST LINE</Text><Text style={styles.openingText}>“{option.openingLine}”</Text></View>{selected ? <View style={styles.selectedPill}><Check size={12} color="#fff" /><Text style={styles.selectedPillText}>FIRST MEETING SELECTED</Text></View> : <Text style={styles.chooseText}>{busy === `meeting:${option.id}` ? 'Selecting…' : 'Choose this introduction'}</Text>}</View></Pressable>; })}</View>
  </View>;
}

function Review({ draft, identity, home, selectedMeeting, ready, onFinalize, busy }: { draft: CreatorDraft; identity: CreatorIdentityConfig; home?: string; selectedMeeting?: CreatorDraft['first_meeting_config']['options'][number]; ready: boolean; onFinalize: () => void; busy: boolean }) {
  const missing = [!draft.portraitUrl && !draft.appearance_config.referenceStoragePaths?.length ? 'Select an appearance' : '', !draft.routine_config.blocks.length ? 'Generate a routine' : '', !selectedMeeting ? 'Choose a first meeting' : ''].filter(Boolean);
  return <View style={styles.form}>
    <GlassCard style={styles.reviewHero}>{draft.portraitUrl ? <Image source={{ uri: draft.portraitUrl }} style={styles.reviewPortrait} contentFit="cover" contentPosition="top" /> : <View style={[styles.reviewPortrait, styles.fallback]}><UserRound size={54} color={colors.rose} /></View>}<View style={{ flex: 1 }}><Text style={styles.cardKicker}>READY TO LIVE IN KIVELLE</Text><Text style={styles.reviewName}>{identity.name}, {identity.age}</Text><Text style={styles.reviewMeta}>{identity.occupation} · {home ?? draft.world?.name}</Text><Text style={styles.reviewTraits}>{identity.traits.slice(0, 4).join(' · ')}</Text></View></GlassCard>
    <ReviewRow label="Identity" value={`${identity.pronouns || 'Pronouns not specified'} · ${identity.interests.slice(0, 3).join(', ')}`} complete />
    <ReviewRow label="Appearance" value={draft.portraitUrl ? 'Canonical identity selected' : 'No canonical portrait selected'} complete={Boolean(draft.portraitUrl || draft.appearance_config.referenceStoragePaths?.length)} />
    <ReviewRow label="Life" value={`${draft.routine_config.blocks.length} weekly rhythm blocks · ${home ?? 'Home area missing'}`} complete={draft.routine_config.blocks.length > 0} />
    <ReviewRow label="Connection" value={`${title(draft.relationship_goal)} · ${title(String(draft.connection_config.conflictStyle).replace('_', ' '))}`} complete />
    <ReviewRow label="First meeting" value={selectedMeeting?.title ?? 'Choose an introduction'} complete={Boolean(selectedMeeting)} />
    {missing.length ? <View style={styles.missing}><Text style={styles.missingTitle}>Before you meet</Text>{missing.map((item) => <Text key={item} style={styles.missingItem}>• {item}</Text>)}</View> : null}
    <GradientButton label={busy ? `Preparing ${identity.name}…` : `Meet ${identity.name}`} icon={<ArrowRight size={18} color="#fff" />} disabled={!ready || busy} onPress={onFinalize} />
    <Text style={styles.privateNote}>Meeting finalizes this character and creates a new relationship inside your selected Kivelle Life.</Text>
  </View>;
}

function CreatorPreview({ draft, identity, personality, connection, homeName, meetingTitle }: { draft: CreatorDraft; identity: CreatorIdentityConfig; personality: CreatorPersonalityConfig; connection: CreatorConnectionConfig; homeName?: string; meetingTitle?: string }) {
  return <View style={styles.preview}><View style={styles.previewPortraitWrap}>{draft.portraitUrl ? <Image source={{ uri: draft.portraitUrl }} style={styles.previewPortrait} contentFit="cover" contentPosition="top" /> : <View style={[styles.previewPortrait, styles.fallback]}><Text style={styles.previewInitial}>{identity.name[0]?.toUpperCase()}</Text></View>}<View style={styles.privateBadge}><Text style={styles.privateBadgeText}>PRIVATE</Text></View></View><View style={styles.previewContent}><Text style={styles.previewName}>{identity.name}</Text><Text style={styles.previewMeta}>{identity.occupation} · {identity.age}</Text><Text style={styles.previewTraits}>{identity.traits.slice(0, 4).join(' · ')}</Text><Text style={styles.previewBio} numberOfLines={5}>{identity.biography}</Text><PreviewFact label="LIFE" value={`${homeName ?? draft.world?.name ?? 'Kivelle'} · ${identity.interests.slice(0, 2).join(' & ')}`} /><PreviewFact label="PERSONALITY" value={`${personality.warmth >= .65 ? 'Warm' : 'Reserved'} · ${personality.humor >= .65 ? 'Playful' : 'Grounded'} · ${personality.independence >= .65 ? 'Independent' : 'Connected'}`} /><PreviewFact label="CONNECTION" value={`${connection.pace < .45 ? 'Slow burn' : 'Natural pace'} · ${title(draft.relationship_goal)}`} />{meetingTitle ? <PreviewFact label="FIRST MEETING" value={meetingTitle} /> : null}</View></View>;
}

function Field({ label, value, onChange, placeholder, multiline = false, keyboard, help }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; multiline?: boolean; keyboard?: 'number-pad'; help?: string }) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>{help ? <Text style={styles.fieldHelp}>{help}</Text> : null}<TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.muted} multiline={multiline} keyboardType={keyboard} textAlignVertical={multiline ? 'top' : 'center'} style={[styles.input, multiline && styles.multiline]} /></View>; }
function TagField({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (value: string[]) => void; placeholder?: string }) { return <Field label={label} value={values.join(', ')} placeholder={placeholder} onChange={(text) => onChange(text.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 12))} help="Separate items with commas." />; }
function Scale({ label, low, high, value, onChange }: { label: string; low: string; high: string; value: number; onChange: (value: number) => void }) { const normalized = Math.max(0, Math.min(1, value)); return <View style={styles.scale}><View style={styles.scaleHeader}><Text style={styles.scaleLabel}>{label}</Text><Text style={styles.scaleValue}>{Math.round(normalized * 10)}/10</Text></View><View style={styles.scaleControl}><Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} onPress={() => onChange(Math.max(0, Number((normalized - .1).toFixed(1))))} style={styles.scaleButton}><Text style={styles.scaleButtonText}>−</Text></Pressable><View style={styles.track}><View style={[styles.fill, { width: `${normalized * 100}%` }]} /></View><Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`} onPress={() => onChange(Math.min(1, Number((normalized + .1).toFixed(1))))} style={styles.scaleButton}><Text style={styles.scaleButtonText}>+</Text></Pressable></View><View style={styles.scaleEnds}><Text style={styles.scaleEnd}>{low}</Text><Text style={styles.scaleEnd}>{high}</Text></View></View>; }
function ChoiceField({ label, value, options, onChange, labels = {} }: { label: string; value: string; options: string[]; onChange: (value: string) => void; labels?: Record<string, string> }) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><View style={styles.chips}>{options.map((option) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: value === option }} onPress={() => onChange(option)} style={[styles.chip, value === option && styles.chipSelected]}><Text style={[styles.chipText, value === option && styles.chipTextSelected]}>{title(labels[option] ?? option.replace('_', ' '))}</Text></Pressable>)}</View></View>; }
function ChoiceCards({ label, items, selected, onChange }: { label: string; items: Array<{ id: string; title: string; detail: string }>; selected: string; onChange: (value: string) => void }) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><View style={styles.choiceCards}>{items.map((item) => <Pressable key={item.id || 'private'} accessibilityRole="radio" accessibilityState={{ checked: selected === item.id }} onPress={() => onChange(item.id)} style={[styles.choiceCard, selected === item.id && styles.choiceCardSelected]}><View style={{ flex: 1 }}><Text style={styles.choiceCardTitle}>{item.title}</Text><Text style={styles.choiceCardDetail} numberOfLines={2}>{item.detail}</Text></View>{selected === item.id ? <Check size={17} color={colors.rose} /> : null}</Pressable>)}</View></View>; }
function ReviewRow({ label, value, complete }: { label: string; value: string; complete: boolean }) { return <View style={styles.reviewRow}><View style={[styles.reviewCheck, complete && styles.reviewCheckComplete]}>{complete ? <Check size={13} color="#fff" /> : null}</View><View style={{ flex: 1 }}><Text style={styles.reviewLabel}>{label}</Text><Text style={styles.reviewValue}>{value}</Text></View></View>; }
function PreviewFact({ label, value }: { label: string; value: string }) { return <View style={styles.previewFact}><Text style={styles.previewFactLabel}>{label}</Text><Text style={styles.previewFactValue}>{value}</Text></View>; }
function sectionTitle(step: CreatorStep, name: string) { return ({ identity: `Who is ${name}?`, appearance: `Choose ${name}'s identity.`, personality: `Give ${name} a point of view.`, life: `Build a life that keeps moving.`, connection: `Decide how closeness feels.`, meeting: `Choose where your story begins.`, review: `${name} is almost ready.` } as Record<CreatorStep, string>)[step]; }
function sectionBody(step: CreatorStep) { return ({ identity: 'These are canonical facts—not memories the companion has to rediscover.', appearance: 'The selected face becomes the stable visual reference for future scenes and photos.', personality: 'Shape tendencies and communication without scripting every response.', life: 'Use real places and a broad weekly rhythm so their world remains internally consistent.', connection: 'Guide relationship behavior without pre-setting trust, attraction, or devotion.', meeting: 'This scene becomes the first real event in your shared history.', review: 'Check the pieces that will enter the normal Kivelle relationship engine.' } as Record<CreatorStep, string>)[step]; }
function time(minute: number) { const hours = Math.floor(minute / 60); const minutes = minute % 60; return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`; }
function title(value: string) { return value ? value[0]!.toUpperCase() + value.slice(1) : value; }

const styles = StyleSheet.create({
  spiceChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  spiceChoice: { flex: 1, minWidth: 130, gap: 6, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  spiceChoiceSelected: { borderColor: colors.rose, backgroundColor: 'rgba(232,93,140,.07)' },
  spiceTitle: { color: colors.text, fontWeight: '900', fontSize: 12 },
  spiceDetail: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  screen: { maxWidth: 1240, paddingHorizontal: spacing.lg }, topbar: { flexDirection: 'row', alignItems: 'center', gap: 12 }, iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, kicker: { color: colors.rose, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 }, title: { color: colors.text, fontFamily: 'Georgia', fontSize: 28, marginTop: 2 }, subtitle: { color: colors.muted, fontSize: 10, marginTop: 2 }, mobileProgress: { gap: 7 }, progressLabel: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, progressTrack: { height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.border }, progressFill: { height: 3, backgroundColor: colors.rose }, workspace: { gap: 16 }, workspaceDesktop: { flexDirection: 'row', alignItems: 'flex-start' }, stepRail: { width: 174, padding: 8, gap: 4, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, step: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 9, borderRadius: radius.md }, stepActive: { backgroundColor: colors.elevated }, stepDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }, stepDone: { backgroundColor: colors.violet, borderColor: colors.violet }, stepCurrent: { borderColor: colors.rose }, stepNumber: { color: colors.muted, fontSize: 9, fontWeight: '900' }, stepLabel: { color: colors.muted, fontSize: 11, fontWeight: '800' }, stepLabelActive: { color: colors.text }, stepShort: { color: colors.dimmed, fontSize: 8, marginTop: 2 }, editor: { flex: 1, minWidth: 0, gap: 18, padding: 18, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, sectionKicker: { color: colors.rose, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 }, sectionTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 27, marginTop: 5 }, sectionBody: { color: colors.muted, lineHeight: 19, fontSize: 12, marginTop: 6 }, form: { gap: 15 }, field: { flex: 1, gap: 7 }, fieldLabel: { color: colors.text, fontSize: 11, fontWeight: '900' }, fieldHelp: { color: colors.muted, fontSize: 9, lineHeight: 14 }, input: { minHeight: 48, paddingHorizontal: 13, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.text, fontSize: 13 }, multiline: { minHeight: 108, paddingTop: 12 }, twoColumn: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, generateButton: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(232,93,140,.3)', backgroundColor: 'rgba(232,93,140,.06)' }, generateTitle: { color: colors.text, fontWeight: '900' }, generateDetail: { color: colors.muted, fontSize: 9, marginTop: 3 }, credit: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(242,162,127,.1)' }, creditText: { color: colors.warm, fontSize: 10, fontWeight: '900' }, lookGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, lookCard: { flexGrow: 1, flexBasis: 190, maxWidth: 270, overflow: 'hidden', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }, lookSelected: { borderColor: colors.rose, borderWidth: 2 }, lookImage: { width: '100%', aspectRatio: .8, backgroundColor: colors.elevated }, lookInfo: { padding: 11, gap: 6 }, lookLabel: { color: colors.text, fontFamily: 'Georgia', fontSize: 19 }, lookDescription: { color: colors.muted, fontSize: 9, lineHeight: 14 }, selectedPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 13, backgroundColor: colors.rose }, selectedPillText: { color: '#fff', fontSize: 8, fontWeight: '900' }, chooseText: { color: colors.rose, fontSize: 10, fontWeight: '900' }, fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.elevated }, emptyAppearance: { alignItems: 'center', gap: 9, padding: 24 }, emptyTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 20 }, emptyCopy: { color: colors.muted, fontSize: 10, lineHeight: 16, textAlign: 'center', maxWidth: 340 }, scale: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border }, scaleHeader: { flexDirection: 'row', justifyContent: 'space-between' }, scaleLabel: { color: colors.text, fontSize: 11, fontWeight: '800' }, scaleValue: { color: colors.rose, fontSize: 9, fontWeight: '900' }, scaleControl: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 8 }, scaleButton: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.elevated }, scaleButtonText: { color: colors.text, fontSize: 17 }, track: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.background }, fill: { height: 5, backgroundColor: colors.rose }, scaleEnds: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5, paddingHorizontal: 39 }, scaleEnd: { color: colors.dimmed, fontSize: 8 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }, chipSelected: { backgroundColor: colors.rose, borderColor: colors.rose }, chipText: { color: colors.muted, fontSize: 10, fontWeight: '800' }, chipTextSelected: { color: '#fff' }, samples: { gap: 9 }, cardKicker: { color: colors.rose, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 }, sampleBubble: { alignSelf: 'flex-start', maxWidth: '88%', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 15, borderBottomLeftRadius: 4, backgroundColor: colors.elevated }, sampleText: { color: colors.text, fontSize: 11, lineHeight: 16 }, previewDisclaimer: { color: colors.dimmed, fontSize: 8 }, contextBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: 'rgba(232,93,140,.06)', borderWidth: 1, borderColor: 'rgba(232,93,140,.18)' }, contextTitle: { color: colors.text, fontWeight: '900' }, contextCopy: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 2 }, choiceCards: { gap: 7 }, choiceCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }, choiceCardSelected: { borderColor: colors.rose, backgroundColor: 'rgba(232,93,140,.06)' }, choiceCardTitle: { color: colors.text, fontWeight: '800', fontSize: 11 }, choiceCardDetail: { color: colors.muted, fontSize: 9, lineHeight: 13, marginTop: 3 }, routineHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 }, smallAction: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.elevated }, smallActionText: { color: colors.text, fontSize: 9, fontWeight: '800' }, routineList: { gap: 7 }, routineCard: { padding: 11, gap: 7, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }, routineTop: { flexDirection: 'row', justifyContent: 'space-between' }, routineDay: { color: colors.rose, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' }, routineTime: { color: colors.text, fontSize: 9, fontWeight: '800' }, routineInput: { color: colors.text, fontSize: 11, fontWeight: '700', borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 5 }, routineBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 }, routinePlace: { flex: 1, color: colors.muted, fontSize: 9 }, timeControls: { flexDirection: 'row', gap: 5 }, timeButton: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 11, backgroundColor: colors.elevated }, timeButtonText: { color: colors.text, fontSize: 8, fontWeight: '800' }, autonomy: { gap: 6 }, cardTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 20 }, cardCopy: { color: colors.muted, fontSize: 10, lineHeight: 16 }, meetingList: { gap: 12 }, meetingCard: { overflow: 'hidden', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }, meetingSelected: { borderColor: colors.rose, borderWidth: 2 }, meetingImage: { width: '100%', height: 190, backgroundColor: colors.elevated }, meetingContent: { padding: 13, gap: 7 }, meetingTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 21 }, meetingSetup: { color: colors.muted, fontSize: 10, lineHeight: 16 }, openingLine: { padding: 10, borderRadius: radius.md, backgroundColor: colors.elevated }, openingLabel: { color: colors.violet, fontSize: 8, fontWeight: '900', letterSpacing: 1 }, openingText: { color: colors.text, fontSize: 11, lineHeight: 17, marginTop: 4, fontStyle: 'italic' }, reviewHero: { flexDirection: 'row', alignItems: 'center', gap: 14 }, reviewPortrait: { width: 116, height: 145, borderRadius: radius.md, backgroundColor: colors.elevated }, reviewName: { color: colors.text, fontFamily: 'Georgia', fontSize: 27, marginTop: 4 }, reviewMeta: { color: colors.rose, fontSize: 10, marginTop: 3 }, reviewTraits: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 7 }, reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: radius.md, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }, reviewCheck: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.elevated }, reviewCheckComplete: { backgroundColor: colors.violet, alignItems: 'center', justifyContent: 'center' }, reviewLabel: { color: colors.text, fontSize: 11, fontWeight: '900' }, reviewValue: { color: colors.muted, fontSize: 9, marginTop: 3 }, missing: { padding: 12, borderRadius: radius.md, backgroundColor: 'rgba(242,162,127,.08)', borderWidth: 1, borderColor: 'rgba(242,162,127,.2)' }, missingTitle: { color: colors.warm, fontWeight: '900', fontSize: 11 }, missingItem: { color: colors.muted, fontSize: 10, marginTop: 5 }, privateNote: { color: colors.muted, fontSize: 9, lineHeight: 14, textAlign: 'center' }, preview: { width: 286, overflow: 'hidden', borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, previewPortraitWrap: { height: 310, backgroundColor: colors.elevated }, previewPortrait: { width: '100%', height: '100%' }, previewInitial: { color: colors.rose, fontFamily: 'Georgia', fontSize: 80 }, privateBadge: { position: 'absolute', right: 10, top: 10, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12, backgroundColor: 'rgba(8,11,19,.72)' }, privateBadgeText: { color: '#fff', fontSize: 8, fontWeight: '900', letterSpacing: 1 }, previewContent: { padding: 15, gap: 8 }, previewName: { color: colors.text, fontFamily: 'Georgia', fontSize: 30 }, previewMeta: { color: colors.rose, fontSize: 10, fontWeight: '800' }, previewTraits: { color: colors.text, fontSize: 9 }, previewBio: { color: colors.muted, fontSize: 10, lineHeight: 16 }, previewFact: { paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }, previewFactLabel: { color: colors.dimmed, fontSize: 8, fontWeight: '900', letterSpacing: 1 }, previewFactValue: { color: colors.text, fontSize: 10, lineHeight: 15, marginTop: 3 }, navigation: { flexDirection: 'row', gap: 9, paddingTop: 4 }, secondaryButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 17, borderRadius: radius.md, backgroundColor: colors.elevated }, secondaryButtonText: { color: colors.text, fontWeight: '800' }, primaryButton: { flex: 1, minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 17, borderRadius: radius.md, backgroundColor: colors.rose }, primaryButtonText: { color: '#fff', fontWeight: '900' }, disabled: { opacity: .45 },
});
