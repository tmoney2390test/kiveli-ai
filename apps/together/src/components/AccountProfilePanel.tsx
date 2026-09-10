import {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {Image, type ImageSource} from 'expo-image';
import {ArrowUpRight, Camera, ImageIcon, LockKeyhole, Pin, Play, Sparkles, UsersRound, Video} from 'lucide-react-native';
import {PROFILE_HIGHLIGHT_LIMIT, profileHighlights, type ProfileHighlight} from '@together/domain/src/profile-showcase';
import {loadMediaLibrary, manageAccount} from '../lib/api';
import {generatedMediaImageSource, privateStoredImageSource} from '../lib/mediaImageSource';
import {useTogether} from '../store/useTogether';
import type {GeneratedMedia, Snapshot} from '../types';
import {colors} from '../theme';
import {resolveCharacterPortraitSource} from './ui';

type Tab = 'companion' | 'image' | 'video';
type Tile = ProfileHighlight & {title: string; subtitle: string; source?: ImageSource | number; route: string; media?: GeneratedMedia};
const tabs = [{id:'companion', label:'Companions', Icon:UsersRound}, {id:'image', label:'Images', Icon:ImageIcon}, {id:'video', label:'Videos', Icon:Video}] as const;

export function AccountProfilePanel({snapshot, avatar, avatarPath, name, busy, notice, email, onAvatar, onRemoveAvatar, onRoute}: {
  snapshot: Snapshot; avatar: string | null; avatarPath: string | null; name: string; busy: boolean;
  notice: {kind:'success'|'error'; message:string} | null; email?: string;
  onAvatar: () => void; onRemoveAvatar: () => void; onRoute: (route:string) => void;
}) {
  const lifeId = snapshot.activeContinuity?.id;
  const [tab, setTab] = useState<Tab>('companion');
  const [panelWidth, setPanelWidth] = useState(600);
  const [pins, setPins] = useState(() => profileHighlights(snapshot.activeContinuity?.metadata.profileHighlights));
  const [saving, setSaving] = useState(false), savingRef = useRef(false);
  const [error, setError] = useState('');
  const [media, setMedia] = useState<GeneratedMedia[]>([]);
  const [loading, setLoading] = useState(true), loadingRef = useRef(false);
  const [libraryError, setLibraryError] = useState('');
  const [hasMore, setHasMore] = useState(false), [before, setBefore] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const mounted = useRef(true);
  const avatarSource = privateStoredImageSource(avatar, avatarPath);
  const small = panelWidth < 520;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let current = true;
    setLoading(true); setLibraryError('');
    const ids = pins.filter(pin => pin.kind !== 'companion').map(pin => pin.id);
    Promise.all([loadMediaLibrary({limit:60}), ids.length ? loadMediaLibrary({ids}) : Promise.resolve(null)])
      .then(([library, highlighted]) => {
        if (!current) return;
        setMedia(mergeMedia(library.media, highlighted?.media ?? []));
        setHasMore(library.hasMore); setBefore(library.nextBefore);
      }).catch(() => { if (current) setLibraryError('Your media could not be loaded. Try again.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
    // Pins save locally without refetching the library. A remount loads their
    // exact IDs so older highlights are independent of library pagination.
  }, [lifeId, reload]);

  const loadMore = async () => {
    if (loadingRef.current || loading || !before) return;
    loadingRef.current = true; setLoading(true); setLibraryError('');
    try {
      const result = await loadMediaLibrary({before, limit:60});
      if (!mounted.current) return;
      setMedia(current => mergeMedia(current, result.media)); setHasMore(result.hasMore); setBefore(result.nextBefore);
    } catch { if (mounted.current) setLibraryError('More media could not be loaded. Try again.'); }
    finally { loadingRef.current = false; if (mounted.current) setLoading(false); }
  };

  const togglePin = async (item: ProfileHighlight) => {
    if (savingRef.current || !lifeId) return;
    const exists = pins.some(pin => pin.kind === item.kind && pin.id === item.id);
    if (!exists && pins.length >= PROFILE_HIGHLIGHT_LIMIT) { setError('You have 12 highlights. Unpin one to make room.'); return; }
    const next = exists ? pins.filter(pin => pin.kind !== item.kind || pin.id !== item.id) : [...pins, {kind:item.kind, id:item.id}];
    savingRef.current = true; setSaving(true); setError('');
    try {
      const result = await manageAccount<{highlights:ProfileHighlight[]}>({action:'profile_highlights', continuityId:lifeId, highlights:next});
      if (!mounted.current) return;
      setPins(result.highlights);
      const store = useTogether.getState(), life = store.snapshot?.activeContinuity;
      if (life?.id === lifeId) store.setCoreState({activeContinuity:{...life, metadata:{...life.metadata, profileHighlights:result.highlights}}});
    } catch (caught) { if (mounted.current) setError(caught instanceof Error ? caught.message : 'Your highlights could not be saved. Try again.'); }
    finally { savingRef.current = false; if (mounted.current) setSaving(false); }
  };

  const companions: Tile[] = snapshot.characters.map(character => ({kind:'companion', id:character.id,
    title:character.together_character_templates.name, subtitle:character.together_character_templates.occupation,
    source:resolveCharacterPortraitSource(character.together_character_templates, character.together_character_versions),
    route:`/character/${character.together_character_templates.public_handle ?? character.together_character_templates.slug}`}));
  const mediaTiles: Tile[] = media.filter(item => ['image','video'].includes(item.media_type) && item.status === 'ready' && item.signed_url && item.metadata?.hiddenIntermediate !== true && item.metadata?.galleryPosterOnly !== true).map(item => {
    const companion = snapshot.characters.find(character => character.id === item.character_instance_id);
    const poster = item.media_type === 'video' ? media.find(photo => photo.id === item.parent_media_id && photo.signed_url) : item;
    return {kind:item.media_type as 'image'|'video', id:item.id, title:companion?.together_character_templates.name ?? (item.media_type === 'video' ? 'Your video' : 'Your image'), subtitle:new Date(item.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}), source:poster ? generatedMediaImageSource(poster) : undefined, route:`/media/${item.id}?gallery=moments&character=all`, media:item};
  });
  const all = [...companions, ...mediaTiles], tiles = all.filter(item => item.kind === tab);
  const open = (item:Tile) => {
    if (item.media) {
      // The full-screen viewer can open an older paginated item immediately.
      const store = useTogether.getState();
      if (store.snapshot?.activeContinuity?.id !== lifeId) return;
      store.upsertMedia(item.media);
    }
    onRoute(item.route);
  };
  const isPinned = (item:ProfileHighlight) => pins.some(pin => pin.kind === item.kind && pin.id === item.id);
  const columns = panelWidth >= 900 ? 4 : panelWidth >= 570 ? 3 : 2;
  const tileWidth = Math.max(100, Math.floor((panelWidth - (columns - 1) * 12) / columns));
  return <View style={s.panel} onLayout={event => setPanelWidth(event.nativeEvent.layout.width)}>
    <View style={[s.hero, small && s.heroSmall]}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill,s.heroGlow]}/>
      <Pressable accessibilityRole="button" accessibilityLabel="Change account photo" disabled={busy} onPress={onAvatar} style={[s.avatar,small && s.avatarSmall]}>
        {avatarSource ? <Image source={avatarSource} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={avatarPath ?? 'account'}/> : <Text style={[s.initial,small && {fontSize:42}]}>{(name || 'Y')[0]?.toUpperCase()}</Text>}
        <View style={s.camera}>{busy ? <ActivityIndicator size="small" color="#fff"/> : <Camera size={16} color="#fff"/>}</View>
      </Pressable>
      <View style={s.heroCopy}>
        <View style={s.privateLabel}><LockKeyhole size={12} color="#CBA6EF"/><Text style={s.eyebrow}>YOUR PRIVATE PROFILE</Text></View>
        <Text accessibilityRole="header" style={[s.name,small && {fontSize:25}]}>{name || 'Your account'}</Text>
        <Text selectable style={s.email}>{email ?? 'Your Kivelle account'}</Text>
        <View style={s.stats}><Text style={s.stat}><Text style={s.statValue}>{companions.length}</Text> companions</Text><Text style={s.stat}><Text style={s.statValue}>{snapshot.continuities?.length ?? 1}</Text> {(snapshot.continuities?.length ?? 1) === 1 ? 'Life' : 'Lives'}</Text></View>
        <View style={s.actions}><Action label={avatarPath ? 'Change photo' : 'Add photo'} onPress={onAvatar} disabled={busy}/>{avatarPath ? <Action label="Remove photo" onPress={onRemoveAvatar} disabled={busy}/> : null}</View>
      </View>
    </View>
    {notice ? <Text accessibilityRole="alert" style={[s.notice,notice.kind === 'error' && s.error]}>{notice.message}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel="Manage Personas & Lives" onPress={() => onRoute('/personas')} style={s.personas}>
      <Sparkles size={21} color="#CBA6EF"/><View style={{flex:1}}><Text style={s.rowTitle}>Your identity lives in Personas</Text><Text style={s.muted}>Manage your name, personal details, and who companions know.</Text></View><ArrowUpRight size={19} color="#CBA6EF"/>
    </Pressable>
    <View style={s.sectionHeading}><Text accessibilityRole="header" style={s.heading}>Highlights</Text><Text style={s.muted}>{pins.length}/{PROFILE_HIGHLIGHT_LIMIT} · {snapshot.activeContinuity?.title ?? 'Main Life'}</Text></View>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {pins.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.highlightRail}>
      {pins.map(pin => {
        const item = all.find(item => item.kind === pin.kind && item.id === pin.id);
        return item ? <ContentTile key={`${pin.kind}:${pin.id}`} item={item} width={small ? 150 : 174} pinned busy={saving} onPin={() => void togglePin(item)} onOpen={() => open(item)}/> : <View key={`${pin.kind}:${pin.id}`} style={[s.unavailable,{width:150}]}><Pin size={20} color={colors.muted}/><Text style={s.muted}>{loading ? 'Loading highlight…' : 'Currently unavailable'}</Text><Action label="Unpin highlight" disabled={saving} onPress={() => void togglePin(pin)}/></View>;
      })}
    </ScrollView> : <View style={s.emptyHighlights}><Sparkles size={27} color="#A37EBC"/><Text style={s.emptyTitle}>Keep your favorites close</Text><Text style={s.emptyBody}>Pin up to 12 companions, images, or videos using the pin on any card below.</Text></View>}
    <View role={'tablist' as never} aria-label="Profile content" style={s.tabs}>{tabs.map(({id,label,Icon}) => <Pressable key={id} accessibilityRole="tab" accessibilityState={{selected:tab===id}} aria-selected={tab===id} onPress={() => setTab(id)} style={[s.tab,tab===id && s.activeTab]}><Icon size={17} color={tab===id ? '#F9F4FC' : colors.muted}/><Text style={[s.tabText,tab===id && s.activeTabText]}>{label}</Text></Pressable>)}</View>
    {libraryError ? <View style={s.libraryNotice}><Text accessibilityRole="alert" style={s.error}>{libraryError}</Text><Action label="Retry media" onPress={() => setReload(value => value + 1)}/></View> : null}
    {tiles.length ? <View style={s.grid}>{tiles.map(item => <ContentTile key={`${item.kind}:${item.id}`} item={item} width={tileWidth} pinned={isPinned(item)} busy={saving} onPin={() => void togglePin(item)} onOpen={() => open(item)}/>)}</View> : loading && tab !== 'companion' ? <View style={s.empty}><ActivityIndicator color="#CBA6EF"/><Text style={s.muted}>Loading your media…</Text></View> : <View style={s.empty}><ImageIcon size={36} color={colors.muted}/><Text style={s.emptyTitle}>{tab==='companion' ? 'Your next connection starts here' : `No ${tab==='image' ? 'images' : 'videos'} yet`}</Text><Text style={s.emptyBody}>{tab==='companion' ? 'Meet someone and they’ll appear in your profile.' : tab==='image' ? 'Photos you create in chat will appear here.' : 'Videos you create with your companions will appear here.'}</Text><Action label={tab==='companion' ? 'Explore companions' : 'Open conversations'} onPress={() => onRoute(tab==='companion' ? '/explore' : '/chat-tab')}/></View>}
    {tab !== 'companion' && hasMore ? <Action label={loading ? 'Loading…' : 'Load more media'} disabled={loading} onPress={() => void loadMore()}/> : null}
  </View>;
}

function mergeMedia(first:GeneratedMedia[], second:GeneratedMedia[]) { return [...new Map([...first,...second].map(item => [item.id,item])).values()]; }
function Action({label,onPress,disabled=false}:{label:string;onPress:()=>void;disabled?:boolean}) { return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({pressed}) => [s.action,(pressed || disabled) && {opacity:.5}]}><Text style={s.actionText}>{label}</Text></Pressable>; }
function ContentTile({item,width,pinned,busy,onPin,onOpen}:{item:Tile;width:number;pinned:boolean;busy:boolean;onPin:()=>void;onOpen:()=>void}) {
  return <View style={{width}}><View style={[s.tile,{height:width * 1.25}]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.kind}: ${item.title}`} onPress={onOpen} style={StyleSheet.absoluteFill}>
      {item.source ? <Image source={item.source} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" loading="lazy" recyclingKey={`${item.kind}:${item.id}`}/> : <View style={s.tileFallback}>{item.kind==='video' ? <Video size={34} color="#BA95D8"/> : <UsersRound size={34} color="#BA95D8"/>}</View>}
      <View pointerEvents="none" style={s.tileShade}/>
      {item.kind==='video' ? <View style={s.play}><Play size={23} color="#fff" fill="#fff"/></View> : null}
      <Text numberOfLines={2} style={s.tileTitle}>{item.title}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`${pinned ? 'Unpin' : 'Pin'} ${item.kind}: ${item.title}`} accessibilityState={{selected:pinned,disabled:busy}} aria-pressed={pinned} disabled={busy} onPress={onPin} style={[s.pin,pinned && s.pinned]}><Pin size={17} color={pinned ? '#fff' : '#EEE2F5'} fill={pinned ? '#fff' : 'transparent'}/></Pressable>
    </View><Text style={s.caption} numberOfLines={1}>{item.subtitle}</Text></View>;
}

const s = StyleSheet.create({
  panel:{width:'100%',maxWidth:1060,gap:22},
  hero:{flexDirection:'row',alignItems:'center',gap:26,padding:28,minHeight:220,borderRadius:22,borderWidth:1,borderColor:'rgba(255,255,255,.1)',backgroundColor:'rgba(24,21,28,.85)',overflow:'hidden'},
  heroGlow:{backgroundColor:'rgba(108,42,161,.13)',...(Platform.OS==='web'?({backgroundImage:'radial-gradient(ellipse at 55% 10%, rgba(137,64,213,.3), transparent 80%)'} as never):{})},
  heroSmall:{flexDirection:'column',alignItems:'center',padding:22,gap:16},
  avatar:{width:132,height:132,borderRadius:66,borderWidth:3,borderColor:'#B178E2',backgroundColor:'#7F42B7',alignItems:'center',justifyContent:'center',overflow:'hidden'}, avatarSmall:{width:98,height:98,borderRadius:49},
  initial:{fontSize:62,fontWeight:'600',color:'#fff'},camera:{position:'absolute',bottom:0,left:0,right:0,height:30,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(19,10,25,.65)'},
  heroCopy:{flex:1,minWidth:0,gap:8},privateLabel:{flexDirection:'row',alignItems:'center',gap:6},eyebrow:{fontSize:9,fontWeight:'700',letterSpacing:1.4,color:'#CBA6EF'},name:{fontSize:30,fontWeight:'700',color:'#fff'},email:{fontSize:13,color:colors.textSecondary,flexShrink:1},
  stats:{flexDirection:'row',flexWrap:'wrap',gap:22,marginTop:8},stat:{color:colors.textSecondary,fontSize:14},statValue:{color:'#fff',fontWeight:'700'},actions:{flexDirection:'row',flexWrap:'wrap',gap:10,marginTop:3},action:{minHeight:44,paddingHorizontal:12,alignItems:'center',justifyContent:'center',alignSelf:'flex-start',borderRadius:10,backgroundColor:'rgba(175,118,214,.1)'},actionText:{fontSize:12,fontWeight:'600',color:'#D9B7F3'},
  notice:{color:colors.success,fontSize:13},error:{color:colors.danger,fontSize:13,lineHeight:20},libraryNotice:{gap:8},
  personas:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:8},rowTitle:{color:colors.text,fontWeight:'600',fontSize:14},muted:{color:colors.textSecondary,fontSize:12,lineHeight:18},
  sectionHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},heading:{fontSize:21,fontWeight:'600',color:'#fff'},
  emptyHighlights:{minHeight:172,alignItems:'center',justifyContent:'center',gap:10,borderRadius:18,borderWidth:1,borderStyle:'dashed',borderColor:'rgba(201,159,228,.22)',padding:24,backgroundColor:'rgba(132,71,165,.045)'},emptyTitle:{color:colors.text,fontSize:17,fontWeight:'600',textAlign:'center'},emptyBody:{color:colors.textSecondary,fontSize:13,lineHeight:20,textAlign:'center',maxWidth:470},highlightRail:{gap:12},unavailable:{height:200,padding:14,gap:12,justifyContent:'center',alignItems:'center',borderRadius:16,backgroundColor:'rgba(130,80,160,.07)'},
  tabs:{flexDirection:'row',borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,.1)'},tab:{flex:1,minHeight:54,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,borderBottomWidth:2,borderBottomColor:'transparent'},activeTab:{borderBottomColor:'#D9B7F3',backgroundColor:'rgba(176,115,218,.06)'},tabText:{fontSize:12,fontWeight:'600',color:colors.muted},activeTabText:{color:'#F9F4FC'},
  grid:{flexDirection:'row',flexWrap:'wrap',gap:12},tile:{borderRadius:16,overflow:'hidden',backgroundColor:'#201827',borderWidth:1,borderColor:'rgba(255,255,255,.1)'},tileFallback:{flex:1,alignItems:'center',justifyContent:'center'},tileShade:{position:'absolute',left:0,right:0,bottom:0,height:'45%',backgroundColor:'rgba(9,7,14,.42)',...(Platform.OS==='web'?({backgroundColor:'transparent',backgroundImage:'linear-gradient(transparent,rgba(9,7,14,.9))'} as never):{})},tileTitle:{position:'absolute',left:12,right:12,bottom:12,color:'#fff',fontSize:16,fontWeight:'600'},pin:{position:'absolute',top:7,right:7,width:44,height:44,borderRadius:22,backgroundColor:'rgba(12,8,18,.7)',alignItems:'center',justifyContent:'center'},pinned:{backgroundColor:'#8242AE'},play:{position:'absolute',top:'40%',alignSelf:'center',width:48,height:48,borderRadius:24,backgroundColor:'rgba(0,0,0,.32)',alignItems:'center',justifyContent:'center'},caption:{fontSize:11,color:colors.textSecondary,marginTop:7,marginBottom:4,paddingHorizontal:2},empty:{minHeight:220,padding:24,alignItems:'center',justifyContent:'center',gap:14},
});
