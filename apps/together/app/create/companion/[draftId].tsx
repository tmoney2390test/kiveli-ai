import { styles } from '../../../src/styles/companionDraftStyles';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowRight, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, MapPin, Plus, RefreshCw, Sparkles, Trash2, UserRound, X } from 'lucide-react-native';
import { CreatorWizardShell, ErrorState, GradientButton, GlassCard, KivelleCreditIcon, LoadingSkeleton, Screen } from '../../../src/components';
import { archiveCreatorDraft, authorizeCreatorAppearanceUpload, cancelCreatorAppearanceUpload, completeCreatorAppearanceUpload, finalizeCreatorDraft, generateCreatorAppearance, getCreatorDraft, meetCompanion, regenerateCreatorDraftSection, selectCreatorAppearance, selectCreatorFirstMeeting, updateCreatorDraftSection } from '../../../src/lib/api';
import { CreatorModal, CreatorPicker, creatorGenders, creatorPronouns } from '../../../src/components/CreatorPicker';
import { creditCost } from '@together/domain/src/entitlements';
import { creatorSampleMessages } from '../../../src/lib/creator';
import { creatorSectionIssues, nextCreatorRoutineSlot } from '../../../src/lib/creatorWizard';
import { confirmAction, showActionAlert } from '../../../src/lib/dialogs';
import { cleanupNormalizedImage, normalizeUserImage, userImagePickerOptions } from '../../../src/lib/imageUploads';
import { normalizeSpiceLevel } from '../../../src/lib/spice';
import { createClientRequestId } from '../../../src/lib/requestId';
import { supabase } from '../../../src/lib/supabase';
import { mappedLocationAsset } from '../../../src/location-assets';
import { useTogether } from '../../../src/store/useTogether';
import { colors } from '../../../src/theme';
import type { CreatorCommunicationConfig, CreatorConnectionConfig, CreatorDraft, CreatorIdentityConfig, CreatorLifeConfig, CreatorPersonalityConfig, CreatorRoutineBlock, CreatorStep, SpiceLevel } from '../../../src/types';

const steps: Array<{ key: CreatorStep; label: string; short: string }> = [
  { key: 'appearance', label: 'Portrait', short: 'Their canonical look' },
  { key: 'personality', label: 'Personality', short: 'Work, history and voice' },
  { key: 'life', label: 'Schedule', short: 'Where and how they live' },
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
  const [relationshipGoal, setRelationshipGoal] = useState<CreatorDraft['relationship_goal']>('either');
  const [life, setLife] = useState<CreatorLifeConfig | null>(null);
  const [routine, setRoutine] = useState<CreatorRoutineBlock[]>([]);
  const [appearanceDescription, setAppearanceDescription] = useState('');
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const appearanceRequestId = useRef<string | null>(null);
  const finalizationRequestId = useRef<string | null>(null);
  const operationInFlight = useRef(false);

  const applyDraft = useCallback((next: CreatorDraft, initializeStep = false) => {
    const normalizedConnection = { ...next.connection_config, spiceLevel: normalizeSpiceLevel(next.connection_config?.spiceLevel) };
    setDraft({ ...next, connection_config: normalizedConnection }); setIdentity(next.identity_config); setPersonality(next.personality_config); setCommunication(next.communication_config);
    setConnection(normalizedConnection); setRelationshipGoal(next.relationship_goal); setLife(next.life_config); setRoutine(next.routine_config?.blocks ?? []);
    setAppearanceDescription(next.appearance_config?.description ?? '');
    if (initializeStep) { const index = Math.max(0, steps.findIndex((step) => step.key === next.current_step)); setStepIndex(index); }
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
      void getCreatorDraft(draftId).then(({ draft: next }) => {
        // Portrait status can change while another section has unsaved edits.
        // Refresh media and revision without replacing the fields being edited.
        setDraft((current) => current && current.id === next.id && next.revision >= current.revision
          ? { ...current, assets: next.assets, portraitUrl: next.portraitUrl, appearance_config: next.appearance_config, revision: next.revision, status: next.status }
          : current);
      }).catch(() => undefined);
    }, 4000);
    return () => clearTimeout(timer);
  }, [draft?.assets, draftId]);

  const saveSection = async (targetStep?: CreatorStep): Promise<CreatorDraft> => {
    if (!draft || !identity || !personality || !communication || !connection || !life) throw new Error('Creator Studio is still loading.');
    let current = draft;
    const update = async (section: 'identity' | 'appearance' | 'personality' | 'communication' | 'connection' | 'life' | 'routine', config: Record<string, unknown>, relationshipGoal?: CreatorDraft['relationship_goal']) => {
      const result = await updateCreatorDraftSection({ draftId: current.id, section, config, expectedRevision: current.revision, currentStep: targetStep, relationshipGoal });
      current = result.draft;
    };
    const active = steps[stepIndex]?.key;
    try {
      if (active === 'appearance') await update('appearance', { description: appearanceDescription });
      if (active === 'personality') { await update('identity', identity); await update('personality', personality); await update('communication', communication); }
      if (active === 'life') { await update('life', life); await update('routine', { blocks: routine, source: 'creator_studio_user' }); }
      if (active === 'connection') await update('connection', connection, relationshipGoal);
    } catch (caught) {
      // A section may involve several writes. Keep the editor values, but
      // refresh the revision so a later retry does not conflict forever.
      try {
        const { draft: latest } = await getCreatorDraft(current.id);
        setDraft((previous) => previous?.id === latest.id ? { ...previous, revision: latest.revision, assets: latest.assets, portraitUrl: latest.portraitUrl, appearance_config: latest.appearance_config } : previous);
      } catch { /* The original save error is more useful to show. */ }
      throw caught;
    }
    applyDraft(current);
    return current;
  };

  const sectionDirty = () => {
    if (!draft) return false;
    const active = steps[stepIndex]?.key;
    if (active === 'appearance') return appearanceDescription !== draft.appearance_config.description;
    if (active === 'personality') return JSON.stringify([identity, personality, communication]) !== JSON.stringify([draft.identity_config, draft.personality_config, draft.communication_config]);
    if (active === 'life') return JSON.stringify([life, routine]) !== JSON.stringify([draft.life_config, draft.routine_config.blocks]);
    if (active === 'connection') return relationshipGoal !== draft.relationship_goal || JSON.stringify(connection) !== JSON.stringify(draft.connection_config);
    return false;
  };

  const advance = async () => {
    if (!draft || stepIndex >= steps.length - 1 || operationInFlight.current) return;
    const active = steps[stepIndex]!.key;
    const issues = creatorSectionIssues({ step: active, identity: identity!, appearanceDescription, hasAppearance: Boolean(draft.portraitUrl || draft.appearance_config.referenceStoragePaths?.length), life: life!, routine, selectedMeeting: Boolean(draft.first_meeting_config.selectedId), connection: connection! });
    if (issues.length) { showActionAlert('Finish this section', issues.join('\n')); return; }
    operationInFlight.current = true;
    setBusy('save');
    try { await saveSection(steps[stepIndex + 1]!.key); setStepIndex(stepIndex + 1); }
    catch (caught) { showActionAlert('Check this section', caught instanceof Error ? caught.message : 'These changes could not be saved.'); }
    finally { operationInFlight.current = false; setBusy(''); }
  };

  const back = async () => {
    if (!draft || stepIndex === 0 || operationInFlight.current) return;
    const previous = stepIndex - 1;
    if (!sectionDirty()) { setStepIndex(previous); return; }
    operationInFlight.current = true;
    setBusy('save');
    try { await saveSection(steps[previous]!.key); setStepIndex(previous); }
    catch (caught) {
      confirmAction({ title: 'These edits could not be saved', message: `${caught instanceof Error ? caught.message : 'Please check this section.'}\n\nGo back and discard the unsaved edits on this step?`, confirmLabel: 'Discard edits', destructive: true, onConfirm: async () => {
        try { const { draft: latest } = await getCreatorDraft(draft.id); applyDraft(latest); setStepIndex(previous); }
        catch (error) { showActionAlert('Could not reopen the draft', error instanceof Error ? error.message : 'Please try again.'); }
      } });
    } finally { operationInFlight.current = false; setBusy(''); }
  };

  const close = async () => {
    if (!draft || operationInFlight.current) return;
    if (!sectionDirty()) { router.replace('/(tabs)/singles'); return; }
    operationInFlight.current = true;
    setBusy('save');
    try { await saveSection(); router.replace('/(tabs)/singles'); }
    catch (caught) {
      confirmAction({ title: 'These edits could not be saved', message: `${caught instanceof Error ? caught.message : 'Please check this section.'}\n\nLeave and discard the unsaved edits on this step?`, confirmLabel: 'Leave without saving', destructive: true, onConfirm: () => router.replace('/(tabs)/singles') });
    } finally { operationInFlight.current = false; setBusy(''); }
  };

  const generateLooks = async () => {
    if (!draft || operationInFlight.current) return;
    operationInFlight.current = true;
    setBusy('appearance');
    try {
      const saved = await saveSection('appearance');
      appearanceRequestId.current ??= createClientRequestId();
      const result = await generateCreatorAppearance(saved.id, appearanceRequestId.current);
      appearanceRequestId.current = null;
      applyDraft(result.draft);
    } catch (caught) { showActionAlert('Could not generate looks', caught instanceof Error ? caught.message : 'Please try again.'); }
    finally { operationInFlight.current = false; setBusy(''); }
  };

  const chooseLook = async (assetId: string) => {
    if (!draft) return;
    setBusy(`look:${assetId}`);
    try { const result = await selectCreatorAppearance(draft.id, assetId); applyDraft(result.draft); }
    catch (caught) { showActionAlert('Could not use that appearance', caught instanceof Error ? caught.message : 'Please try again.'); }
    finally { setBusy(''); }
  };

  const regenerateRoutine = async () => {
    if (!draft) return;
    setBusy('routine');
    try {
      const saved = await saveSection('life');
      const result = await regenerateCreatorDraftSection(saved.id, 'routine'); applyDraft(result.draft);
    } catch (caught) { showActionAlert('Could not rebuild the routine', caught instanceof Error ? caught.message : 'Please try again.'); }
    finally { setBusy(''); }
  };

  const regenerateMeetings = async () => {
    if (!draft) return;
    setBusy('meeting');
    try { const result = await regenerateCreatorDraftSection(draft.id, 'first_meetings'); applyDraft(result.draft); }
    catch (caught) { showActionAlert('Could not create new introductions', caught instanceof Error ? caught.message : 'Please try again.'); }
    finally { setBusy(''); }
  };

  const chooseMeeting = async (meetingId: string) => {
    if (!draft) return;
    setBusy(`meeting:${meetingId}`);
    try { const result = await selectCreatorFirstMeeting(draft.id, meetingId); applyDraft(result.draft); }
    catch (caught) { showActionAlert('Could not choose that meeting', caught instanceof Error ? caught.message : 'Please try again.'); }
    finally { setBusy(''); }
  };

  const finalize = async () => {
    if (!draft || operationInFlight.current) return;
    operationInFlight.current = true;
    setBusy('finalize');
    try {
      let templateId = draft.finalized_template_id;
      let fallbackHandle: string | undefined;
      if (draft.status !== 'finalized') {
        finalizationRequestId.current ??= createClientRequestId();
        const finalization = await finalizeCreatorDraft(draft.id, finalizationRequestId.current);
        applyDraft(finalization.draft);
        templateId = finalization.result?.characterTemplateId ?? finalization.draft.finalized_template_id;
        fallbackHandle = finalization.result?.publicHandle;
      }
      if (!templateId) throw new Error('This companion was saved, but could not be opened. Please try again.');
      const snapshot = await meetCompanion(templateId);
      setSnapshot(snapshot);
      const character = snapshot.characters.find((item) => item.character_template_id === templateId);
      const handle = character?.together_character_templates.public_handle ?? character?.together_character_templates.slug ?? fallbackHandle;
      if (!handle) throw new Error('Your companion was created, but their chat could not be opened. Please try again.');
      router.replace(`/chat?character=${encodeURIComponent(handle)}` as never);
    } catch (caught) { showActionAlert('Could not begin this relationship', caught instanceof Error ? caught.message : 'Your draft is safe. Please try again.'); }
    finally { operationInFlight.current = false; setBusy(''); }
  };

  const archive = () => {
    if (!draft) return;
    confirmAction({ title: 'Archive this draft?', message: 'The unfinished character will leave Your Creations. No relationship history exists yet.', confirmLabel: 'Archive', destructive: true, onConfirm: async () => {
      setBusy('archive');
      try { await archiveCreatorDraft(draft.id); router.replace('/(tabs)/singles'); }
      catch (caught) { showActionAlert('Could not archive draft', caught instanceof Error ? caught.message : 'Please try again.'); }
      finally { setBusy(''); }
    } });
  };

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!draft || !identity || !personality || !communication || !connection || !life) return <LoadingSkeleton label="Opening Creator Studio…" />;
  const desktop = width >= 980;
  const activeStep = steps[stepIndex]!;
  const home = draft.locations?.find((location) => location.id === life.homeLocationId);
  const selectedMeeting = draft.first_meeting_config.options.find((option) => option.id === draft.first_meeting_config.selectedId);
  const hasAppearance = Boolean(draft.assets.some((asset) => asset.selected && asset.status === 'ready') || draft.appearance_config.referenceStoragePaths?.length);
  const reviewInput = { identity, appearanceDescription, hasAppearance, life, routine, selectedMeeting: Boolean(selectedMeeting), connection };
  const reviewIssues = {
    identity: creatorSectionIssues({ ...reviewInput, step: 'personality' }),
    appearance: creatorSectionIssues({ ...reviewInput, step: 'appearance' }),
    life: creatorSectionIssues({ ...reviewInput, step: 'life' }),
    connection: creatorSectionIssues({ ...reviewInput, step: 'connection' }),
    meeting: creatorSectionIssues({ ...reviewInput, step: 'meeting' }),
  };
  const reviewReady = Object.values(reviewIssues).every((issues) => issues.length === 0);

  return <Screen contentStyle={styles.screen}>
    <CreatorWizardShell
      title={sectionTitle(activeStep.key, identity.name)}
      subtitle={`${draft.world?.name ?? 'Kivelle'} · ${sectionBody(activeStep.key)}`}
      currentStep={stepIndex + 2}
      totalSteps={steps.length + 1}
      stepLabel={activeStep.label}
      onClose={() => void close()}
      closeDisabled={Boolean(busy)}
      maxWidth={1180}
      headerAction={draft.status !== 'finalized' ? <Pressable accessibilityRole="button" accessibilityLabel="Archive character draft" disabled={Boolean(busy)} onPress={archive} style={[styles.headerAction, Boolean(busy) && styles.disabled]}><Trash2 size={18} color={colors.muted} /></Pressable> : null}
    >
      <View style={[styles.workspace, desktop && styles.workspaceDesktop]}>
      <View style={styles.editor}>
        {activeStep.key === 'appearance' ? <AppearanceEditor draft={draft} description={appearanceDescription} onDescription={setAppearanceDescription} busy={busy} onBusy={setBusy} onDraft={applyDraft} onGenerate={() => void generateLooks()} onChoose={(id) => void chooseLook(id)} /> : null}
        {activeStep.key === 'personality' ? <PersonalityEditor identity={identity} onIdentity={setIdentity} personality={personality} communication={communication} onPersonality={setPersonality} onCommunication={setCommunication} name={identity.name} /> : null}
        {activeStep.key === 'life' ? <LifeEditor draft={draft} identity={identity} life={life} routine={routine} onLife={setLife} onRoutine={setRoutine} busy={busy === 'routine'} onRegenerate={() => void regenerateRoutine()} /> : null}
        {activeStep.key === 'connection' ? <ConnectionEditor goal={relationshipGoal} value={connection} onChange={setConnection} onGoal={setRelationshipGoal} /> : null}
        {activeStep.key === 'meeting' ? <MeetingEditor draft={draft} busy={busy} onChoose={(id) => void chooseMeeting(id)} onRegenerate={() => void regenerateMeetings()} /> : null}
        {activeStep.key === 'review' ? <Review draft={draft} identity={identity} home={home?.name} selectedMeeting={selectedMeeting} ready={reviewReady} issues={reviewIssues} onFinalize={() => void finalize()} busy={busy === 'finalize'} /> : null}

        <View style={styles.navigation}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous creator section" disabled={stepIndex === 0 || Boolean(busy)} onPress={() => void back()} style={[styles.secondaryButton, (stepIndex === 0 || Boolean(busy)) && styles.disabled]}><ChevronLeft size={18} color={colors.text} /><Text style={styles.secondaryButtonText}>Back</Text></Pressable>
          {stepIndex < steps.length - 1 ? <Pressable accessibilityRole="button" accessibilityLabel={`Continue to ${steps[stepIndex + 1]!.label}`} disabled={Boolean(busy)} onPress={() => void advance()} style={[styles.primaryButton, Boolean(busy) && styles.disabled]}><Text style={styles.primaryButtonText}>{busy === 'save' ? 'Saving…' : 'Save & continue'}</Text><ChevronRight size={18} color="#fff" /></Pressable> : null}
        </View>
      </View>

      <CreatorPreview draft={{ ...draft, relationship_goal: relationshipGoal }} identity={identity} personality={personality} connection={connection} homeName={home?.name} meetingTitle={selectedMeeting?.title} />
      </View>
    </CreatorWizardShell>
  </Screen>;
}

function IdentityEditor({ value, onChange }: { value: CreatorIdentityConfig; onChange: (next: CreatorIdentityConfig) => void }) {
  const chooseGender = (gender: string) => onChange({ ...value, gender, pronouns: !value.pronouns || ['she/her', 'he/him', 'they/them'].includes(value.pronouns) ? ({ woman: 'she/her', man: 'he/him', nonbinary: 'they/them' } as Record<string, string>)[gender] || value.pronouns : value.pronouns });
  return <View style={styles.form}>
    <View style={styles.twoColumn}><Field label="Name" value={value.name} maxLength={50} onChange={(name) => onChange({ ...value, name })} /><AgeField value={value.age} onChange={(age) => onChange({ ...value, age })} /></View>
    <View style={styles.twoColumn}><CreatorPicker label="Gender" value={value.gender ?? ''} options={creatorGenders} onChange={chooseGender} custom /><CreatorPicker label="Pronouns" value={value.pronouns} options={creatorPronouns} onChange={(pronouns) => onChange({ ...value, pronouns })} custom /><Field label="Job or role" value={value.occupation} maxLength={100} onChange={(occupation) => onChange({ ...value, occupation })} /></View>
    <Field label="History and point of view" value={value.biography} multiline maxLength={1000} onChange={(biography) => onChange({ ...value, biography })} help="Required. Give them enough history to explain what they care about and how they see their world." />
    <TagField label="Interests" values={value.interests} maxItems={12} maxItemLength={40} onChange={(interests) => onChange({ ...value, interests })} placeholder="Jazz, food, travel" />
    <TagField label="Defining traits" values={value.traits} maxItems={8} maxItemLength={40} onChange={(traits) => onChange({ ...value, traits })} placeholder="Confident, perceptive, ambitious" />
    <TagField label="Ambitions" values={value.ambitions} maxItems={5} maxItemLength={160} onChange={(ambitions) => onChange({ ...value, ambitions })} placeholder="Build a meaningful design career" />
  </View>;
}

function AgeField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(value ? String(value) : '');
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(value ? String(value) : ''); }, [value]);
  return <View style={styles.field}><Text style={styles.fieldLabel}>Age</Text><TextInput accessibilityLabel="Age" value={text} keyboardType="number-pad" maxLength={2} onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; setText(value ? String(value) : ''); }} onChangeText={(next) => { const digits = next.replace(/\D/g, '').slice(0, 2); setText(digits); onChange(digits ? Number(digits) : 0); }} style={styles.input} /></View>;
}

function AppearanceEditor({ draft, description, onDescription, busy, onBusy, onDraft, onGenerate, onChoose }: { draft: CreatorDraft; description: string; onDescription: (value: string) => void; busy: string; onBusy: (value: string) => void; onDraft: (draft: CreatorDraft) => void; onGenerate: () => void; onChoose: (id: string) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const { width } = useWindowDimensions();
  // Unknown uploads retain the existing safe-only provenance policy.
  const referenceOrigin = 'authorized_real_person' as const;
  const uploadPhoto = async (source: 'camera' | 'library') => {
    if (description.trim().length < 20 || description.length > 800) { showActionAlert('Describe their appearance first', 'Add a 20–800 character physical description so future photos stay consistent.'); return; }
    let normalized: Awaited<ReturnType<typeof normalizeUserImage>> | null = null;
    let authorization: { assetId: string; path: string; token: string } | null = null;
    let requestId = '';
    onBusy('upload');
    try {
      if (Platform.OS !== 'web') {
        const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) throw new Error(source === 'camera' ? 'Camera access is needed to take a portrait.' : 'Photo access is needed to choose a portrait.');
      }
      const options = userImagePickerOptions(source);
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      normalized = await normalizeUserImage({ uri: asset.uri, width: asset.width, height: asset.height, fileSize: asset.fileSize, fileName: asset.fileName }, .9, 2048);
      requestId = createClientRequestId();
      authorization = await authorizeCreatorAppearanceUpload({ draftId: draft.id, requestId, byteSize: normalized.byteSize, width: normalized.width, height: normalized.height, description: description.trim(), referenceOrigin });
      const blob = await (await fetch(normalized.uri)).blob();
      const uploaded = await supabase.storage.from('kivelle-character-reference').uploadToSignedUrl(authorization.path, authorization.token, blob, { contentType: 'image/jpeg' });
      if (uploaded.error) throw new Error('The portrait upload did not finish. Please try again.');
      const completed = await completeCreatorAppearanceUpload({ draftId: draft.id, assetId: authorization.assetId, requestId });
      onDraft(completed.draft);
    } catch (caught) { if (authorization && requestId) void cancelCreatorAppearanceUpload({ draftId: draft.id, assetId: authorization.assetId, requestId }).catch(() => undefined); showActionAlert('Portrait upload failed', caught instanceof Error ? caught.message : 'Choose the portrait and try again.'); }
    finally { cleanupNormalizedImage(normalized?.uri); onBusy(''); }
  };
  const readyAssets = draft.assets.filter((asset) => asset.asset_type === 'appearance_candidate' && asset.status === 'ready');
  const selected = readyAssets.find((asset) => asset.selected);
  const generating = draft.assets.some((asset) => asset.status === 'queued' || asset.status === 'generating');
  const unavailable = Boolean(busy) || generating;
  const validDescription = description.trim().length >= 20 && description.length <= 800;
  const setCost = creditCost('creator_appearance_set');
  return <View style={styles.form}>
    <View style={styles.field}><View style={styles.labelRow}><Text style={styles.fieldLabel}>Physical appearance *</Text><Text style={styles.counter}>{description.length}/800</Text></View><Text style={styles.fieldHelp}>Describe stable physical details—not a pose, outfit, or scene.</Text><TextInput accessibilityLabel="Physical appearance" value={description} onChangeText={onDescription} maxLength={800} multiline textAlignVertical="top" style={[styles.input, styles.multiline]} placeholder="Face shape, hair, eyes, build, complexion, distinguishing features, and enduring style…" placeholderTextColor={colors.muted} /></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Choose avatar" onPress={() => setPickerOpen(true)} style={avatarStyles.launcher}>
      {selected?.signedUrl || draft.portraitUrl ? <Image source={{ uri: selected?.signedUrl || draft.portraitUrl || '' }} style={avatarStyles.preview} contentFit="contain" /> : <Plus size={48} color={colors.muted} />}
      <Text style={avatarStyles.launcherText}>{selected || draft.portraitUrl ? 'Change avatar' : 'Choose avatar'}</Text>
    </Pressable>
    {generating ? <Text accessibilityLiveRegion="polite" style={avatarStyles.note}>Your portraits are being generated. Open the avatar picker to see them arrive.</Text> : null}
    <CreatorModal visible={pickerOpen} title={`Choose ${draft.identity_config.name}'s avatar`} onClose={() => setPickerOpen(false)} large>
      {!validDescription ? <Text style={avatarStyles.note}>Add at least 20 characters to their physical appearance before uploading or generating a portrait.</Text> : null}
      {readyAssets.length ? <View style={avatarStyles.grid}>{readyAssets.map((asset) => <Pressable key={asset.id} accessibilityRole="radio" accessibilityLabel={`${asset.label} avatar`} aria-checked={asset.selected} accessibilityState={{ checked: asset.selected, disabled: Boolean(busy) }} disabled={Boolean(busy)} onPress={() => onChoose(asset.id)} style={[avatarStyles.option, { width: width < 600 ? '100%' : '31%' }, asset.selected && avatarStyles.selected]}>
        {asset.signedUrl ? <Image source={{ uri: asset.signedUrl }} style={avatarStyles.image} contentFit="contain" /> : <View style={[avatarStyles.image, styles.fallback]}><UserRound size={32} color={colors.muted} /></View>}
        <View style={avatarStyles.caption}><Text style={avatarStyles.optionText}>{asset.label}</Text>{asset.selected ? <Check size={20} color={colors.rose} /> : null}</View><Text style={avatarStyles.status}>{asset.selected ? 'Selected' : busy === `look:${asset.id}` ? 'Selecting…' : 'Use this avatar'}</Text>
      </Pressable>)}</View> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Choose portrait from photo library" disabled={Boolean(busy) || !validDescription} onPress={() => void uploadPhoto('library')} style={[avatarStyles.upload, readyAssets.length > 0 && { minHeight: 110 }, (Boolean(busy) || !validDescription) && styles.disabled]}><Plus size={readyAssets.length ? 28 : 48} color={colors.muted} /><Text style={avatarStyles.note}>{busy === 'upload' ? 'Uploading…' : 'Choose a photo'}</Text></Pressable>
      {Platform.OS !== 'web' ? <Pressable accessibilityRole="button" disabled={Boolean(busy) || !validDescription} onPress={() => void uploadPhoto('camera')} style={styles.takeButton}><Camera size={17} color={colors.text} /><Text style={styles.takeButtonText}>Take photo</Text></Pressable> : null}
      {generating ? <Text accessibilityLiveRegion="polite" style={avatarStyles.note}>Generating your portraits… They will appear here automatically.</Text> : null}
      {draft.assets.some((asset) => asset.status === 'failed') && !generating ? <Text accessibilityRole="alert" style={avatarStyles.note}>Some portraits could not be prepared. You can upload a photo or try a new set.</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`Generate three appearance options for ${setCost} Kivelle Credits`} disabled={unavailable || !validDescription} onPress={onGenerate} style={[styles.generateButton, (unavailable || !validDescription) && styles.disabled]}><Sparkles size={20} color={colors.rose} /><View style={{ flex: 1 }}><Text style={avatarStyles.optionText}>{unavailable && (busy === 'appearance' || generating) ? 'Generating three portraits…' : readyAssets.length ? 'Generate another set' : 'Generate three portraits'}</Text><Text style={avatarStyles.note}>3 images</Text></View><View style={styles.credit}><KivelleCreditIcon size={16} /><Text style={styles.creditText}>{setCost}</Text></View></Pressable>
      {selected ? <GradientButton label="Use selected avatar" onPress={() => setPickerOpen(false)} disabled={Boolean(busy)} /> : null}
    </CreatorModal>
  </View>;
}

function PersonalityEditor({ identity, onIdentity, personality, communication, onPersonality, onCommunication, name }: { identity: CreatorIdentityConfig; onIdentity: (value: CreatorIdentityConfig) => void; personality: CreatorPersonalityConfig; communication: CreatorCommunicationConfig; onPersonality: (value: CreatorPersonalityConfig) => void; onCommunication: (value: CreatorCommunicationConfig) => void; name: string }) {
  const traits: Array<[keyof CreatorPersonalityConfig, string, string, string]> = [['warmth', 'Warmth', 'Reserved', 'Warm'], ['humor', 'Humor', 'Serious', 'Playful'], ['directness', 'Directness', 'Gentle', 'Direct'], ['independence', 'Independence', 'Attached', 'Independent'], ['spontaneity', 'Spontaneity', 'Planner', 'Spontaneous'], ['socialEnergy', 'Social energy', 'Private', 'Social']];
  const samples = creatorSampleMessages({ name, warmth: personality.warmth, humor: personality.humor, directness: personality.directness, messageLength: communication.messageLength });
  return <View style={styles.form}>
    <GlassCard style={styles.identityCard}><Text style={styles.cardKicker}>CANONICAL DETAILS</Text><Text style={styles.cardCopy}>These required facts feed chat, schedules, world events, and consistent media prompts.</Text><IdentityEditor value={identity} onChange={onIdentity} /></GlassCard>
    <GlassCard>{traits.map(([key, label, low, high]) => <Scale key={String(key)} label={label} low={low} high={high} value={Number(personality[key] ?? .5)} onChange={(value) => onPersonality({ ...personality, [key]: value })} />)}</GlassCard>
    <Field label="Anything else?" value={personality.note ?? ''} multiline maxLength={600} onChange={(note) => onPersonality({ ...personality, note })} placeholder="Professionally confident, but awkward when something becomes genuinely romantic." />
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
  const updateBlock = (id: string, patch: Partial<CreatorRoutineBlock>) => onRoutine(routine.map((block) => block.id === id ? { ...block, ...patch } : block));
  const addBlock = () => {
    const slot = nextCreatorRoutineSlot(routine);
    if (!slot) { showActionAlert('No open time found', 'Adjust an existing block to make room for another activity.'); return; }
    onRoutine([...routine, { id: createClientRequestId(), ...slot, locationId: life.workLocationId || life.homeLocationId, activity: identity.interests[0] ? `Making time for ${identity.interests[0].toLowerCase()}` : 'Personal time', availability: 'available', energyDelta: 0, moodInfluence: 'open' }]);
  };
  return <View style={styles.form}>
    <View style={styles.contextBanner}><MapPin size={18} color={colors.rose} /><View style={{ flex: 1 }}><Text style={styles.contextTitle}>{draft.world?.name}</Text><Text style={styles.contextCopy}>Home is a canonical area—not another companion’s private residence.</Text></View></View>
    <ChoiceCards label="Home area" items={homeAreas.map((location) => ({ id: location.id, title: location.name, detail: location.description }))} selected={life.homeLocationId} onChange={(homeLocationId) => onLife({ ...life, homeLocationId })} />
    <ChoiceCards label="Work or regular daytime place" items={[{ id: '', title: 'Private / flexible', detail: `Works around ${homeAreas.find((location) => location.id === life.homeLocationId)?.name ?? 'their home area'}.` }, ...workPlaces.map((location) => ({ id: location.id, title: location.name, detail: `${location.category} · ${location.description}` }))]} selected={life.workLocationId ?? ''} onChange={(workLocationId) => onLife({ ...life, workLocationId: workLocationId || null })} />
    <Field label="Typical lifestyle" value={life.lifestyle} multiline maxLength={300} onChange={(lifestyle) => onLife({ ...life, lifestyle })} />
    <Field label="Schedule style" value={life.scheduleStyle} maxLength={200} onChange={(scheduleStyle) => onLife({ ...life, scheduleStyle })} placeholder="Structured weekdays, flexible evenings" />
    <TagField label="Preferred activities" values={life.preferredActivities} maxItems={10} maxItemLength={80} onChange={(preferredActivities) => onLife({ ...life, preferredActivities })} placeholder={identity.interests.join(', ')} />
    <View style={styles.routineHeader}><View style={{ flex: 1 }}><Text style={styles.fieldLabel}>Weekly rhythm *</Text><Text style={styles.fieldHelp}>Choose what they do, when they do it, and the exact world location. Kivelle uses this to make presence and suggestions believable.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Build schedule from job and world" disabled={busy} onPress={onRegenerate} style={styles.smallAction}><RefreshCw size={15} color={colors.violet} /><Text style={styles.smallActionText}>{busy ? 'Building…' : 'Auto-build from job'}</Text></Pressable></View>
    <View style={styles.routineList}>{grouped.map((block) => <RoutineBlockEditor key={block.id} block={block} locations={locations} onChange={(patch) => updateBlock(block.id, patch)} onRemove={() => onRoutine(routine.filter((item) => item.id !== block.id))} />)}</View>
    <Pressable accessibilityRole="button" accessibilityLabel="Add schedule block" accessibilityState={{ disabled: routine.length >= 28 }} disabled={routine.length >= 28} onPress={addBlock} style={[styles.addRoutine, routine.length >= 28 && styles.disabled]}><Plus size={16} color={colors.rose} /><Text style={styles.addRoutineText}>{routine.length >= 28 ? '28 schedule blocks reached' : 'Add another time and place'}</Text></Pressable>
  </View>;
}

function RoutineBlockEditor({ block, locations, onChange, onRemove }: { block: CreatorRoutineBlock; locations: NonNullable<CreatorDraft['locations']>; onChange: (patch: Partial<CreatorRoutineBlock>) => void; onRemove: () => void }) {
  const [dayOpen, setDayOpen] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  const location = locations.find((item) => item.id === block.locationId);
  const changeTime = (edge: 'start' | 'end', delta: number) => {
    const next = Math.max(edge === 'start' ? 0 : block.startMinute + 30, Math.min(edge === 'start' ? block.endMinute - 30 : 1440, block[edge === 'start' ? 'startMinute' : 'endMinute'] + delta));
    onChange({ [edge === 'start' ? 'startMinute' : 'endMinute']: next });
  };
  return <View style={styles.routineCard}>
    <View style={styles.routineTop}><Pressable accessibilityRole="button" accessibilityLabel={`Change day, currently ${dayNames[block.dayOfWeek]}`} onPress={() => setDayOpen(true)} style={styles.dayButton}><Text style={styles.routineDay}>{dayNames[block.dayOfWeek]}</Text><ChevronDown size={13} color={colors.rose} /></Pressable><Text style={styles.routineTime}>{time(block.startMinute)}–{time(block.endMinute)}</Text><Pressable accessibilityRole="button" accessibilityLabel="Remove schedule block" onPress={onRemove} style={styles.removeRoutine}><Trash2 size={14} color={colors.muted} /></Pressable></View>
    <TextInput accessibilityLabel={`${dayNames[block.dayOfWeek]} activity`} value={block.activity} maxLength={160} onChangeText={(activity) => onChange({ activity })} placeholder="What are they doing?" placeholderTextColor={colors.muted} style={styles.routineInput} />
    <Pressable accessibilityRole="button" accessibilityLabel={`Choose place, currently ${location?.name ?? 'none'}`} onPress={() => setPlaceOpen(true)} style={styles.placeButton}><MapPin size={15} color={colors.rose} /><View style={{ flex: 1 }}><Text style={styles.placeButtonLabel}>PLACE</Text><Text style={styles.placeButtonText}>{location?.name ?? 'Choose a location'}</Text></View><ChevronRight size={16} color={colors.muted} /></Pressable>
    <View style={styles.scheduleControls}><View style={styles.availabilityChoices}>{(['available', 'limited', 'busy'] as const).map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: block.availability === value }} onPress={() => onChange({ availability: value })} style={[styles.availabilityChoice, block.availability === value && styles.availabilitySelected]}><Text style={[styles.availabilityText, block.availability === value && styles.availabilityTextSelected]}>{title(value)}</Text></Pressable>)}</View><View style={styles.timeControls}><Pressable accessibilityLabel="Start 30 minutes earlier" onPress={() => changeTime('start', -30)} style={styles.timeButton}><Text style={styles.timeButtonText}>Start −30</Text></Pressable><Pressable accessibilityLabel="Start 30 minutes later" onPress={() => changeTime('start', 30)} style={styles.timeButton}><Text style={styles.timeButtonText}>Start +30</Text></Pressable><Pressable accessibilityLabel="End 30 minutes earlier" onPress={() => changeTime('end', -30)} style={styles.timeButton}><Text style={styles.timeButtonText}>End −30</Text></Pressable><Pressable accessibilityLabel="End 30 minutes later" onPress={() => changeTime('end', 30)} style={styles.timeButton}><Text style={styles.timeButtonText}>End +30</Text></Pressable></View></View>
    <Modal visible={dayOpen} transparent animationType="fade" onRequestClose={() => setDayOpen(false)}><View style={styles.pickerScrim}><View style={[styles.pickerModal, { maxWidth: 420 }]}><View style={styles.pickerHeader}><View style={{ flex: 1 }}><Text style={styles.cardKicker}>WEEKLY SCHEDULE</Text><Text style={styles.pickerTitle}>Choose a day</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close day picker" onPress={() => setDayOpen(false)} style={styles.iconButton}><X size={18} color={colors.text} /></Pressable></View><View style={styles.pickerList}>{dayNames.map((day, index) => <Pressable key={day} accessibilityRole="radio" accessibilityState={{ checked: block.dayOfWeek === index }} onPress={() => { onChange({ dayOfWeek: index }); setDayOpen(false); }} style={[styles.pickerOption, block.dayOfWeek === index && styles.pickerOptionSelected]}><Text style={styles.pickerOptionTitle}>{day}</Text>{block.dayOfWeek === index ? <Check size={16} color={colors.rose} /> : null}</Pressable>)}</View></View></View></Modal>
    <Modal visible={placeOpen} transparent animationType="fade" onRequestClose={() => setPlaceOpen(false)}><View style={styles.pickerScrim}><View style={styles.pickerModal}><View style={styles.pickerHeader}><View style={{ flex: 1 }}><Text style={styles.cardKicker}>WORLD LOCATION</Text><Text style={styles.pickerTitle}>Where are they?</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close location picker" onPress={() => setPlaceOpen(false)} style={styles.iconButton}><X size={18} color={colors.text} /></Pressable></View><ScrollView contentContainerStyle={styles.pickerList}>{locations.map((item) => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: block.locationId === item.id }} onPress={() => { onChange({ locationId: item.id }); setPlaceOpen(false); }} style={[styles.pickerOption, block.locationId === item.id && styles.pickerOptionSelected]}><View style={{ flex: 1 }}><Text style={styles.pickerOptionTitle}>{item.name}</Text><Text style={styles.pickerOptionCopy} numberOfLines={2}>{item.category} · {item.description}</Text></View>{block.locationId === item.id ? <Check size={16} color={colors.rose} /> : null}</Pressable>)}</ScrollView></View></View></Modal>
  </View>;
}

function ConnectionEditor({ goal, value, onChange, onGoal }: { goal: CreatorDraft['relationship_goal']; value: CreatorConnectionConfig; onChange: (value: CreatorConnectionConfig) => void; onGoal: (value: CreatorDraft['relationship_goal']) => void }) {
  return <View style={styles.form}>
    <ChoiceField label="Relationship direction" value={goal} options={['friendship', 'romance', 'either']} onChange={(next) => onGoal(next as CreatorDraft['relationship_goal'])} />
    <SpicePicker value={value.spiceLevel} onChange={(spiceLevel) => onChange({ ...value, spiceLevel })} />
    <GlassCard><Scale label="Romantic pace" low="Slow burn" high="Fast-moving" value={value.pace} onChange={(pace) => onChange({ ...value, pace })} /><Scale label="Affection" low="Reserved" high="Affectionate" value={value.affection} onChange={(affection) => onChange({ ...value, affection })} /><Scale label="Initiative" low="Lets you lead" high="Initiates" value={value.initiative} onChange={(initiative) => onChange({ ...value, initiative })} /></GlassCard>
    <ChoiceField label="Conflict style" value={value.conflictStyle} options={['gentle', 'direct', 'reflective', 'needs_space']} labels={{ needs_space: 'Needs space' }} onChange={(conflictStyle) => onChange({ ...value, conflictStyle: conflictStyle as CreatorConnectionConfig['conflictStyle'] })} />
    <TagField label="Personal boundaries" values={value.boundaries} maxItems={8} maxItemLength={120} onChange={(boundaries) => onChange({ ...value, boundaries })} placeholder="Needs time after conflict, values privacy" />
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
    <Text style={styles.fieldLabel}>Romantic energy</Text>
    <Text style={styles.fieldHelp}>Sets romantic boldness—not consent, relationship progress, or content permissions.</Text>
    <View style={styles.spiceChoices}>{choices.map((choice) => <Pressable key={choice.level} accessibilityRole="radio" accessibilityState={{ checked: value === choice.level }} accessibilityLabel={`${choice.title}. Romantic energy ${choice.level} of 3. ${choice.detail}`} onPress={() => onChange(choice.level)} style={[styles.spiceChoice, value === choice.level && styles.spiceChoiceSelected]}><Text style={styles.spiceTitle}>{choice.title}</Text><Text style={styles.spiceDetail}>{choice.detail}</Text></Pressable>)}</View>
  </View>;
}

function MeetingEditor({ draft, busy, onChoose, onRegenerate }: { draft: CreatorDraft; busy: string; onChoose: (id: string) => void; onRegenerate: () => void }) {
  return <View style={styles.form}>
    <View style={styles.routineHeader}><Text style={styles.fieldHelp}>Each introduction uses a real place and becomes canonical relationship history.</Text><Pressable accessibilityRole="button" accessibilityLabel="Generate new first meeting options" disabled={busy === 'meeting'} onPress={onRegenerate} style={styles.smallAction}><RefreshCw size={15} color={colors.violet} /><Text style={styles.smallActionText}>{busy === 'meeting' ? 'Building…' : 'Try new scenes'}</Text></Pressable></View>
    <View style={styles.meetingList}>{draft.first_meeting_config.options.map((option) => { const location = draft.locations?.find((item) => item.id === option.locationId); const source = mappedLocationAsset(draft.world?.slug, location?.slug); const selected = option.id === draft.first_meeting_config.selectedId; return <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={`${option.title}. ${option.setup}`} onPress={() => onChoose(option.id)} style={[styles.meetingCard, selected && styles.meetingSelected]}>{source ? <Image source={source} style={styles.meetingImage} contentFit="cover" contentPosition="center" /> : <View style={[styles.meetingImage, styles.fallback]}><MapPin size={30} color={colors.rose} /></View>}<View style={styles.meetingContent}><Text style={styles.cardKicker}>{draft.world?.name?.toUpperCase()}</Text><Text style={styles.meetingTitle}>{option.title}</Text><Text style={styles.meetingSetup}>{option.setup}</Text><View style={styles.openingLine}><Text style={styles.openingLabel}>THEIR FIRST LINE</Text><Text style={styles.openingText}>“{option.openingLine}”</Text></View>{selected ? <View style={styles.selectedPill}><Check size={12} color="#fff" /><Text style={styles.selectedPillText}>FIRST MEETING SELECTED</Text></View> : <Text style={styles.chooseText}>{busy === `meeting:${option.id}` ? 'Selecting…' : 'Choose this introduction'}</Text>}</View></Pressable>; })}</View>
  </View>;
}

function Review({ draft, identity, home, selectedMeeting, ready, issues, onFinalize, busy }: { draft: CreatorDraft; identity: CreatorIdentityConfig; home?: string; selectedMeeting?: CreatorDraft['first_meeting_config']['options'][number]; ready: boolean; issues: Record<'identity' | 'appearance' | 'life' | 'connection' | 'meeting', string[]>; onFinalize: () => void; busy: boolean }) {
  const missing = Object.values(issues).flat();
  return <View style={styles.form}>
    <GlassCard style={styles.reviewHero}>{draft.portraitUrl ? <Image source={{ uri: draft.portraitUrl }} style={styles.reviewPortrait} contentFit="cover" contentPosition="top" /> : <View style={[styles.reviewPortrait, styles.fallback]}><UserRound size={54} color={colors.rose} /></View>}<View style={{ flex: 1 }}><Text style={styles.cardKicker}>READY TO LIVE IN KIVELLE</Text><Text style={styles.reviewName}>{identity.name}, {identity.age}</Text><Text style={styles.reviewMeta}>{identity.occupation} · {home ?? draft.world?.name}</Text><Text style={styles.reviewTraits}>{identity.traits.slice(0, 4).join(' · ')}</Text></View></GlassCard>
    <ReviewRow label="Identity" value={`${identity.gender || 'Gender missing'} · ${identity.pronouns || 'Pronouns missing'} · ${identity.interests.slice(0, 3).join(', ')}`} complete={!issues.identity.length} />
    <ReviewRow label="Appearance" value={draft.portraitUrl ? 'Canonical identity selected' : 'No canonical portrait selected'} complete={!issues.appearance.length} />
    <ReviewRow label="Life" value={`${draft.routine_config.blocks.length} weekly rhythm blocks · ${home ?? 'Home area missing'}`} complete={!issues.life.length} />
    <ReviewRow label="Connection" value={`${title(draft.relationship_goal)} · ${title(String(draft.connection_config.conflictStyle).replace('_', ' '))}`} complete={!issues.connection.length} />
    <ReviewRow label="First meeting" value={selectedMeeting?.title ?? 'Choose an introduction'} complete={!issues.meeting.length} />
    {missing.length ? <View style={styles.missing}><Text style={styles.missingTitle}>Before you meet</Text>{missing.map((item) => <Text key={item} style={styles.missingItem}>• {item}</Text>)}</View> : null}
    <GradientButton label={busy ? `Preparing ${identity.name}…` : `Meet ${identity.name}`} icon={<ArrowRight size={18} color="#fff" />} disabled={!ready || busy} onPress={onFinalize} />
    <Text style={styles.privateNote}>Meeting finalizes this character and creates a new relationship inside your selected Kivelle Life.</Text>
  </View>;
}

function CreatorPreview({ draft, identity, personality, connection, homeName, meetingTitle }: { draft: CreatorDraft; identity: CreatorIdentityConfig; personality: CreatorPersonalityConfig; connection: CreatorConnectionConfig; homeName?: string; meetingTitle?: string }) {
  return <View style={styles.preview}><View style={styles.previewPortraitWrap}>{draft.portraitUrl ? <Image source={{ uri: draft.portraitUrl }} style={styles.previewPortrait} contentFit="cover" contentPosition="top" /> : <View style={[styles.previewPortrait, styles.fallback]}><Text style={styles.previewInitial}>{identity.name[0]?.toUpperCase()}</Text></View>}<View style={styles.privateBadge}><Text style={styles.privateBadgeText}>PRIVATE</Text></View></View><View style={styles.previewContent}><Text style={styles.previewName}>{identity.name}</Text><Text style={styles.previewMeta}>{identity.occupation} · {identity.age}</Text><Text style={styles.previewTraits}>{identity.traits.slice(0, 4).join(' · ')}</Text><Text style={styles.previewBio} numberOfLines={5}>{identity.biography}</Text><PreviewFact label="LIFE" value={`${homeName ?? draft.world?.name ?? 'Kivelle'} · ${identity.interests.slice(0, 2).join(' & ')}`} /><PreviewFact label="PERSONALITY" value={`${personality.warmth >= .65 ? 'Warm' : 'Reserved'} · ${personality.humor >= .65 ? 'Playful' : 'Grounded'} · ${personality.independence >= .65 ? 'Independent' : 'Connected'}`} /><PreviewFact label="CONNECTION" value={`${connection.pace < .45 ? 'Slow burn' : 'Natural pace'} · ${title(draft.relationship_goal)}`} />{meetingTitle ? <PreviewFact label="FIRST MEETING" value={meetingTitle} /> : null}</View></View>;
}

function Field({ label, value, onChange, placeholder, multiline = false, keyboard, help, maxLength }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; multiline?: boolean; keyboard?: 'number-pad'; help?: string; maxLength?: number }) { return <View style={styles.field}><View style={styles.labelRow}><Text style={styles.fieldLabel}>{label}</Text>{maxLength ? <Text style={styles.counter}>{value.length}/{maxLength}</Text> : null}</View>{help ? <Text style={styles.fieldHelp}>{help}</Text> : null}<TextInput accessibilityLabel={label} value={value} onChangeText={onChange} maxLength={maxLength} placeholder={placeholder} placeholderTextColor={colors.muted} multiline={multiline} keyboardType={keyboard} textAlignVertical={multiline ? 'top' : 'center'} style={[styles.input, multiline && styles.multiline]} /></View>; }
function TagField({ label, values, onChange, placeholder, maxItems, maxItemLength }: { label: string; values: string[]; onChange: (value: string[]) => void; placeholder?: string; maxItems: number; maxItemLength: number }) {
  const [text, setText] = useState(values.join(', '));
  const focused = useRef(false);
  const joined = values.join(', ');
  useEffect(() => { if (!focused.current) setText(joined); }, [joined]);
  const invalid = values.length > maxItems || values.some((item) => item.length > maxItemLength);
  return <View style={styles.field}>
    <View style={styles.labelRow}><Text style={styles.fieldLabel}>{label}</Text><Text style={styles.counter}>{values.length}/{maxItems}</Text></View>
    <Text style={styles.fieldHelp}>Separate with commas. {maxItemLength} characters per item.</Text>
    <TextInput accessibilityLabel={label} value={text} onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; setText(values.join(', ')); }} onChangeText={(next) => { setText(next); onChange(next.split(',').map((item) => item.trim()).filter(Boolean)); }} placeholder={placeholder} placeholderTextColor={colors.muted} style={styles.input} />
    {invalid ? <Text accessibilityRole="alert" style={styles.validationText}>Use up to {maxItems} items, each {maxItemLength} characters or fewer.</Text> : null}
  </View>;
}
function Scale({ label, low, high, value, onChange }: { label: string; low: string; high: string; value: number; onChange: (value: number) => void }) { const normalized = Math.max(0, Math.min(1, value)); return <View style={styles.scale}><View style={styles.scaleHeader}><Text style={styles.scaleLabel}>{label}</Text><Text style={styles.scaleValue}>{Math.round(normalized * 10)}/10</Text></View><View style={styles.scaleControl}><Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} onPress={() => onChange(Math.max(0, Number((normalized - .1).toFixed(1))))} style={styles.scaleButton}><Text style={styles.scaleButtonText}>−</Text></Pressable><View style={styles.track}><View style={[styles.fill, { width: `${normalized * 100}%` }]} /></View><Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`} onPress={() => onChange(Math.min(1, Number((normalized + .1).toFixed(1))))} style={styles.scaleButton}><Text style={styles.scaleButtonText}>+</Text></Pressable></View><View style={styles.scaleEnds}><Text style={styles.scaleEnd}>{low}</Text><Text style={styles.scaleEnd}>{high}</Text></View></View>; }
function ChoiceField({ label, value, options, onChange, labels = {} }: { label: string; value: string; options: string[]; onChange: (value: string) => void; labels?: Record<string, string> }) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><View style={styles.chips}>{options.map((option) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: value === option }} onPress={() => onChange(option)} style={[styles.chip, value === option && styles.chipSelected]}><Text style={[styles.chipText, value === option && styles.chipTextSelected]}>{title(labels[option] ?? option.replace('_', ' '))}</Text></Pressable>)}</View></View>; }
function ChoiceCards({ label, items, selected, onChange }: { label: string; items: Array<{ id: string; title: string; detail: string }>; selected: string; onChange: (value: string) => void }) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><View style={styles.choiceCards}>{items.map((item) => <Pressable key={item.id || 'private'} accessibilityRole="radio" accessibilityState={{ checked: selected === item.id }} onPress={() => onChange(item.id)} style={[styles.choiceCard, selected === item.id && styles.choiceCardSelected]}><View style={{ flex: 1 }}><Text style={styles.choiceCardTitle}>{item.title}</Text><Text style={styles.choiceCardDetail} numberOfLines={2}>{item.detail}</Text></View>{selected === item.id ? <Check size={17} color={colors.rose} /> : null}</Pressable>)}</View></View>; }
function ReviewRow({ label, value, complete }: { label: string; value: string; complete: boolean }) { return <View style={styles.reviewRow}><View style={[styles.reviewCheck, complete && styles.reviewCheckComplete]}>{complete ? <Check size={13} color="#fff" /> : null}</View><View style={{ flex: 1 }}><Text style={styles.reviewLabel}>{label}</Text><Text style={styles.reviewValue}>{value}</Text></View></View>; }
function PreviewFact({ label, value }: { label: string; value: string }) { return <View style={styles.previewFact}><Text style={styles.previewFactLabel}>{label}</Text><Text style={styles.previewFactValue}>{value}</Text></View>; }
function sectionTitle(step: CreatorStep, name: string) { return ({ identity: `Who is ${name}?`, appearance: `Give ${name} a face.`, personality: `Give ${name} a point of view.`, life: `Build a life that keeps moving.`, connection: `Decide how closeness feels.`, meeting: `Choose where your story begins.`, review: `${name} is almost ready.` } as Record<CreatorStep, string>)[step]; }
function sectionBody(step: CreatorStep) { return ({ identity: 'These are canonical facts—not memories the companion has to rediscover.', appearance: 'Choose a photo or generate a look you love.', personality: 'Shape tendencies and communication without scripting every response.', life: 'Use real places and a broad weekly rhythm so their world remains internally consistent.', connection: 'Guide relationship behavior without pre-setting trust, attraction, or devotion.', meeting: 'This scene becomes the first real event in your shared history.', review: 'Check the pieces that will enter the normal Kivelle relationship engine.' } as Record<CreatorStep, string>)[step]; }
function time(minute: number) { const hours = Math.floor(minute / 60); const minutes = minute % 60; return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`; }
function title(value: string) { return value ? value[0]!.toUpperCase() + value.slice(1) : value; }



const avatarStyles = StyleSheet.create({
  launcher: { minHeight: 290, backgroundColor: '#252525', borderRadius: 24, alignItems: 'center', justifyContent: 'center', gap: 20, overflow: 'hidden', padding: 20 }, launcherText: { color: colors.text, fontSize: 17, fontWeight: '700' }, preview: { width: '100%', height: 300, borderRadius: 16 }, upload: { minHeight: 350, backgroundColor: '#272727', borderRadius: 28, alignItems: 'center', justifyContent: 'center', gap: 18 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }, option: { borderWidth: 2, borderColor: 'transparent', backgroundColor: '#272727', borderRadius: 20, overflow: 'hidden' }, selected: { borderColor: colors.rose }, image: { width: '100%', aspectRatio: .8, backgroundColor: '#111' }, caption: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 14 }, optionText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' }, status: { color: colors.muted, paddingHorizontal: 16, paddingVertical: 12, fontSize: 13 }, note: { color: colors.muted, fontSize: 13, lineHeight: 20 },
});
