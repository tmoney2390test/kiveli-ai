import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { CreatorModal } from './CreatorPicker';
import { CreateChoiceArtwork } from './CreateChoiceArtwork';
import { PersonalPlacePicker } from './PersonalPlacePicker';
import { useTogether } from '../store/useTogether';
import { canAccessWorld } from '../lib/place';
import { isWorldCatalogVisible } from '@together/domain/src/world-access';

export function CreateMenu({ visible, onClose, onCreateCharacter }: {
  visible: boolean;
  onClose: () => void;
  onCreateCharacter: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const snapshot = useTogether((state) => state.snapshot);
  const browsedWorldId = useTogether((state) => state.browsedWorldId);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [chooserDismissed, setChooserDismissed] = useState(false);
  const [hoveredChoice, setHoveredChoice] = useState<'character' | 'place' | null>(null);
  useEffect(() => { if (visible) { setPlaceOpen(false); setChooserDismissed(false); setHoveredChoice(null); } }, [visible]);
  const currentWorld = snapshot?.worlds.find((world) => world.id === browsedWorldId)
    ?? snapshot?.worlds.find((world) => world.id === snapshot.currentPlaceContext?.world.id)
    ?? snapshot?.worlds.find(isWorldCatalogVisible);
  const placeWorld = snapshot?.worlds.find((world) => world.id === currentWorld?.id && canAccessWorld(snapshot, world))
    ?? snapshot?.worlds.find((world) => isWorldCatalogVisible(world) && canAccessWorld(snapshot, world));
  const stacked = width < 720;
  const compactCard = stacked ? { flex: 0, flexShrink: 0, height: Math.max(170, Math.min(240, (height - 230) / 2)) } : undefined;

  return <>
    <CreatorModal visible={visible && !placeOpen} title="What would you like to create?" onClose={onClose} onDismiss={Platform.OS === 'ios' ? () => setChooserDismissed(true) : undefined} cardChooser>
      <View style={[styles.choices, stacked && styles.choicesStack]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Create a character" onHoverIn={() => setHoveredChoice('character')} onHoverOut={() => setHoveredChoice(null)} onFocus={() => setHoveredChoice('character')} onBlur={() => setHoveredChoice(null)} onPress={onCreateCharacter} style={({ pressed }) => [styles.card, compactCard, hoveredChoice === 'character' && styles.cardHover, pressed && styles.cardPressed]}>
          <View pointerEvents="none" style={styles.artwork}><CreateChoiceArtwork kind="character" /></View>
          <View style={styles.footer}><View style={styles.copy}><Text style={styles.title}>Create a character</Text><Text style={styles.detail}>Make a companion of your own.</Text></View><ChevronRight size={20} color="#F9E9FC" /></View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Create a place" accessibilityState={{ disabled: !placeWorld }} disabled={!placeWorld} onHoverIn={() => setHoveredChoice('place')} onHoverOut={() => setHoveredChoice(null)} onFocus={() => setHoveredChoice('place')} onBlur={() => setHoveredChoice(null)} onPress={() => setPlaceOpen(true)} style={({ pressed }) => [styles.card, compactCard, hoveredChoice === 'place' && styles.cardHover, !placeWorld && styles.disabled, pressed && styles.cardPressed]}>
          <View pointerEvents="none" style={styles.artwork}><CreateChoiceArtwork kind="place" /></View>
          <View style={styles.footer}><View style={styles.copy}><Text style={styles.title}>Create a place</Text><Text style={styles.detail}>{placeWorld ? 'Build somewhere you can visit together.' : 'Your worlds are still loading.'}</Text></View><ChevronRight size={20} color="#F9E9FC" /></View>
        </Pressable>
      </View>
    </CreatorModal>
    {snapshot && placeWorld ? <PersonalPlacePicker visible={visible && placeOpen && (Platform.OS !== 'ios' || chooserDismissed)} worldId={placeWorld.id} snapshot={snapshot} onClose={onClose} startInCreateMode /> : null}
  </>;
}

const styles = StyleSheet.create({
  choices: { flexDirection: 'row', alignItems: 'stretch', gap: 16 },
  choicesStack: { flexDirection: 'column' },
  card: { position: 'relative', flex: 1, height: 380, minWidth: 0, overflow: 'hidden', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(204,163,230,.28)', backgroundColor: '#100D17' },
  cardHover: { borderColor: '#BA82E8', shadowColor: '#AF63D5', shadowOpacity: .3, shadowRadius: 15, shadowOffset: { width: 0, height: 0 } },
  cardPressed: { opacity: .84 },
  disabled: { opacity: .45 },
  artwork: { ...StyleSheet.absoluteFill, backgroundColor: '#261B36' },
  footer: { position: 'absolute', right: 0, bottom: 0, left: 0, minHeight: 116, flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 20, paddingBottom: 22, paddingTop: 38, backgroundColor: 'rgba(11,8,18,.83)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(transparent, rgba(11,8,18,.84) 30%, #100D17)' } as never) : {}) },
  copy: { flex: 1, minWidth: 0, gap: 5 },
  title: { color: '#FFF9FE', fontFamily: 'Georgia', fontSize: 23, fontWeight: '700' },
  detail: { color: '#C1B2C9', fontSize: 12, lineHeight: 18 },
});
