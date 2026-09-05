import { describe, expect, it } from 'vitest';
import { classifyConversationQuery, conversationReferencesKnownCharacter } from './conversation.ts';

describe('multilingual conversation intent', () => {
  it.each([
    ['¿Dónde estás ahora?', 'location'],
    ['Tu es où maintenant ?', 'location'],
    ['明日は空いてる？', 'schedule'],
    ['우리 계획을 취소할까?', 'plan'],
    ['你还记得我告诉你的生日吗？', 'memory_overview'],
    ['Was ist gestern passiert?', 'history'],
    ['Você quer sair comigo em um encontro romântico?', 'date'],
    ['Chi conosci in città?', 'social'],
  ] as const)('%s → %s', (message, intent) => {
    expect(classifyConversationQuery(message)).toBe(intent);
  });
});

describe('relationship conversation intent', () => {
  it.each([
    'Do you know Princess Maris?',
    'How do you know Princess Maris?',
    'What do you think of Princess Maris?',
    'What is Princess Maris to you?',
    'Tell me about Queen Maerra.',
  ])('recognizes a relationship question: %s', (message) => {
    expect(classifyConversationQuery(message)).toBe('social');
  });

  it('does not steal a direct place question', () => {
    expect(classifyConversationQuery('What is this place?')).toBe('location');
  });

  it('recognizes authored names without hard-coding them into the classifier', () => {
    const social=[{name:'Princess Maris Vaelorian',slug:'princess-maris-vaelorian'}];
    expect(conversationReferencesKnownCharacter('Tell me about Maris.',social)).toBe(true);
    expect(conversationReferencesKnownCharacter('What happened at Aurora Spa?',social)).toBe(false);
  });
});
