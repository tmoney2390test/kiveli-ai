import { createElement, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronDown, Clock3, X } from 'lucide-react-native';
import { PLACE_DAYS, type PlaceHoursDraft } from '@together/domain/src/place-hours';
import { colors } from '../theme';

const dayNames = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
type Props = { value: PlaceHoursDraft; onChange: (value: PlaceHoursDraft) => void; disabled?: boolean };

export function PlaceHoursEditor({ value, onChange, disabled = false }: Props) {
  const [timePicker, setTimePicker] = useState<{ label: string; value: string; select: (time: string) => void } | null>(null);
  const hasIndividualHours = useRef(!value.repeatDaily);
  const chooseMode = (repeatDaily: boolean) => {
    const initializeDays = !repeatDaily && !hasIndividualHours.current;
    if (!repeatDaily) hasIndividualHours.current = true;
    onChange({ ...value, repeatDaily, ...(initializeDays ? { days: Object.fromEntries(PLACE_DAYS.map(day => [day, { ...value.daily, closed: false }])) as PlaceHoursDraft['days'] } : {}) });
  };
  const timeField = (label: string, time: string, change: (time: string) => void) => Platform.OS === 'web'
    ? createElement('input', { type: 'time', className: 'place-hours-time', 'aria-label': label, value: time === '24:00' ? '00:00' : time, disabled, step: 900,
        onClick: (event: { currentTarget: HTMLInputElement }) => { try { event.currentTarget.showPicker?.(); } catch { /* Editable time segments remain available when a browser has no picker. */ } },
        onChange: (event: { target: { value: string } }) => change(event.target.value),
        style: { width: '100%', minWidth: 0, minHeight: 42, boxSizing: 'border-box', border: '1px solid rgba(215,175,225,.22)', borderRadius: 9, background: '#110B19', color: colors.text, colorScheme: 'dark', fontFamily: 'system-ui, sans-serif', fontSize: 16, padding: '0 5px' } })
    : <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${timeLabel(time)}`} disabled={disabled} onPress={() => setTimePicker({ label, value: time, select: change })} style={styles.time}><Text style={styles.timeText}>{timeLabel(time)}</Text><ChevronDown size={12} color={colors.muted}/></Pressable>;
  const windowFields = (label: string, row: { open: string; close: string }, change: (patch: Partial<typeof row>) => void) => <View style={styles.times}>
    <View style={styles.timeWrap}>{timeField(`${label} opens`, row.open, open => change({ open }))}</View><Text style={styles.to}>–</Text>
    <View style={styles.timeWrap}>{timeField(`${label} closes`, row.close, close => change({ close }))}</View>
  </View>;
  return <View style={styles.section}>
    {Platform.OS === 'web' ? createElement('style', null, '.place-hours-time::-webkit-calendar-picker-indicator{display:none}.place-hours-time::-webkit-datetime-edit{padding:0}') : null}
    <View style={styles.heading}><Clock3 size={17} color={colors.rose}/><Text style={styles.title}>Opening hours</Text></View>
    <Pressable accessibilityRole="checkbox" accessibilityLabel="Open 24/7" accessibilityState={{ checked: value.alwaysOpen, disabled }} disabled={disabled} onPress={() => onChange({ ...value, alwaysOpen: !value.alwaysOpen })} style={styles.checkRow}>
      <View style={[styles.checkbox, value.alwaysOpen && styles.checked]}>{value.alwaysOpen ? <Check size={14} strokeWidth={3} color="#fff"/> : null}</View>
      <Text style={styles.checkText}>Open 24/7</Text><Text style={styles.hint}>{value.alwaysOpen ? 'Always available' : 'Set your hours below'}</Text>
    </Pressable>
    {!value.alwaysOpen ? <View style={styles.expanded}>
      <View style={styles.modes}>{[{ daily: true, label: 'Repeat daily' }, { daily: false, label: 'Individual days' }].map(mode => <Pressable key={mode.label} accessibilityRole="radio" accessibilityState={{ checked: value.repeatDaily === mode.daily, disabled }} disabled={disabled} onPress={() => chooseMode(mode.daily)} style={[styles.mode, value.repeatDaily === mode.daily && styles.activeMode]}><Text style={[styles.modeText, value.repeatDaily === mode.daily && styles.activeText]}>{mode.label}</Text></Pressable>)}</View>
      {value.repeatDaily ? windowFields('Every day', value.daily, patch => onChange({ ...value, daily: { ...value.daily, ...patch } })) : PLACE_DAYS.map(day => <View key={day} style={styles.day}>
        <Pressable accessibilityRole="checkbox" accessibilityLabel={`${dayNames[day]} open`} accessibilityState={{ checked: !value.days[day].closed, disabled }} disabled={disabled} onPress={() => onChange({ ...value, days: { ...value.days, [day]: { ...value.days[day], closed: !value.days[day].closed } } })} style={styles.dayToggle}><View style={[styles.smallCheckbox, !value.days[day].closed && styles.checked]}>{!value.days[day].closed ? <Check size={11} strokeWidth={3} color="#fff"/> : null}</View><Text style={styles.dayName}>{dayNames[day].slice(0, 3)}</Text></Pressable>
        {value.days[day].closed ? <Text style={styles.closed}>Closed</Text> : windowFields(dayNames[day], value.days[day], patch => onChange({ ...value, days: { ...value.days, [day]: { ...value.days[day], ...patch } } }))}
      </View>)}
      <Text style={styles.footnote}>Times follow your local clock. A closing time before opening runs overnight.</Text>
    </View> : null}
    {timePicker ? <View style={styles.picker}><View style={styles.heading}><Text style={styles.title}>{timePicker.label}</Text><Pressable accessibilityLabel="Close time picker" onPress={() => setTimePicker(null)} style={styles.close}><X size={18} color={colors.text}/></Pressable></View><ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>{Array.from({ length: 96 }, (_, index) => `${String(Math.floor(index / 4)).padStart(2, '0')}:${String(index % 4 * 15).padStart(2, '0')}`).map(time => <Pressable key={time} accessibilityRole="button" onPress={() => { timePicker.select(time); setTimePicker(null); }} style={styles.pickerRow}><Text style={styles.timeText}>{timeLabel(time)}</Text>{time === timePicker.value ? <Check size={16} color={colors.rose}/> : null}</Pressable>)}</ScrollView></View> : null}
  </View>;
}

function timeLabel(time: string) { const [hour = 0, minute = 0] = time.split(':').map(Number); return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 && hour < 24 ? 'PM' : 'AM'}`; }
const styles = StyleSheet.create({
  section: { gap: 10, borderWidth: 1, borderColor: 'rgba(215,175,225,.2)', borderRadius: 14, padding: 12, backgroundColor: 'rgba(17,11,25,.65)' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 }, title: { color: colors.text, fontSize: 13, fontWeight: '800', flex: 1 },
  checkRow: { flexDirection: 'row', alignItems: 'center', minHeight: 40, gap: 8 }, checkbox: { width: 21, height: 21, borderRadius: 6, borderWidth: 1, borderColor: colors.dimmed, alignItems: 'center', justifyContent: 'center' }, checked: { backgroundColor: '#A921C8', borderColor: '#BE51D5' }, checkText: { color: colors.text, fontSize: 13, fontWeight: '700' }, hint: { color: colors.muted, fontSize: 10, flex: 1, textAlign: 'right' },
  expanded: { gap: 9, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }, modes: { flexDirection: 'row', gap: 4, backgroundColor: '#0E0A15', borderRadius: 10, padding: 3 }, mode: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 38, borderRadius: 7 }, activeMode: { backgroundColor: 'rgba(169,33,200,.24)' }, modeText: { color: colors.muted, fontSize: 11, fontWeight: '700' }, activeText: { color: '#F2C6FA' },
  times: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 5, alignItems: 'center' }, timeWrap: { flex: 1, minWidth: 0 }, time: { minHeight: 42, borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, timeText: { color: colors.text, fontSize: 13 }, to: { color: colors.dimmed, fontSize: 12 }, day: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }, dayToggle: { flexDirection: 'row', gap: 6, alignItems: 'center', minHeight: 44, width: 66 }, smallCheckbox: { width: 17, height: 17, borderRadius: 5, borderWidth: 1, borderColor: colors.dimmed, alignItems: 'center', justifyContent: 'center' }, dayName: { color: colors.text, fontSize: 11, fontWeight: '700' }, closed: { flex: 1, color: colors.muted, fontSize: 12, textAlign: 'center' }, footnote: { color: colors.dimmed, fontSize: 10, lineHeight: 15 }, picker: { gap: 8 }, pickerRow: { minHeight: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12 }, close: { padding: 9 },
});
