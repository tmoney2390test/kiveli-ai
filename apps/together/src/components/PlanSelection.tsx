import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Edit3, MapPin, RefreshCw, X } from 'lucide-react-native';
import { router } from 'expo-router';
import { DateTimeFields } from './DateTimeFields';
import { locationHeroAsset } from '../assets';
import { colors, radius } from '../theme';
import type { CharacterInstance, ConversationAction, SharedPlan, Snapshot } from '../types';
import { companionPick, companionPickQuote, defaultPlanTimeFields, isVenueProgramTime, localPlanDateValue, nextAvailableGroupPlanTime, parseCustomPlanTime, planOptionCanStartNow, previewPlanTiming, recommendPlanOptions, resolveGroupPlanAvailability, type PlanDiscoveryIntent, type PlanOption, type PlanTimingChoice, type PlanTimingSelection } from '../lib/plans';
import { characterResidentWorld, locationsForWorld, worldForLocation } from '../lib/place';
import { placeHoursStatus } from '../lib/placeHours';
import { userExperienceTimezone } from '../lib/experienceTimezone';
import { useWorldPulse } from '../hooks/useWorldPulse';

type Props = {
  snapshot: Snapshot;
  character: CharacterInstance;
  scopedLocationId?: string | null;
  currentLocationId?: string | null;
  initialActivityKey?: string | null;
  repeatPlanId?: string;
  proposal?: ConversationAction;
  initialTimingChoice?: PlanTimingChoice;
  mode?: 'create'|'switch';
  currentPlan?: SharedPlan | null;
  interests: string[];
  companionLabel?: string;
  pluralCompanions?: boolean;
  participants?: CharacterInstance[];
  plannerWorldId?: string | null;
  plannerConversationId?: string | null;
  hideViewAllPlaces?: boolean;
  busy: boolean;
  error?: string;
  onPlan: (option: PlanOption, timing: PlanTimingSelection) => void;
  onClose: () => void;
};

/** Every planning entry point deliberately shares the same three timing choices. */
export function PlanSelection({ snapshot, character, scopedLocationId, currentLocationId, initialActivityKey, repeatPlanId, proposal, initialTimingChoice, mode='create', currentPlan, interests, companionLabel, pluralCompanions=false, participants, plannerWorldId, plannerConversationId, hideViewAllPlaces=false, busy, error, onPlan, onClose }: Props) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [selectedDateTime, setSelectedDateTime] = useState<string | null>(null);
  const [timingChoice, setTimingChoice] = useState<PlanTimingChoice | null>(mode==='switch'?'now':initialTimingChoice??null);
  const [customOpen, setCustomOpen] = useState(initialTimingChoice==='custom');
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
  const viewerTimezone=userExperienceTimezone(snapshot);
  const switchNow=useMemo(()=>new Date(),[currentPlan?.id,mode]);

  const residentWorld = snapshot.worlds.find((world)=>world.id===plannerWorldId) ?? characterResidentWorld(snapshot, character);
  const {data:worldPulse}=useWorldPulse(residentWorld?.id,Boolean(residentWorld?.id));
  const activeLocationId = currentLocationId ?? character.current_location_id;
  const scopedCandidate = snapshot.locations.find((item) => item.id === scopedLocationId && (mode==='switch'||item.id !== currentLocationId));
  const scoped = scopedCandidate && (!residentWorld || scopedCandidate.world_id === residentWorld.id) ? scopedCandidate : undefined;
  const scopedWorld = residentWorld ?? worldForLocation(snapshot, scoped?.id ?? activeLocationId);
  const allPlanLocations = scopedWorld ? locationsForWorld(snapshot, scopedWorld.id) : snapshot.locations;
  const planLocations = mode==='switch'
    ? allPlanLocations.filter((location)=>placeHoursStatus(location.hours,switchNow,viewerTimezone).isOpen)
    : allPlanLocations;
  const preferences = snapshot.memories
    .filter((item) => item.character_instance_id === character.id && item.memory_type === 'preference')
    .map((item) => item.canonical_text);
  const planContext = {
    activity: character.current_activity,
    mood: character.current_mood,
    locationId: activeLocationId,
    excludedLocationId: mode==='switch'?null:currentLocationId,
    interests: character.together_character_versions.interests,
    userInterests: interests,
    preferences,
    personality: character.together_character_versions.personality_config,
    relationshipStage: character.relationship_stage,
    locations: planLocations,
    scopedLocationId:scoped?.id,
    chooseElsewhere: elsewhere,
    previousPlans: (snapshot.sharedPlans ?? []).filter((plan)=>plan.character_instance_id===character.id),
    intent: intent ?? undefined,
    worldPulse:worldPulse?.events??[],
  };
  const options = useMemo(() => {
    const recommended=recommendPlanOptions(planContext);
    return mode==='switch'?recommended.filter((option)=>
      planOptionCanStartNow(option,switchNow,viewerTimezone)
      && !(option.locationId===currentPlan?.location_id&&option.activityKey===currentPlan.activity_key)
    ):recommended;
  }, [
    character.current_activity,
    character.current_mood,
    activeLocationId,
    currentLocationId,
    character.relationship_stage,
    character.id,
    character.together_character_versions,
    interests.join('|'),
    preferences.join('|'),
    planLocations.map((item) => item.id).join('|'),
    scoped?.id,
    elsewhere,
    intent,
    mode,
    switchNow,
    viewerTimezone,
    currentPlan?.location_id,
    currentPlan?.activity_key,
    worldPulse?.generatedAt,
  ]);
  const repeatPlan = (snapshot.sharedPlans ?? []).find((item) => item.id === repeatPlanId);
  const proposalActivity = typeof proposal?.payload.activityKey === 'string' ? proposal.payload.activityKey : null;
  const proposalLocation = typeof proposal?.payload.locationId === 'string' ? proposal.payload.locationId : null;
  const proposalOption = proposal && !proposal.payload.needsCompanionPick
    ? options.find((option) => option.locationId === proposalLocation && option.activityKey === proposalActivity)
      ?? options.find((option) => option.locationId === proposalLocation)
    : undefined;
  const initialOption = initialActivityKey ? options.find((option) => option.activityKey === initialActivityKey || option.activityKey === initialActivityKey.replace(/[^a-z0-9]+/gi, '_').toLowerCase()) : undefined;
  const pick = companionPick(planContext);
  const choice = chooserOpen ? undefined : options.find((option) => option.id === selectedOptionId);
  const heroOptions = useMemo(() => {
    const unique = new Map<string, PlanOption>();
    for (const option of options) if (!unique.has(option.locationId)) unique.set(option.locationId, option);
    return [...unique.values()].slice(0, 8);
  }, [options]);
  const selectedLocation = choice ? snapshot.locations.find((item) => item.id === choice.locationId) : scoped;
  const selectedWorld = selectedLocation ? worldForLocation(snapshot, selectedLocation.id) : scopedWorld;
  const activeHeroIndex = choice ? Math.max(0, heroOptions.findIndex((option) => option.locationId === choice.locationId)) : heroIndex;

  useEffect(() => {
    if (!selectedOptionId && !chooserOpen && (proposalOption || initialOption || repeatPlan || pick || options[0])) {
      const initial = proposalOption ?? initialOption ?? (repeatPlan ? options.find((option) => option.locationId === repeatPlan.location_id && option.activityKey === repeatPlan.activity_key) : undefined) ?? pick ?? options[0];
      if (initial) { setSelectedOptionId(initial.id); if (proposalOption) setChooserOpen(false); }
    }
  }, [chooserOpen, initialOption?.id, options, pick?.id, proposalOption?.id, repeatPlan?.id, selectedOptionId]);

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

  const selectOption = (id: string) => {
    setSelectedOptionId(id);
    setChooserOpen(false);
    setSelectedDateTime(null);
    setTimingChoice(mode==='switch'?'now':null);
    setCustomOpen(false);
    setValidation('');
  };
  const selectTiming = (value:PlanTimingChoice) => {
    setTimingChoice(value);
    setValidation('');
    if(value==='custom'){
      setCustomOpen(true);
      if(selectedDateTime)syncFields(selectedDateTime,setDateValue,setTimeValue,selectedWorld?.timezone);
      return;
    }
    setCustomOpen(false);
    setSelectedDateTime(null);
  };
  const updateCustom = (nextDate: string, nextTime: string) => {
    setDateValue(nextDate); setTimeValue(nextTime);
    const value = parseCustomPlanTime(nextDate, nextTime);
    setTimingChoice('custom');
    if (!value) { setSelectedDateTime(null); setValidation('Choose a valid date and time.'); return; }
    if (value.getTime() < Date.now() + 10 * 60_000) { setSelectedDateTime(null); setValidation('Choose a time at least 10 minutes from now.'); return; }
    if (choice?.program && !isVenueProgramTime(choice, value)) { setSelectedDateTime(null); setValidation(`${choice.program.title} runs on its listed event nights at ${choice.program.startTime}.`); return; }
    setSelectedDateTime(value.toISOString()); setValidation('');
  };
  const resetSelection = () => {
    setSelectedOptionId(null); setSelectedDateTime(null); setTimingChoice(mode==='switch'?'now':null); setCustomOpen(false); setChooserOpen(true); setValidation('');
    if (!scoped || elsewhere) setIntent(null);
  };
  const chooseIntent = (value: PlanDiscoveryIntent) => {
    setIntent(value); setSelectedDateTime(null); setTimingChoice(mode==='switch'?'now':null); setSelectedOptionId(value === 'companion_pick' ? pick?.id ?? null : null); setChooserOpen(value !== 'companion_pick'); setCustomOpen(false); setValidation('');
  };
  const selectHero = (index: number) => {
    const next = heroOptions[index];
    if (!next) return;
    setHeroIndex(index); setSelectedOptionId(next.id); setChooserOpen(false); setSelectedDateTime(null); setTimingChoice(mode==='switch'?'now':null); setCustomOpen(false); setValidation('');
    carousel.current?.scrollTo({ x: index * (heroCardWidth + 12), animated: true });
  };
  const moveHero = (direction: -1 | 1) => selectHero(Math.min(Math.max(activeHeroIndex + direction, 0), Math.max(heroOptions.length - 1, 0)));
  const viewAllPlaces = () => {
    if (!selectedWorld) return;
    const groupQuery = plannerConversationId
      ? `&group=${encodeURIComponent(plannerConversationId)}`
      : "";
    const switchQuery=mode==='switch'&&currentPlan?.id?`&switchPlanId=${encodeURIComponent(currentPlan.id)}&openNow=1`:'';
    router.push(`/world/places?world=${selectedWorld.slug}&character=${encodeURIComponent(character.id)}&planning=1${groupQuery}${switchQuery}` as never);
  };
  const confirm = () => { if(!choice||!timingChoice)return;if(timingChoice==='custom'){if(selectedDateTime)onPlan(choice,{choice:'custom',startsAt:selectedDateTime});return;}onPlan(choice,{choice:timingChoice}); };
  const companionName = companionLabel?.trim() || character.together_character_templates.name;
  const availability = pluralCompanions ? 'Check everyone below' : availabilityCopy(character);
  const timingPreview=timingChoice==='now'?'Start now':timingChoice==='in_one_hour'?`In 1 hour · ${formatPlanDate(previewPlanTiming('in_one_hour'),selectedWorld?.timezone)}`:selectedDateTime?formatPlanDate(new Date(selectedDateTime),selectedWorld?.timezone):'Choose a time above';
  const planParticipants=participants?.length?participants:[character];
  const timingDate=timingChoice==='now'?new Date():timingChoice==='in_one_hour'?previewPlanTiming('in_one_hour'):selectedDateTime?new Date(selectedDateTime):null;
  const groupAvailability=pluralCompanions&&choice&&timingDate?resolveGroupPlanAvailability({participants:planParticipants,start:timingDate,durationMinutes:choice.durationMinutes,schedules:snapshot.schedules,plans:snapshot.sharedPlans,dates:snapshot.dates,immediate:timingChoice==='now',excludePlanId:currentPlan?.id,replacingActivePlan:mode==='switch'}):[];
  const groupBlocked=groupAvailability.some((status)=>!status.available);
  const nextGroupTime=pluralCompanions&&choice&&timingDate&&groupBlocked?nextAvailableGroupPlanTime({participants:planParticipants,after:new Date(Math.max(Date.now()+10*60000,timingDate.getTime())),option:choice,schedules:snapshot.schedules,plans:snapshot.sharedPlans,dates:snapshot.dates,excludePlanId:currentPlan?.id}):null;
  const chooseRecommendedGroupTime=()=>{if(!nextGroupTime)return;const value=nextGroupTime.toISOString();setTimingChoice('custom');setSelectedDateTime(value);setCustomOpen(false);syncFields(value,setDateValue,setTimeValue,selectedWorld?.timezone);setValidation('');};
  const canConfirm=Boolean(timingChoice&&(timingChoice!=='custom'||selectedDateTime)&&!groupBlocked);

  return <View style={styles.surface} accessibilityViewIsModal={Platform.OS === 'web' ? undefined : true}>
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.heading}>{mode==='switch'?`Change plans with ${companionName}`:`Plan with ${companionName}`}</Text>
        <Text style={styles.subtitle}>{mode==='switch'?`Choose what replaces ${currentPlan?.title??'your current plan'}.`:choice ? pluralCompanions?'When should everyone go?':'When should you two go?' : scoped && !elsewhere ? `What sounds good at ${scoped.name}?` : 'Pick an idea, then we’ll find the right time.'}</Text>
      </View>
      <Pressable accessibilityLabel="Close planner" disabled={busy} onPress={onClose} style={styles.close}><X size={18} color={colors.muted} /></Pressable>
    </View>
    {chooserOpen || !choice ? <>
      {!scoped || elsewhere ? <View style={styles.intentRow}>{((mode==='switch'?[
        ['companion_pick', pluralCompanions?'Group pick':`${companionName} picks`], ['casual', 'Something casual'], ['different', 'Something different'], ['liked', 'Places you liked'],
      ]:[
        ['companion_pick', pluralCompanions?'Group pick':`${companionName} picks`], ['tonight', 'For tonight'], ['date_night', 'Date night'], ['casual', 'Something casual'], ['different', 'Something different'], ['liked', 'Places you liked'],
      ]) as Array<[PlanDiscoveryIntent, string]>).map(([value, label]) => <Pressable key={value} onPress={() => chooseIntent(value)} style={[styles.intent, intent === value && styles.intentActive]}><Text style={styles.intentText}>{label}</Text></Pressable>)}</View> : null}
      {intent || (scoped && !elsewhere) ? <View style={styles.options}>{(intent === 'companion_pick' ? [pick].filter(Boolean) as PlanOption[] : options.slice(0, scoped && !elsewhere ? 8 : 4)).map((option) => {
        const hours=placeHoursStatus(option.hours);
        return <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={`${option.title}. ${hours.statusLabel}. ${hours.scheduleLabel}.`} onPress={() => selectOption(option.id)} style={styles.option}><View style={{ flex: 1, minWidth: 0 }}><Text style={styles.optionTitle}>{option.title}</Text><Text style={styles.optionCopy} numberOfLines={2}>{option.description}</Text><PlaceHoursLine status={hours}/><Text style={styles.optionReason}>{option.reason}</Text></View><ChevronRight size={17} color={colors.rose} /></Pressable>;
      })}</View> : null}
      {!options.length&&mode==='switch'?<View style={styles.noOpenPlaces}><Clock3 size={16} color={colors.muted}/><Text style={styles.noOpenPlacesText}>No other place can fit a plan right now. Try again when more places are open.</Text></View>:null}
      {scoped && !elsewhere ? <Pressable onPress={() => { setElsewhere(true); setIntent(null); }} style={styles.secondary}><MapPin size={15} color={colors.rose} /><Text style={styles.secondaryText}>Choose somewhere else</Text></Pressable> : null}
    </> : <>
      <View style={styles.carouselWrap} accessible accessibilityLabel={`${companionName}'s plan place choices`}>
        <ScrollView ref={carousel} horizontal showsHorizontalScrollIndicator={false} snapToInterval={heroCardWidth + 12} decelerationRate="fast" contentContainerStyle={styles.carouselContent} onMomentumScrollEnd={(event) => { const index = Math.round(event.nativeEvent.contentOffset.x / (heroCardWidth + 12)); if (heroOptions[index]) selectHero(index); }}>
          {heroOptions.map((option, index) => { const isActive = index === activeHeroIndex; const optionLocation = snapshot.locations.find((item) => item.id === option.locationId); const optionWorld = optionLocation ? worldForLocation(snapshot, option.locationId) : selectedWorld; const hours=placeHoursStatus(optionLocation?.hours??option.hours); return <View key={option.id} style={[styles.heroCard,{width:heroCardWidth}]}>
            <View style={[styles.hero,isActive&&styles.heroActive]}>
              <Image source={locationHeroAsset(optionWorld?.slug, optionLocation?.slug)} contentFit="cover" transition={220} priority={isActive ? 'high' : 'low'} style={StyleSheet.absoluteFill} />
              <View style={styles.heroShade} />
              <View style={styles.heroContent}>
                <Text style={styles.heroStatus}>{index === 0 ? pluralCompanions?'Group pick':`${companionName}'s pick` : isActive ? availability : pluralCompanions?'Check everyone below':`${companionName} should be free`}</Text>
                <Text style={styles.eyebrow}>{activityLabel(option.activityKey)}</Text>
                <Text style={styles.heroTitle}>{option.title}</Text>
                <View style={styles.heroMeta}><MapPin size={13} color="#FFD1E0" /><Text style={styles.heroMetaText}>{option.locationName}</Text><Text style={styles.heroDot}>·</Text><Text style={styles.heroMetaText}>{durationLabel(option.durationMinutes)}</Text></View>
                <PlaceHoursLine status={hours} hero/>
                {index === 0 && intent === 'companion_pick' ? <Text style={styles.quote}>{companionPickQuote(companionName, option, character.together_character_versions.personality_config)}</Text> : null}
              </View>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Change activity or place" onPress={resetSelection} style={styles.change}><Edit3 size={13} color="#FFD1E0" /><Text style={styles.changeText}>Change activity or place</Text></Pressable>
          </View>; })}
        </ScrollView>
        {heroOptions.length > 1 && Platform.OS === 'web' ? <><Pressable accessibilityLabel="Previous place" disabled={activeHeroIndex === 0} onPress={() => moveHero(-1)} style={[styles.carouselArrow, styles.carouselArrowLeft, activeHeroIndex === 0 && styles.arrowDisabled]}><ChevronLeft size={20} color="#fff" /></Pressable><Pressable accessibilityLabel="Next place" disabled={activeHeroIndex >= heroOptions.length - 1} onPress={() => moveHero(1)} style={[styles.carouselArrow, styles.carouselArrowRight, activeHeroIndex >= heroOptions.length - 1 && styles.arrowDisabled]}><ChevronRight size={20} color="#fff" /></Pressable></> : null}
        <View style={styles.carouselFooter}><Text style={styles.carouselCount}>{activeHeroIndex + 1} of {heroOptions.length}</Text>{!hideViewAllPlaces?<Pressable accessibilityRole="link" onPress={viewAllPlaces} style={styles.viewAll}><Text style={styles.viewAllText}>View all places</Text><ChevronRight size={14} color={colors.rose} /></Pressable>:null}</View>
      </View>
      {mode==='switch'?<View style={styles.switchNotice}><RefreshCw size={15} color={colors.rose}/><View style={{flex:1}}><Text style={styles.switchNoticeTitle}>Switch together now</Text><Text style={styles.switchNoticeCopy}>Only places open for the full activity are shown. Your current plan will be saved first.</Text></View></View>:<><View style={styles.whenHeader}><Text style={styles.sectionTitle}>When works?</Text><Text style={styles.sectionHint}>Choose the moment that feels right.</Text></View>
      <View style={styles.timingRow}>
        <TimingOption label="NOW" detail="Start together immediately" selected={timingChoice==='now'} disabled={busy} onPress={()=>selectTiming('now')}/>
        <TimingOption label="IN 1 HOUR" detail={previewPlanTiming('in_one_hour').toLocaleTimeString([],{hour:'numeric',minute:'2-digit',...(selectedWorld?.timezone?{timeZone:selectedWorld.timezone}:{})})} selected={timingChoice==='in_one_hour'} disabled={busy} onPress={()=>selectTiming('in_one_hour')}/>
        <TimingOption label="PICK ANOTHER TIME" detail="Choose an exact date and time" selected={timingChoice==='custom'} disabled={busy} expanded={customOpen} onPress={()=>selectTiming('custom')}/>
      </View>
      {customOpen ? <View style={styles.custom}><Text style={styles.customEyebrow}>OTHER TIME</Text><DateTimeFields date={dateValue} time={timeValue} onDateChange={(value) => updateCustom(value, timeValue)} onTimeChange={(value) => updateCustom(dateValue, value)} />{validation ? <Text style={styles.validation}>{validation}</Text> : null}</View> : null}</>}
      {pluralCompanions&&groupAvailability.length?<View style={styles.groupAvailability} accessibilityLabel="Group availability"><View style={styles.groupAvailabilityHeading}><Text style={styles.groupAvailabilityTitle}>{groupBlocked?'SOMEONE HAS A CONFLICT':'EVERYONE IS IN'}</Text><Text style={styles.groupAvailabilityTime}>{timingPreview}</Text></View>{groupAvailability.map((status)=><View key={status.characterInstanceId} style={styles.groupAvailabilityRow}><View style={[styles.groupAvailabilityDot,status.available?styles.groupAvailabilityFree:styles.groupAvailabilityBusy]}/><Text numberOfLines={1} style={styles.groupAvailabilityName}>{status.name}</Text><Text numberOfLines={1} style={[styles.groupAvailabilityDetail,!status.available&&styles.groupAvailabilityConflict]}>{status.detail}</Text></View>)}{nextGroupTime?<Pressable accessibilityRole="button" onPress={chooseRecommendedGroupTime} style={styles.groupAvailabilitySuggestion}><Check size={14} color={colors.success}/><Text style={styles.groupAvailabilitySuggestionText}>Everyone is free {formatPlanDate(nextGroupTime,selectedWorld?.timezone)}</Text></Pressable>:null}</View>:null}
      <View style={styles.confirmation}><Text style={styles.confirmationTitle} numberOfLines={2}>{choice.title}</Text><Text style={styles.confirmationWhen}>{mode==='switch'?'Starts now':timingPreview}</Text>{error?<Text accessibilityRole="alert" style={styles.validation}>{error}</Text>:null}<Pressable accessibilityRole="button" accessibilityLabel={mode==='switch'?'Switch plan now':'Confirm plan'} accessibilityHint={mode==='switch'?'Ends the current plan and starts this one':timingChoice==='custom'?'Custom time selected':timingChoice?`${timingChoice.replace(/_/g,' ')} selected`:'Choose a time first'} disabled={busy || !canConfirm} onPress={confirm} style={[styles.confirm, (busy || !canConfirm) && styles.disabled]}><Text style={styles.confirmText}>{busy ? mode==='switch'?'Switching…':'Saving…' : mode==='switch'?'Switch Now':timingChoice==='now'?'Start Now':'Confirm Plan'}</Text></Pressable></View>
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
function activityLabel(value: string) { return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()).toUpperCase(); }
function durationLabel(minutes: number) { return `about ${Math.round(minutes / 30) * 30} min`; }
function availabilityCopy(character: CharacterInstance) { const name = character.together_character_templates.name; if (character.current_interruptibility === 'busy') return `${name} may still be busy`; if (character.current_interruptibility === 'limited') return `${name} should have a little time`; return `${name} is free`; }
function PlaceHoursLine({status,hero=false}:{status:ReturnType<typeof placeHoursStatus>;hero?:boolean}){return <View style={[styles.hoursLine,hero&&styles.heroHoursLine]}><View style={[styles.hoursDot,status.state==='open'?styles.hoursDotOpen:status.state==='closed'?styles.hoursDotClosed:styles.hoursDotUnknown]}/><Text style={[styles.hoursStatus,hero&&styles.heroHoursText,status.state==='open'?styles.hoursOpen:status.state==='closed'?styles.hoursClosed:styles.hoursUnknown]}>{status.statusLabel}</Text>{status.scheduleLabel!==status.statusLabel?<Text style={[styles.hoursSchedule,hero&&styles.heroHoursText]}>· {status.scheduleLabel}</Text>:null}</View>;}
function TimingOption({label,detail,selected,disabled,expanded,onPress}:{label:string;detail:string;selected:boolean;disabled:boolean;expanded?:boolean;onPress:()=>void}){return <Pressable accessibilityRole="button" accessibilityState={{selected,expanded}} disabled={disabled} onPress={onPress} style={[styles.timingOption,selected&&styles.timingOptionSelected]}><View style={styles.timingTop}><Text style={styles.timingLabel}>{label}</Text>{selected?<Check size={16} color={colors.rose}/>:label==='PICK ANOTHER TIME'?<ChevronDown size={16} color={colors.rose} style={expanded?{transform:[{rotate:'180deg'}]}:undefined}/>:null}</View><Text style={styles.timingDetail}>{detail}</Text></Pressable>;}

const styles = StyleSheet.create({
  surface: { gap: 14, padding: 16, backgroundColor: '#15101D', borderBottomWidth: 1, borderBottomColor: colors.border, shadowColor: '#000', shadowOpacity: .3, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, heading: { color: colors.text, fontFamily: 'Georgia', fontSize: 28 }, subtitle: { color: colors.muted, fontSize: 13, marginTop: 4 }, close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  intentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, intent: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 13, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, intentActive: { backgroundColor: 'rgba(216,62,234,.12)', borderColor: colors.rose }, intentText: { color: colors.text, fontWeight: '800', fontSize: 11 }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, option: { width: '48%', minWidth: 220, flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 13, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, optionTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 18 }, optionCopy: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }, optionReason: { color: colors.rose, fontSize: 10, fontWeight: '800', marginTop: 6 }, hoursLine:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:4,marginTop:7},hoursDot:{width:6,height:6,borderRadius:3},hoursDotOpen:{backgroundColor:'#65D6A0'},hoursDotClosed:{backgroundColor:'#F08A9B'},hoursDotUnknown:{backgroundColor:colors.dimmed},hoursStatus:{fontSize:10,fontWeight:'900'},hoursOpen:{color:'#78E3B1'},hoursClosed:{color:'#F5A0AE'},hoursUnknown:{color:colors.muted},hoursSchedule:{color:colors.muted,fontSize:10,fontWeight:'700'},secondary: { minHeight: 42, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }, secondaryText: { color: colors.text, fontSize: 11, fontWeight: '800' },
  noOpenPlaces:{minHeight:54,flexDirection:'row',alignItems:'center',gap:9,padding:12,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},noOpenPlacesText:{flex:1,color:colors.muted,fontSize:11,lineHeight:16},
  carouselWrap: { position: 'relative', gap: 8 }, carouselContent: { gap: 12, paddingHorizontal: 2 },heroCard:{gap:2}, hero: { height: 286, borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,.10)', backgroundColor: colors.surface }, heroActive: { borderColor: 'rgba(216,62,234,.42)', shadowColor: colors.rose, shadowOpacity: .14, shadowRadius: 22, shadowOffset: { width: 0, height: 8 } }, heroShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(6,7,14,.48)' }, heroContent: { flex: 1, justifyContent: 'flex-end', padding: 20, gap: 5 }, eyebrow: { color: '#FFD1E0', fontSize: 10, letterSpacing: 1.3, fontWeight: '900' }, heroStatus: { position:'absolute',top:16,right:16,maxWidth:'62%',color:'#FBE7EF',fontSize:11,fontWeight:'900',paddingHorizontal:11,paddingVertical:7,borderRadius:radius.pill,overflow:'hidden',backgroundColor:'rgba(18,12,28,.72)',borderWidth:1,borderColor:'rgba(255,255,255,.17)',textAlign:'right' }, heroTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 31, lineHeight: 36, maxWidth: '90%' }, heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }, heroMetaText: { color: '#F5EAF0', fontSize: 12, fontWeight: '700' }, heroDot: { color: '#E8B4C8' },heroHoursLine:{marginTop:4},heroHoursText:{color:'#F6EAF0'}, quote: { color: '#F8D9E5', fontFamily: 'Georgia', fontSize: 14, lineHeight: 20, marginTop: 7, maxWidth: 560 }, change: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,marginLeft:8,paddingHorizontal:8,paddingVertical:9 }, changeText: { color: '#FFD1E0', fontSize: 11, fontWeight: '800' }, carouselArrow: { position: 'absolute', top: 118, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,11,19,.74)', borderWidth: 1, borderColor: 'rgba(255,255,255,.20)' }, carouselArrowLeft: { left: 12 }, carouselArrowRight: { right: 12 }, arrowDisabled: { opacity: .35 }, carouselFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 5 }, carouselCount: { color: colors.dimmed, fontSize: 10 }, viewAll: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 7 }, viewAllText: { color: colors.rose, fontSize: 11, fontWeight: '900' },
  whenHeader: { gap: 3, marginTop: 2 }, sectionTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 21 }, sectionHint: { color: colors.muted, fontSize: 12 }, timingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, timingOption: { flex: 1, minWidth: 150, minHeight: 100, padding: 14, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent:'space-between' }, timingOptionSelected: { backgroundColor: 'rgba(216,62,234,.11)', borderColor: colors.rose, shadowColor: colors.rose, shadowOpacity: .18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }, timingTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 19, gap:8 }, timingLabel: { color: colors.rose, fontSize: 10, letterSpacing: .8, fontWeight: '900' }, timingDetail: { color: colors.text, fontFamily:'Georgia', fontSize:16, lineHeight:21, marginTop:12 }, custom: { gap: 8, padding: 13, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, customEyebrow: { color: colors.dimmed, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, groupAvailability:{borderTopWidth:1,borderBottomWidth:1,borderColor:colors.border,paddingVertical:9},groupAvailabilityHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,paddingHorizontal:2,paddingBottom:5},groupAvailabilityTitle:{color:colors.text,fontSize:9,fontWeight:'900',letterSpacing:1},groupAvailabilityTime:{color:colors.muted,fontSize:9,flexShrink:1,textAlign:'right'},groupAvailabilityRow:{minHeight:34,flexDirection:'row',alignItems:'center',gap:8,borderTopWidth:1,borderTopColor:'rgba(255,255,255,.045)',paddingHorizontal:2},groupAvailabilityDot:{width:7,height:7,borderRadius:4},groupAvailabilityFree:{backgroundColor:colors.success},groupAvailabilityBusy:{backgroundColor:colors.danger},groupAvailabilityName:{color:colors.text,fontSize:11,fontWeight:'800',maxWidth:'34%'},groupAvailabilityDetail:{flex:1,color:colors.muted,fontSize:10,textAlign:'right'},groupAvailabilityConflict:{color:'#F5A0AE'},groupAvailabilitySuggestion:{minHeight:40,flexDirection:'row',alignItems:'center',gap:8,marginTop:6,paddingHorizontal:4},groupAvailabilitySuggestionText:{color:colors.success,fontSize:10,fontWeight:'900'}, switchNotice:{flexDirection:'row',alignItems:'center',gap:10,padding:12,borderRadius:radius.md,backgroundColor:'rgba(216,62,234,.08)',borderWidth:1,borderColor:'rgba(216,62,234,.22)'},switchNoticeTitle:{color:colors.text,fontSize:12,fontWeight:'900'},switchNoticeCopy:{color:colors.muted,fontSize:10,lineHeight:14,marginTop:2}, validation: { color: colors.danger, fontSize: 11 }, confirmation: { alignItems: 'center', gap: 3, paddingVertical: 8, paddingHorizontal: 12 }, confirmationWhen: { color: colors.muted, fontSize: 12, fontWeight: '700' }, confirmationTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 20, textAlign: 'center' }, confirm: { minHeight: 48, minWidth: 180, paddingHorizontal: 24, marginTop: 8, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.rose, shadowColor: colors.rose, shadowOpacity: .24, shadowRadius: 15, shadowOffset: { width: 0, height: 6 } }, disabled: { opacity: .42 }, confirmText: { color: '#fff', fontSize: 12, fontWeight: '900', textAlign: 'center' },
});
