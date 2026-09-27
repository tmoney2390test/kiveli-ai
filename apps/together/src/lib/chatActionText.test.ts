import { describe, expect, it } from 'vitest';
import { parseChatActionText } from './chatActionText';

describe('chat action text', () => {
  it('hides paired markers and italicizes actions beside speech', () => {
    expect(parseChatActionText('*Sora smiles.* I missed you. *She takes your hand.*')).toEqual([
      { text: 'Sora smiles.', italic: true },
      { text: ' I missed you. ', italic: false },
      { text: 'She takes your hand.', italic: true },
    ]);
  });

  it('handles multiline and doubled action markers', () => {
    expect(parseChatActionText('Hello.\n**She looks up.**\nCome closer.')).toEqual([
      { text: 'Hello.\n', italic: false },
      { text: 'She looks up.', italic: true },
      { text: '\nCome closer.', italic: false },
    ]);
  });

  it('keeps unmatched and mathematical asterisks literal', () => {
    expect(parseChatActionText('2*3*4 and *unfinished')).toEqual([
      { text: '2*3*4 and *unfinished', italic: false },
    ]);
  });

  it('honors escaped asterisks as literal text', () => {
    expect(parseChatActionText('\\*not an action\\* and *a smile*')).toEqual([
      { text: '*not an action* and ', italic: false },
      { text: 'a smile', italic: true },
    ]);
  });
});
