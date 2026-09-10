import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { colors } from '../theme';
import { VIDEO_ACCENT, VIDEO_ACCENT_FILL } from '../lib/videoCreator';
import { videoComparisonQuote } from '../lib/videoGeneration';
import type { VideoResolution, VideoRouteOption } from '../types';

export function VideoModelPicker({ routes, selectedRouteId, duration, resolution, sound, disabled, onSelect }: { routes: VideoRouteOption[]; selectedRouteId: string; duration: number; resolution: VideoResolution; sound: boolean; disabled?: boolean; onSelect: (route: VideoRouteOption) => void }) {
  const current = routes.find(r => r.id === selectedRouteId);
  const currentCost = current ? videoComparisonQuote(current, { duration, resolution, sound }).credits : 0;
  return <View accessibilityRole="radiogroup" accessibilityLabel="Video quality" style={s.row}>{routes.map(route => {
    const selected = selectedRouteId === route.id, quote = videoComparisonQuote(route,{duration,resolution,sound});
    const premium = route.id === 'tier:premium', delta = quote.credits - currentCost;
    const difference = selected ? 'Selected' : delta === 0 ? 'Same price' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} credits`;
    return <Pressable key={route.id} accessibilityRole="radio" accessibilityLabel={`${route.displayName}, ${quote.credits} credits`} aria-checked={selected} accessibilityState={{checked:selected,disabled}} disabled={disabled} onPress={() => onSelect(route)} style={[s.card,selected && s.active]}>
      <View style={s.titleRow}><Text style={s.title}>{premium ? 'Premium' : 'Standard'}</Text>{selected ? <Check size={16} color={VIDEO_ACCENT} /> : null}</View>
      <Text style={s.description}>{premium ? 'Longer scenes · stereo sound included' : 'Everyday moments · optional sound'}</Text>
      <Text style={s.detail}>{premium ? 'Up to 15 sec · up to 768p' : '5 or 10 sec · up to 1080p'}</Text>
      <Text style={s.price}>{difference}</Text>
      {!selected && (quote.duration !== duration || quote.resolution !== resolution || quote.sound !== (current?.audioMode === 'always' || sound)) ? <Text style={s.detail}>At {quote.duration} sec · {quote.resolution} · sound {quote.sound ? 'on' : 'off'}</Text> : null}
    </Pressable>;
  })}</View>;
}
const s = StyleSheet.create({row:{width:'100%',flexDirection:'row',gap:10},card:{flex:1,minWidth:0,padding:12,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:'rgba(255,255,255,.025)',gap:5},active:{borderColor:VIDEO_ACCENT,backgroundColor:VIDEO_ACCENT_FILL},titleRow:{flexDirection:'row',justifyContent:'space-between',gap:4},title:{color:colors.text,fontSize:14,fontWeight:'600'},description:{color:colors.textSecondary,fontSize:12,lineHeight:17},detail:{color:colors.muted,fontSize:11,lineHeight:16},price:{color:VIDEO_ACCENT,fontSize:12,fontWeight:'600'}});
