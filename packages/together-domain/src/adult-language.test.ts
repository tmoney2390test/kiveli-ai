import { describe, expect, it } from 'vitest';
import { analyzeAdultLanguage, hasExplicitAdultLanguage, normalizeAdultLanguageText } from './adult-language.ts';

describe('adult language analysis',()=>{
  it.each([
    ['female_genitalia','vulva'],
    ['female_genitalia','coochie'],
    ['female_genitalia','vajayjay'],
    ['male_genitalia','penis'],
    ['male_genitalia','schlong'],
    ['male_genitalia','ballsack'],
    ['breasts','boobies'],
    ['breasts','tiddies'],
    ['breasts','areola'],
    ['buttocks_anus','butthole'],
    ['buttocks_anus','chocolate starfish'],
    ['general','private parts'],
  ] as const)('recognizes %s vocabulary: %s',(category,term)=>{
    expect(analyzeAdultLanguage(`show me your ${term}`)).toMatchObject({explicit:true});
    expect(analyzeAdultLanguage(`show me your ${term}`).categories).toContain(category);
  });

  it.each([
    ['p e n i s','penis'],
    ['p3n1s','penis'],
    ['d1ck','dick'],
    ['c0ck','cock'],
    ['pu$$y','pussy'],
    ['p*ssy','pussy'],
    ['c@nt','cunt'],
    ['v@gina','vagina'],
    ['cl!t','clit'],
    ['b00bs','boobs'],
    ['b**bs','boobs'],
    ['t1ts','tits'],
    ['n!pples','nipples'],
    ['a$$hole','ass'],
  ])('normalizes obfuscated spelling %s',(input,canonical)=>{
    expect(normalizeAdultLanguageText(input)).toContain(canonical);
    expect(hasExplicitAdultLanguage(`show me your ${input}`)).toBe(true);
  });

  it.each([
    'show me a picture of your cock',
    'send me a photo of your package exposed',
    'zoom in on your rack',
    'ass cheeks spread',
    'visible nipples',
    'hanging balls',
    'send me a 🍆 picture',
    'send me a 🍑 picture',
  ])('promotes ambiguous wording only when adult context supports it: %s',(text)=>{
    expect(hasExplicitAdultLanguage(text)).toBe(true);
  });

  it.each([
    'chicken breast recipe',
    'breast cancer screening',
    'golf balls on the green',
    'nuts and bolts in the package delivery',
    'photo of the rear wheel',
    'peach cobbler recipe',
    'kitty litter and cat food',
    'show me your button',
    'put the cake on the rack',
    '🌸 flowers are pretty',
    'the exposed pipe needs repair',
  ])('does not promote ordinary ambiguous language: %s',(text)=>{
    expect(hasExplicitAdultLanguage(text)).toBe(false);
  });
});
