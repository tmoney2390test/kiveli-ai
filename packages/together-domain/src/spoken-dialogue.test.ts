import { describe, expect, it } from 'vitest';
import { spokenDialogueText } from './spoken-dialogue';

describe('spoken dialogue', () => {
  it('removes every action marker and performance cue while preserving dialogue', () => {
    expect(spokenDialogueText('*She smiles.* "Hello." **She looks away.** _A pause._ [sigh] (softly) I missed you.').trim()).toBe('Hello. I missed you.');
  });
  it('removes long, multiline and unfinished action blocks', () => {
    expect(spokenDialogueText(`Hello. *${'She looks around. '.repeat(30)}\nShe sits down.* How are you?`).trim()).toBe('Hello. How are you?');
    expect(spokenDialogueText('Hello. *She starts to move')).toBe('Hello. ');
    expect(spokenDialogueText('*A silent look*').trim()).toBe('');
    expect(spokenDialogueText('<em>She waves.</em> Hi.').trim()).toBe('Hi.');
  });
  it('never leaks a partially streamed action or joins words across chunks', () => {
    const text='Hello there. **She smiles warmly.\nShe waves.** What are you doing? [laugh] I was thinking of you.';
    let previous='';
    for (let length=1;length<=text.length;length++) {
      const current=spokenDialogueText(text.slice(0,length));
      expect(current.startsWith(previous)).toBe(true);
      expect(current).not.toMatch(/She|smiles|waves|laugh|\*/);
      previous=current;
    }
    expect(previous).toBe('Hello there. What are you doing? I was thinking of you.');
  });
  it('preserves ordinary dialogue punctuation and arithmetic',()=>{
    expect(spokenDialogueText("I'm here. It's 2*3, isn't it?")).toBe("I'm here. It's 2*3, isn't it?");
  });
});
