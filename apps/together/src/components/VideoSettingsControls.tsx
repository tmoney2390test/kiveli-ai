import { useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Check, ChevronDown, MapPin, SlidersHorizontal, X } from 'lucide-react-native';
import { colors } from '../theme';
import { VIDEO_ACCENT, VIDEO_ACCENT_FILL } from '../lib/videoCreator';
import { videoCreditCost } from '../lib/videoGeneration';
import type { VideoGenerationOptions, VideoResolution, VideoRouteOption } from '../types';

type Option = { value: string; label: string; detail?: string };
export function VideoSettingPicker({ label, value, options, onChange, disabled, searchable = false, compact = false }: { label: string; value: string; options: Option[]; onChange: (value: string) => void; disabled?: boolean; searchable?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const trigger = useRef<View>(null);
  const close = () => { setOpen(false); if (Platform.OS === 'web') requestAnimationFrame(() => (trigger.current as unknown as { focus?: () => void })?.focus?.()); };
  return <>
    <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={`${label}: ${options.find(o => o.value === value)?.label ?? 'Choose'}`} aria-expanded={open} accessibilityState={{ expanded: open, disabled }} disabled={disabled} onPress={() => { setQuery(''); setOpen(true); }} style={compact ? s.location : s.field}>
      {compact ? <MapPin size={15} color={colors.muted}/> : null}<View style={{ flex: 1 }}>{!compact ? <Text style={s.label}>{label}</Text> : null}<Text style={s.value}>{options.find(o => o.value === value)?.label ?? 'Choose'}</Text></View><ChevronDown size={18} color={colors.textSecondary} />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <View style={s.backdrop} accessibilityViewIsModal><Pressable accessibilityLabel={`Close ${label} picker`} onPress={close} style={StyleSheet.absoluteFill} />
        <View style={s.popup}><View style={s.heading}><Text accessibilityRole="header" style={s.title}>{label}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close picker" onPress={close} style={s.close}><X color={colors.text} size={22} /></Pressable></View>
          {searchable ? <TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Search places" placeholderTextColor={colors.muted} accessibilityLabel="Search places" style={s.search} /> : null}
          <ScrollView keyboardShouldPersistTaps="handled"><View accessibilityRole="radiogroup">{options.filter(o => `${o.label} ${o.detail ?? ''}`.toLowerCase().includes(query.toLowerCase())).map(option => <Pressable key={option.value} accessibilityRole="radio" aria-checked={option.value === value} accessibilityState={{ checked: option.value === value }} onPress={() => { onChange(option.value); close(); }} style={[s.option, option.value === value && s.selected]}><View style={{ flex: 1 }}><Text style={s.value}>{option.label}</Text>{option.detail ? <Text style={s.detail}>{option.detail}</Text> : null}</View>{option.value === value ? <Check color={VIDEO_ACCENT} size={19} /> : null}</Pressable>)}</View></ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

export function VideoSettingsControls({ route, resolution, duration, sound, onResolution, onDuration, onSound, frame, onFrame, disabled, sourceFrame }: { route: VideoRouteOption; resolution: VideoResolution; duration: number; sound: boolean; onResolution: (v: VideoResolution) => void; onDuration: (v: number) => void; onSound: (v: boolean) => void; frame?: '9:16'|'16:9'; onFrame?: (v:'9:16'|'16:9') => void; disabled?: boolean; sourceFrame?: string }) {
  const [expanded, setExpanded] = useState(false);
  const summary = `${duration} sec · ${resolution} · ${frame === '16:9' ? 'Landscape' : frame ? 'Portrait' : sourceFrame || 'Photo frame'} · Sound ${sound ? 'on' : 'off'}`;
  return <View style={s.controls}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Video settings: ${summary}`} aria-expanded={expanded} accessibilityState={{expanded}} onPress={() => setExpanded(v => !v)} style={s.summary}><View style={s.summaryTitle}><SlidersHorizontal size={16} color={colors.textSecondary}/><Text style={s.value}>Video settings</Text></View><View style={s.summaryDetail}><Text style={s.detail}>{summary}</Text><ChevronDown size={16} color={colors.textSecondary} style={{transform:[{rotate:expanded?'180deg':'0deg'}]}}/></View></Pressable>
    {expanded ? <View style={s.expanded}>
    <View style={s.row}><View style={{ flex: 1 }}><VideoSettingPicker label="Resolution" value={resolution} disabled={disabled} options={route.supportedResolutions.map(value => ({ value, label: value, detail: `${videoCreditCost(route, duration, value, sound)} credits` }))} onChange={value => onResolution(value as VideoResolution)} /></View>
      <View style={{ flex: 1 }}><VideoSettingPicker label="Duration" value={String(duration)} disabled={disabled} options={route.allowedDurations.map(value => ({ value: String(value), label: `${value} seconds`, detail: `${videoCreditCost(route, value, resolution, sound)} credits` }))} onChange={value => onDuration(Number(value))} /></View></View>
    {frame && onFrame ? <View style={s.field}><Text style={[s.value, { flex: 1 }]}>Frame</Text><View accessibilityRole="radiogroup" style={s.segment}>{(['9:16','16:9'] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={value === '9:16' ? 'Portrait' : 'Landscape'} aria-checked={frame === value} accessibilityState={{checked: frame === value, disabled}} disabled={disabled} onPress={() => onFrame(value)} style={[s.segmentItem,frame === value && s.selected]}><Text style={s.value}>{value === '9:16' ? 'Portrait' : 'Landscape'}</Text></Pressable>)}</View></View> : null}
    {route.audioMode === 'toggleable' && videoCreditCost(route, duration, resolution, false) < videoCreditCost(route, duration, resolution, true) ? <View style={s.field}><Text style={[s.value,{flex:1}]}>Sound</Text><Switch accessibilityLabel="Include sound" value={sound} onValueChange={onSound} disabled={disabled} trackColor={{false:'#42404b',true:VIDEO_ACCENT}} /></View> : null}
    </View> : null}
  </View>;
}

export function VideoLocationPicker({ options, source, locationId, onChange, disabled }: { options?: VideoGenerationOptions['locationOptions']; source: string; locationId: string; onChange: (source:'current'|'home'|'place', id: string) => void; disabled?: boolean }) {
  const choices: Option[] = options ? [{ value:'current',label:options.current.name,detail:'Current location' }, ...(options.home ? [{value:'home',label:options.home.name,detail:'Home'}] : []), ...options.places.filter(p => p.locationId).map(p => ({value:`place:${p.locationId}`,label:p.name,detail:p.detail ?? p.worldName}))] : [{value:'current',label:'Current location',detail:'Loading places…'}];
  return <VideoSettingPicker compact label="Location" value={source === 'place' ? `place:${locationId}` : source} options={choices} disabled={disabled || !options} searchable onChange={value => value.startsWith('place:') ? onChange('place',value.slice(6)) : onChange(value as 'current'|'home','')} />;
}
const s = StyleSheet.create({ controls:{width:'100%',marginTop:14,borderTopWidth:1,borderTopColor:colors.border},expanded:{gap:8,paddingBottom:12},summary:{paddingVertical:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',columnGap:14,rowGap:5},summaryTitle:{flexDirection:'row',alignItems:'center',gap:7},summaryDetail:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},location:{width:'100%',minHeight:36,flexDirection:'row',alignItems:'center',gap:7},row:{width:'100%',flexDirection:'row',gap:10},field:{width:'100%',minHeight:52,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:'rgba(255,255,255,.025)',padding:13,flexDirection:'row',alignItems:'center',gap:10},label:{color:colors.muted,fontSize:11,marginBottom:4},value:{color:colors.text,fontSize:14,fontWeight:'600'},detail:{color:colors.textSecondary,fontSize:12,marginTop:4},backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.7)',alignItems:'center',justifyContent:'center',padding:20},popup:{width:'100%',maxWidth:460,maxHeight:'80%',backgroundColor:'#211d29',borderRadius:22,padding:18},heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:14},title:{color:colors.text,fontSize:22,fontWeight:'700'},close:{padding:10},option:{padding:15,borderRadius:12,flexDirection:'row',alignItems:'center',marginBottom:5},selected:{backgroundColor:VIDEO_ACCENT_FILL},search:{color:colors.text,borderWidth:1,borderColor:colors.border,borderRadius:12,padding:12,marginBottom:12},segment:{flexDirection:'row',borderRadius:10,overflow:'hidden'},segmentItem:{padding:10} });
