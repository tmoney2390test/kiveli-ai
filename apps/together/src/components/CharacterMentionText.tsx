import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import type { FeaturedCompanion } from '../lib/featuredCompanions';
import { parseCharacterMentions } from '../lib/characterMentions';
import { parseChatActionText } from '../lib/chatActionText';
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
    () => parseChatActionText(text).flatMap((span) => parseCharacterMentions(span.text, characters.map(({ id, name, slug }) => ({ id, name, slug }))).map((segment) => ({ ...segment, italic: span.italic }))),
    [characters, text],
  );

  return <Text style={style}>
    {segments.map((segment, index) => segment.kind === 'text' || segment.character.slug === excludeSlug
      ? <Text key={index} style={segment.italic ? styles.action : undefined}>{segment.text}</Text>
      : <Text
        key={`${segment.character.id}-${index}`}
        accessibilityRole="link"
        accessibilityLabel={`View ${segment.character.name}'s profile`}
        onPress={() => {
          const character = byId.get(segment.character.id);
          if (character) onCharacterPress(character);
        }}
        style={[styles.link, segment.italic && styles.action]}
      >{segment.text}</Text>)}
  </Text>;
}

export function ChatActionText({ text, style, trailing }: { text: string; style?: StyleProp<TextStyle>; trailing?: ReactNode }) {
  const spans = useMemo(() => parseChatActionText(text), [text]);
  return <Text style={style}>{spans.map((span, index) => <Text key={index} style={span.italic ? styles.action : undefined}>{span.text}</Text>)}{trailing}</Text>;
}

const styles = StyleSheet.create({
  action: { fontStyle: 'italic' },
  link: {
    color: '#F4C7E8',
    fontWeight: '800',
    textDecorationLine: 'underline',
    textDecorationColor: colors.violet,
  },
});
