import { assertEquals } from 'jsr:@std/assert@1';
import {
  customCharacterAgeCheckFromMetadata,
  isAdultMediaReferenceEligible,
  isCustomCharacterTemplate,
  isFictionalCompanion,
  MEDIA_OFFER_COMPANION_SELECT,
  requiresCustomCharacterAgePresentationCheck,
} from './together-media-character.ts';

Deno.test('authored companions default to fictional', () => {
  assertEquals(isFictionalCompanion({ discovery_metadata: {} }, { visual_identity: {}, character_bible: {} }), true);
});

Deno.test('media offers request only canonical character schema columns', () => {
  assertEquals(MEDIA_OFFER_COMPANION_SELECT.includes('together_character_templates(name,age,discovery_metadata,creator_id)'), true);
  assertEquals(MEDIA_OFFER_COMPANION_SELECT.includes('together_character_versions(visual_identity,character_bible)'), true);
  assertEquals(MEDIA_OFFER_COMPANION_SELECT.includes('templates(name,age,metadata)'), false);
});

Deno.test('a canonical non-fictional flag blocks media eligibility', () => {
  assertEquals(isFictionalCompanion({ discovery_metadata: { fictional: false } }, { visual_identity: { fictional: true } }), false);
  assertEquals(isFictionalCompanion({ discovery_metadata: { fictional: true } }, { visual_identity: { fictional: false } }), false);
  assertEquals(isFictionalCompanion({}, { character_bible: { fictional: false } }), false);
});

Deno.test('real-person portrait references are isolated from adult-capable media', () => {
  assertEquals(isAdultMediaReferenceEligible({ visual_identity: { referenceOrigin: 'authorized_real_person', adultMediaReferenceEligible: false } }), false);
  assertEquals(isAdultMediaReferenceEligible({ visual_identity: { referenceOrigin: 'generated_fictional', adultMediaReferenceEligible: true } }), true);
  assertEquals(isAdultMediaReferenceEligible({ visual_identity: {} }), true);
});

Deno.test('official catalog templates are not custom', () => {
  assertEquals(isCustomCharacterTemplate({ name: 'Maris' }), false);
  assertEquals(isCustomCharacterTemplate({ creator_id: null }), false);
  assertEquals(isCustomCharacterTemplate({ creator_id: 'user-1' }), true);
});

Deno.test('visual age presentation QA stays strict for custom or unknown subjects', () => {
  assertEquals(requiresCustomCharacterAgePresentationCheck([]), true);
  assertEquals(requiresCustomCharacterAgePresentationCheck([{ companion: { custom: true } }]), true);
  assertEquals(requiresCustomCharacterAgePresentationCheck([{ companion: {} }]), true);
  assertEquals(requiresCustomCharacterAgePresentationCheck([{ companion: { custom: false } }]), false);
  assertEquals(
    requiresCustomCharacterAgePresentationCheck([
      { companion: { custom: false } },
      { companion: { custom: true } },
    ]),
    true,
  );
});

Deno.test('media metadata can pin the custom-character age gate', () => {
  assertEquals(customCharacterAgeCheckFromMetadata({ customCharacter: true }), true);
  assertEquals(customCharacterAgeCheckFromMetadata({ customCharacter: false }), false);
  assertEquals(customCharacterAgeCheckFromMetadata({}), null);
});
