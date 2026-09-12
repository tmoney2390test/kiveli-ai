import { Text, View } from 'react-native';
import { Camera } from 'lucide-react-native';
import type { GeneratedMedia } from '../../types';
import { colors } from '../../theme';
import { styles } from '../../styles/mediaStyles';
import { MediaTile } from './MediaTile';

export function MediaGallery(
  { media, emptyText = "Photos from your story will appear here." }: {
    media: GeneratedMedia[];
    emptyText?: string;
  },
) {
  const ready = media.filter((item) =>
    item.status === "ready" && item.signed_url
  );
  if (!ready.length) {
    return (
      <View style={styles.empty}>
        <Camera size={20} color={colors.rose} />
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  }
  return (
    <View style={styles.grid}>
      {ready.map((item) => (
        <MediaTile key={item.id} media={item} style={styles.gridTile} />
      ))}
    </View>
  );
}
