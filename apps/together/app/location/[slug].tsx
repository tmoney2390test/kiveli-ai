import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { ArrowLeft, CalendarDays, MapPin, Sparkles } from 'lucide-react-native';
import { locationHeroAsset } from '../../src/assets';
import { Body, EmptyState, GlassCard, GradientButton, LoadingSkeleton, MediaGallery, Screen, SectionHeader } from '../../src/components';
import { colors, radius } from '../../src/theme';
import { useTogether } from '../../src/store/useTogether';
import type { Conversation } from '../../src/types';
import { locationAncestry, worldById, charactersCurrentlyAtLocation } from '../../src/lib/place';
import { currentScheduleEvent, getInterruptibilityPresentation, getScheduleEventPresentation } from '../../src/lib/lifePresentation';
import { ApiError, enterScene } from '../../src/lib/api';

export default function LocationDetail() {
  const { slug, world: worldSlug } = useLocalSearchParams<{slug:string;world?:string}>();
  const snapshot = useTogether((state) => state.snapshot);
  const upsertConversation = useTogether((state) => state.upsertConversation);
  if (!snapshot) return <LoadingSkeleton />;
  const selectedWorld = snapshot.worlds.find((item) => item.slug === worldSlug);
  const location = snapshot.locations.find((item) => item.slug === slug && (!selectedWorld || item.world_id === selectedWorld.id));
  if (!location) return <EmptyState title="Place unavailable" body="This place is not available in the selected world." action="Back to Explore" onAction={() => router.replace('/(tabs)/explore')} />;
  const locationWorld = worldById(snapshot, location.world_id);
  const ancestry = locationAncestry(snapshot, location.id);
  const breadcrumb = [locationWorld?.name, ...ancestry.map((item) => item.name), location.name].filter(Boolean).join('  ›  ');
  const now = new Date();
  const people = charactersCurrentlyAtLocation(snapshot, location.id, now).map((person) => ({ person, event: currentScheduleEvent(snapshot.scheduleEvents, person.id, now, person.current_schedule_event_id) }));
  const active = snapshot.characters.find((item) => item.id === snapshot.activeContinuity?.active_companion_instance_id);
  const dates = snapshot.dates.filter((item) => item.together_date_templates.location_id === location.id);
  const events = snapshot.lifeEvents.filter((item) => item.location_id === location.id).slice(0, 3);
  const moments = snapshot.moments.filter((item) => item.location_id === location.id).slice(0, 3);
  const photos = (snapshot.generatedMedia ?? []).filter((item) => item.location_id === location.id);
  const hero = photos.find((item) => item.status === 'ready' && item.signed_url);
  const upcoming = (snapshot.sharedPlans ?? []).filter((plan) => plan.location_id === location.id && plan.status === 'scheduled' && new Date(plan.starts_at) > now).sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];
  const handle = active?.together_character_templates.public_handle ?? active?.together_character_templates.slug;
  const join = async (person:typeof people[number]['person']) => {
    const event = currentScheduleEvent(snapshot.scheduleEvents, person.id, now, person.current_schedule_event_id);
    const interruptibility = event?.interruptibility ?? person.current_interruptibility ?? 'open';
    const personHandle = person.together_character_templates.public_handle ?? person.together_character_templates.slug;
    if (interruptibility === 'busy' || interruptibility === 'unavailable') { router.push(`/chat?character=${personHandle}` as never); return; }
    try {
      const result = await enterScene<{conversation:Conversation}>({characterInstanceId:person.id,locationId:location.id,conversationId:snapshot.conversations.find((item)=>item.character_instance_id===person.id&&!item.archived_at)?.id});
      upsertConversation(result.conversation);
      router.push(`/chat?character=${personHandle}&scene=co_present&conversationId=${result.conversation.id}` as never);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'SCENE_NO_LONGER_AVAILABLE') Alert.alert('They just headed out', `${person.together_character_templates.name} is no longer at ${location.name}.`, [{text:'Message instead',onPress:()=>router.push(`/chat?character=${personHandle}` as never)}]);
      else Alert.alert('Could not join', caught instanceof Error ? caught.message : 'That scene is no longer available.');
    }
  };
  return <Screen>
    <View style={styles.header}><Pressable accessibilityLabel="Back to Explore" onPress={() => router.canGoBack() ? router.back() : router.replace(`/(tabs)/explore?world=${locationWorld?.slug ?? ''}`)} style={styles.back}><ArrowLeft size={19} color={colors.text} /></Pressable><Text style={styles.kicker}>{breadcrumb.toUpperCase()}</Text></View>
    <Image source={hero?.signed_url ? { uri: hero.signed_url } : locationHeroAsset(locationWorld?.slug, location.slug)} style={styles.hero} contentFit="cover" />
    <Text style={styles.title}>{location.name}</Text><Body muted>{location.description}</Body>
    {upcoming ? <Pressable onPress={() => router.push(`/plan/${upcoming.id}` as never)} style={styles.upcoming}><CalendarDays size={18} color={colors.rose} /><View style={styles.flex}><Text style={styles.upcomingKicker}>COMING UP</Text><Text style={styles.rowTitle}>{upcoming.title}</Text><Text style={styles.rowCopy}>{new Date(upcoming.starts_at).toLocaleString([], { weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}</Text></View></Pressable> : null}
    <View style={styles.actions}><GradientButton label={`${upcoming ? 'Plan something else here' : 'Plan something here'}${active ? ` with ${active.together_character_templates.name}` : ''}`} onPress={() => router.push(`/(tabs)/chat-tab?${handle ? `character=${handle}&` : ''}plan=1&location=${location.slug}&world=${locationWorld?.slug ?? ''}` as never)} /><Pressable style={styles.ask} onPress={() => router.push(`/(tabs)/chat-tab?${handle ? `character=${handle}&` : ''}draft=${encodeURIComponent(`What do you think about ${location.name} in ${locationWorld?.name ?? 'this world'}?`)}` as never)}><Text style={styles.askText}>Ask about this place</Text></Pressable></View>
    {photos.length ? <><SectionHeader title={`From ${location.name}`} /><MediaGallery media={photos} /></> : null}
    {people.length ? <><SectionHeader title="Who’s here" /><GlassCard style={styles.list}>{people.map(({ person, event }) => {
      const presentation = event ? getScheduleEventPresentation(event) : { activity:person.current_activity, availability:getInterruptibilityPresentation(person.current_interruptibility ?? 'open').label };
      const personHandle = person.together_character_templates.public_handle ?? person.together_character_templates.slug;
      const interruptibility=event?.interruptibility??person.current_interruptibility??'open';
      const action=interruptibility==='busy'?'Message':interruptibility==='limited'?'Drop in briefly':`Join ${person.together_character_templates.name}`;
      return <View key={person.id} style={styles.presenceRow}><Pressable onPress={() => router.push(`/character/${personHandle}` as never)} style={[styles.row, styles.flex]}><MapPin size={17} color={colors.rose} /><View style={styles.flex}><Text style={styles.rowTitle}>{person.together_character_templates.name}</Text><Text style={styles.rowCopy}>{presentation.activity} · {presentation.availability}</Text></View></Pressable><Pressable accessibilityLabel={action} onPress={() => void join(person)} style={styles.join}><Text style={styles.joinText}>{action}</Text></Pressable></View>;
    })}</GlassCard></> : null}
    <SectionHeader title="Things to do" /><GlassCard style={styles.list}>{location.possible_activities.slice(0, 8).map((activity) => <Pressable key={activity} onPress={() => router.push(`/(tabs)/chat-tab?${handle ? `character=${handle}&` : ''}plan=1&location=${location.slug}&world=${locationWorld?.slug ?? ''}&draft=${encodeURIComponent(`Want to ${activity} at ${location.name}?`)}` as never)} style={styles.row}><Sparkles size={16} color={colors.violet} /><Text style={styles.rowTitle}>{activity}</Text></Pressable>)}</GlassCard>
    {dates.length ? <><SectionHeader title="Dates here" /><GlassCard style={styles.list}>{dates.map((date) => { const locked = date.status === 'locked'; return <Pressable key={date.id} disabled={locked} onPress={() => router.push(`/date/${date.id}` as never)} style={[styles.row, locked && styles.locked]}><CalendarDays size={16} color={colors.warm} /><View><Text style={styles.rowTitle}>{date.together_date_templates.name}</Text><Text style={styles.rowCopy}>{locked ? 'Grow closer to unlock' : 'Available now'}</Text></View></Pressable>; })}</GlassCard></> : null}
    {events.length ? <><SectionHeader title="Recent activity" /><GlassCard style={styles.list}>{events.map((event) => <View key={event.id} style={styles.row}><Text style={styles.rowTitle}>{event.title}</Text></View>)}</GlassCard></> : null}
    {moments.length ? <><SectionHeader title="Shared moments" /><GlassCard style={styles.list}>{moments.map((moment) => <Pressable key={moment.id} onPress={() => router.push(`/moment/${moment.id}` as never)} style={styles.row}><Text style={styles.rowTitle}>{moment.title}</Text></Pressable>)}</GlassCard></> : null}
  </Screen>;
}

const styles = StyleSheet.create({ header:{flexDirection:'row',alignItems:'center',gap:12}, back:{width:40,height:40,borderRadius:20,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.border}, kicker:{flex:1,color:colors.rose,fontWeight:'900',fontSize:9,letterSpacing:.8}, hero:{height:270,width:'100%',borderRadius:radius.xl,backgroundColor:colors.elevated}, title:{color:colors.text,fontFamily:'Georgia',fontSize:36}, flex:{flex:1}, actions:{gap:9}, ask:{minHeight:50,alignItems:'center',justifyContent:'center',borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface}, askText:{color:colors.text,fontWeight:'800'}, upcoming:{flexDirection:'row',alignItems:'center',gap:11,padding:14,borderRadius:radius.lg,backgroundColor:'rgba(241,103,154,.08)',borderWidth:1,borderColor:'rgba(241,103,154,.22)'}, upcomingKicker:{color:colors.rose,fontSize:9,fontWeight:'900',letterSpacing:1.1}, list:{paddingVertical:4}, presenceRow:{flexDirection:'row',alignItems:'center',paddingRight:10}, join:{paddingHorizontal:13,paddingVertical:9,borderRadius:999,backgroundColor:colors.rose}, joinText:{color:'#fff',fontSize:11,fontWeight:'900'}, row:{minHeight:48,flexDirection:'row',alignItems:'center',gap:10,padding:10}, rowTitle:{color:colors.text,fontWeight:'800',fontSize:13,textTransform:'capitalize'}, rowCopy:{color:colors.muted,fontSize:11,marginTop:2}, locked:{opacity:.55} });
