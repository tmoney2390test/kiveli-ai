import { useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Check, ChevronDown, X } from 'lucide-react-native';
import { colors, radius } from '../theme';
import { videoCreditCost } from '../lib/videoGeneration';
import type { VideoGenerationOptions, VideoResolution, VideoRouteOption } from '../types';

type Option = { value: string; label: string; detail?: string };
export function VideoSettingPicker({ label, value, options, onChange, disabled, searchable = false }: { label: string; value: string; options: Option[]; onChange: (value: string) => void; disabled?: boolean; searchable?: boolean }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const trigger = useRef<View>(null);
  const close = () => { setOpen(false); if (Platform.OS === 'web') requestAnimationFrame(() => (trigger.current as unknown as { focus?: () => void })?.focus?.()); };
  return <>
    <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={`${label}: ${options.find(o => o.value === value)?.label ?? 'Choose'}`} accessibilityState={{ expanded: open, disabled }} disabled={disabled} onPress={() => { setQuery(''); setOpen(true); }} style={s.field}>
      <View style={{ flex: 1 }}><Text style={s.label}>{label}</Text><Text style={s.value}>{options.find(o => o.value === value)?.label ?? 'Choose'}</Text></View><ChevronDown size={18} color={colors.textSecondary} />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <View style={s.backdrop} accessibilityViewIsModal><Pressable accessibilityLabel={`Close ${label} picker`} onPress={close} style={StyleSheet.absoluteFill} />
        <View style={s.popup}><View style={s.heading}><Text accessibilityRole="header" style={s.title}>{label}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close picker" onPress={close} style={s.close}><X color={colors.text} size={22} /></Pressable></View>
          {searchable ? <TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Search places" placeholderTextColor={colors.muted} accessibilityLabel="Search places" style={s.search} /> : null}
          <ScrollView keyboardShouldPersistTaps="handled"><View accessibilityRole="radiogroup">{options.filter(o => `${o.label} ${o.detail ?? ''}`.toLowerCase().includes(query.toLowerCase())).map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ selected: option.value === value }} onPress={() => { onChange(option.value); close(); }} style={[s.option, option.value === value && s.selected]}><View style={{ flex: 1 }}><Text style={s.value}>{option.label}</Text>{option.detail ? <Text style={s.detail}>{option.detail}</Text> : null}</View>{option.value === value ? <Check color={colors.rose} size={19} /> : null}</Pressable>)}</View></ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

export function VideoSettingsControls({ route, resolution, duration, sound, onResolution, onDuration, onSound, frame, onFrame, disabled }: { route: VideoRouteOption; resolution: VideoResolution; duration: number; sound: boolean; onResolution: (v: VideoResolution) => void; onDuration: (v: number) => void; onSound: (v: boolean) => void; frame?: '9:16'|'16:9'; onFrame?: (v:'9:16'|'16:9') => void; disabled?: boolean }) {
  return <View style={s.controls}>
    <View style={s.row}><View style={{ flex: 1 }}><VideoSettingPicker label="Resolution" value={resolution} disabled={disabled} options={route.supportedResolutions.map(value => ({ value, label: value, detail: `${videoCreditCost(route, duration, value, sound)} credits` }))} onChange={value => onResolution(value as VideoResolution)} /></View>
      <View style={{ flex: 1 }}><VideoSettingPicker label="Duration" value={String(duration)} disabled={disabled} options={route.allowedDurations.map(value => ({ value: String(value), label: `${value} seconds`, detail: `${videoCreditCost(route, value, resolution, sound)} credits` }))} onChange={value => onDuration(Number(value))} /></View></View>
    {frame && onFrame ? <View style={s.field}><Text style={[s.value, { flex: 1 }]}>Frame</Text><View accessibilityRole="radiogroup" style={s.segment}>{(['9:16','16:9'] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={value === '9:16' ? 'Portrait' : 'Landscape'} accessibilityState={{selected: frame === value, disabled}} disabled={disabled} onPress={() => onFrame(value)} style={[s.segmentItem,frame === value && s.selected]}><Text style={s.value}>{value === '9:16' ? 'Portrait' : 'Landscape'}</Text></Pressable>)}</View></View> : null}
    {route.audioMode === 'toggleable' && videoCreditCost(route, duration, resolution, false) < videoCreditCost(route, duration, resolution, true) ? <View style={s.field}><Text style={[s.value,{flex:1}]}>Sound</Text><Switch accessibilityLabel="Include sound" value={sound} onValueChange={onSound} disabled={disabled} trackColor={{false:'#42404b',true:'#b65cba'}} /></View> : null}
  </View>;
}

export function VideoLocationPicker({ options, source, locationId, onChange, disabled }: { options?: VideoGenerationOptions['locationOptions']; source: string; locationId: string; onChange: (source:'current'|'home'|'place', id: string) => void; disabled?: boolean }) {
  const choices: Option[] = options ? [{ value:'current',label:'Current location',detail:options.current.name }, ...(options.home ? [{value:'home',label:'Home',detail:options.home.name}] : []), ...options.places.filter(p => p.locationId).map(p => ({value:`place:${p.locationId}`,label:p.name,detail:p.detail ?? p.worldName}))] : [{value:'current',label:'Current location',detail:'Loading places…'}];
  return <VideoSettingPicker label="Location" value={source === 'place' ? `place:${locationId}` : source} options={choices} disabled={disabled || !options} searchable onChange={value => value.startsWith('place:') ? onChange('place',value.slice(6)) : onChange(value as 'current'|'home','')} />;
}
const s = StyleSheet.create({ controls:{gap:10},row:{flexDirection:'row',gap:10},field:{minHeight:60,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,backgroundColor:'rgba(255,255,255,.045)',padding:13,flexDirection:'row',alignItems:'center',gap:10},label:{color:colors.muted,fontSize:11,marginBottom:4},value:{color:colors.text,fontSize:14,fontWeight:'600'},detail:{color:colors.textSecondary,fontSize:12,marginTop:4},backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.7)',alignItems:'center',justifyContent:'center',padding:20},popup:{width:'100%',maxWidth:460,maxHeight:'80%',backgroundColor:'#211d29',borderRadius:22,padding:18},heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:14},title:{color:colors.text,fontSize:22,fontWeight:'700'},close:{padding:10},option:{padding:15,borderRadius:12,flexDirection:'row',alignItems:'center',marginBottom:5},selected:{backgroundColor:'rgba(180,86,183,.26)'},search:{color:colors.text,borderWidth:1,borderColor:colors.border,borderRadius:12,padding:12,marginBottom:12},segment:{flexDirection:'row',borderRadius:10,overflow:'hidden'},segmentItem:{padding:10} });
