import { assertEquals } from 'jsr:@std/assert@1';
import { nativeDialogueSurface, privateTextModeForSurface, readIosExplicitDialogueControl } from './ios-explicit-dialogue-control.ts';
import { resolvePrivateDialoguePolicy } from './private-adult-text-policy.ts';
import type { AdultAccessContext } from './web-adult-access.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

Deno.test('iOS and unidentified native clients fail closed until the Ops control is enabled', () => {
  assertEquals(privateTextModeForSurface('on', 'ios', false), 'off');
  assertEquals(privateTextModeForSurface('on', 'native_or_unknown', false), 'off');
  assertEquals(privateTextModeForSurface('on', 'ios', true), 'on');
  assertEquals(privateTextModeForSurface('on', 'web', false), 'on');
  assertEquals(privateTextModeForSurface('on', 'android', false), 'on');
  assertEquals(privateTextModeForSurface('shadow', 'ios', true), 'shadow');
  assertEquals(nativeDialogueSurface(true, 'ios'), 'web');
  assertEquals(nativeDialogueSurface(false, 'ios'), 'ios');
  assertEquals(nativeDialogueSurface(false, 'android'), 'android');
  assertEquals(nativeDialogueSurface(false, 'web'), 'native_or_unknown');
});

Deno.test('Ops control read fails closed when the table is unavailable', async () => {
  const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'missing' } }) }) }) }) } as unknown as SupabaseClient;
  assertEquals(await readIosExplicitDialogueControl(db), { enabled: false, available: false, updatedAt: null });
});

Deno.test('a saved explicit preference produces only mature iOS dialogue while the control is off', () => {
  const access: AdultAccessContext = {
    premium_access: true, adult_eligible: true, adult_mode_enabled: false,
    client_surface: 'ios', adult_generation_enabled: false, authorized_web_adult: false,
    adult_eligibility: { allowed: true, reason: 'verified_adult' },
    private_adult_text_mode: privateTextModeForSurface('on', 'ios', false),
    private_text_preference: 'explicit', private_text_preference_recorded: true, web_session_id: null,
  };
  const result = resolvePrivateDialoguePolicy({
    access, requestedMode: 'explicit', conversationMode: 'direct', safetyAllowed: true,
    participants: [{ id: 'adult', together_character_templates: { age: 28, description: 'An adult artist.' }, together_character_versions: {} }],
  });
  assertEquals(result.effectiveMode, 'mature');
  assertEquals(result.rollout.generationAllowed, false);
});
