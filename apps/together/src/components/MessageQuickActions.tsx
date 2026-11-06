import { Fragment, useRef, useState, type ReactNode } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Brain, CalendarDays, Camera, Check, Copy, FastForward, Flame, GitBranch, Heart, MapPin, MessageCircle, Plus, Volume2, Sparkles, X } from 'lucide-react-native';
import type { ChatQuickAction } from '../lib/chatQuickActions';
import { MAX_CHAT_QUICK_ACTIONS, toggleChatQuickAction } from '../lib/chatQuickActions';
import { messageActionTileStyles, type MessageActionDefinition } from './MessageActionSheet';
import { FrostedBackdrop, FrostedSurface } from './FrostedGlass';
import { colors, radius } from '../theme';

const DIRECT_OPTIONS: Array<{ key: ChatQuickAction; label: string; detail: string }> = [
  { key: 'voice', label: 'Voice', detail: 'Create a voice note for this message' },
  { key: 'location', label: 'Location', detail: 'See where they are now' },
  { key: 'branch', label: 'Branch', detail: 'Available on the latest reply' },
  { key: 'continue', label: 'Continue', detail: 'Available when a reply can continue' },
  { key: 'memory', label: 'Memory', detail: 'Save this moment when available' },
  { key: 'favorite', label: 'Favorite', detail: 'Save a message' },
  { key: 'photo', label: 'Ask for photo', detail: 'Open photo requests' },
  { key: 'activity', label: 'Do an Activity', detail: 'Change what you are doing in the current plan' },
  { key: 'plan', label: 'Plan something', detail: 'Make a plan together' },
  { key: 'copy', label: 'Copy', detail: 'Copy message text' },
  { key: 'spice', label: 'Spice', detail: 'Available for eligible replies' },
];
const GROUP_OPTIONS: Array<{ key: ChatQuickAction; label: string; detail: string }> = [
  { key: 'voice', label: 'Voice', detail: 'Create a voice note for this message' },
  { key: 'continue', label: 'Continue', detail: 'Keep the group talking' },
  { key: 'memory', label: 'Memory', detail: 'Save this moment when available' },
  { key: 'favorite', label: 'Favorite', detail: 'Save a message' },
  { key: 'photo', label: 'Group photo', detail: 'Open photo requests' },
  { key: 'activity', label: 'Do an Activity', detail: 'Change what you are doing in the current plan' },
  { key: 'plan', label: 'Plan with group', detail: 'Make a plan together' },
  { key: 'reply', label: 'Reply', detail: 'Reply to this message' },
  { key: 'copy', label: 'Copy', detail: 'Copy message text' },
  { key: 'spice', label: 'Spice', detail: 'Available for eligible replies' },
];

export function MessageQuickActions({ kind, selected, ready, onChange, actions, voice }: {
  kind: 'direct' | 'group';
  selected: ChatQuickAction[];
  ready: boolean;
  onChange: (value: ChatQuickAction[]) => void;
  actions: MessageActionDefinition[];
  voice: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const busy = useRef(false);
  const options = kind === 'direct' ? DIRECT_OPTIONS : GROUP_OPTIONS;
  const available = new Map(actions.map((action) => [action.key, action]));
  const runAction = async (action: MessageActionDefinition | undefined) => {
    if (!action || action.disabled || busy.current) return;
    busy.current = true;
    setBusyKey(action.key);
    try {
      await action.onPress();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : `${action.label} could not be completed. Please try again.`;
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert(`${action.label} unavailable`, message);
    } finally {
      busy.current = false;
      setBusyKey(null);
    }
  };
  const unavailableIcon = (key: ChatQuickAction, size = 15) => {
    const props = { size, color: colors.muted };
    switch (key) {
      case 'voice': return <Volume2 {...props}/>;
      case 'location': return <MapPin {...props}/>;
      case 'branch': return <GitBranch {...props}/>;
      case 'continue': return <FastForward {...props}/>;
      case 'memory': return <Brain {...props}/>;
      case 'favorite': return <Heart {...props}/>;
      case 'photo': return <Camera {...props}/>;
      case 'plan': return <CalendarDays {...props}/>;
      case 'activity': return <Sparkles {...props}/>;
      case 'reply': return <MessageCircle {...props}/>;
      case 'copy': return <Copy {...props}/>;
      case 'spice': return <Flame {...props}/>;
    }
  };
  return <>
    <View style={styles.bar}>
      {selected.map((key) => {
        if (key === 'voice') return <Fragment key={key}>{voice}</Fragment>;
        const action = available.get(key);
        const option = options.find((item) => item.key === key);
        const unavailable = !action || action.disabled;
        const disabled = unavailable || busyKey !== null;
        return <Pressable key={key} accessibilityRole="button" accessibilityLabel={unavailable ? `${option?.label ?? key} unavailable for this message` : action.label} accessibilityState={{ disabled, selected: action?.selected }} disabled={disabled} onPress={() => void runAction(action)} style={[styles.control, action?.selected && (key === 'memory' ? styles.remembered : styles.selected), disabled && styles.unavailable]}>{action && !unavailable ? <View style={styles.smallIcon}>{action.icon}</View> : unavailableIcon(key)}</Pressable>;
      })}
      <Pressable accessibilityRole="button" accessibilityLabel="Customize message quick actions" disabled={!ready} onPress={() => setOpen(true)} style={styles.control}><Plus size={16} color={ready ? colors.textSecondary : colors.muted}/></Pressable>
    </View>
    {open ? <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close quick action picker" onPress={() => setOpen(false)}><FrostedBackdrop intensity={38}/></Pressable>
        <FrostedSurface intensity={86} style={styles.panel}>
          <View style={styles.heading}><View style={{ flex: 1 }}><Text style={styles.title}>Message shortcuts</Text><Text style={styles.subtitle}>Choose up to {MAX_CHAT_QUICK_ACTIONS} for this chat · {selected.length} selected</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Done customizing message actions" onPress={() => setOpen(false)} style={styles.close}><X size={18} color={colors.textSecondary}/></Pressable></View>
          <ScrollView style={styles.list} contentContainerStyle={messageActionTileStyles.grid}>
            {options.map((option) => {
              const chosen = selected.includes(option.key);
              const atLimit = selected.length >= MAX_CHAT_QUICK_ACTIONS && !chosen;
              const action = available.get(option.key);
              return <Pressable key={option.key} accessibilityRole="checkbox" accessibilityLabel={available.get(option.key)?.label ?? option.label} accessibilityState={{ checked: chosen, disabled: atLimit }} disabled={atLimit} onPress={() => onChange(toggleChatQuickAction(selected, option.key))} style={({ pressed }) => [messageActionTileStyles.action, chosen && messageActionTileStyles.actionSelected, atLimit && messageActionTileStyles.actionDisabled, pressed && styles.optionPressed]}>
                {chosen ? <Check size={13} color={colors.rose} style={styles.check}/> : null}
                <View style={messageActionTileStyles.actionIcon}>{option.key === 'voice' ? <Volume2 size={23} color={chosen ? colors.rose : colors.textSecondary}/> : action?.icon ?? unavailableIcon(option.key, 23)}</View>
                <Text numberOfLines={2} style={[messageActionTileStyles.actionLabel, chosen && messageActionTileStyles.actionLabelSelected]}>{action?.label ?? option.label}</Text>
              </Pressable>;
            })}
          </ScrollView>
          {selected.length ? <Pressable accessibilityRole="button" accessibilityLabel="Remove all quick actions" onPress={() => onChange([])} style={styles.clear}><Text style={styles.clearText}>Remove all</Text></Pressable> : null}
        </FrostedSurface>
      </View>
    </Modal> : null}
  </>;
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 1 },
  control: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,.18)', backgroundColor: 'rgba(27,24,36,.68)', alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: 'rgba(216,62,234,.16)', borderColor: 'rgba(216,62,234,.38)' },
  remembered: { backgroundColor: 'rgba(155,99,215,.18)', borderColor: 'rgba(155,99,215,.58)' },
  unavailable: { opacity: .48 },
  smallIcon: { transform: [{ scale: .7 }] },
  modalRoot: { flex: 1, justifyContent: 'center', padding: 18 },
  panel: { width: '100%', maxWidth: 430, maxHeight: '78%', alignSelf: 'center', padding: 18, borderRadius: radius.xl, backgroundColor: 'rgba(20,16,30,.86)', borderWidth: 1, borderColor: 'rgba(255,255,255,.18)' },
  heading: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 14 },
  title: { color: colors.text, fontFamily: 'Georgia', fontSize: 24 },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 4 },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,.08)', alignItems: 'center', justifyContent: 'center' },
  list: { flexGrow: 0 },
  optionPressed: { opacity: .72, transform: [{ scale: .98 }] },
  check: { position: 'absolute', top: 7, right: 7 },
  clear: { alignSelf: 'center', minHeight: 38, justifyContent: 'center', paddingHorizontal: 16, marginTop: 10 },
  clearText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
});
