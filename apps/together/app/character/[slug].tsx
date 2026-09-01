import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image as ExpoImage, type ImageContentPosition } from 'expo-image';
import { ArrowLeft, Brain, CalendarDays, Camera, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, LockKeyhole, MapPin, Sparkles } from 'lucide-react-native';
import {
  Body,
  EmptyState,
  GradientButton,
  MoodBadge,
  RelationshipBadge,
  Screen,
  resolveCharacterPortraitSource,
} from '../../src/components';
import { DetailPreservingArtwork } from '../../src/components/DetailPreservingArtwork';
import { characterProfilePhotos } from '../../src/character-profile-assets';
import { ensureConversation, loadCharacterSchedule, meetCompanion } from '../../src/lib/api';
import { buildCharacterDaySchedule, type CharacterDayScheduleEntry } from '../../src/lib/characterDaySchedule';
import { characterRelationshipPresentation, compactCharacterSchedule } from '../../src/lib/characterProfilePresentation';
import { relationshipDaysKnown } from '../../src/lib/companionLife';
import { activeConversationFor } from '../../src/lib/conversation';
import { characterConversationHref } from '../../src/lib/chatRoute';
import { presentMemoryText } from '../../src/lib/memoryPresentation';
import { worldForLocation } from '../../src/lib/place';
import { cycleProfilePhotoIndex } from '../../src/lib/profilePhotoCarousel';
import { selectPortraitVersion } from '../../src/lib/selectors';
import { useTogether } from '../../src/store/useTogether';
import { colors, radius, spacing, typography } from '../../src/theme';
import { characterAssets } from '../../src/assets';

export function generateStaticParams() {
  return Object.keys(characterAssets).map((slug) => ({ slug }));
}

export default function CharacterProfile() {
  const { slug, intro } = useLocalSearchParams<{ slug: string; intro?: string }>();
  const { width } = useWindowDimensions();
  const desktop = width >= 820;
  const { snapshot, setSnapshot, upsertConversation } = useTogether();
  const [busy, setBusy] = useState(false);
  const [openingStage, setOpeningStage] = useState<'idle'|'meeting'|'conversation'>('idle');
  const [error, setError] = useState('');

  if (!snapshot) return null;

  const instance = snapshot.characters.find((item) =>
    item.together_character_templates.slug === slug
    || item.together_character_templates.public_handle === slug
    || item.character_template_id === slug
  );
  const discoverable = snapshot.discoverableCharacters?.find((item) =>
    item.slug === slug || item.public_handle === slug || item.id === slug
  );
  const template = instance?.together_character_templates ?? discoverable;
  const baseVersion = instance?.together_character_versions ?? discoverable?.together_character_versions;

  if (!template || !baseVersion) {
    return <EmptyState
      title="You haven’t crossed paths yet"
      body="Some people enter your world through introductions and shared events."
      action="Back to Discover"
      onAction={() => router.replace('/(tabs)/singles')}
    />;
  }

  const version = instance ? selectPortraitVersion(snapshot, instance) : baseVersion;
  const asset = resolveCharacterPortraitSource(template, version, template.slug);
  const profilePhotos = characterProfilePhotos(template.slug, asset);
  const focal = (version.appearance_config?.hero_focal_position
    ?? template.discovery_metadata?.hero_focal_position
    ?? 'top') as ImageContentPosition;
  const known = Boolean(instance && (instance.contact_added_at || instance.introduced_at));
  const selectable = Boolean(template.can_be_selected);
  const locationRow = instance ? snapshot.locations.find((item) => item.id === instance.current_location_id) : undefined;
  const authoredPresence = !instance ? snapshot.characterWorldPresence?.find((item) => item.character_version_id === version.id && item.presence_type !== 'unavailable') : undefined;
  const world = instance
    ? worldForLocation(snapshot, instance.current_location_id)
    : snapshot.worlds.find((item) => item.id === (template.first_meeting?.world_id ?? authoredPresence?.world_id));
  const meetingLocation = !instance ? snapshot.locations.find((item) => item.id === template.first_meeting?.location_id) : undefined;
  const location = locationRow?.name ?? world?.name ?? 'Current place';
  const moments = instance ? snapshot.moments
    .filter((item) => item.character_instance_id === instance.id || item.participant_instance_ids.includes(instance.id))
    .sort((left, right) => new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime()) : [];
  const memories = instance ? snapshot.memories
    .filter((item) => item.character_instance_id === instance.id && item.status !== 'forgotten')
    .sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.importance - left.importance || new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()) : [];
  const relationship = instance ? snapshot.relationships.find((item) => item.character_instance_id === instance.id) : undefined;
  const daysKnown = instance ? relationshipDaysKnown(relationship) : 0;
  const placesTogether = new Set(moments.map((item) => item.location_id).filter(Boolean)).size;
  const upcoming = instance
    ? snapshot.sharedPlans.filter((item) => item.character_instance_id === instance.id && ['scheduled', 'active'].includes(item.status)).length
    : 0;
  const relationshipPresentation = characterRelationshipPresentation({
    name: template.name,
    known,
    stage: instance?.relationship_stage,
    daysKnown,
    momentCount: moments.length,
    placesTogether,
    upcomingCount: upcoming,
  });
  const memoryInspector = snapshot.entitlements?.entitlement_keys?.includes('memory_inspector') === true;
  const memoryCount = instance ? snapshot.memoryCounts?.[instance.id] ?? memories.length : 0;
  const featuredMemory = memories[0];
  const latestMoment = moments[0];
  const handle = template.public_handle ?? template.slug;
  const canTalk = selectable || known;
  const daySchedule = buildCharacterDaySchedule({ snapshot, instance, characterVersionId: version.id, timezone: snapshot.profile?.experience_timezone });
  const authoredScheduleOwnsPresence = Boolean(instance
    && daySchedule.source === 'authored'
    && !['scene', 'active_date', 'active_plan', 'active_event', 'plan', 'life_event'].includes(String(instance.current_presence_source)));
  const currentActivity = authoredScheduleOwnsPresence
    ? daySchedule.currentStatus?.activity ?? 'Having some unstructured time at home'
    : instance?.current_activity;
  const currentLocation = authoredScheduleOwnsPresence
    ? daySchedule.currentStatus?.location ?? 'Home'
    : location;
  const currentLocationId = authoredScheduleOwnsPresence
    ? daySchedule.currentStatus?.locationId
    : instance?.current_location_id ?? undefined;
  const currentLocationRecord = currentLocationId ? snapshot.locations.find((item) => item.id === currentLocationId) : undefined;
  const locationHref = currentLocationRecord && world
    ? `/location/${currentLocationRecord.slug}?world=${encodeURIComponent(world.slug)}`
    : null;

  const goBack = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/home');
  const act = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      let targetSnapshot = snapshot;
      let targetInstance = instance;
      if (!instance) {
        setOpeningStage('meeting');
        targetSnapshot = await meetCompanion(template.id);
        setSnapshot(targetSnapshot);
        targetInstance = targetSnapshot.characters.find((item) => item.character_template_id === template.id);
      }
      if (!targetInstance) throw new Error(`Kivelle could not finish introducing ${template.name}. Please try again.`);
      setOpeningStage('conversation');
      let targetConversation = activeConversationFor(targetSnapshot.conversations, targetInstance.id);
      if (!targetConversation) {
        targetConversation = await ensureConversation(targetInstance.id);
        upsertConversation(targetConversation);
      }
      router.push(characterConversationHref(handle, targetConversation.id) as never);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not continue right now.');
    } finally {
      setBusy(false);
      setOpeningStage('idle');
    }
  };

  return <Screen contentStyle={desktop ? styles.pageDesktop : styles.pageMobile}>
    <View style={[styles.profile, desktop && styles.profileDesktop]}>
      <CharacterPortraitGallery
        slug={template.slug}
        name={template.name}
        age={template.age}
        occupation={template.occupation}
        photos={profilePhotos}
        focal={focal}
        desktop={desktop}
        viewportWidth={width}
        onBack={goBack}
      />

      <View style={[styles.details, desktop && styles.detailsDesktop]}>
        {intro === '1' ? <View style={styles.welcome}>
          <Sparkles size={18} color={colors.rose} />
          <View style={styles.flex}>
            <Text style={styles.welcomeTitle}>Your story starts here</Text>
            <Text style={styles.welcomeCopy}>Say hello in your own words. {template.name} will remember what matters.</Text>
          </View>
        </View> : null}

        {instance ? <View style={styles.badges}>
          <MoodBadge mood={instance.current_mood} />
          {known ? <RelationshipBadge stage={instance.relationship_stage} /> : null}
        </View> : null}

        {relationshipPresentation.heading ? <View style={styles.relationshipHeading}>
          <Text accessibilityRole="header" style={[styles.heading, styles.relationshipHeadingText]}>{relationshipPresentation.heading}</Text>
          {relationshipPresentation.supportingCopy ? <Text style={styles.relationshipSupporting}>{relationshipPresentation.supportingCopy}</Text> : null}
        </View> : null}
        <View style={styles.about}>
          <Text style={styles.aboutLabel}>ABOUT {template.name.toUpperCase()}</Text>
          <Body muted>{template.biography}</Body>
        </View>

        {relationshipPresentation.stats.length ? <View accessibilityLabel="Relationship highlights" style={styles.history}>
          {relationshipPresentation.stats.map((stat) => <Stat key={stat.label} value={stat.value} label={stat.label} />)}
        </View> : null}

        <View style={styles.facts}>
          {instance ? <>
            <Info label="Right now" value={currentActivity ?? instance.current_activity} />
            <Info label="Location" value={currentLocation} onPress={locationHref ? () => router.push(locationHref as never) : undefined} />
          </> : null}
          {world ? <Info label={instance ? 'World' : 'Lives in'} value={world.name} onPress={() => router.push(`/(tabs)/explore?world=${encodeURIComponent(world.slug)}` as never)} /> : null}
          {!instance && meetingLocation ? <Info label="Where you could meet" value={meetingLocation.name} onPress={() => router.push(`/location/${meetingLocation.slug}?world=${encodeURIComponent(world?.slug ?? '')}` as never)} /> : null}
          <Info label="Occupation" value={template.occupation} />
        </View>

        <View style={styles.interests}>
          <Text style={styles.label}>Interests</Text>
          <View style={styles.interestChips}>
            {(version.interests?.length ? version.interests : ['Still discovering']).map((interest) => <View key={interest} style={styles.interestChip}><Text style={styles.interestChipText}>{interest}</Text></View>)}
          </View>
        </View>

        <CharacterScheduleCard snapshot={snapshot} instance={instance} characterTemplateId={template.id} characterVersionId={version.id} characterName={template.name}/>

        {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
        {busy ? <Text accessibilityLiveRegion="polite" style={styles.openingStatus}>{openingStage==='meeting'?`Introducing you to ${template.name}…`:`Preparing your conversation with ${template.name}…`}</Text> : null}
        {canTalk ? <GradientButton
          disabled={busy}
          label={busy ? openingStage==='meeting'?`Meeting ${template.name}…`:'Opening conversation…' : instance ? `Talk to ${template.name}` : `Meet ${template.name}`}
          onPress={() => void act()}
        /> : <View style={styles.notMet}>
          <MapPin size={18} color={colors.muted} />
          <Text style={styles.notMetText}>You haven’t been introduced yet. Their story will unfold through people, places, and events in their world.</Text>
        </View>}

        {known && instance ? <View style={styles.sharedHistory}>
          <Text accessibilityRole="header" style={styles.sharedHistoryTitle}>Your shared history</Text>
          <View style={styles.previewGrid}>
            <ProfilePreviewCard
              accessibilityLabel={`Open what ${template.name} remembers`}
              icon={memoryInspector ? <Brain size={18} color={colors.violet}/> : <LockKeyhole size={18} color={colors.violet}/>}
              kicker={`WHAT ${template.name.toUpperCase()} REMEMBERS`}
              title={memoryInspector && featuredMemory ? presentMemoryText(featuredMemory.canonical_text, template.name) : `${memoryCount} saved ${memoryCount === 1 ? 'detail' : 'details'}`}
              body={memoryInspector ? featuredMemory ? 'A meaningful detail from your conversations.' : 'Meaningful details will collect here as you talk.' : 'Open the Memory Center with Kivelle+.'}
              onPress={() => router.push(`/memories?character=${handle}` as never)}
            />
            <ProfilePreviewCard
              accessibilityLabel={latestMoment ? `Open shared moment ${latestMoment.title}` : `Open shared moments with ${template.name}`}
              icon={<Camera size={18} color={colors.rose}/>}
              kicker="LATEST SHARED MOMENT"
              title={latestMoment?.title ?? 'No shared moments yet'}
              body={latestMoment ? latestMoment.summary : 'Photos, places, and experiences you share will appear here.'}
              meta={latestMoment ? new Date(latestMoment.occurred_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : undefined}
              onPress={() => router.push((latestMoment ? `/moment/${latestMoment.id}` : `/(tabs)/moments?character=${handle}`) as never)}
            />
          </View>
        </View> : null}
      </View>
    </View>
  </Screen>;
}

function CharacterPortraitGallery({slug,name,age,occupation,photos,focal,desktop,viewportWidth,onBack}:{slug:string;name:string;age:number;occupation:string;photos:ReturnType<typeof characterProfilePhotos>;focal:ImageContentPosition;desktop:boolean;viewportWidth:number;onBack:()=>void}) {
  const[photoIndex,setPhotoIndex]=useState(0);
  const[failedPhotoIndexes,setFailedPhotoIndexes]=useState<Record<number,true>>({});
  useEffect(()=>{setPhotoIndex(0);setFailedPhotoIndexes({});},[slug]);
  const activePhotoIndex=photoIndex<photos.length?photoIndex:0;
  const activePhoto=photos[activePhotoIndex];
  const activePhotoFailed=Boolean(failedPhotoIndexes[activePhotoIndex]);
  const cyclePhoto=(delta:number)=>setPhotoIndex((current)=>cycleProfilePhotoIndex(current,delta,photos.length));
  const panResponder=useMemo(()=>PanResponder.create({
    onMoveShouldSetPanResponder:(_event,gesture)=>photos.length>1&&Math.abs(gesture.dx)>12&&Math.abs(gesture.dx)>Math.abs(gesture.dy),
    onPanResponderRelease:(_event,gesture)=>{if(gesture.dx<=-46)setPhotoIndex((current)=>cycleProfilePhotoIndex(current,1,photos.length));else if(gesture.dx>=46)setPhotoIndex((current)=>cycleProfilePhotoIndex(current,-1,photos.length));},
    onPanResponderTerminationRequest:()=>true,
  }),[photos.length]);
  const nextPhoto=photos.length>1?photos[cycleProfilePhotoIndex(activePhotoIndex,1,photos.length)]:undefined;
  const compactPhone=!desktop&&viewportWidth<360;
  return <View {...panResponder.panHandlers} style={[styles.portrait,desktop?styles.portraitDesktop:styles.portraitMobile,compactPhone&&styles.portraitCompact]}>
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.portraitFallback}>{!activePhoto||activePhotoFailed?<Text accessible={false} style={styles.portraitFallbackInitial}>{name[0]}</Text>:null}</View>
    {nextPhoto?<ExpoImage accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" alt="" source={nextPhoto} style={styles.photoPreload} contentFit="cover" cachePolicy="memory-disk" priority="low"/>:null}
    {activePhoto&&!activePhotoFailed?<DetailPreservingArtwork
      accessibilityLabel={`${name}, age ${age}, ${occupation}. Photo ${activePhotoIndex+1} of ${photos.length}.`}
      source={activePhoto}
      contentPosition={focal}
      frameStyle={desktop?styles.portraitFrameDesktop:styles.portraitFrameMobile}
      dim={0}
      priority="high"
      recyclingKey={`${slug}:profile:${activePhotoIndex}`}
      onLoad={()=>setFailedPhotoIndexes((current)=>{if(!current[activePhotoIndex])return current;const next={...current};delete next[activePhotoIndex];return next;})}
      onError={()=>setFailedPhotoIndexes((current)=>({...current,[activePhotoIndex]:true}))}
    />:null}
    <View pointerEvents="none" style={styles.portraitShade}/>
    <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={4} onPress={onBack} style={({pressed})=>[styles.back,pressed&&styles.pressed]}><ArrowLeft size={20} color="#fff"/></Pressable>
    {photos.length>1?<>
      <Pressable accessibilityRole="button" accessibilityLabel={`Previous photo of ${name}`} hitSlop={6} onPress={()=>cyclePhoto(-1)} style={({pressed})=>[styles.photoButton,styles.previousPhoto,pressed&&styles.pressed]}><ChevronLeft size={24} color="#fff"/></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Next photo of ${name}`} hitSlop={6} onPress={()=>cyclePhoto(1)} style={({pressed})=>[styles.photoButton,styles.nextPhoto,pressed&&styles.pressed]}><ChevronRight size={24} color="#fff"/></Pressable>
      <View pointerEvents="none" style={styles.photoCounter}><Text accessibilityLiveRegion="polite" style={styles.photoCounterText}>{activePhotoIndex+1} / {photos.length}</Text></View>
      <View pointerEvents="none" style={styles.photoDots}>{photos.map((_,index)=><View key={index} style={[styles.photoDot,index===activePhotoIndex&&styles.photoDotActive]}/>)}</View>
    </>:null}
    {activePhotoFailed?<View style={styles.photoError}><Text style={styles.photoErrorText}>This photo couldn’t be displayed.</Text>{photos.length>1?<Pressable accessibilityRole="button" onPress={()=>cyclePhoto(1)} style={styles.photoErrorAction}><Text style={styles.photoErrorActionText}>Try another photo</Text></Pressable>:null}</View>:null}
    <View pointerEvents="none" style={styles.portraitTitle}>
      <View style={styles.nameRow}><Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={.78} style={[styles.name,compactPhone&&styles.nameCompact]}>{name}</Text><View style={styles.agePill}><Text style={styles.age}>{age}</Text></View></View>
      <Text numberOfLines={2} style={styles.job}>{occupation}</Text>
    </View>
  </View>;
}

function Info({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  const content=<><Text style={styles.label}>{label}</Text><View style={styles.infoValue}><Text style={styles.value}>{value}</Text>{onPress?<ChevronRight size={15} color={colors.muted}/>:null}</View></>;
  return onPress?<Pressable accessibilityRole="link" accessibilityLabel={`${label}: ${value}`} onPress={onPress} style={({pressed})=>[styles.info,styles.infoInteractive,pressed&&styles.pressed]}>{content}</Pressable>:<View style={styles.info}>{content}</View>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function ProfilePreviewCard({icon,kicker,title,body,meta,onPress,accessibilityLabel}:{icon:ReactNode;kicker:string;title:string;body:string;meta?:string;onPress:()=>void;accessibilityLabel:string}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({pressed})=>[styles.previewCard,pressed&&styles.previewCardPressed]}>
    <View style={styles.previewIcon}>{icon}</View>
    <View style={styles.previewCopy}><Text style={styles.previewKicker}>{kicker}</Text><Text numberOfLines={2} style={styles.previewTitle}>{title}</Text><Text numberOfLines={2} style={styles.previewBody}>{body}</Text>{meta?<Text style={styles.previewMeta}>{meta}</Text>:null}</View>
    <ChevronRight size={18} color={colors.muted}/>
  </Pressable>;
}

function CharacterScheduleCard({snapshot,instance,characterTemplateId,characterVersionId,characterName}:{snapshot:NonNullable<ReturnType<typeof useTogether.getState>['snapshot']>;instance?:NonNullable<ReturnType<typeof useTogether.getState>['snapshot']>['characters'][number];characterTemplateId:string;characterVersionId:string;characterName:string}){
  const setCoreState=useTogether((state)=>state.setCoreState);
  const hasSchedule=snapshot.schedules.some((item)=>item.character_version_id===characterVersionId);
  const[loading,setLoading]=useState(!hasSchedule);
  const[loadError,setLoadError]=useState('');
  const[retry,setRetry]=useState(0);
  const[expanded,setExpanded]=useState(false);
  useEffect(()=>setExpanded(false),[characterVersionId]);
  useEffect(()=>{
    let cancelled=false;
    if(hasSchedule){setLoading(false);setLoadError('');return()=>{cancelled=true;};}
    setLoading(true);setLoadError('');
    void loadCharacterSchedule(characterTemplateId).then((result)=>{
      if(cancelled)return;
      setCoreState({schedules:[...snapshot.schedules.filter((item)=>item.character_version_id!==result.characterVersionId),...result.schedules]});
      setLoading(false);
    }).catch(()=>{if(!cancelled){setLoading(false);setLoadError('Today’s routine could not be loaded.');}});
    return()=>{cancelled=true;};
  },[characterTemplateId,characterVersionId,hasSchedule,retry,setCoreState]);
  const daySchedule=buildCharacterDaySchedule({snapshot,instance,characterVersionId,timezone:snapshot.profile?.experience_timezone});
  const compact=compactCharacterSchedule(daySchedule.entries);
  const visibleEntries=expanded?daySchedule.entries:compact.entries;
  const canToggle=daySchedule.entries.length>visibleEntries.length||expanded&&daySchedule.entries.length>2;
  const openLocation=(entry:CharacterDayScheduleEntry)=>{
    if(!entry.locationId)return;
    const location=snapshot.locations.find((item)=>item.id===entry.locationId);
    const world=location?snapshot.worlds.find((item)=>item.id===location.world_id):undefined;
    if(location)router.push(`/location/${location.slug}${world?`?world=${encodeURIComponent(world.slug)}`:''}` as never);
  };
  return <View style={styles.schedule}>
    <View style={styles.scheduleHeader}><View style={styles.scheduleIcon}><CalendarDays size={17} color={colors.rose}/></View><View style={styles.flex}><Text style={styles.scheduleTitle}>Today</Text><Text style={styles.scheduleDate}>{daySchedule.dateLabel}</Text></View>{canToggle?<Pressable accessibilityRole="button" accessibilityLabel={expanded?'Show schedule summary':'Show full day schedule'} accessibilityState={{expanded}} onPress={()=>setExpanded((value)=>!value)} style={({pressed})=>[styles.scheduleToggle,pressed&&styles.pressed]}><Text style={styles.scheduleToggleText}>{expanded?'Summary':`Full day · ${daySchedule.entries.length}`}</Text>{expanded?<ChevronUp size={15} color={colors.rose}/>:<ChevronDown size={15} color={colors.rose}/>}</Pressable>:null}</View>
    {daySchedule.entries.length?<View style={styles.scheduleList}>{visibleEntries.map((entry)=><ScheduleRow key={entry.id} entry={entry} summary={!expanded} onLocation={entry.locationId?()=>openLocation(entry):undefined}/>)}</View>
      :loading?<View style={styles.scheduleEmpty}><Clock3 size={16} color={colors.rose}/><Text style={styles.scheduleLoadingText}>Loading {characterName}’s routine…</Text></View>
      :loadError?<View style={styles.scheduleEmpty}><Text style={styles.scheduleEmptyText}>{loadError}</Text><Pressable accessibilityRole="button" onPress={()=>setRetry((value)=>value+1)} style={styles.scheduleRetry}><Text style={styles.scheduleRetryText}>Try again</Text></Pressable></View>
      :<View style={styles.scheduleEmpty}><Clock3 size={16} color={colors.muted}/><Text style={styles.scheduleEmptyText}>{characterName} is keeping today flexible.</Text></View>}
  </View>;
}

function ScheduleRow({entry,summary,onLocation}:{entry:CharacterDayScheduleEntry;summary:boolean;onLocation?:()=>void}) {
  const place=entry.location?<View style={styles.schedulePlace}><MapPin size={12} color={onLocation?colors.rose:colors.muted}/><Text style={[styles.scheduleLocation,onLocation&&styles.scheduleLocationInteractive]}>{entry.location}</Text>{onLocation?<ChevronRight size={12} color={colors.muted}/>:null}</View>:null;
  const status=entry.current?'NOW':summary&&!entry.past?'UP NEXT':entry.time;
  return <View style={[styles.scheduleRow,entry.current&&styles.scheduleRowCurrent,entry.past&&styles.scheduleRowPast]}><View style={[styles.scheduleRail,entry.current&&styles.scheduleRailCurrent]}/><View style={styles.scheduleTimeWrap}><Text style={[styles.scheduleTime,(entry.current||status==='UP NEXT')&&styles.scheduleTimeCurrent]}>{status}</Text>{entry.current||status==='UP NEXT'?<Text style={styles.scheduleCurrentRange}>{entry.time}</Text>:null}</View><View style={styles.scheduleCopy}><Text style={styles.scheduleActivity}>{entry.activity}</Text>{onLocation?<Pressable accessibilityRole="link" accessibilityLabel={`Open ${entry.location}`} onPress={onLocation} style={({pressed})=>pressed&&styles.pressed}>{place}</Pressable>:place}</View></View>;
}

const styles = StyleSheet.create({
  pageMobile: { padding: spacing.md, paddingBottom: 120, gap: 0 },
  pageDesktop: { padding: spacing.xl, paddingBottom: 120, gap: 0, maxWidth: 1040 },
  profile: { width: '100%', gap: spacing.md },
  profileDesktop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xl },
  portrait: { position: 'relative', overflow: 'hidden', backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.borderBright, borderRadius: radius.xl },
  portraitMobile: { width: '100%', height: 310 },
  portraitCompact: { height: 292 },
  portraitDesktop: { width: 330, height: 430, flexShrink: 0 },
  portraitFallback: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.plum },
  portraitFallbackInitial: { color: 'rgba(255,255,255,.18)', fontFamily: typography.display, fontSize: 112, fontWeight: '600' },
  photoPreload: { position: 'absolute', top: 0, left: 0, width: 1, height: 1, opacity: 0 },
  portraitFrameMobile: { top: 4, right: 4, bottom: 4, left: 4 },
  portraitFrameDesktop: { top: 5, right: 5, bottom: 5, left: 5 },
  portraitShade: { position: 'absolute', right: 0, bottom: 0, left: 0, height: 118, backgroundColor: 'rgba(6,4,9,.72)' },
  back: { position: 'absolute', top: 12, left: 12, zIndex: 5, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(8,11,19,.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,.18)', alignItems: 'center', justifyContent: 'center' },
  photoButton: { position: 'absolute', top: '43%', zIndex: 4, width: 44, height: 48, borderRadius: 22, backgroundColor: 'rgba(8,11,19,.68)', borderWidth: 1, borderColor: 'rgba(255,255,255,.22)', alignItems: 'center', justifyContent: 'center' },
  previousPhoto: { left: 12 },
  nextPhoto: { right: 12 },
  photoCounter: { position: 'absolute', top: 14, right: 14, zIndex: 3, minWidth: 50, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: 'rgba(8,11,19,.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,.18)', alignItems: 'center' },
  photoCounterText: { color: '#fff', fontSize: 10, lineHeight: 12, fontWeight: '900', letterSpacing: .6 },
  photoDots: { position: 'absolute', right: 20, bottom: 105, left: 20, zIndex: 3, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  photoDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.42)' },
  photoDotActive: { width: 18, backgroundColor: '#fff' },
  photoError: { position: 'absolute', zIndex: 3, top: '32%', right: 54, left: 54, alignItems: 'center', gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: 'rgba(8,7,12,.84)' },
  photoErrorText: { color: '#fff', fontSize: 11, textAlign: 'center' },
  photoErrorAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  photoErrorActionText: { color: colors.rose, fontSize: 11, fontWeight: '900' },
  portraitTitle: { position: 'absolute', right: 20, bottom: 18, left: 20 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  name: { flex: 1, minWidth: 0, fontFamily: typography.display, fontSize: 34, lineHeight: 37, color: '#fff', fontWeight: '600', textShadowColor: '#000', textShadowRadius: 14 },
  nameCompact: { fontSize: 29, lineHeight: 32 },
  agePill: { flexShrink: 0, minWidth: 38, height: 30, paddingHorizontal: 9, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,.17)' },
  age: { fontFamily: typography.interface, fontSize: 14, color: 'rgba(255,255,255,.88)', fontWeight: '900' },
  job: { color: 'rgba(255,255,255,.90)', fontSize: 13, lineHeight: 17, marginTop: 5, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 8 },
  details: { width: '100%', gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  detailsDesktop: { flex: 1, width: 'auto', minHeight: 430, backgroundColor: colors.glass },
  flex: { flex: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  relationshipHeading: { gap: 7 },
  relationshipHeadingText: { flex: 1 },
  relationshipSupporting: { maxWidth: 600, color: colors.muted, fontSize: 12, lineHeight: 18 },
  heading: { fontFamily: typography.display, fontSize: 26, lineHeight: 31, color: colors.text, fontWeight: '600' },
  about: { gap: 6 },
  aboutLabel: { color: colors.dimmed, fontSize: 9, fontWeight: '900', letterSpacing: 1.05 },
  history: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flexGrow: 1, flexBasis: 92, minWidth: 0, paddingHorizontal: 8, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  statValue: { fontFamily: typography.display, fontSize: 23, color: colors.text },
  statLabel: { fontSize: 9, color: colors.muted, fontWeight: '800', marginTop: 2, textAlign: 'center' },
  facts: { borderTopWidth: 1, borderTopColor: colors.border },
  info: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  infoInteractive: { paddingHorizontal: 4, marginHorizontal: -4, borderRadius: radius.sm },
  infoValue: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5 },
  label: { color: colors.muted, flexShrink: 0 },
  value: { flexShrink: 1, color: colors.text, textAlign: 'right' },
  interests: { gap: 8 },
  interestChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  interestChip: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  interestChipText: { color: colors.textSecondary, fontSize: 10, fontWeight: '800' },
  schedule: { gap: 10, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  scheduleHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scheduleIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(216,62,234,.10)' },
  scheduleTitle: { color: colors.text, fontFamily: typography.display, fontSize: 19, fontWeight: '600' },
  scheduleDate: { color: colors.muted, fontSize: 10, marginTop: 1 },
  scheduleToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: 8 },
  scheduleToggleText: { color: colors.rose, fontSize: 9, fontWeight: '900' },
  scheduleList: { borderTopWidth: 1, borderTopColor: colors.border },
  scheduleRow: { position: 'relative', minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  scheduleRowCurrent: { backgroundColor: 'rgba(216,62,234,.07)' },
  scheduleRowPast: { opacity: .5 },
  scheduleRail: { position: 'absolute', left: 0, top: 12, bottom: 12, width: 2, borderRadius: 2, backgroundColor: colors.borderBright },
  scheduleRailCurrent: { width: 3, backgroundColor: colors.rose },
  scheduleTimeWrap: { width: 86 },
  scheduleTime: { color: colors.muted, fontSize: 9, lineHeight: 13, fontWeight: '800' },
  scheduleTimeCurrent: { color: colors.rose, letterSpacing: .7 },
  scheduleCurrentRange: { color: colors.muted, fontSize: 8, marginTop: 2 },
  scheduleCopy: { flex: 1, gap: 4 },
  scheduleActivity: { color: colors.text, fontSize: 12, fontWeight: '800' },
  schedulePlace: { minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 4 },
  scheduleLocation: { color: colors.muted, fontSize: 9 },
  scheduleLocationInteractive: { color: colors.textSecondary, fontWeight: '800' },
  scheduleEmpty: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.border },
  scheduleEmptyText: { color: colors.muted, fontSize: 11 },
  scheduleLoadingText: { color: colors.rose, fontSize: 11, fontWeight: '800' },
  scheduleRetry: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 9 }, scheduleRetryText: { color: colors.rose, fontSize: 10, fontWeight: '900', textDecorationLine: 'underline' },
  welcome: { flexDirection: 'row', gap: 10, padding: 13, borderRadius: radius.md, backgroundColor: 'rgba(216,62,234,.10)', borderWidth: 1, borderColor: 'rgba(216,62,234,.22)' },
  welcomeTitle: { color: colors.text, fontWeight: '900' },
  welcomeCopy: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  notMet: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface },
  notMetText: { flex: 1, color: colors.muted, fontSize: 12, lineHeight: 18 },
  sharedHistory: { gap: 10, paddingTop: 3 },
  sharedHistoryTitle: { color: colors.text, fontFamily: typography.display, fontSize: 21, fontWeight: '600' },
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  previewCard: { flexGrow: 1, flexBasis: 245, minWidth: 0, minHeight: 124, flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 13, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  previewCardPressed: { opacity: .86, transform: [{ scale: .99 }], borderColor: colors.borderBright },
  previewIcon: { width: 36, height: 36, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: 'rgba(154,104,255,.11)' },
  previewCopy: { flex: 1, minWidth: 0, gap: 3 },
  previewKicker: { color: colors.dimmed, fontSize: 8, fontWeight: '900', letterSpacing: .8 },
  previewTitle: { color: colors.text, fontSize: 13, lineHeight: 17, fontWeight: '900' },
  previewBody: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  previewMeta: { color: colors.rose, fontSize: 9, fontWeight: '800', marginTop: 2 },
  pressed: { opacity: .78 },
  error: { color: colors.danger, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  openingStatus: { color: colors.muted, fontSize: 11, fontWeight: '700', textAlign: 'center', marginBottom: -8 },
});
