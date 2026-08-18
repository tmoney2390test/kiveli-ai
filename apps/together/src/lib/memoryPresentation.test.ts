import { describe, expect, it } from 'vitest';
import { presentMemoryText } from './memoryPresentation';

describe('memory presentation', () => {
  it('conjugates third-person preference facts for the user', () => {
    expect(presentMemoryText('User likes football.')).toBe('You like football.');
    expect(presentMemoryText('User dislikes olives.')).toBe('You dislike olives.');
    expect(presentMemoryText('User prefers quiet restaurants.')).toBe('You prefer quiet restaurants.');
  });

  it('conjugates identity and emotional facts', () => {
    expect(presentMemoryText('User is a developer.')).toBe('You are a developer.');
    expect(presentMemoryText('User has a dog named Pepper.')).toBe('You have a dog named Pepper.');
    expect(presentMemoryText('User feels anxious before presentations.')).toBe('You feel anxious before presentations.');
    expect(presentMemoryText('User watches football on Sundays.')).toBe('You watch football on Sundays.');
    expect(presentMemoryText('User goes running before work.')).toBe('You go running before work.');
  });

  it('presents possessive and embedded user references naturally', () => {
    expect(presentMemoryText("The user's favorite team is the Eagles.")).toBe('Your favorite team is the Eagles.');
    expect(presentMemoryText('Maya thinks the user likes football.', 'Maya')).toBe('Maya thinks you like football.');
    expect(presentMemoryText('Maya calls the user Trouble.', 'Maya')).toBe('Maya calls you Trouble.');
  });

  it('uses the companion name without changing canonical relationship meaning', () => {
    expect(presentMemoryText('User told Maya they wanted to stay all night', 'Maya')).toBe('You told Maya you wanted to stay all night.');
    expect(presentMemoryText('User stepped closer to the character and expressed a desire to stay with them all night', 'Maya')).toBe('You stepped closer to Maya and said you wanted to stay with them all night.');
  });

  it('leaves already-natural second-person copy intact', () => {
    expect(presentMemoryText('You like old movies.')).toBe('You like old movies.');
  });
});
