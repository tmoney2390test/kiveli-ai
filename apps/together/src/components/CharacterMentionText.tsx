import { useMemo } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import type { FeaturedCompanion } from '../lib/featuredCompanions';
import { parseCharacterMentions } from '../lib/characterMentions';
import { colors } from '../theme';

export function CharacterMentionText({
  text,
  characters,
  excludeSlug,
  onCharacterPress,
  style,
}: {
  text: string;
  characters: FeaturedCompanion[];
  excludeSlug?: string;
  onCharacterPress: (character: FeaturedCompanion) => void;
  style?: StyleProp<TextStyle>;
}) {
  const byId = useMemo(() => new Map(characters.map((character) => [character.id, character])), [characters]);
  const segments = useMemo(
    () => parseCharacterMentions(text, characters.map(({ id, name, slug }) => ({ id, name, slug }))),
    [characters, text],
  );

  return <Text style={style}>
    {segments.map((segment, index) => segment.kind === 'text' || segment.character.slug === excludeSlug
      ? segment.text
      : <Text
        key={`${segment.character.id}-${index}`}
        accessibilityRole="link"
        accessibilityLabel={`View ${segment.character.name}'s profile`}
        onPress={() => {
          const character = byId.get(segment.character.id);
          if (character) onCharacterPress(character);
        }}
        style={styles.link}
      >{segment.text}</Text>)}
  </Text>;
}

const styles = StyleSheet.create({
  link: {
    color: '#F4C7E8',
    fontWeight: '800',
    textDecorationLine: 'underline',
    textDecorationColor: colors.violet,
  },
});
