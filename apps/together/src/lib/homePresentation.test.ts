import { describe, expect, it } from 'vitest';
import { getMemoryPresentation } from './homePresentation';

describe('home presentation', () => {
  it('never exposes raw system subjects in memory copy', () => {
    const result = getMemoryPresentation({
      canonical_text: 'User stepped closer to the character and expressed a desire to stay with them all night',
      memory_type: 'relationship',
    }, 'Maya');
    expect(result.text).toBe('You stepped closer to Maya and said you wanted to stay with them all night.');
    expect(result.text.toLowerCase()).not.toContain('the character');
  });

  it('turns possessive database language into second-person copy', () => {
    const result = getMemoryPresentation({ canonical_text: "The user's dog is named Cooper", memory_type: 'semantic' }, 'Maya');
    expect(result.text).toBe('Your dog is named Cooper.');
  });
});

