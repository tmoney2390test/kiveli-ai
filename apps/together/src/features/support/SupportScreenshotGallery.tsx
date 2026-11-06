import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SupportAttachment } from '../../lib/operations';
import { colors } from '../../theme';
export function SupportScreenshotGallery({ attachments }: { attachments: SupportAttachment[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <View style={s.row}>
        {attachments.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole='button'
            accessibilityLabel='View screenshot'
            disabled={!item.url}
            onPress={() => {
              setFailed(false);
              setSelected(item.url);
            }}
            style={s.thumb}
          >
            {item.url
              ? (
                <>
                  <Image
                    source={{ uri: item.url }}
                    style={StyleSheet.absoluteFill}
                    contentFit='cover'
                    cachePolicy='none'
                  />
                  <Text style={s.view}>View</Text>
                </>
              )
              : (
                <Text style={[s.error, { padding: 12 }]}>
                  Screenshot unavailable. Refresh this request to try again.
                </Text>
              )}
          </Pressable>
        ))}
      </View>
      <Modal
        visible={!!selected}
        transparent
        animationType='fade'
        onRequestClose={() => setSelected(null)}
      >
        <SafeAreaView style={s.viewer}>
          <Pressable
            accessibilityRole='button'
            accessibilityLabel='Close screenshot'
            style={s.close}
            onPress={() => setSelected(null)}
          >
            <X color={colors.text} />
          </Pressable>
          {failed
            ? <Text style={s.error}>Refresh this request to reload the screenshot.</Text>
            : (
              <Image
                accessibilityLabel='Support screenshot'
                source={{ uri: selected ?? '' }}
                contentFit='contain'
                cachePolicy='none'
                style={{ flex: 1, width: '100%' }}
                onError={() => setFailed(true)}
              />
            )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumb: {
    width: 120,
    height: 120,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  view: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    textAlign: 'center',
    padding: 7,
    color: colors.text,
    backgroundColor: 'rgba(0,0,0,.65)',
  },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  viewer: { flex: 1, backgroundColor: 'rgba(8,6,12,.97)', padding: 16 },
  close: {
    minHeight: 44,
    minWidth: 44,
    alignSelf: 'flex-end',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
