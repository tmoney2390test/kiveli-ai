import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AlertTriangle, CalendarDays, Clock3, MapPin, Play, RotateCcw, Trash2, UserCheck, X } from 'lucide-react-native';
import { locationHeroAsset } from '../assets';
import { colors, radius, spacing } from '../theme';
import { useTogether } from '../store/useTogether';
import { managePlan } from '../lib/api';
import { commitmentStatusLabel, commitmentTimeLabel, endPlanExperience, getCommitment, joinCommitment, planCompletionLabel, rescheduleCommitment, type Commitment } from '../lib/commitments';
import { userExperienceTimezone } from '../lib/experienceTimezone';
import { parseCustomPlanTime, recommendPlanOptions } from '../lib/plans';
import { planActionAvailability } from '../lib/planActions';
import { DateTimeFields } from './DateTimeFields';
import { FrostedBackdrop, FrostedSurface } from './FrostedGlass';

type Props = {
  visible: boolean;
  planId: string | null;
  confirmCancel?: boolean;
  onClose: () => void;
};

export function PlanDetailsModal({ visible, planId, confirmCancel = false, onClose }: Props) {
  const { snapshot, refresh } = useTogether();
  const snapshotPlan = snapshot?.sharedPlans.find((item) => item.id === planId);
  const [detail, setDetail] = useState<Commitment | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const [editingPlace, setEditingPlace] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [dateValue, setDateValue] = useState('');
  const [timeValue, setTimeValue] = useState('19:30');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!visible || !planId) return;
    let active = true;
    setDetail(null); setError(''); setCancelOpen(confirmCancel); setEndOpen(false); setEditingTime(false); setEditingPlace(false); setEditingNote(false); setLoading(true);
    void getCommitment(planId).then((value) => { if (active) { setDetail(value); setNote(value.note ?? ''); } }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'The plan could not be loaded.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [confirmCancel, planId, visible]);

  const plan = detail ?? (snapshotPlan as Commitment | undefined);
  const character = snapshot?.characters.find((item) => item.id === plan?.character_instance_id);
  const location = snapshot?.locations.find((item) => item.id === plan?.location_id);
  const world = snapshot?.worlds.find((item) => item.id === plan?.world_id);
  const viewerTimezone = snapshot ? userExperienceTimezone(snapshot) : undefined;
  const actions = plan ? planActionAvailability(plan) : null;
  const exactStart = plan?.starts_at ? new Date(plan.starts_at) : null;
  const exactEnd = plan?.ends_at ? new Date(plan.ends_at) : null;
  const experienceSummary = plan && typeof plan.metadata?.planExperience === 'object' && plan.metadata.planExperience && typeof (plan.metadata.planExperience as Record<string, unknown>).summary === 'string' ? String((plan.metadata.planExperience as Record<string, unknown>).summary) : null;
  const locationOptions = useMemo(() => snapshot && character && plan ? recommendPlanOptions({ activity: character.current_activity, mood: character.current_mood, locationId: character.current_location_id, interests: [...(snapshot.activePersona?.interests ?? []), ...character.together_character_versions.interests], relationshipStage: character.relationship_stage, locations: snapshot.locations.filter((item) => !plan.world_id || item.world_id === plan.world_id), chooseElsewhere: true, previousPlans: snapshot.sharedPlans }).filter((item) => item.activityKey === plan.activity_key || item.tags.some((tag) => plan.activity_key.includes(tag))).slice(0, 6) : [], [character, plan, snapshot]);

  const reload = async (force=false) => { if (!planId) return; const value = await getCommitment(planId); setDetail(value); setNote(value.note ?? ''); await refresh(force?{force:true}:undefined); };
  const start = async () => {
    if (!plan || !character || !actions) return;
    if (!actions.primaryEnabled) { setError(`This plan can be started within 30 minutes of ${commitmentTimeLabel(plan, viewerTimezone)}.`); return; }
    setBusy(true); setError('');
    try { await joinCommitment(plan.id, character.id); await refresh(); if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onClose(); router.push(`/plan-live?planId=${plan.id}` as never); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The plan could not be started.'); }
    finally { setBusy(false); }
  };
  const end = async () => {
    if (!plan || !character || !actions?.canEnd) return;
    setBusy(true); setError('');
    try { await endPlanExperience(plan.id, character.id); await reload(true); setEndOpen(false); if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The plan could not be ended.'); }
    finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!plan) return;
    setBusy(true); setError('');
    try { await managePlan({ action: 'cancel', planId: plan.id, conversationId: snapshotPlan?.source_conversation_id }); await reload(); setCancelOpen(false); if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The plan could not be cancelled.'); }
    finally { setBusy(false); }
  };
  const openTime = () => {
    if (exactStart) { setDateValue(localDateValue(exactStart, viewerTimezone)); setTimeValue(localTimeValue(exactStart, viewerTimezone)); }
    setEditingTime((value) => !value); setEditingPlace(false); setEditingNote(false); setError('');
  };
  const saveTime = async () => {
    if (!plan) return;
    const value = parseCustomPlanTime(dateValue, timeValue);
    if (!value || value.getTime() < Date.now() + 10 * 60_000) { setError('Choose a time at least 10 minutes from now.'); return; }
    setBusy(true); setError('');
    try { await rescheduleCommitment(plan.id, { startsAt: value.toISOString(), timePrecision: 'exact', conversationId: snapshotPlan?.source_conversation_id ?? undefined }); await reload(); setEditingTime(false); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The time could not be changed.'); }
    finally { setBusy(false); }
  };
  const savePlace = async (locationId: string) => {
    if (!plan) return;
    setBusy(true); setError('');
    try { await managePlan({ action: 'update', planId: plan.id, locationId, conversationId: snapshotPlan?.source_conversation_id }); await reload(); setEditingPlace(false); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The place could not be changed.'); }
    finally { setBusy(false); }
  };
  const saveNote = async () => {
    if (!plan) return;
    setBusy(true); setError('');
    try { await managePlan({ action: 'update', planId: plan.id, note, conversationId: snapshotPlan?.source_conversation_id }); await reload(); setEditingNote(false); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The note could not be saved.'); }
    finally { setBusy(false); }
  };

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable accessibilityLabel="Close plan details" style={styles.backdrop} onPress={onClose}>
      <FrostedBackdrop intensity={38}/>
      <Pressable style={styles.frame} onPress={() => undefined}>
        <FrostedSurface intensity={92} style={styles.modal}>
          {!plan || !snapshot || !character ? <View style={styles.loading}>{loading ? <ActivityIndicator color={colors.rose}/> : null}<Text style={styles.error}>{error || 'This plan is unavailable.'}</Text><Pressable onPress={onClose} style={styles.secondary}><Text style={styles.secondaryText}>Close</Text></Pressable></View> : <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.hero}><Image source={locationHeroAsset(world?.slug, location?.slug)} style={StyleSheet.absoluteFill} contentFit="cover"/><View style={styles.heroShade}/><Pressable accessibilityLabel="Close plan details" onPress={onClose} style={styles.close}><X size={18} color="#fff"/></Pressable><View style={styles.heroCopy}><View style={styles.status}><Text style={styles.statusText}>{commitmentStatusLabel(plan)}</Text></View><Text style={styles.title}>{plan.title}</Text><Text style={styles.companion}>{character.together_character_templates.name} · {world?.name ?? 'Your world'}</Text></View></View>
            <View style={styles.details}><Detail icon={<CalendarDays size={18} color={colors.rose}/>} label="WHEN" value={exactStart ? exactStart.toLocaleDateString([], { timeZone: viewerTimezone, weekday: 'long', month: 'long', day: 'numeric' }) : plan.original_time_expression ?? 'Time not settled'}/><Detail icon={<Clock3 size={18} color={colors.warm}/>} label="TIME" value={commitmentTimeLabel(plan, viewerTimezone)}/><Detail icon={<MapPin size={18} color={colors.violet}/>} label="PLACE" value={location?.name ?? plan.together_locations?.name ?? 'Place not set'}/>{exactEnd ? <Text style={styles.localTime}>Expected through {formatTime(exactEnd, viewerTimezone)} · your local time</Text> : null}</View>
            {plan.note ? <View style={styles.noteCard}><Text style={styles.kicker}>PLAN NOTE</Text><Text style={styles.noteText}>{plan.note}</Text></View> : null}
            {plan.companion_state === 'late' ? <Notice icon={<Clock3 color={colors.warm}/>} title={`${character.together_character_templates.name} is running late.`} body={`${plan.companion_reason ?? 'Their arrival changed.'}${plan.companion_eta_at ? ` New ETA: ${formatTime(new Date(plan.companion_eta_at), viewerTimezone)}.` : ''}`}/> : null}
            {plan.companion_state === 'absent' ? <Notice icon={<AlertTriangle color={colors.danger}/>} title={`${character.together_character_templates.name} couldn't make it.`} body={`${plan.companion_reason ?? 'The plan changed on their side.'} This does not count against you.`}/> : null}
            {actions?.userPresent && plan.status === 'active' ? <View style={styles.present}><UserCheck size={17} color={colors.success}/><Text style={styles.presentText}>You’re both here. Continue in Together Now.</Text></View> : null}
            {plan.status === 'completed' ? <View style={styles.history}><Text style={styles.kicker}>SHARED HISTORY</Text><Text style={styles.historyTitle}>{experienceSummary ?? `${plan.title} became part of your shared history.`}</Text><Text style={styles.historyCopy}>{planCompletionLabel(plan)}{plan.completed_at ? ` · ${formatTime(new Date(plan.completed_at), viewerTimezone)}` : ''}</Text></View> : null}
            {plan.status === 'missed' ? <Notice icon={<AlertTriangle color={colors.danger}/>} title={plan.miss_reason === 'user_absent' ? `${character.together_character_templates.name} waited for you.` : 'This plan did not happen.'} body={plan.miss_reason === 'user_absent' ? 'You can talk about what happened from the full plan view.' : 'A companion or technical miss does not count against your relationship.'}/> : null}
            {cancelOpen ? <View style={styles.confirm}><Text style={styles.confirmTitle}>Cancel this plan?</Text><Text style={styles.confirmCopy}>{character.together_character_templates.name} will know that {plan.title} changed.</Text><View style={styles.buttonRow}><Pressable disabled={busy} onPress={() => setCancelOpen(false)} style={styles.secondary}><Text style={styles.secondaryText}>Keep plan</Text></Pressable><Pressable disabled={busy} onPress={() => void cancel()} style={styles.dangerButton}><Trash2 size={15} color="#fff"/><Text style={styles.primaryText}>{busy ? 'Cancelling…' : 'Cancel plan'}</Text></Pressable></View></View> : null}
            {endOpen ? <View style={styles.confirm}><Text style={styles.confirmTitle}>End this plan now?</Text><Text style={styles.confirmCopy}>This closes your shared scene with {character.together_character_templates.name} and saves what happened to your history.</Text><View style={styles.buttonRow}><Pressable disabled={busy} onPress={() => setEndOpen(false)} style={styles.secondary}><Text style={styles.secondaryText}>Keep going</Text></Pressable><Pressable disabled={busy} onPress={() => void end()} style={styles.dangerButton}><Clock3 size={15} color="#fff"/><Text style={styles.primaryText}>{busy ? 'Ending…' : 'End plan'}</Text></Pressable></View></View> : null}
            {editingTime ? <View style={styles.editor}><Text style={styles.editorTitle}>Change date and time</Text><DateTimeFields date={dateValue} time={timeValue} onDateChange={setDateValue} onTimeChange={setTimeValue}/><Pressable disabled={busy} onPress={() => void saveTime()} style={styles.primary}><Text style={styles.primaryText}>{busy ? 'Saving…' : 'Save time'}</Text></Pressable></View> : null}
            {editingPlace ? <View style={styles.editor}><Text style={styles.editorTitle}>Change place</Text>{locationOptions.map((option) => <Pressable key={option.id} disabled={busy} onPress={() => void savePlace(option.locationId)} style={styles.placeOption}><View style={{ flex: 1 }}><Text style={styles.placeTitle}>{option.locationName}</Text><Text style={styles.placeReason}>{option.reason}</Text></View><MapPin size={15} color={colors.rose}/></Pressable>)}</View> : null}
            {editingNote ? <View style={styles.editor}><Text style={styles.editorTitle}>Plan note</Text><TextInput value={note} onChangeText={setNote} placeholder="Outdoor table if the weather is good." placeholderTextColor={colors.dimmed} multiline style={styles.noteInput}/><Pressable disabled={busy} onPress={() => void saveNote()} style={styles.primary}><Text style={styles.primaryText}>{busy ? 'Saving…' : 'Save note'}</Text></Pressable></View> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {actions?.primary === 'start' ? <Pressable disabled={busy || !actions.primaryEnabled} onPress={() => void start()} style={[styles.primary, !actions.primaryEnabled && styles.disabled]}><Play size={16} color="#fff" fill="#fff"/><Text style={styles.primaryText}>{busy ? 'Starting…' : 'Start plan'}</Text></Pressable> : null}
            {actions?.primary === 'start' && !actions.primaryEnabled ? <Text style={styles.availability}>Start becomes available 30 minutes before the planned time.</Text> : null}
            {actions?.canEnd && !endOpen ? <Pressable disabled={busy} onPress={() => setEndOpen(true)} style={styles.secondary}><Clock3 size={16} color={colors.muted}/><Text style={styles.secondaryText}>End plan</Text></Pressable> : null}
            {actions?.canEdit && !cancelOpen ? <View style={styles.manage}><Text style={styles.kicker}>MANAGE PLAN</Text><View style={styles.manageRow}><Pressable onPress={openTime} style={styles.manageButton}><Clock3 size={14} color={colors.rose}/><Text style={styles.manageText}>Change time</Text></Pressable><Pressable onPress={() => { setEditingPlace((value) => !value); setEditingTime(false); setEditingNote(false); }} style={styles.manageButton}><MapPin size={14} color={colors.violet}/><Text style={styles.manageText}>Change place</Text></Pressable><Pressable onPress={() => { setEditingNote((value) => !value); setEditingPlace(false); setEditingTime(false); }} style={styles.manageButton}><Text style={styles.manageText}>Edit note</Text></Pressable></View><Pressable onPress={() => setCancelOpen(true)} style={styles.cancelLink}><Trash2 size={14} color={colors.danger}/><Text style={styles.cancelText}>Cancel plan</Text></Pressable></View> : null}
            {plan.status === 'completed' ? <Pressable onPress={() => { onClose(); router.push(`/chat?character=${character.together_character_templates.public_handle ?? character.together_character_templates.slug}&plan=1&repeatPlanId=${plan.id}` as never); }} style={styles.secondary}><RotateCcw size={15} color={colors.rose}/><Text style={styles.secondaryText}>Go again</Text></Pressable> : null}
            {plan.status === 'missed' ? <Pressable onPress={() => { onClose(); router.push(`/plan/${plan.id}` as never); }} style={styles.secondary}><Text style={styles.secondaryText}>Explain what happened</Text></Pressable> : null}
          </ScrollView>}
        </FrostedSurface>
      </Pressable>
    </Pressable>
  </Modal>;
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <View style={styles.detail}>{icon}<View style={{ flex: 1 }}><Text style={styles.kicker}>{label}</Text><Text style={styles.value}>{value}</Text></View></View>; }
function Notice({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) { return <View style={styles.notice}>{icon}<View style={{ flex: 1 }}><Text style={styles.noticeTitle}>{title}</Text><Text style={styles.noticeCopy}>{body}</Text></View></View>; }
function formatTime(value: Date, timezone?: string) { try { return new Intl.DateTimeFormat(undefined, { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(value); } catch { return value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } }
function localDateValue(value: Date, timezone?: string) { try { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value); } catch { return value.toISOString().slice(0, 10); } }
function localTimeValue(value: Date, timezone?: string) { try { const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(value); return `${parts.find((item) => item.type === 'hour')?.value ?? '19'}:${parts.find((item) => item.type === 'minute')?.value ?? '30'}`; } catch { return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`; } }

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18 }, frame: { width: '100%', maxWidth: 620, maxHeight: '90%' }, modal: { width: '100%', maxHeight: '100%', borderRadius: radius.xl, borderColor: 'rgba(216,142,255,.34)', backgroundColor: 'rgba(19,14,29,.88)', shadowColor: '#8A4DFF', shadowOpacity: .32, shadowRadius: 32, shadowOffset: { width: 0, height: 16 } }, content: { gap: spacing.md, padding: 16, paddingBottom: 22 }, loading: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }, hero: { height: 190, borderRadius: radius.lg, overflow: 'hidden', justifyContent: 'flex-end' }, heroShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(7,5,13,.52)' }, heroCopy: { padding: 18 }, close: { position: 'absolute', zIndex: 2, top: 12, right: 12, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(6,4,11,.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,.16)' }, status: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(216,62,234,.28)', borderWidth: 1, borderColor: 'rgba(255,255,255,.16)' }, statusText: { color: '#fff', fontSize: 8, fontWeight: '900', letterSpacing: 1 }, title: { color: '#fff', fontFamily: 'Georgia', fontSize: 29, marginTop: 8 }, companion: { color: 'rgba(255,255,255,.78)', fontSize: 11, fontWeight: '700', marginTop: 5 }, details: { gap: 14, padding: 16, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,.045)', borderWidth: 1, borderColor: 'rgba(216,181,255,.13)' }, detail: { flexDirection: 'row', alignItems: 'center', gap: 11 }, kicker: { color: '#CDB6E5', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 }, value: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 3 }, localTime: { color: colors.muted, fontSize: 9, marginLeft: 29 }, noteCard: { gap: 5, padding: 13, borderRadius: radius.md, backgroundColor: 'rgba(216,62,234,.07)', borderWidth: 1, borderColor: 'rgba(216,62,234,.17)' }, noteText: { color: colors.textSecondary, fontSize: 11, lineHeight: 17 }, notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 13, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.035)', borderWidth: 1, borderColor: colors.border }, noticeTitle: { color: colors.text, fontSize: 12, fontWeight: '900' }, noticeCopy: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 }, present: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: 'rgba(78,203,141,.09)', borderWidth: 1, borderColor: 'rgba(78,203,141,.18)' }, presentText: { flex: 1, color: colors.text, fontSize: 11, fontWeight: '800' }, history: { gap: 7, padding: 15, borderRadius: radius.lg, backgroundColor: 'rgba(216,62,234,.08)', borderWidth: 1, borderColor: 'rgba(216,62,234,.22)' }, historyTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 20, lineHeight: 26 }, historyCopy: { color: colors.success, fontSize: 10, fontWeight: '800' }, confirm: { gap: 11, padding: 16, borderRadius: radius.lg, backgroundColor: 'rgba(75,24,43,.42)', borderWidth: 1, borderColor: 'rgba(255,93,121,.32)' }, confirmTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 22 }, confirmCopy: { color: colors.textSecondary, fontSize: 11, lineHeight: 17 }, buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, primary: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 15, borderRadius: radius.md, backgroundColor: colors.rose, shadowColor: colors.rose, shadowOpacity: .25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }, dangerButton: { minHeight: 44, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 13, borderRadius: radius.md, backgroundColor: colors.danger }, primaryText: { color: '#fff', fontSize: 11, fontWeight: '900' }, secondary: { minHeight: 44, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 13, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,.035)' }, secondaryText: { color: colors.text, fontSize: 11, fontWeight: '800' }, editor: { gap: 11, padding: 14, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,.035)', borderWidth: 1, borderColor: 'rgba(203,168,255,.18)' }, editorTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 19 }, placeOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border }, placeTitle: { color: colors.text, fontSize: 12, fontWeight: '900' }, placeReason: { color: colors.muted, fontSize: 9, marginTop: 3 }, noteInput: { minHeight: 80, padding: 12, borderRadius: radius.md, color: colors.text, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, textAlignVertical: 'top' }, manage: { gap: 10, paddingTop: 3 }, manageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, manageButton: { minHeight: 39, flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,.025)' }, manageText: { color: colors.text, fontSize: 9, fontWeight: '800' }, cancelLink: { alignSelf: 'flex-start', minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 }, cancelText: { color: colors.danger, fontSize: 10, fontWeight: '800' }, availability: { color: colors.muted, fontSize: 9, textAlign: 'center', marginTop: -7 }, disabled: { opacity: .42 }, error: { color: colors.danger, fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
