import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Camera, Play, RefreshCw, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react-native';
import { router } from 'expo-router';
import type { GeneratedMedia } from '../types';
import { colors, radius } from '../theme';
import { rateGeneratedMedia } from '../lib/api';

export function MediaTile({ media, style, onRetry }: { media: GeneratedMedia; style?: ViewStyle; onRetry?: () => void }) {
  const noun = media.media_type === 'video' ? 'Video' : 'Photo';
  if (media.status === 'queued' || media.status === 'generating') return <MediaProgress media={media} style={style} />;
  if (media.status === 'failed') return <View style={[styles.tile, styles.pending, style]}>
    <Camera color={colors.muted} />
    <Text style={styles.pendingTitle}>That {noun.toLowerCase()} didn’t come through</Text>
    <Text style={styles.caption}>{media.failure_reason_safe ?? 'Ask again or retry.'}</Text>
    {onRetry ? <Pressable onPress={onRetry} style={styles.retry}>
      <RefreshCw size={14} color={colors.rose} />
      <Text style={styles.retryText}>Try again</Text>
    </Pressable> : null}
  </View>;
  if (!media.signed_url) return null;
  return <View style={[styles.tile, style]}>
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={`Open ${noun.toLowerCase()}`}
      onPress={() => router.push(`/media/${media.id}` as never)}
      style={StyleSheet.absoluteFill}
    >
      {media.media_type === 'video' && media.parent_media_id
        ? <VideoPoster />
        : <Image source={{ uri: media.signed_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} />}
      {media.media_type === 'video' ? <View style={styles.play}><Play size={20} color="#fff" fill="#fff" /></View> : null}
    </Pressable>
    {media.media_type === 'image' ? <MediaFeedbackControls media={media} style={styles.feedbackOverlay} /> : null}
  </View>;
}

export function MediaFeedbackControls({media,style}:{media:GeneratedMedia;style?:ViewStyle}){
  const[selected,setSelected]=useState<'positive'|'negative'|null>(media.user_feedback??null);
  const[busy,setBusy]=useState(false);
  useEffect(()=>setSelected(media.user_feedback??null),[media.id,media.user_feedback]);
  const submit=async(event:GestureResponderEvent,feedback:'positive'|'negative')=>{
    event.stopPropagation?.();
    if(busy||selected===feedback)return;
    const previous=selected;setSelected(feedback);setBusy(true);
    try{await rateGeneratedMedia(media.id,feedback);}catch(error){setSelected(previous);Alert.alert('Feedback not saved',error instanceof Error?error.message:'Please try again.');}finally{setBusy(false);}
  };
  return <View accessibilityLabel="Rate this photo" style={[styles.feedback,style]}>
    <Pressable accessibilityRole="button" accessibilityLabel="This photo looks good" accessibilityState={{selected:selected==='positive',disabled:busy}} disabled={busy} onPress={(event)=>void submit(event,'positive')} style={[styles.feedbackButton,selected==='positive'&&styles.feedbackButtonSelected]}>
      <ThumbsUp size={15} color="#fff" fill={selected==='positive'?'#fff':'transparent'} strokeWidth={2}/>
    </Pressable>
    <View style={styles.feedbackDivider}/>
    <Pressable accessibilityRole="button" accessibilityLabel="This photo looks wrong" accessibilityState={{selected:selected==='negative',disabled:busy}} disabled={busy} onPress={(event)=>void submit(event,'negative')} style={[styles.feedbackButton,selected==='negative'&&styles.feedbackButtonSelected]}>
      <ThumbsDown size={15} color="#fff" fill={selected==='negative'?'#fff':'transparent'} strokeWidth={2}/>
    </Pressable>
  </View>;
}

function MediaProgress({ media, style }: { media: GeneratedMedia; style?: ViewStyle }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const scan = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    const scanLoop = Animated.loop(Animated.timing(scan, {
      toValue: 1,
      duration: 2400,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }));
    pulseLoop.start();
    scanLoop.start();
    return () => {
      pulseLoop.stop();
      scanLoop.stop();
    };
  }, [pulse, scan]);

  const isVideo = media.media_type === 'video';
  const title = isVideo
    ? 'Bringing the moment to life…'
    : media.status === 'queued' ? 'Getting the photo ready…' : 'Taking the photo…';
  const context = pendingContext(media.metadata ?? {});

  return <View
    accessible
    accessibilityRole="progressbar"
    accessibilityLiveRegion="polite"
    accessibilityLabel={isVideo ? 'Companion video is being generated' : 'Companion photo is being generated'}
    style={[styles.tile, styles.progressCard, style]}
  >
    <View pointerEvents="none" style={styles.progressBackdrop}>
      <View style={[styles.glow, styles.glowRose]} />
      <View style={[styles.glow, styles.glowViolet]} />
      <Animated.View style={[
        styles.scanLine,
        {
          opacity: scan.interpolate({ inputRange: [0, 0.18, 0.82, 1], outputRange: [0, 0.7, 0.7, 0] }),
          transform: [{ translateY: scan.interpolate({ inputRange: [0, 1], outputRange: [-92, 92] }) }],
        },
      ]} />
    </View>
    <View style={styles.progressBadge}>
      <Sparkles size={11} color="#FFD8E7" />
      <Text style={styles.progressBadgeText}>{isVideo ? 'MOMENT IN PROGRESS' : 'PHOTO IN PROGRESS'}</Text>
    </View>
    <View style={styles.captureStage}>
      <Animated.View style={[
        styles.captureHalo,
        {
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.72] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.12] }) }],
        },
      ]} />
      <Animated.View style={[
        styles.captureFrame,
        { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] }) }] },
      ]}>
        <Camera size={31} color={colors.cream} strokeWidth={1.6} />
        <View style={styles.captureSpark}><Sparkles size={13} color="#FF9CC0" fill="rgba(255,156,192,.2)" /></View>
      </Animated.View>
    </View>
    <View style={styles.progressCopy}>
      <Text style={styles.progressTitle}>{title}</Text>
      {context ? <Text style={styles.progressContext} numberOfLines={1}>{context}</Text> : null}
      <Text style={styles.progressHint}>You can keep chatting while it develops.</Text>
    </View>
    <View style={styles.progressTrack}>
      <Animated.View style={[
        styles.progressFill,
        { transform: [{ scaleX: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.28, 1] }) }] },
      ]} />
    </View>
  </View>;
}

function pendingContext(metadata: Record<string, unknown>): string {
  const place = asRecord(metadata.placeContext);
  const location = asRecord(place?.location);
  const locationName = stringValue(location?.name) ?? stringValue(place?.locationName);
  const activity = stringValue(metadata.activity);
  return [activity, locationName].filter((value): value is string => Boolean(value)).join(' · ');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function VideoPoster() {
  return <View style={[StyleSheet.absoluteFill, styles.videoPoster]}>
    <Play size={34} color={colors.rose} />
    <Text style={styles.pendingTitle}>Shared video</Text>
  </View>;
}

export function MediaGallery({ media, emptyText = 'Photos from your story will appear here.' }: { media: GeneratedMedia[]; emptyText?: string }) {
  const ready = media.filter((item) => item.status === 'ready' && item.signed_url);
  if (!ready.length) return <View style={styles.empty}>
    <Camera size={20} color={colors.rose} />
    <Text style={styles.emptyText}>{emptyText}</Text>
  </View>;
  return <View style={styles.grid}>{ready.map((item) => <MediaTile key={item.id} media={item} style={styles.gridTile} />)}</View>;
}

const styles = StyleSheet.create({
  tile: {
    height: 238,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'flex-end',
  },
  pending: { alignItems: 'center', justifyContent: 'center', gap: 7, padding: 18 },
  pendingTitle: { color: colors.text, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  caption: { color: '#F3EAF0', fontSize: 11, lineHeight: 15 },
  progressCard: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 18,
    backgroundColor: '#130E19',
    borderColor: 'rgba(255,190,215,.22)',
  },
  progressBackdrop: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  glow: { position: 'absolute', width: 210, height: 210, borderRadius: 105, opacity: 0.32 },
  glowRose: { left: -92, top: -86, backgroundColor: '#7E234F' },
  glowViolet: { right: -98, bottom: -104, backgroundColor: '#533376' },
  scanLine: {
    position: 'absolute', left: 18, right: 18, top: '50%', height: 1,
    backgroundColor: 'rgba(255,209,227,.34)', shadowColor: '#FF8FBB', shadowOpacity: 0.9, shadowRadius: 10,
  },
  progressBadge: {
    position: 'absolute', left: 14, top: 14, flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 6, borderRadius: radius.pill,
    backgroundColor: 'rgba(23,15,30,.72)', borderWidth: 1, borderColor: 'rgba(255,225,237,.18)',
  },
  progressBadgeText: { color: '#FFD8E7', fontSize: 9, fontWeight: '900', letterSpacing: 1.05 },
  captureStage: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  captureHalo: {
    position: 'absolute', width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(239,82,137,.18)', borderWidth: 1, borderColor: 'rgba(255,156,192,.45)',
  },
  captureFrame: {
    width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,.085)', borderWidth: 1, borderColor: 'rgba(255,255,255,.24)',
    shadowColor: '#EF5289', shadowOpacity: 0.32, shadowRadius: 18, shadowOffset: { width: 0, height: 7 },
  },
  captureSpark: { position: 'absolute', right: 7, top: 7 },
  progressCopy: { alignItems: 'center', gap: 3, marginTop: 7 },
  progressTitle: { color: colors.cream, fontSize: 15, fontWeight: '900', letterSpacing: 0.1, textAlign: 'center' },
  progressContext: { color: '#E7C8D8', fontSize: 11, fontWeight: '700', textAlign: 'center', textTransform: 'capitalize' },
  progressHint: { color: colors.muted, fontSize: 10.5, lineHeight: 15, textAlign: 'center' },
  progressTrack: {
    position: 'absolute', left: 24, right: 24, bottom: 13, height: 2, borderRadius: 2,
    overflow: 'hidden', backgroundColor: 'rgba(255,255,255,.08)',
  },
  progressFill: { width: '100%', height: '100%', borderRadius: 2, backgroundColor: colors.rose },
  play: {
    position: 'absolute', left: '50%', top: '44%', width: 48, height: 48, marginLeft: -24, marginTop: -24,
    borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,8,17,.72)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,.3)',
  },
  videoPoster: { alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.elevated },
  feedbackOverlay:{position:'absolute',right:10,bottom:10},
  feedback:{flexDirection:'row',alignItems:'center',height:34,borderRadius:radius.pill,overflow:'hidden',backgroundColor:'rgba(9,8,15,.62)',borderWidth:1,borderColor:'rgba(255,255,255,.24)',shadowColor:'#000',shadowOpacity:.28,shadowRadius:10,shadowOffset:{width:0,height:4}},
  feedbackButton:{width:36,height:34,alignItems:'center',justifyContent:'center',opacity:.72},
  feedbackButtonSelected:{opacity:1,backgroundColor:'rgba(255,255,255,.18)'},
  feedbackDivider:{width:1,height:17,backgroundColor:'rgba(255,255,255,.18)'},
  retry: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 7,
    borderRadius: radius.pill, backgroundColor: 'rgba(241,103,154,.10)',
  },
  retryText: { color: colors.rose, fontWeight: '800', fontSize: 11 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridTile: { width: '31.5%', minWidth: 118, height: 180 },
  empty: {
    minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  emptyText: { color: colors.muted, fontSize: 12, textAlign: 'center' },
});
