import { styles } from '../../../styles/chatStyles';
import { CatalogImage as Image } from '../../../components/CatalogImage';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type ImageSource } from 'expo-image';
import { ChevronRight, MapPin, Sparkles, X } from 'lucide-react-native';
import { FrostedBackdrop, FrostedSurface } from '../../../components/FrostedGlass';
import { colors } from '../../../theme';
export function ChatPlaceInfoModal(
  {
    visible,
    name,
    worldName,
    category,
    description,
    activity,
    activities,
    source,
    onClose,
    onOpen,
  }: {
    visible: boolean;
    name: string;
    worldName?: string;
    category?: string;
    description: string;
    activity: string;
    activities: string[];
    source: ImageSource | number;
    onClose: () => void;
    onOpen?: () => void;
  },
) {
  const categoryLabel = category?.replace(/[_-]+/g, ' ').replace(
    /^./,
    (value) => value.toUpperCase(),
  );
  return (
    <Modal visible={visible} transparent animationType='fade' onRequestClose={onClose}>
      <Pressable
        accessibilityLabel='Close place information'
        style={[styles.mediaModalBackdrop, styles.placeModalBackdrop]}
        onPress={onClose}
      >
        <FrostedBackdrop intensity={36} />
        <Pressable
          accessibilityViewIsModal
          style={styles.placeModalFrame}
          onPress={() => undefined}
        >
          <FrostedSurface intensity={88} style={styles.placeModal}>
            <View style={styles.placeModalHero}>
              <Image
                source={source}
                style={StyleSheet.absoluteFill}
                contentFit='cover'
                contentPosition='center'
              />
              <View pointerEvents='none' style={styles.placeModalHeroShade} />
              <Pressable
                accessibilityRole='button'
                accessibilityLabel='Close place information'
                onPress={onClose}
                style={styles.placeModalClose}
              >
                <X size={18} color='#fff' />
              </Pressable>
              <View style={styles.placeModalHeroCopy}>
                <Text style={styles.placeModalKicker}>
                  {[worldName, categoryLabel].filter(Boolean).join(' · ').toUpperCase()}
                </Text>
                <Text style={styles.placeModalTitle}>{name}</Text>
              </View>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.placeModalBody}
            >
              <View style={styles.placeNow}>
                <MapPin size={17} color={colors.warm} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.placeNowLabel}>HERE RIGHT NOW</Text>
                  <Text style={styles.placeNowText}>{activity}</Text>
                </View>
              </View>
              <Text style={styles.placeModalDescription}>{description}</Text>
              {activities.length
                ? (
                  <View>
                    <Text style={styles.placeActivitiesLabel}>WHAT FITS HERE</Text>
                    <View style={styles.placeActivities}>
                      {activities.slice(0, 5).map((item) => (
                        <View key={item} style={styles.placeActivityChip}>
                          <Sparkles size={12} color={colors.violet} />
                          <Text style={styles.placeActivityText}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )
                : null}
              {onOpen
                ? (
                  <Pressable
                    accessibilityRole='button'
                    accessibilityLabel={`Open full place page for ${name}`}
                    onPress={onOpen}
                    style={styles.placeOpenButton}
                  >
                    <Text style={styles.placeOpenText}>Explore this place</Text>
                    <ChevronRight size={17} color='#fff' />
                  </Pressable>
                )
                : null}
            </ScrollView>
          </FrostedSurface>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
