import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import type { GeneratedMedia, MediaOffer } from '../../types';
import { includedPhotoWasFree } from '../../lib/photoRequestPresentation.shared';
import { styles } from '../../styles/mediaStyles';

export function FreePhotoBadge({ media, offer }: { media: GeneratedMedia; offer?: MediaOffer | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!includedPhotoWasFree(media, offer)) return null;
  return (
    <View style={styles.freePhotoBadgeWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Free photo"
        accessibilityHint="Shows why this photo was free"
        accessibilityState={{ expanded }}
        onPress={(event) => {
          event.stopPropagation();
          setExpanded((current) => !current);
        }}
        style={styles.freePhotoBadge}
      >
        <Sparkles size={12} color="#FFE6F1" />
        <Text style={styles.freePhotoBadgeText}>Free</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.freePhotoTooltip}>
          <Text style={styles.freePhotoTooltipText}>This photo was included. No Credits were used.</Text>
        </View>
      ) : null}
    </View>
  );
}
