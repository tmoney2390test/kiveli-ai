import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Edit3, MapPin, X } from 'lucide-react-native';
import { router } from 'expo-router';
import { DateTimeFields } from './DateTimeFields';
import { locationHeroAsset } from '../assets';
import { colors, radius } from '../theme';
import type { CharacterInstance, ConversationAction, Snapshot } from '../types';
import { companionPick, companionPickQuote, defaultPlanTimeFields, localPlanDateValue, parseCustomPlanTime, recommendPlanOptions, buildPlanSlots, type PlanDiscoveryIntent, type PlanOption, type PlanSlot } from '../lib/plans';
import { locationsForWorld, worldForLocation } from '../lib/place';

type Props = {
  snapshot: Snapshot;
  character: CharacterInstance;
  scopedLocationId?: string | null;
  repeatPlanId?: string;
  proposal?: ConversationAction;
  interests: string[];
  busy: boolean;
  onPlan: (option: PlanOption, scheduledFor: string) => void;
  onClose: () => void;
};

/** The planning surface deliberately keeps one source of truth: selectedDateTime. */
export function PlanSelection({ snapshot, character, scopedLocationId, repeatPlanId, proposal, interests, busy, onPlan, onClose }: Props) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [selectedDateTime, setSelectedDateTime] = useState<string | null>(null);
  const [selectionSource, setSelectionSource] = useState<'recommended' | 'custom'>('recommended');
  const [customOpen, setCustomOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [elsewhere, setElsewhere] = useState(false);
  const [intent, setIntent] = useState<PlanDiscoveryIntent | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [dateValue, setDateValue] = useState('');
  const [timeValue, setTimeValue] = useState(defaultPlanTimeFields().time);
  const [validation, setValidation] = useState('');
  const { width } = useWindowDimensions();
  const carousel = useRef<ScrollView>(null);
  const heroCardWidth = Math.max(290, Math.min(width - 48, 760));

  const scoped = snapshot.locations.find((item) => item.id === scopedLocationId);
  const scopedWorld = worldForLocation(snapshot, scopedLocationId ?? character.current_location_id);
  const planLocations = scopedWorld ? locationsForWorld(snapshot, scopedWorld.id) : snapshot.locations;
  const preferences = snapshot.memories
    .filter((item) => item.character_instance_id === character.id && item.memory_type === 'preference')
    .map((item) => item.canonical_text);
  const planContext = {
    activity: character.current_activity,
    mood: character.current_mood,
    locationId: character.current_location_id,
    interests: character.together_character_versions.interests,
    userInterests: interests,
    preferences,
    personality: character.together_character_versions.personality_config,
    relationshipStage: character.relationship_stage,
    locations: planLocations,
    scopedLocationId,
    chooseElsewhere: elsewhere,
    previousPlans: snapshot.sharedPlans ?? [],
    intent: intent ?? undefined,
  };
  const options = useMemo(() => recommendPlanOptions(planContext), [
    character.current_activity,
    character.current_mood,
    character.current_location_id,
    character.relationship_stage,
    character.id,
    character.together_character_versions,
    interests.join('|'),
    preferences.join('|'),
    planLocations.map((item) => item.id).join('|'),
    scopedLocationId,
    elsewhere,
    intent,
  ]);
  const repeatPlan = (snapshot.sharedPlans ?? []).find((item) => item.id === repeatPlanId);
  const proposalActivity = typeof proposal?.payload.activityKey === 'string' ? proposal.payload.activityKey : null;
  const proposalLocation = typeof proposal?.payload.locationId === 'string' ? proposal.payload.locationId : null;
  const proposalOption = proposal && !proposal.payload.needsCompanionPick
    ? options.find((option) => option.locationId === proposalLocation && option.activityKey === proposalActivity)
      ?? options.find((option) => option.locationId === proposalLocation)
    : undefined;
  const pick = companionPick(planContext);
  const choice = chooserOpen ? undefined : options.find((option) => option.id === selectedOptionId);
  const heroOptions = useMemo(() => {
    const unique = new Map<string, PlanOption>();
    for (const option of options) if (!unique.has(option.locationId)) unique.set(option.locationId, option);
    return [...unique.values()].slice(0, 8);
  }, [options]);
  const generatedSlots = buildPlanSlots({
    option: choice,
    schedules: snapshot.schedules.filter((item) => item.character_version_id === character.character_version_id),
    plans: (snapshot.sharedPlans ?? []).filter((item) => item.character_instance_id === character.id),
    dates: snapshot.dates.filter((item) => item.character_instance_id === character.id),
    timezone: scopedWorld?.timezone,
  });
  const suggestedCandidate = typeof proposal?.payload.suggestedStartsAt === 'string' ? proposal.payload.suggestedStartsAt : null;
  const suggestedStart = suggestedCandidate && new Date(suggestedCandidate).getTime() >= Date.now() + 10 * 60_000 ? suggestedCandidate : null;
  const slots: PlanSlot[] = suggestedStart
    ? [{ label: 'Best time', detail: formatPlanDate(new Date(suggestedStart), scopedWorld?.timezone), value: suggestedStart, reason: 'The time you suggested', best: true }, ...generatedSlots.filter((item) => item.value !== suggestedStart)]
    : generatedSlots;
  const selectedSlot = slots.find((slot) => slot.value === selectedDateTime);
  const selectedLocation = choice ? snapshot.locations.find((item) => item.id === choice.locationId) : scoped;
  const selectedWorld = selectedLocation ? worldForLocation(snapshot, selectedLocation.id) : scopedWorld;
  const activeHeroIndex = choice ? Math.max(0, heroOptions.findIndex((option) => option.locationId === choice.locationId)) : heroIndex;

  useEffect(() => {
    if (!selectedOptionId && !chooserOpen && (proposalOption || repeatPlan || pick || options[0])) {
      const initial = proposalOption ?? (repeatPlan ? options.find((option) => option.locationId === repeatPlan.location_id && option.activityKey === repeatPlan.activity_key) : undefined) ?? pick ?? options[0];
      if (initial) { setSelectedOptionId(initial.id); if (proposalOption) setChooserOpen(false); }
    }
  }, [chooserOpen, options, pick?.id, proposalOption?.id, repeatPlan?.id, selectedOptionId]);

  useEffect(() => {
    if (repeatPlan && !selectedOptionId) {
      const match = options.find((option) => option.locationId === repeatPlan.location_id && option.activityKey === repeatPlan.activity_key)
        ?? options.find((option) => option.locationId === repeatPlan.location_id);
      if (match) { setIntent('liked'); setSelectedOptionId(match.id); setChooserOpen(false); return; }
    }
    if (proposalOption && !selectedOptionId) { setSelectedOptionId(proposalOption.id); setChooserOpen(false); return; }
    if (proposal?.payload.needsCompanionPick && !selectedOptionId && pick) { setIntent('companion_pick'); setSelectedOptionId(pick.id); setChooserOpen(false); }
  }, [pick?.id, proposal?.id, proposalOption?.id, repeatPlan?.id, selectedOptionId, options]);

  useEffect(() => {
    if (!heroOptions.length) return;
    const index = choice ? Math.max(0, heroOptions.findIndex((option) => option.locationId === choice.locationId)) : heroIndex;
    if (index !== heroIndex) setHeroIndex(index);
  }, [choice?.locationId, heroIndex, heroOptions]);

  useEffect(() => {
    if (!choice || selectedDateTime || !slots[0]) return;
    setSelectedDateTime(slots[0].value);
    setSelectionSource('recommended');
    syncFields(slots[0].value, setDateValue, setTimeValue, selectedWorld?.timezone);
  }, [choice?.id, slots[0]?.value, selectedDateTime, selectedWorld?.timezone]);

  const selectOption = (id: string) => {
    setSelectedOptionId(id);
    setChooserOpen(false);
    setSelectedDateTime(null);
    setSelectionSource('recommended');
    setCustomOpen(false);
    setValidation('');
  };
  const selectSlot = (slot: PlanSlot) => {
    setSelectedDateTime(slot.value);
    setSelectionSource('recommended');
    setCustomOpen(false);
    setValidation('');
    syncFields(slot.value, setDateValue, setTimeValue, selectedWorld?.timezone);
  };
  const updateCustom = (nextDate: string, nextTime: string) => {
    setDateValue(nextDate); setTimeValue(nextTime);
    const value = parseCustomPlanTime(nextDate, nextTime);
    if (!value) { setSelectedDateTime(null); setSelectionSource('custom'); setValidation('Choose a valid date and time.'); return; }
    if (value.getTime() < Date.now() + 10 * 60_000) { setSelectedDateTime(null); setSelectionSource('custom'); setValidation('Choose a time at least 10 minutes from now.'); return; }
    setSelectedDateTime(value.toISOString()); setSelectionSource('custom'); setValidation('');
  };
  const resetSelection = () => {
    setSelectedOptionId(null); setSelectedDateTime(null); setCustomOpen(false); setChooserOpen(true); setValidation('');
    if (!scoped || elsewhere) setIntent(null);
  };
  const chooseIntent = (value: PlanDiscoveryIntent) => {
    setIntent(value); setSelectedDateTime(null); setSelectedOptionId(value === 'companion_pick' ? pick?.id ?? null : null); setChooserOpen(value !== 'companion_pick'); setCustomOpen(false); setValidation('');
  };
  const selectHero = (index: number) => {
    const next = heroOptions[index];
    if (!next) return;
    setHeroIndex(index); setSelectedOptionId(next.id); setChooserOpen(false); setSelectedDateTime(null); setSelectionSource('recommended'); setCustomOpen(false); setValidation('');
    carousel.current?.scrollTo({ x: index * (heroCardWidth + 12), animated: true });
  };
  const moveHero = (direction: -1 | 1) => selectHero(Math.min(Math.max(activeHeroIndex + direction, 0), Math.max(heroOptions.length - 1, 0)));
  const viewAllPlaces = () => { if (selectedWorld) router.push(`/world/places?world=${selectedWorld.slug}` as never); };
  const confirm = () => { if (choice && selectedDateTime) onPlan(choice, selectedDateTime); };
  const companionName = character.together_character_templates.name;
  const availability = availabilityCopy(character, selectedSlot);

  return <View style={styles.surface} accessibilityViewIsModal={Platform.OS === 'web' ? undefined : true}>
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.heading}>Plan with {companionName}</Text>
        <Text style={styles.subtitle}>{choice ? 'When should you two go?' : scoped && !elsewhere ? `What sounds good at ${scoped.name}?` : 'Pick an idea, then weâ€™ll find the right time.'}</Text>
      </View>
      <Pressable accessibilityLabel="Close planner" disabled={busy} onPress={onClose} style={styles.close}><X size={18} color={colors.muted} /></Pressable>
    </View>
    {chooserOpen || !choice ? <>
      {!scoped || elsewhere ? <View style={styles.intentRow}>{([
        ['companion_pick', `${companionName} picks`], ['tonight', 'For tonight'], ['date_night', 'Date night'], ['casual', 'Something casual'], ['different', 'Something different'], ['liked', 'Places you liked'],
      ] as Array<[PlanDiscoveryIntent, string]>).map(([value, label]) => <Pressable key={value} onPress={() => chooseIntent(value)} style={[styles.intent, intent === value && styles.intentActive]}><Text style={styles.intentText}>{label}</Text></Pressable>)}</View> : null}
      {intent || (scoped && !elsewhere) ? <View style={styles.options}>{(intent === 'companion_pick' ? [pick].filter(Boolean) as PlanOption[] : options.slice(0, scoped && !elsewhere ? 8 : 4)).map((option) => <Pressable key={option.id} accessibilityRole="button" onPress={() => selectOption(option.id)} style={styles.option}><View style={{ flex: 1, minWidth: 0 }}><Text style={styles.optionTitle}>{option.title}</Text><Text style={styles.optionCopy} numberOfLines={2}>{option.description}</Text><Text style={styles.optionReason}>{option.reason}</Text></View><ChevronRight size={17} color={colors.rose} /></Pressable>)}</View> : null}
      {scoped && !elsewhere ? <Pressable onPress={() => { setElsewhere(true); setIntent(null); }} style={styles.secondary}><MapPin size={15} color={colors.rose} /><Text style={styles.secondaryText}>Choose somewhere else</Text></Pressable> : null}
    </> : <>
      <View style={styles.carouselWrap} accessible accessibilityLabel={`${companionName}'s plan place choices`}>
        <ScrollView ref={carousel} horizontal showsHorizontalScrollIndicator={false} snapToInterval={heroCardWidth + 12} decelerationRate="fast" contentContainerStyle={styles.carouselContent} onMomentumScrollEnd={(event) => { const index = Math.round(event.nativeEvent.contentOffset.x / (heroCardWidth + 12)); if (heroOptions[index]) selectHero(index); }}>
          {heroOptions.map((option, index) => { const isActive = index === activeHeroIndex; const optionLocation = snapshot.locations.find((item) => item.id === option.locationId); const optionWorld = optionLocation ? worldForLocation(snapshot, option.locationId) : selectedWorld; return <View key={option.id} style={[styles.hero, { width: heroCardWidth }, isActive && styles.heroActive]}>
            <Image source={locationHeroAsset(optionWorld?.slug, optionLocation?.slug)} contentFit="cover" transition={220} priority={isActive ? 'high' : 'low'} style={StyleSheet.absoluteFill} />
            <View style={styles.heroShade} />
            <View style={styles.heroContent}>
              <View style={styles.heroTop}><Text style={styles.eyebrow}>{activityLabel(option.activityKey)}</Text><Text style={styles.heroStatus}>{index === 0 ? `${companionName}'s pick` : `â— ${isActive ? availability : `${companionName} should be free`}`}</Text></View>
              <Text style={styles.heroTitle}>{option.title}</Text>
              <View style={styles.heroMeta}><MapPin size={13} color="#FFD1E0" /><Text style={styles.heroMetaText}>{option.locationName}</Text><Text style={styles.heroDot}>Â·</Text><Text style={styles.heroMetaText}>{durationLabel(option.durationMinutes)}</Text></View>
              {index === 0 && intent === 'companion_pick' ? <Text style={styles.quote}>{companionPickQuote(companionName, option, character.together_character_versions.personality_config)}</Text> : null}
              <Pressable onPress={resetSelection} style={styles.change}><Edit3 size={13} color="#FFD1E0" /><Text style={styles.changeText}>Change activity or place</Text></Pressable>
            </View>
          </View>; })}
        </ScrollView>
        {heroOptions.length > 1 && Platform.OS === 'web' ? <><Pressable accessibilityLabel="Previous place" disabled={activeHeroIndex === 0} onPress={() => moveHero(-1)} style={[styles.carouselArrow, styles.carouselArrowLeft, activeHeroIndex === 0 && styles.arrowDisabled]}><ChevronLeft size={20} color="#fff" /></Pressable><Pressable accessibilityLabel="Next place" disabled={activeHeroIndex >= heroOptions.length - 1} onPress={() => moveHero(1)} style={[styles.carouselArrow, styles.carouselArrowRight, activeHeroIndex >= heroOptions.length - 1 && styles.arrowDisabled]}><ChevronRight size={20} color="#fff" /></Pressable></> : null}
        <View style={styles.carouselFooter}><Text style={styles.carouselCount}>{activeHeroIndex + 1} of {heroOptions.length}</Text><Pressable accessibilityRole="link" onPress={viewAllPlaces} style={styles.viewAll}><Text style={styles.viewAllText}>View all places</Text><ChevronRight size={14} color={colors.rose} /></Pressable></View>
      </View>
      <View style={styles.whenHeader}><Text style={styles.sectionTitle}>When works?</Text><Text style={styles.sectionHint}>Choose the moment that feels right.</Text></View>
      {slots.length ? <View style={styles.slotRow}>{slots.slice(0, 3).map((slot, index) => <Pressable key={slot.value} accessibilityRole="button" accessibilityState={{ selected: selectedDateTime === slot.value }} disabled={busy} onPress={() => selectSlot(slot)} style={[styles.slot, selectedDateTime === slot.value && styles.slotSelected]}><View style={styles.slotTop}><Text style={styles.slotEyebrow}>{index === 0 || slot.best ? 'BEST FOR YOU TWO' : slotLabel(slot.label)}</Text>{selectedDateTime === slot.value ? <Check size={16} color={colors.rose} /> : null}</View><Text style={styles.slotDay}>{slotDay(slot.value, selectedWorld?.timezone)}</Text><Text style={styles.slotTime}>{slotTime(slot.value, selectedWorld?.timezone)}</Text><Text style={styles.slotReason}>{slot.reason ?? `${companionName} should be free around then.`}</Text></Pressable>)}</View> : <View style={styles.emptySlots}><Text style={styles.emptySlotsTitle}>Looks like a busy stretch.</Text><Text style={styles.emptySlotsCopy}>Pick another time and weâ€™ll work around it.</Text></View>}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: customOpen }} onPress={() => { setCustomOpen((value) => !value); if (!customOpen && selectedDateTime) syncFields(selectedDateTime, setDateValue, setTimeValue, selectedWorld?.timezone); }} style={styles.disclosure}><Text style={styles.disclosureText}>Pick another time</Text><ChevronDown size={16} color={colors.rose} style={customOpen ? { transform: [{ rotate: '180deg' }] } : undefined} /></Pressable>
      {customOpen ? <View style={styles.custom}><Text style={styles.customEyebrow}>OTHER TIME</Text><DateTimeFields date={dateValue} time={timeValue} onDateChange={(value) => updateCustom(value, timeValue)} onTimeChange={(value) => updateCustom(dateValue, value)} />{validation ? <Text style={styles.validation}>{validation}</Text> : null}</View> : null}
      <View style={styles.confirmation}><Text style={styles.confirmationTitle} numberOfLines={2}>{choice.title}</Text><Text style={styles.confirmationWhen}>{selectedDateTime ? formatPlanDate(new Date(selectedDateTime), selectedWorld?.timezone) : 'Choose a time above'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Confirm plan" accessibilityHint={selectionSource === 'custom' ? 'Custom time selected' : 'Recommended time selected'} disabled={busy || !selectedDateTime} onPress={confirm} style={[styles.confirm, (busy || !selectedDateTime) && styles.disabled]}><Text style={styles.confirmText}>{busy ? 'Savingâ€¦' : 'Confirm Plan'}</Text></Pressable></View>
    </>}
  </View>;
}

function syncFields(value: string, setDate: (value: string) => void, setTime: (value: string) => void, timezone?: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return;
  const parts = timezone ? new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date) : [];
  const part = (key: string) => parts.find((item) => item.type === key)?.value;
  setDate(timezone && part('year') && part('month') && part('day') ? `${part('year')}-${part('month')}-${part('day')}` : localPlanDateValue(date));
  const hours = timezone ? Number(new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(date)) : date.getHours();
  const minutes = timezone ? Number(new Intl.DateTimeFormat('en-US', { timeZone: timezone, minute: '2-digit' }).format(date)) : date.getMinutes();
  setTime(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
}
function formatPlanDate(value: Date, timezone?: string) { return value.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...(timezone ? { timeZone: timezone } : {}) }); }
function slotDay(value: string, timezone?: string) { return new Date(value).toLocaleDateString([], { weekday: 'long', ...(timezone ? { timeZone: timezone } : {}) }); }
function slotTime(value: string, timezone?: string) { return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', ...(timezone ? { timeZone: timezone } : {}) }); }
function slotLabel(value: string) { return value.replace('Tomorrow evening', 'Tomorrow').replace('This weekend', 'Weekend').replace('Best time', 'BEST TIME').toUpperCase(); }
function activityLabel(value: string) { return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()).toUpperCase(); }
function durationLabel(minutes: number) { return `about ${Math.round(minutes / 30) * 30} min`; }
function availabilityCopy(character: CharacterInstance, slot?: PlanSlot) { const name = character.together_character_templates.name; if (character.current_interruptibility === 'busy') return slot?.reason?.replace(/^Companion is /, '') ?? `${name} may still be busy`; if (character.current_interruptibility === 'limited') return `${name} should have a little time`; return `${name} is free`; }

const styles = StyleSheet.create({
  surface: { gap: 14, padding: 16, backgroundColor: '#15101D', borderBottomWidth: 1, borderBottomColor: colors.border, shadowColor: '#000', shadowOpacity: .3, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, heading: { color: colors.text, fontFamily: 'Georgia', fontSize: 28 }, subtitle: { color: colors.muted, fontSize: 13, marginTop: 4 }, close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  intentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, intent: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 13, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, intentActive: { backgroundColor: 'rgba(241,103,154,.12)', borderColor: colors.rose }, intentText: { color: colors.text, fontWeight: '800', fontSize: 11 }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, option: { width: '48%', minWidth: 220, flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 13, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, optionTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 18 }, optionCopy: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }, optionReason: { color: colors.rose, fontSize: 10, fontWeight: '800', marginTop: 6 }, secondary: { minHeight: 42, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }, secondaryText: { color: colors.text, fontSize: 11, fontWeight: '800' },
  carouselWrap: { position: 'relative', gap: 8 }, carouselContent: { gap: 12, paddingHorizontal: 2 }, hero: { height: 286, borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,.10)', backgroundColor: colors.surface }, heroActive: { borderColor: 'rgba(241,103,154,.42)', shadowColor: colors.rose, shadowOpacity: .14, shadowRadius: 22, shadowOffset: { width: 0, height: 8 } }, heroShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(6,7,14,.48)' }, heroContent: { flex: 1, justifyContent: 'flex-end', padding: 20, gap: 5 }, heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, eyebrow: { color: '#FFD1E0', fontSize: 10, letterSpacing: 1.3, fontWeight: '900' }, heroStatus: { color: '#FBE7EF', fontSize: 11, fontWeight: '800' }, heroTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 31, lineHeight: 36, maxWidth: '90%' }, heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }, heroMetaText: { color: '#F5EAF0', fontSize: 12, fontWeight: '700' }, heroDot: { color: '#E8B4C8' }, quote: { color: '#F8D9E5', fontFamily: 'Georgia', fontSize: 14, lineHeight: 20, marginTop: 7, maxWidth: 560 }, change: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingVertical: 8 }, changeText: { color: '#FFD1E0', fontSize: 11, fontWeight: '800' }, carouselArrow: { position: 'absolute', top: 118, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,11,19,.74)', borderWidth: 1, borderColor: 'rgba(255,255,255,.20)' }, carouselArrowLeft: { left: 12 }, carouselArrowRight: { right: 12 }, arrowDisabled: { opacity: .35 }, carouselFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 5 }, carouselCount: { color: colors.dimmed, fontSize: 10 }, viewAll: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 7 }, viewAllText: { color: colors.rose, fontSize: 11, fontWeight: '900' },
  whenHeader: { gap: 3, marginTop: 2 }, sectionTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 21 }, sectionHint: { color: colors.muted, fontSize: 12 }, slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, slot: { flex: 1, minWidth: 150, minHeight: 154, padding: 14, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, slotSelected: { backgroundColor: 'rgba(241,103,154,.11)', borderColor: colors.rose, shadowColor: colors.rose, shadowOpacity: .18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }, slotTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 19 }, slotEyebrow: { color: colors.rose, fontSize: 9, letterSpacing: .85, fontWeight: '900' }, slotDay: { color: colors.muted, fontSize: 12, marginTop: 13 }, slotTime: { color: colors.text, fontFamily: 'Georgia', fontSize: 25, marginTop: 2 }, slotReason: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 8 }, emptySlots: { padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, emptySlotsTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 19 }, emptySlotsCopy: { color: colors.muted, fontSize: 12, marginTop: 5 }, disclosure: { minHeight: 42, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12 }, disclosureText: { color: colors.rose, fontSize: 12, fontWeight: '900' }, custom: { gap: 8, padding: 13, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, customEyebrow: { color: colors.dimmed, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, validation: { color: colors.danger, fontSize: 11 }, confirmation: { alignItems: 'center', gap: 3, paddingVertical: 8, paddingHorizontal: 12 }, confirmationWhen: { color: colors.muted, fontSize: 12, fontWeight: '700' }, confirmationTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 20, textAlign: 'center' }, confirm: { minHeight: 48, minWidth: 180, paddingHorizontal: 24, marginTop: 8, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.rose, shadowColor: colors.rose, shadowOpacity: .24, shadowRadius: 15, shadowOffset: { width: 0, height: 6 } }, disabled: { opacity: .42 }, confirmText: { color: '#fff', fontSize: 12, fontWeight: '900', textAlign: 'center' },
});

