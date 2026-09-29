import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

const characterArtwork = require('../../assets/create-choice-character.webp');
const placeArtwork = require('../../assets/create-choice-place.webp');

export function CreateChoiceArtwork({ kind }: { kind: 'character' | 'place' }) {
  return <Image
    accessible={false}
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
    alt=""
    source={kind === 'character' ? characterArtwork : placeArtwork}
    contentFit="cover"
    cachePolicy="memory-disk"
    loading="eager"
    priority="high"
    transition={0}
    style={StyleSheet.absoluteFill}
  />;
}
