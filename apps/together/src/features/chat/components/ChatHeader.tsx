import { styles } from '../../../styles/chatStyles';
import { Platform, Pressable, Text, View } from 'react-native';
import { ArrowLeft, Images, MoreHorizontal, Phone } from 'lucide-react-native';
import { CharacterAvatar } from '../../../components/ui';
import { colors } from '../../../theme';
import type { CharacterInstance } from '../../../types';
import { navigateChatSurface } from '../navigation';
export function ChatAmbientGlow({ compact }: {
  compact: boolean;
}) {
  return (
    <View
      pointerEvents='none'
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      style={styles.chatGlowLayer}
    >
      <View style={[styles.chatGlow, styles.chatGlowRose, compact && styles.chatGlowRoseCompact]} />
      <View
        style={[styles.chatGlow, styles.chatGlowViolet, compact && styles.chatGlowVioletCompact]}
      />
      <View
        style={[styles.chatGlow, styles.chatGlowCenter, compact && styles.chatGlowCenterCompact]}
      />
    </View>
  );
}
export function ChatHeader({ character, location, mediaCount, onBack, onMedia, onCall, onMenu }: {
  character: CharacterInstance;
  location: string;
  mediaCount: number;
  onBack: () => void;
  onMedia: () => void;
  onCall: () => void;
  onMenu: () => void;
}) {
  const slug = character.together_character_templates.slug,
    locationStatus = location.trim().toLowerCase() === 'home' ? 'At home' : `At ${location}`;
  return (
    <View style={[styles.header, Platform.OS === 'web' && styles.webHeader]}>
      <Pressable
        accessibilityRole='button'
        accessibilityLabel='Back to Messages'
        onPress={onBack}
        style={styles.icon}
      >
        <ArrowLeft color={colors.text} />
      </Pressable>
      <Pressable
        accessibilityRole='button'
        accessibilityLabel={`View ${character.together_character_templates.name}'s profile`}
        onPress={() => navigateChatSurface(`/character/${slug}`)}
      >
        <CharacterAvatar slug={slug} name={character.together_character_templates.name} size={42} />
      </Pressable>
      <Pressable
        accessibilityRole='button'
        accessibilityLabel={`View ${character.together_character_templates.name}'s profile`}
        onPress={() => navigateChatSurface(`/character/${slug}`)}
        style={styles.headerIdentity}
      >
        <Text numberOfLines={1} style={[styles.name, styles.desktopHeaderName]}>
          {character.together_character_templates.name}
        </Text>
        <Text numberOfLines={1} style={[styles.status, styles.desktopHeaderStatus]}>
          {locationStatus}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole='button'
        accessibilityLabel={`Open ${character.together_character_templates.name} conversation media${
          mediaCount ? `, ${mediaCount} items` : ''
        }`}
        onPress={onMedia}
        style={styles.icon}
      >
        <Images size={19} color={colors.text} />
        {mediaCount
          ? (
            <View style={styles.headerMediaCount}>
              <Text style={styles.headerMediaCountText}>
                {mediaCount > 99 ? '99+' : mediaCount}
              </Text>
            </View>
          )
          : null}
      </Pressable>
      <Pressable
        accessibilityRole='button'
        accessibilityLabel={`Call ${character.together_character_templates.name}`}
        onPress={onCall}
        style={styles.icon}
      >
        <Phone size={18} color={colors.text} />
      </Pressable>
      <Pressable
        accessibilityRole='button'
        accessibilityLabel='Conversation menu'
        onPress={onMenu}
        style={styles.icon}
      >
        <MoreHorizontal color={colors.text} />
      </Pressable>
    </View>
  );
}
