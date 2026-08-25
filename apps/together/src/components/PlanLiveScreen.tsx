import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, CheckCircle2, Clock3, MapPin, MoreHorizontal, Send } from 'lucide-react-native';
import { router } from 'expo-router';
import { MESSAGE_CHARACTER_LIMIT, messageCharacterLimitError } from '@together/domain/src/message-limits';
import { locationHeroAsset } from '../assets';
import { endPlanExperience, getCommitment, getPlanExperience, joinCommitment, type Commitment } from '../lib/commitments';
import { manageInteraction, sendDialogue, sendSceneReaction } from '../lib/api';
import { createClientRequestId } from '../lib/requestId';
import { supabase } from '../lib/supabase';
import { useTogether } from '../store/useTogether';
import type { InteractionCandidate, Message, PlanExperience, SceneSession } from '../types';
import { colors, radius, spacing } from '../theme';
import { MessageCharacterCounter } from './MessageCharacterCounter';
import { userExperienceTimezone } from '../lib/experienceTimezone';

type InteractionResponse = { scene: SceneSession; interactions: InteractionCandidate[]; destinations: InteractionCandidate[]; action?: { id: string }; place?: { path?: string } };

export function PlanLiveScreen({ planId }: { planId: string }) {
  const { snapshot, refresh, upsertPlan, upsertSceneSession } = useTogether();
  const [experience, setExperience] = useState<PlanExperience | null>(null);
  const [loadedPlan, setLoadedPlan] = useState<Commitment | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [composer, setComposer] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [stream, setStream] = useState('');
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  const experienceRef = useRef<PlanExperience | null>(null);
  const loadedPlanRef = useRef<Commitment | null>(null);
  const loadInFlightRef = useRef<Promise<void> | null>(null);
  const actionResolveGeneration = useRef(0);
  const realtimeReloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const snapshotPlan = snapshot?.sharedPlans.find((item) => item.id === planId);
  const canonicalPlan = experience?.plan ?? loadedPlan ?? snapshotPlan;
  const character = snapshot?.characters.find((item) => item.id === canonicalPlan?.character_instance_id);
  const conversation = snapshot?.conversations.find((item) => item.id === (experience?.scene?.conversation_id ?? experience?.plan.source_conversation_id)) ?? snapshot?.conversations.find((item) => item.character_instance_id === character?.id && !item.archived_at);
  const location = snapshot?.locations.find((item) => item.id === (experience?.scene?.location_id ?? experience?.plan.location_id));
  const world = snapshot?.worlds.find((item) => item.id === (experience?.scene?.world_id ?? experience?.plan.world_id));
  const companionName = character?.together_character_templates.name ?? 'Your companion';
  const viewerTimezone = userExperienceTimezone(snapshot);
  const activeScene = experience?.scene && !experience.scene.ended_at ? experience.scene : null;
  const planLocation = snapshot?.locations.find((item) => item.id === experience?.plan.location_id);
  const currentActivity = String(activeScene?.state?.activityLabel ?? activeScene?.activity_key ?? experience?.plan.activity_key ?? 'shared time').replace(/_/g, ' ');
  const elapsed = useMemo(() => {
    const recorded = experience?.participation.attendedSeconds ?? 0;
    const liveDelta = experience?.participation.userPresent ? Math.max(0, Math.round((clockNow - loadedAt) / 1000)) : 0;
    return formatDuration(recorded + liveDelta);
  }, [clockNow, experience?.participation.attendedSeconds, experience?.participation.userPresent, loadedAt]);

  const resolveActions = useCallback(async (scene: SceneSession, conversationId?: string | null, characterInstanceId?: string) => {
    const currentSnapshot = useTogether.getState().snapshot;
    const actionConversation = (conversationId ? currentSnapshot?.conversations.find((item) => item.id === conversationId) : null) ?? currentSnapshot?.conversations.find((item) => item.character_instance_id === characterInstanceId && !item.archived_at);
    if (!characterInstanceId || !actionConversation) return;
    const generation = ++actionResolveGeneration.current;
    setActionsLoading(true);
    try {
      const result = await manageInteraction<InteractionResponse>({ action: 'resolve', characterInstanceId, conversationId: actionConversation.id });
      if (generation !== actionResolveGeneration.current) return;
      if (result.scene) upsertSceneSession(result.scene);
      setExperience((current) => {
        if (!current) return current;
        const next = { ...current, scene: result.scene ?? scene, interactions: result.interactions ?? [], destinations: result.destinations ?? [] };
        experienceRef.current = next;
        return next;
      });
    } catch { /* Waiting and stale scenes are rendered from the authoritative plan state. */ }
    finally { if (generation === actionResolveGeneration.current) setActionsLoading(false); }
  }, [upsertSceneSession]);

  const load = useCallback((): Promise<void> => {
    if (loadInFlightRef.current) return loadInFlightRef.current;
    const request = (async () => {
      const currentSnapshot = useTogether.getState().snapshot;
      if (!currentSnapshot) return;
      const blocking = !experienceRef.current;
      if (blocking) setLoading(true);
      try {
        const cachedPlan = currentSnapshot.sharedPlans.find((item) => item.id === planId);
        const plan = cachedPlan ?? loadedPlanRef.current ?? await getCommitment(planId);
        if (!cachedPlan && !loadedPlanRef.current) {
          loadedPlanRef.current = plan;
          setLoadedPlan(plan);
        }
        const planCharacter = currentSnapshot.characters.find((item) => item.id === plan.character_instance_id);
        if (!planCharacter) throw new Error('The companion for this plan is unavailable in the current Life.');
        const value = await getPlanExperience(planId, planCharacter.id);
        const previous = experienceRef.current;
        const displayValue = previous?.scene?.id && previous.scene.id === value.scene?.id
          ? { ...value, interactions: previous.interactions, destinations: previous.destinations }
          : value;
        experienceRef.current = displayValue;
        setExperience(displayValue);
        upsertPlan(displayValue.plan);
        if (displayValue.scene) upsertSceneSession(displayValue.scene);
        setLoadedAt(Date.now());
        setLoading(false);
        setError('');
        if (displayValue.scene && !displayValue.scene.ended_at) void resolveActions(displayValue.scene, displayValue.scene.conversation_id ?? displayValue.plan.source_conversation_id, planCharacter.id);
      } catch (caught) { setError(caught instanceof Error ? caught.message : 'Together Now could not load.'); }
      finally { if (blocking) setLoading(false); }
    })();
    loadInFlightRef.current = request;
    void request.finally(() => { if (loadInFlightRef.current === request) loadInFlightRef.current = null; });
    return request;
  }, [planId, resolveActions, upsertPlan, upsertSceneSession]);

  useEffect(() => { if (snapshot) void load(); }, [Boolean(snapshot), load]);
  useEffect(() => {
    const ticker = setInterval(() => setClockNow(Date.now()), 15_000);
    return () => clearInterval(ticker);
  }, []);
  useEffect(() => {
    const end = experience?.plan.ends_at ? new Date(experience.plan.ends_at).getTime() : 0;
    if (!end || !['scheduled', 'active'].includes(String(experience?.plan.status))) return;
    const delay = Math.max(0, end - Date.now()) + 750;
    const timer = setTimeout(() => void load(), Math.min(delay, 2_147_000_000));
    return () => clearTimeout(timer);
  }, [experience?.plan.ends_at, experience?.plan.status, load]);
  useEffect(() => {
    const scheduleReload = () => {
      if (realtimeReloadTimer.current) clearTimeout(realtimeReloadTimer.current);
      realtimeReloadTimer.current = setTimeout(() => { realtimeReloadTimer.current = null; void load(); }, 160);
    };
    const channel = supabase.channel(`plan-live:${planId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'together_plan_attendance', filter: `plan_id=eq.${planId}` }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'together_shared_plans', filter: `id=eq.${planId}` }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'together_scene_sessions', filter: `shared_plan_id=eq.${planId}` }, scheduleReload)
      .subscribe();
    return () => { if (realtimeReloadTimer.current) clearTimeout(realtimeReloadTimer.current); realtimeReloadTimer.current = null; void supabase.removeChannel(channel); };
  }, [load, planId]);

  if (!snapshot || loading) return <View style={styles.center}><ActivityIndicator color={colors.rose}/><Text style={styles.muted}>Loading the shared experience…</Text></View>;
  if (!experience || !character) return <View style={styles.center}><Text style={styles.error}>{error || 'Together Now could not find this saved plan.'}</Text><Pressable accessibilityRole="button" onPress={() => void load()} style={styles.join}><Text style={styles.joinText}>Try again</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.replace(`/plan/${planId}` as never)} style={styles.keepButton}><Text style={styles.keepText}>View plan details</Text></Pressable></View>;

  const join = async () => {
    setBusy(true); setError('');
    try { const value = await joinCommitment(planId, character.id); experienceRef.current = value; setExperience(value); upsertPlan(value.plan); if (value.scene) { upsertSceneSession(value.scene); void resolveActions(value.scene, value.scene.conversation_id ?? value.plan.source_conversation_id); } void refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not join this plan.'); }
    finally { setBusy(false); }
  };

  const execute = async (candidate: InteractionCandidate) => {
    if (!character || !conversation || !activeScene || busy) return;
    setBusy(true); setError('');
    try {
      const result = await manageInteraction<InteractionResponse>({ action: 'execute', characterInstanceId: character.id, conversationId: conversation.id, sceneId: activeScene.id, interactionKey: candidate.interactionKey, requestId: createClientRequestId(), reactionMode: 'generate' });
      upsertSceneSession(result.scene);
      setExperience((current) => { if (!current) return current; const next = { ...current, scene: result.scene, interactions: result.interactions ?? [], destinations: result.destinations ?? [], phase: 'together' as const }; experienceRef.current = next; return next; });
      if (result.action?.id) {
        setStream('');
        try {
          const reaction = await sendSceneReaction({ conversationId: conversation.id, characterInstanceId: character.id, sceneActionId: result.action.id, clientRequestId: createClientRequestId() }, (token) => setStream((current) => current + token));
          setMessages((current) => [...current, reaction.message]);
        } finally { setStream(''); }
      }
      void refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'That action is no longer available.'); }
    finally { setBusy(false); }
  };

  const move = async (candidate: InteractionCandidate) => {
    const destination = String(candidate.effects.destinationLocationId ?? '');
    if (!destination || !character || !conversation || !activeScene || busy) return;
    setBusy(true); setError('');
    try {
      const result = await manageInteraction<InteractionResponse>({ action: 'move', characterInstanceId: character.id, conversationId: conversation.id, sceneId: activeScene.id, destinationLocationId: destination, requestId: createClientRequestId() });
      upsertSceneSession(result.scene);
      setExperience((current) => { if (!current) return current; const next = { ...current, scene: result.scene, interactions: result.interactions ?? [], destinations: result.destinations ?? [] }; experienceRef.current = next; return next; });
      if (result.action?.id) {
        setStream('');
        try {
          const reaction = await sendSceneReaction({ conversationId: conversation.id, characterInstanceId: character.id, sceneActionId: result.action.id, clientRequestId: createClientRequestId() }, (token) => setStream((current) => current + token));
          setMessages((current) => [...current, reaction.message]);
        } finally { setStream(''); }
      }
      void refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'That move is no longer available.'); }
    finally { setBusy(false); }
  };

  const endPlan = async () => {
    if (!character || busy) return;
    setBusy(true); setError('');
    try {
      const value = await endPlanExperience(planId, character.id, activeScene?.id);
      experienceRef.current = value; setExperience(value); upsertPlan(value.plan); if (value.scene) upsertSceneSession(value.scene); setLoadedAt(Date.now()); setShowEndConfirm(false); void refresh({force:true});
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The plan could not be ended.'); }
    finally { setBusy(false); }
  };

  const send = async () => {
    if (composer.length > MESSAGE_CHARACTER_LIMIT) { setError(messageCharacterLimitError()); return; }
    const text = composer.trim();
    if (!text || !character || !conversation || busy) return;
    setComposer(''); setBusy(true); setError('');
    try {
      const result = await sendDialogue({ conversationId: conversation.id, characterInstanceId: character.id, message: text, clientRequestId: createClientRequestId(), focusPlanId: planId }, (token) => setStream((current) => current + token));
      setMessages((current) => [...current, result.message]); setStream(''); void refresh();
    } catch (caught) { setStream(''); setError(caught instanceof Error ? caught.message : 'The message could not be sent.'); }
    finally { setBusy(false); }
  };

  const livePlan = ['scheduled', 'active'].includes(String(experience.plan.status));
  const completed = experience.plan.status === 'completed';
  const didNotHappen = experience.plan.status === 'missed' || experience.plan.status === 'cancelled';
  const canEndManually = Boolean(activeScene && experience.plan.source !== 'date');
  const early = livePlan && (experience.phase === 'early' || (!activeScene && new Date(String(experience.plan.starts_at)).getTime() > Date.now()));
  const waiting = livePlan && !activeScene && !early;
  const hero = locationHeroAsset(world?.slug, location?.slug ?? planLocation?.slug);
  const remaining = livePlan && experience.plan.ends_at ? Math.max(0, new Date(experience.plan.ends_at).getTime() - clockNow) : 0;
  const endLabel = remaining > 0 ? `${formatDuration(Math.ceil(remaining / 1000))} left` : 'Ending now';
  const completionSummary = typeof experience.plan.metadata?.planExperience === 'object' && experience.plan.metadata.planExperience && typeof (experience.plan.metadata.planExperience as Record<string, unknown>).summary === 'string' ? String((experience.plan.metadata.planExperience as Record<string, unknown>).summary) : `${experience.plan.title} is now part of your shared history.`;
  const characterHandle = character.together_character_templates.public_handle ?? character.together_character_templates.slug;
  const back = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/dates');
  const talkAboutIt = () => router.push(`/chat?character=${characterHandle}&planId=${planId}&draft=${encodeURIComponent(didNotHappen ? `Can we talk about what happened with ${experience.plan.title}?` : 'That was fun. What was your favorite part?')}` as never);
  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.top}><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={styles.icon}><ArrowLeft size={19} color={colors.text}/></Pressable><View style={styles.topCopy}><Text style={styles.kicker}>{completed ? 'SHARED' : experience.plan.status === 'missed' ? 'PLAN MISSED' : experience.plan.status === 'cancelled' ? 'CANCELLED' : activeScene ? 'TOGETHER NOW' : early ? "YOU'RE EARLY" : 'YOU’RE HERE'}</Text><Text style={styles.headerTitle}>{companionName}</Text></View>{canEndManually ? <Pressable accessibilityRole="button" accessibilityLabel="Plan options" onPress={() => setShowEndConfirm((value) => !value)} disabled={busy} style={styles.icon}><MoreHorizontal size={20} color={colors.text}/></Pressable> : <View style={styles.iconSpacer}/>}</View>
      <View style={styles.hero}><Image source={hero as never} style={styles.heroImage}/><View style={styles.heroShade}/><View style={styles.heroCopy}><Text style={styles.place}>{location?.name ?? planLocation?.name ?? 'Somewhere together'}</Text><Text style={styles.activity}>{currentActivity}</Text><Text style={styles.sub}>{activeScene ? `${companionName} · here with you · ${elapsed}` : `${companionName} · ${experience.plan.title}`}</Text></View></View>
      {activeScene && experience.plan.ends_at ? <View style={styles.timeRow}><Clock3 size={14} color={colors.warm}/><Text style={styles.timeText}>Planned until {formatTime(experience.plan.ends_at, viewerTimezone)} · {endLabel}</Text></View> : null}
      {early ? <WaitingCard title={experience.companion.arrived ? `${companionName} is already here` : `${companionName} should be here around ${formatTime(experience.plan.starts_at, viewerTimezone)}`} body={experience.companion.arrived ? 'Go inside together when you’re ready.' : `${planLocation?.name ?? 'The planned place'} · ${experience.plan.title}`} action={experience.companion.arrived ? 'Go inside together' : 'Wait here'} onPress={experience.companion.arrived ? () => void load() : () => void load()} /> : null}
      {waiting ? <WaitingCard title={experience.companion.state === 'late' ? `${companionName} is running late` : `${companionName} hasn’t arrived yet`} body={experience.companion.state === 'late' && experience.plan.companion_eta_at ? `New ETA · ${formatTime(experience.plan.companion_eta_at)}` : 'You’re here. They’ll join when they arrive.'} action="Refresh arrival" onPress={() => void load()} /> : null}
      {showEndConfirm && canEndManually ? <View style={styles.endConfirm}><Text style={styles.endTitle}>End this plan now?</Text><Text style={styles.endCopy}>Kivelle will close the shared scene and save what happened as part of your history with {companionName}.</Text><View style={styles.endActions}><Pressable disabled={busy} onPress={() => setShowEndConfirm(false)} style={styles.keepButton}><Text style={styles.keepText}>Keep going</Text></Pressable><Pressable disabled={busy} onPress={() => void endPlan()} style={styles.endButton}><Text style={styles.endButtonText}>{busy ? 'Ending…' : 'End plan'}</Text></Pressable></View></View> : null}
      {activeScene ? <>
        <View style={styles.quote}><Text style={styles.quoteName}>{companionName}</Text><Text style={styles.quoteText}>{stream || latestReaction(messages) || `“I was wondering if you’d actually make me go first.”`}</Text></View>
        <Text style={styles.sectionLabel}>{experience.phase === 'wrapping_up' ? 'WINDING DOWN' : String(experience.plan.title).toUpperCase()}</Text>
        {actionsLoading && !experience.interactions.length ? <View accessibilityLiveRegion="polite" style={styles.actionsLoading}><ActivityIndicator size="small" color={colors.rose}/><Text style={styles.actionsLoadingText}>Loading things to do…</Text></View> : <View style={styles.actions}>{experience.interactions.slice(0, 6).map((candidate) => <Pressable key={candidate.id} disabled={busy} onPress={() => void execute(candidate)} style={[styles.action, candidate.presentation?.emphasis === 'recommended' && styles.actionFeatured]}><Text style={styles.actionText}>{candidate.label}</Text></Pressable>)}</View>}
        {experience.destinations.length ? <><Text style={styles.sectionLabel}>GO SOMEWHERE ELSE</Text><View style={styles.actions}>{experience.destinations.slice(0, 3).map((candidate) => <Pressable key={candidate.id} disabled={busy} onPress={() => void move(candidate)} style={styles.action}><MapPin size={14} color={colors.rose}/><Text style={styles.actionText}>{candidate.label}</Text></Pressable>)}</View></> : null}
        {canEndManually ? <Pressable accessibilityRole="button" accessibilityLabel={`End ${experience.plan.title}`} onPress={() => setShowEndConfirm(true)} disabled={busy} style={styles.wrap}><Clock3 size={15} color={colors.muted}/><Text style={styles.wrapText}>End plan</Text></Pressable> : null}
      </> : null}
      {completed ? <View style={styles.completed}><CheckCircle2 size={24} color={colors.success}/><View style={styles.completedCopy}><Text style={styles.completedKicker}>{experience.plan.completion_reason === 'user_ended' ? 'ENDED EARLY' : 'PLAN COMPLETE'}</Text><Text style={styles.completedTitle}>{experience.plan.title}</Text><Text style={styles.completedBody}>{completionSummary}</Text><Text style={styles.completedMeta}>{formatCompletionMeta(experience,viewerTimezone)}</Text></View><View style={styles.completedActions}><Pressable accessibilityRole="button" onPress={talkAboutIt} style={styles.join}><Text style={styles.joinText}>Talk about it</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.replace(`/plan/${planId}` as never)} style={styles.keepButton}><Text style={styles.keepText}>View plan details</Text></Pressable></View></View> : null}
      {didNotHappen ? <View style={styles.completed}><View style={styles.completedCopy}><Text style={styles.completedKicker}>{experience.plan.status === 'cancelled' ? 'CANCELLED' : 'DID NOT HAPPEN'}</Text><Text style={styles.completedTitle}>{experience.plan.title}</Text><Text style={styles.completedBody}>{experience.plan.miss_reason === 'character_absent' ? `${companionName} could not make it. This does not count against you.` : experience.plan.status === 'missed' ? 'The shared experience never began.' : 'This plan is no longer active.'}</Text></View><View style={styles.completedActions}><Pressable accessibilityRole="button" onPress={talkAboutIt} style={styles.join}><Text style={styles.joinText}>Message {companionName}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.replace(`/plan/${planId}` as never)} style={styles.keepButton}><Text style={styles.keepText}>View plan details</Text></Pressable></View></View> : null}
      {messages.map((message) => <View key={message.id} style={styles.message}><Text style={styles.messageText}>{message.content}</Text></View>)}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!activeScene && !experience.participation.userPresent && (experience.phase === 'early' || waiting) ? <Pressable disabled={busy} onPress={() => void join()} style={styles.join}><Text style={styles.joinText}>{busy ? 'Joining…' : `Join ${companionName}`}</Text></Pressable> : null}
      {conversation && !completed && !didNotHappen ? <View style={styles.composerArea}><View style={styles.composer}><TextInput value={composer} onChangeText={setComposer} placeholder={`Message ${companionName}…`} placeholderTextColor={colors.dimmed} style={styles.input} multiline/><Pressable onPress={() => void send()} disabled={!composer.trim() || busy || composer.length > MESSAGE_CHARACTER_LIMIT} style={[styles.send, (!composer.trim() || busy || composer.length > MESSAGE_CHARACTER_LIMIT) && styles.disabled]}><Send size={17} color="#fff"/></Pressable></View><MessageCharacterCounter value={composer}/></View> : null}
    </ScrollView>
  </KeyboardAvoidingView>;
}

function WaitingCard({ title, body, action, onPress }: { title: string; body: string; action: string; onPress: () => void }) { return <View style={styles.waiting}><Text style={styles.waitingTitle}>{title}</Text><Text style={styles.waitingBody}>{body}</Text><Pressable onPress={onPress} style={styles.waitingButton}><Text style={styles.waitingButtonText}>{action}</Text></Pressable></View>; }
function latestReaction(messages: Message[]) { return messages.at(-1)?.content; }
function formatDuration(seconds: number) { const minutes = Math.max(0, Math.floor(seconds / 60)); return minutes < 1 ? 'just started' : `${minutes}m`; }
function formatTime(value: string, timezone?: string | null) { try { return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', ...(timezone ? { timeZone: timezone } : {}) }).format(new Date(value)); } catch { return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } }
function formatCompletionMeta(experience: PlanExperience, timezone: string) {
  const reason = experience.plan.completion_reason === 'user_ended' ? 'Ended by you' : experience.plan.completion_reason === 'elapsed' ? 'Ended as scheduled' : 'Saved as shared history';
  const duration = experience.participation.attendedSeconds > 0 ? formatDuration(experience.participation.attendedSeconds) : null;
  const ended = experience.plan.completed_at ? formatTime(experience.plan.completed_at, timezone) : null;
  return [reason, duration, ended].filter(Boolean).join(' · ');
}

const styles = StyleSheet.create({
  composerArea: { gap: 4 },
  root: { flex: 1, backgroundColor: colors.background }, content: { gap: spacing.md, padding: spacing.lg, paddingBottom: 32, maxWidth: 760, width: '100%', alignSelf: 'center' }, center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 10 }, muted: { color: colors.muted, fontSize: 12 }, top: { flexDirection: 'row', alignItems: 'center', gap: 10 }, icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, iconSpacer: { width: 40, height: 40 }, topCopy: { flex: 1 }, kicker: { color: colors.rose, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 }, headerTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 22, marginTop: 2 }, hero: { height: 255, borderRadius: radius.xl, overflow: 'hidden', position: 'relative', backgroundColor: colors.surface }, heroImage: { width: '100%', height: '100%' }, heroShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(12,8,16,.34)' }, heroCopy: { position: 'absolute', left: 18, right: 18, bottom: 18 }, place: { color: '#fff', fontSize: 11, fontWeight: '800' }, activity: { color: '#fff', fontFamily: 'Georgia', fontSize: 32, marginTop: 4, textTransform: 'capitalize' }, sub: { color: 'rgba(255,255,255,.8)', fontSize: 11, marginTop: 6 }, timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, timeText: { color: colors.warm, fontSize: 11, fontWeight: '800' }, quote: { padding: 16, borderRadius: radius.lg, backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border }, quoteName: { color: colors.rose, fontSize: 10, fontWeight: '900', letterSpacing: 1 }, quoteText: { color: colors.text, fontFamily: 'Georgia', fontSize: 19, lineHeight: 26, marginTop: 6 }, sectionLabel: { color: colors.dimmed, fontSize: 9, fontWeight: '900', letterSpacing: 1.4, marginTop: 6 }, actions: { gap: 8 }, actionsLoading: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, actionsLoadingText: { color: colors.muted, fontSize: 12, fontWeight: '700' }, action: { minHeight: 48, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 8 }, actionFeatured: { borderColor: colors.rose, backgroundColor: 'rgba(216,62,234,.12)' }, actionText: { color: colors.text, fontSize: 13, fontWeight: '800' }, waiting: { padding: 18, borderRadius: radius.lg, backgroundColor: colors.elevated, borderWidth: 1, borderColor: 'rgba(216,62,234,.24)' }, waitingTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 21 }, waitingBody: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 }, waitingButton: { marginTop: 14, minHeight: 42, borderRadius: radius.md, backgroundColor: colors.rose, alignItems: 'center', justifyContent: 'center' }, waitingButtonText: { color: '#fff', fontSize: 12, fontWeight: '900' }, endConfirm: { gap: 10, padding: 17, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(216,62,234,.28)', backgroundColor: colors.elevated }, endTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 21 }, endCopy: { color: colors.muted, fontSize: 12, lineHeight: 18 }, endActions: { flexDirection: 'row', gap: 9 }, keepButton: { minHeight: 44, flex: 1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, keepText: { color: colors.text, fontSize: 11, fontWeight: '900' }, endButton: { minHeight: 44, flex: 1, borderRadius: radius.md, backgroundColor: colors.rose, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, endButtonText: { color: '#fff', fontSize: 11, fontWeight: '900' }, wrap: { alignSelf: 'center', flexDirection: 'row', gap: 7, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 }, wrapText: { color: colors.muted, fontSize: 11, fontWeight: '800' }, completed: { gap: 12, padding: 18, borderRadius: radius.xl, borderWidth: 1, borderColor: 'rgba(78,203,141,.24)', backgroundColor: colors.elevated }, completedCopy: { gap: 5 }, completedKicker: { color: colors.success, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 }, completedTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 24 }, completedBody: { color: colors.muted, fontSize: 12, lineHeight: 18 }, completedMeta: { color: colors.dimmed, fontSize: 10, fontWeight: '800', marginTop: 3 }, completedActions: { gap: 8, marginTop: 3 }, message: { alignSelf: 'flex-start', maxWidth: '88%', padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface }, messageText: { color: colors.text, fontSize: 13, lineHeight: 18 }, join: { minHeight: 48, borderRadius: radius.md, backgroundColor: colors.rose, alignItems: 'center', justifyContent: 'center' }, joinText: { color: '#fff', fontSize: 13, fontWeight: '900' }, composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 }, input: { flex: 1, minHeight: 48, maxHeight: 120, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 16, paddingVertical: 12 }, send: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.rose, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: .45 }, error: { color: colors.danger, fontSize: 12, textAlign: 'center' }, } as const);
