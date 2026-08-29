import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ChevronDown, Search, Sparkles } from 'lucide-react-native';
import { CharacterAvatar, EmptyState, FrostedSurface, GlassCard, MomentCard, PageTitle, Screen } from '../../src/components';
import { colors, radius } from '../../src/theme';
import { useTogether } from '../../src/store/useTogether';
import { selectActiveCompanion, selectPortraitVersion } from '../../src/lib/selectors';
import { worldForLocation } from '../../src/lib/place';
import { buildMomentsFeed, planSummary, type MomentsFeedEntry, type MomentsFeedFilter } from '../../src/lib/momentsFeed';
import { mostRecentlyMessagedConversation } from '../../src/lib/conversation';
import { locationHeroAsset } from '../../src/assets';
import type { Moment, Snapshot } from '../../src/types';

const filters: MomentsFeedFilter[] = ['All', 'Experiences', 'Milestones', 'Memories', 'Photos', 'Videos'];

export default function MomentsTab() {
  return <MomentsFeed/>;
}

function MomentsFeed() {
  const snapshot = useTogether((state) => state.snapshot);
  const params=useLocalSearchParams<{character?:string;filter?:MomentsFeedFilter}>();
  const active = snapshot ? selectActiveCompanion(snapshot) : undefined;
  const companions = snapshot?.characters.filter((item) => item.contact_added_at || item.introduced_at) ?? [];
  const requested=companions.find((item)=>item.together_character_templates.slug===params.character||item.together_character_templates.public_handle===params.character||item.id===params.character);
  const recentConversation=snapshot?mostRecentlyMessagedConversation(snapshot.conversations):undefined;
  const recentCompanion=companions.find((item)=>item.id===recentConversation?.character_instance_id);
  const defaultCompanionId=requested?.id??recentCompanion?.id??active?.id??'all';
  const [companionId, setCompanionId] = useState<string>(() => defaultCompanionId);
  const [showCompanions,setShowCompanions]=useState(false);
  const [filter, setFilter] = useState<MomentsFeedFilter>(()=>filters.includes(params.filter as MomentsFeedFilter)?params.filter as MomentsFeedFilter:'All');
  const [query, setQuery] = useState('');
  const [visibleCount,setVisibleCount]=useState(48);
  useFocusEffect(useCallback(()=>{setCompanionId(defaultCompanionId);setShowCompanions(false);},[defaultCompanionId]));
  const selected = companions.find((item) => item.id === companionId);
  const entries = useMemo(() => snapshot ? buildMomentsFeed(snapshot, companionId, filter, query) : [], [companionId, filter, query, snapshot]);
  useEffect(()=>setVisibleCount(48),[companionId,filter,query]);
  const groups = groupEntries(entries.slice(0,visibleCount));
  const name = selected?.together_character_templates.name;

  return <Screen>
    <View style={styles.header}><View style={{flex:1}}><PageTitle>Moments</PageTitle><Text style={styles.subtitle}>{name ? `Your living history with ${name}.` : 'Experiences, milestones, memories, and photos from every story.'}</Text></View></View>
    {companions.length>1?<View style={styles.selectorWrap}><Pressable onPress={()=>setShowCompanions((value)=>!value)} style={styles.selector}>{selected?<CharacterAvatar slug={selected.together_character_templates.slug} name={selected.together_character_templates.name} template={selected.together_character_templates} version={snapshot?selectPortraitVersion(snapshot,selected):selected.together_character_versions} size={30}/>:<View style={styles.allAvatar}><Sparkles size={14} color={colors.rose}/></View>}<View style={{flex:1}}><Text style={styles.selectorLabel}>SHARED HISTORY</Text><Text style={styles.selectorName}>{name??'All companions'}</Text></View><ChevronDown size={17} color={colors.muted}/></Pressable>{showCompanions?<FrostedSurface style={styles.picker}><Pressable onPress={()=>{setCompanionId('all');setShowCompanions(false);}} style={styles.pickerRow}><View style={styles.allAvatar}><Sparkles size={14} color={colors.rose}/></View><Text style={styles.pickerName}>All companions</Text></Pressable>{companions.map((companion)=><Pressable key={companion.id} onPress={()=>{setCompanionId(companion.id);setShowCompanions(false);}} style={styles.pickerRow}><CharacterAvatar slug={companion.together_character_templates.slug} name={companion.together_character_templates.name} template={companion.together_character_templates} version={snapshot?selectPortraitVersion(snapshot,companion):companion.together_character_versions} size={32}/><Text style={styles.pickerName}>{companion.together_character_templates.name}</Text></Pressable>)}</FrostedSurface>:null}</View>:null}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{filters.map((item)=><Pressable key={item} onPress={()=>setFilter(item)} style={[styles.tab,filter===item&&styles.active]}><Text style={[styles.tabText,filter===item&&styles.activeText]}>{item}</Text></Pressable>)}</ScrollView>
    {entries.length >= 6 ? <View style={styles.search}><Search size={16} color={colors.muted}/><TextInput value={query} onChangeText={setQuery} placeholder="Search people, places, or memories" placeholderTextColor={colors.muted} style={styles.searchInput}/></View> : null}
    {entries.length ? <>{groups.map((group)=><View key={group.label} style={styles.group}><Text style={styles.groupTitle}>{group.label}</Text><View style={styles.grid}>{group.items.map((entry)=><FeedCard key={`${entry.kind}:${entry.id}`} entry={entry} companionId={companionId}/>)}</View></View>)}{visibleCount<entries.length?<Pressable accessibilityRole="button" onPress={()=>setVisibleCount((value)=>Math.min(entries.length,value+48))} style={styles.loadMore}><Text style={styles.loadMoreText}>Show more moments</Text></Pressable>:null}</> : <View style={styles.emptyWrap}><View style={styles.emptyIcon}><Sparkles size={24} color={colors.rose}/></View><EmptyState title={emptyTitle(filter,name)} body={emptyBody(filter,name)}/></View>}
    <GlassCard style={styles.note}><Sparkles size={17} color={colors.warm}/><Text style={styles.noteText}>Completed plans appear immediately. Especially meaningful experiences can still be promoted into featured Moments.</Text></GlassCard>
  </Screen>;
}

function FeedCard({entry,companionId}:{entry:MomentsFeedEntry;companionId:string}) {
  const snapshot=useTogether((state)=>state.snapshot);
  if(!snapshot)return null;
  const moment=entryAsMoment(entry);
  const character=snapshot.characters.find((item)=>item.id===moment.character_instance_id||(moment.participant_instance_ids??[]).includes(item.id));
  const place=snapshot.locations.find((item)=>item.id===moment.location_id);
  const world=place?worldForLocation(snapshot,place.id):undefined;
  const meta=[entryLabel(entry),companionId==='all'?character?.together_character_templates.name:null,place?.name,world?.name].filter(Boolean).join(' · ');
  const mediaUrl=entryMediaUrl(snapshot,entry);
  const locationFallback=entry.kind==='memory'&&place?locationHeroAsset(world?.slug,place.slug):undefined;
  const open=()=>{
    if(entry.kind==='moment')router.push(`/moment/${entry.id}` as never);
    else if(entry.kind==='photo'||entry.kind==='video')router.push(`/media/${entry.id}?gallery=moments&character=${encodeURIComponent(companionId)}` as never);
    else if(entry.kind==='plan')router.push(`/plan/${entry.id}` as never);
    else if(entry.kind==='date')router.push(`/date/${entry.id}` as never);
    else if(character){const handle=character.together_character_templates.public_handle??character.together_character_templates.slug;router.push(entry.kind==='memory'?`/memories?character=${handle}` as never:`/chat?character=${handle}` as never);}
  };
  return <View style={styles.momentWrap}><MomentCard moment={moment} character={character} portraitVersion={character?selectPortraitVersion(snapshot,character):undefined} mediaUrl={mediaUrl} fallbackSource={locationFallback} onPress={open}/>{meta?<Text style={styles.momentMeta} numberOfLines={1}>{meta}</Text>:null}</View>;
}

function entryAsMoment(entry:MomentsFeedEntry):Moment {
  if(entry.kind==='moment')return entry.moment;
  if(entry.kind==='photo')return{id:entry.id,character_instance_id:entry.media.character_instance_id,title:entry.title,summary:'',occurred_at:entry.media.created_at,location_id:entry.media.location_id,participant_instance_ids:[entry.media.character_instance_id],linked_memory_ids:[],moment_type:'photo',media:[{id:entry.media.id,url:entry.media.signed_url??undefined,status:entry.media.status,media_type:'image',created_at:entry.media.created_at}]};
  if(entry.kind==='video')return{id:entry.id,character_instance_id:entry.media.character_instance_id,title:entry.title,summary:entry.media.status==='ready'?'Ready to watch.':'You can keep exploring while Kivelle finishes it.',occurred_at:entry.media.created_at,location_id:entry.media.location_id,participant_instance_ids:[entry.media.character_instance_id],linked_memory_ids:[],moment_type:'video',media:entry.poster?[{id:entry.poster.id,url:entry.poster.signed_url??undefined,status:entry.poster.status,media_type:'image',created_at:entry.poster.created_at}]:[]};
  if(entry.kind==='plan')return{id:entry.id,character_instance_id:entry.plan.character_instance_id,title:entry.plan.title,summary:planSummary(entry.plan),occurred_at:entry.occurred_at,location_id:entry.plan.location_id,participant_instance_ids:[entry.plan.character_instance_id],linked_memory_ids:[],moment_type:'shared_plan',shared_plan_id:entry.plan.id,media:[]};
  if(entry.kind==='date'){const summary=typeof entry.date.state?.summary==='string'?entry.date.state.summary:entry.date.together_date_templates.description;return{id:entry.id,character_instance_id:entry.date.character_instance_id,title:entry.date.together_date_templates.name,summary,occurred_at:entry.occurred_at,location_id:entry.date.together_date_templates.location_id,participant_instance_ids:[entry.date.character_instance_id],linked_memory_ids:[],moment_type:'date',date_session_id:entry.date.id,media:[]};}
  if(entry.kind==='milestone')return{id:entry.id,character_instance_id:entry.milestone.character_instance_id,title:entry.milestone.title,summary:entry.milestone.body,occurred_at:entry.occurred_at,participant_instance_ids:[entry.milestone.character_instance_id],linked_memory_ids:[],moment_type:'relationship_milestone',media:[]};
  return{id:entry.id,character_instance_id:entry.memory.character_instance_id,title:entry.memory.memory_type==='relationship'?'A relationship memory':'A shared memory',summary:entry.memory.canonical_text,occurred_at:entry.occurred_at,location_id:entry.memory.location_id,participant_instance_ids:[entry.memory.character_instance_id],linked_memory_ids:[entry.memory.id],moment_type:'memory',media:[]};
}

function entryMediaUrl(snapshot:Snapshot,entry:MomentsFeedEntry){
  if(entry.kind==='moment')return entry.mediaUrl;
  if(entry.kind==='photo')return entry.media.signed_url;
  if(entry.kind==='video')return entry.poster?.signed_url;
  if(entry.kind==='date')return snapshot.generatedMedia?.find((item)=>item.date_session_id===entry.id&&item.status==='ready')?.signed_url;
  if(entry.kind==='plan'){const moment=snapshot.moments.find((item)=>item.shared_plan_id===entry.id);return moment?snapshot.generatedMedia?.find((item)=>item.moment_id===moment.id&&item.status==='ready')?.signed_url:undefined;}
  return undefined;
}

function entryLabel(entry:MomentsFeedEntry){return entry.kind==='plan'?'Experience':entry.kind==='date'?'Date':entry.kind==='milestone'?'Milestone':entry.kind==='memory'?'Memory':entry.kind==='photo'?'Photo':entry.kind==='video'?'Video':'Moment';}
function emptyTitle(filter:MomentsFeedFilter,name?:string){if(filter==='All')return name?`You and ${name} haven't made history yet`:'No shared history yet';return`No ${filter.toLowerCase()} yet`;}
function emptyBody(filter:MomentsFeedFilter,name?:string){if(filter==='Experiences')return'Completed plans and Dates will collect here automatically.';if(filter==='Milestones')return'Relationship turning points appear here after you make a choice.';if(filter==='Memories')return'Shared episodic and relationship memories will appear here.';if(filter==='Photos')return'Photos shared in Chat, Dates, Stories, and Moments will appear here.';if(filter==='Videos')return'Videos created from your photos will stay available here.';return name?`As you spend time with ${name}, your experiences will collect here.`:'Try another companion or filter.';}
function groupEntries<T extends {occurred_at:string}>(entries:T[]){const now=new Date();const startOfWeek=new Date(now);startOfWeek.setHours(0,0,0,0);startOfWeek.setDate(startOfWeek.getDate()-6);const groups=new Map<string,T[]>();for(const entry of entries){const date=new Date(entry.occurred_at);const label=date>=startOfWeek?'THIS WEEK':date.toLocaleDateString([],{month:'long',year:'numeric'}).toUpperCase();groups.set(label,[...(groups.get(label)??[]),entry]);}return[...groups].map(([label,items])=>({label,items}));}

const styles=StyleSheet.create({header:{flexDirection:'row',alignItems:'flex-start'},subtitle:{color:colors.muted,fontSize:12,marginTop:3},selectorWrap:{gap:7},selector:{minHeight:56,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:12,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},selectorLabel:{color:colors.dimmed,fontSize:8,fontWeight:'900',letterSpacing:.8},selectorName:{color:colors.text,fontSize:14,fontWeight:'900',marginTop:2},allAvatar:{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(216,62,234,.10)'},picker:{paddingVertical:4},pickerRow:{minHeight:48,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:8,borderBottomWidth:1,borderBottomColor:colors.border},pickerName:{color:colors.text,fontWeight:'800',fontSize:12},tabs:{gap:7,paddingRight:10},tab:{paddingHorizontal:11,paddingVertical:8,borderRadius:99,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},active:{backgroundColor:'rgba(216,62,234,.16)',borderColor:'rgba(216,62,234,.45)'},tabText:{color:colors.muted,fontSize:11,fontWeight:'800'},activeText:{color:colors.rose},search:{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:12,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},searchInput:{flex:1,minHeight:44,color:colors.text},group:{gap:10},groupTitle:{color:colors.rose,fontSize:10,fontWeight:'900',letterSpacing:1.1},grid:{flexDirection:'row',flexWrap:'wrap',gap:12},momentWrap:{width:154,gap:5},momentMeta:{color:colors.muted,fontSize:9,paddingHorizontal:2},loadMore:{alignSelf:'center',minHeight:40,justifyContent:'center',paddingHorizontal:18,borderRadius:radius.pill,backgroundColor:'rgba(216,62,234,.08)',borderWidth:1,borderColor:colors.border},loadMoreText:{color:colors.rose,fontSize:11,fontWeight:'900'},emptyWrap:{minHeight:330,justifyContent:'center',alignItems:'center'},emptyIcon:{width:58,height:58,borderRadius:29,backgroundColor:'rgba(216,62,234,.11)',alignItems:'center',justifyContent:'center',marginBottom:-36,zIndex:1},note:{flexDirection:'row',gap:10,alignItems:'center',paddingVertical:13},noteText:{flex:1,color:colors.muted,fontSize:12,lineHeight:17}});
