import { useMemo, type ReactNode } from 'react';
import {formatCompanionMessage} from '../lib/companionMessageFormatting';
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
  streaming=false,
  speakerName,
  children,
}: {
  text: string;
  characters: FeaturedCompanion[];
  excludeSlug?: string;
  onCharacterPress: (character: FeaturedCompanion) => void;
  style?: StyleProp<TextStyle>;
  streaming?:boolean;
  speakerName?:string;
  children?:ReactNode;
}) {
  const byId = useMemo(() => new Map(characters.map((character) => [character.id, character])), [characters]);
  const segments = useMemo(
    () => formatCompanionMessage(text,{streaming,speakerName}).flatMap(span=>parseCharacterMentions(span.text, characters.map(({ id, name, slug }) => ({ id, name, slug }))).map(segment=>({...segment,italic:span.italic,bold:span.bold}))),
    [characters, text, streaming, speakerName],
  );

  return <Text style={style}>
    {segments.map((segment, index) => segment.kind === 'text' || segment.character.slug === excludeSlug
      ? <Text key={`text-${index}`} style={[segment.italic&&styles.italic,segment.bold&&styles.bold]}>{segment.text}</Text>
      : <Text
        key={`${segment.character.id}-${index}`}
        accessibilityRole="link"
        accessibilityLabel={`View ${segment.character.name}'s profile`}
        onPress={() => {
          const character = byId.get(segment.character.id);
          if (character) onCharacterPress(character);
        }}
        style={[styles.link,segment.italic&&styles.italic]}
      >{segment.text}</Text>)}
    {children}
  </Text>;
}

const styles = StyleSheet.create({
  italic:{fontStyle:'italic'},
  bold:{fontWeight:'700'},
  link: {
    color: '#F4C7E8',
    fontWeight: '800',
    textDecorationLine: 'underline',
    textDecorationColor: colors.violet,
  },
});
