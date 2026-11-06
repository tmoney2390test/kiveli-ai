import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Captions } from 'lucide-react-native';
import { KivelleCreditIcon } from './KivelleCreditIcon';
import { useCallDisplayPreferences } from '../hooks/useCallDisplayPreferences';
import type { CallCaption } from '../lib/realtimeVoice/captions';
import { colors } from '../theme';

export function CallDisplay({ caption, name, billing, active }: {
  caption: CallCaption | null;
  name: string;
  billing: string | null;
  active: boolean;
}) {
  const preferences = useCallDisplayPreferences();
  const scroll = useRef<ScrollView>(null);
  useEffect(() => { scroll.current?.scrollToEnd({ animated: false }); }, [caption, preferences.captions]);
  return <View style={styles.wrap}>
    <View style={styles.toggles}>
      <Pressable accessibilityRole="switch" accessibilityLabel="Call captions" accessibilityState={{ checked: preferences.captions }} aria-checked={preferences.captions}
        onPress={() => preferences.toggle('captions')} style={[styles.toggle, preferences.captions && styles.selected]}>
        <Captions size={18} color={preferences.captions ? colors.rose : colors.textSecondary}/>
        <Text style={styles.toggleText}>Captions {preferences.captions ? 'on' : 'off'}</Text>
      </Pressable>
      <Pressable accessibilityRole="switch" accessibilityLabel="Call credit details" accessibilityState={{ checked: preferences.credits }} aria-checked={preferences.credits}
        onPress={() => preferences.toggle('credits')} style={[styles.toggle, preferences.credits && styles.selected]}>
        <KivelleCreditIcon size={18}/>
        <Text style={styles.toggleText}>Credits {preferences.credits ? 'on' : 'off'}</Text>
      </Pressable>
    </View>
    {preferences.captions && active && caption?.content ? <View style={styles.captionBox}>
      {caption ? <Text style={styles.speaker}>{caption.role === 'user' ? 'You' : name}</Text> : null}
      <ScrollView ref={scroll} nestedScrollEnabled style={styles.captionScroll} contentContainerStyle={styles.captionContent}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        <Text selectable style={styles.caption}>{caption.content}</Text>
      </ScrollView>
    </View> : null}
    {preferences.credits && billing ? <Text style={styles.billing}>{billing}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 380, marginTop: 14, gap: 10 },
  toggles: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8 },
  toggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,.16)', backgroundColor: 'rgba(10,8,17,.68)' },
  selected: { borderColor: 'rgba(216,62,234,.45)', backgroundColor: 'rgba(54,23,65,.72)' },
  toggleText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  captionBox: { maxHeight: 180, paddingVertical: 8, paddingHorizontal: 6 },
  captionScroll: { flexShrink: 1 },
  captionContent: { flexGrow: 1, justifyContent: 'center' },
  speaker: { color: colors.rose, fontSize: 11, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  caption: { color: colors.text, fontSize: 19, lineHeight: 28, textAlign: 'center', textShadowColor: 'rgba(0,0,0,.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
  billing: { color: colors.warm, fontSize: 11, lineHeight: 16, textAlign: 'center', fontWeight: '700' },
});
