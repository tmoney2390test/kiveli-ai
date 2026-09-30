import {useState} from 'react';
import {Modal, Platform, Pressable, StyleSheet, Text, View} from 'react-native';
import DateTimePicker, {type DateTimePickerEvent} from '@react-native-community/datetimepicker';
import {ChevronDown, Clock3, X} from 'lucide-react-native';
import {colors, radius} from '../theme';

type Props = {label: string; value: string; onChange: (value: string) => void};

function dateForTime(value: string): Date {
  const [hour, minute] = value.split(':').map(Number);
  const date = new Date();
  date.setHours(hour !== undefined && Number.isFinite(hour) ? hour : 0, minute !== undefined && Number.isFinite(minute) ? minute : 0, 0, 0);
  return date;
}

function timeForDate(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function QuietHoursTimeField({label, value, onChange}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const choose = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setOpen(false);
    if (event.type !== 'set' || !date) return;
    const next = timeForDate(date);
    if (Platform.OS === 'ios') setDraft(next);
    else onChange(next);
  };
  return <View style={styles.wrapper}>
    <Text style={styles.label}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} quiet hours, ${dateForTime(value).toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit'})}`} onPress={() => {setDraft(value); setOpen(true);}} style={({pressed}) => [styles.field, pressed && styles.pressed]}>
      <Clock3 size={18} color={colors.violet}/>
      <Text style={styles.value}>{dateForTime(value).toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit'})}</Text>
      <ChevronDown size={17} color={colors.muted}/>
    </Pressable>
    {open && Platform.OS === 'android' ? <DateTimePicker mode="time" display="clock" value={dateForTime(draft)} onChange={choose}/> : null}
    {open && Platform.OS === 'ios' ? <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close time picker" onPress={() => setOpen(false)} style={StyleSheet.absoluteFill}/>
        <View style={styles.sheet}>
          <View style={styles.heading}><Text style={styles.title}>{label} quiet hours</Text><Pressable accessibilityLabel="Close" onPress={() => setOpen(false)} style={styles.close}><X size={19} color={colors.text}/></Pressable></View>
          <DateTimePicker mode="time" display="spinner" themeVariant="dark" accentColor={colors.violet} value={dateForTime(draft)} onChange={choose}/>
          <Pressable accessibilityRole="button" onPress={() => {onChange(draft); setOpen(false);}} style={styles.done}><Text style={styles.doneText}>Done</Text></Pressable>
        </View>
      </View>
    </Modal> : null}
  </View>;
}

const styles = StyleSheet.create({
  wrapper: {flex: 1, minWidth: 135, gap: 7},
  label: {color: colors.textSecondary, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: .7},
  field: {minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface},
  pressed: {borderColor: colors.violet},
  value: {flex: 1, color: colors.text, fontSize: 16, fontWeight: '700'},
  backdrop: {flex: 1, justifyContent: 'flex-end', padding: 14, backgroundColor: 'rgba(3,2,7,.72)'},
  sheet: {gap: 12, padding: 16, paddingBottom: 24, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderBright, backgroundColor: colors.surface},
  heading: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  title: {color: colors.text, fontSize: 18, fontWeight: '800'},
  close: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.elevated},
  done: {minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.violet},
  doneText: {color: '#fff', fontSize: 15, fontWeight: '800'},
});
