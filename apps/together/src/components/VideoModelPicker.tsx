import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { colors, radius } from '../theme';
import { videoComparisonQuote } from '../lib/videoGeneration';
import type { VideoResolution, VideoRouteOption } from '../types';

export function VideoModelPicker({ routes, selectedRouteId, duration, resolution, sound, disabled, onSelect }: { routes: VideoRouteOption[]; selectedRouteId: string; duration: number; resolution: VideoResolution; sound: boolean; disabled?: boolean; onSelect: (route: VideoRouteOption) => void }) {
  return <View accessibilityRole="radiogroup" accessibilityLabel="Video quality" style={s.row}>{routes.map(route => {
    const selected = selectedRouteId === route.id, quote = videoComparisonQuote(route,{duration,resolution,sound});
    return <Pressable key={route.id} accessibilityRole="radio" accessibilityLabel={`${route.displayName}, ${quote.credits} credits`} aria-checked={selected} accessibilityState={{checked:selected,disabled}} disabled={disabled} onPress={() => onSelect(route)} style={[s.card,selected && s.active]}>
      <View style={s.titleRow}><Text style={s.title}>{route.displayName}</Text>{selected ? <Check size={17} color={colors.rose} /> : null}</View><Text style={s.description}>{route.description}</Text><Text style={s.price}>{quote.credits} credits</Text>
    </Pressable>;
  })}</View>;
}
const s = StyleSheet.create({row:{width:'100%',flexDirection:'row',gap:10},card:{flex:1,minWidth:0,padding:14,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,backgroundColor:'rgba(255,255,255,.035)',gap:8},active:{borderColor:colors.rose,backgroundColor:'rgba(155,67,150,.16)'},titleRow:{flexDirection:'row',justifyContent:'space-between',gap:4},title:{color:colors.text,fontSize:16,fontWeight:'700'},description:{color:colors.textSecondary,fontSize:12,lineHeight:18},price:{color:colors.text,fontSize:13,fontWeight:'700'}});
