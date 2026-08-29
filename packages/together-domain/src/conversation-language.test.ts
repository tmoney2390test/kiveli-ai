import { describe, expect, it } from 'vitest';
import { classifyConversationQuery } from './conversation.ts';

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
