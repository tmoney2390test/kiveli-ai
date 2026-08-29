import { describe, expect, it } from 'vitest';
import { parseCharacterMentions, type CharacterMentionTarget } from './characterMentions';

const people: CharacterMentionTarget[] = [
  { id: 'mirelle', name: 'Mirelle Voss', slug: 'mirelle-voss' },
  { id: 'priya', name: 'Priya Raman', slug: 'priya-raman' },
];

describe('parseCharacterMentions', () => {
  it('links full names and unique first names while preserving the original text', () => {
    const result = parseCharacterMentions('Ask Priya, then call MIRELLE VOSS.', people);
    expect(result).toEqual([
      { kind: 'text', text: 'Ask ' },
      { kind: 'character', text: 'Priya', character: people[1] },
      { kind: 'text', text: ', then call ' },
      { kind: 'character', text: 'MIRELLE VOSS', character: people[0] },
      { kind: 'text', text: '.' },
    ]);
  });

  it('does not link an ambiguous first name but still links the full name', () => {
    const targets = [
      { id: 'maya-a', name: 'Maya Bennett', slug: 'maya-bennett' },
      { id: 'maya-b', name: 'Maya Cole', slug: 'maya-cole' },
    ];
    const result = parseCharacterMentions('Maya knows Maya Bennett.', targets);
    expect(result).toEqual([
      { kind: 'text', text: 'Maya knows ' },
      { kind: 'character', text: 'Maya Bennett', character: targets[0] },
      { kind: 'text', text: '.' },
    ]);
  });

  it('respects word boundaries and possessive punctuation', () => {
    const targets = [{ id: 'ann', name: 'Ann Vale', slug: 'ann-vale' }];
    const result = parseCharacterMentions("Annabelle found Ann's notebook.", targets);
    expect(result).toEqual([
      { kind: 'text', text: 'Annabelle found ' },
      { kind: 'character', text: 'Ann', character: targets[0] },
      { kind: 'text', text: "'s notebook." },
    ]);
  });

  it('returns plain text when no world character is mentioned', () => {
    expect(parseCharacterMentions('The rain is getting heavier.', people)).toEqual([
      { kind: 'text', text: 'The rain is getting heavier.' },
    ]);
  });
});
