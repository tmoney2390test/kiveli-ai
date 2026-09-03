import { assertEquals } from 'jsr:@std/assert@1';
import { configuredDialogueProviders, resolveDialogueRouting } from './kivelle-ai-routing.ts';

Deno.test('chat enables xAI explicit routing only when the private-text rollout and server authorization are present', () => {
  const previousKey = Deno.env.get('XAI_API_KEY');
  const previousEnabled = Deno.env.get('KIVELLE_XAI_ENABLED');
  const previousExplicit = Deno.env.get('KIVELLE_XAI_EXPLICIT_ENABLED');
  const previousPrivateText = Deno.env.get('KIVELLE_PRIVATE_ADULT_TEXT_MODE');
  try {
    Deno.env.set('XAI_API_KEY', 'test-key');
    Deno.env.set('KIVELLE_XAI_ENABLED', 'true');
    Deno.env.set('KIVELLE_XAI_EXPLICIT_ENABLED', 'true');
    Deno.env.set('KIVELLE_PRIVATE_ADULT_TEXT_MODE', 'on');
    const providers = configuredDialogueProviders();
    assertEquals(providers.xai, true);
    assertEquals(providers.xaiEnabled, true);
    assertEquals(providers.xaiExplicitEnabled, true);
    const route = resolveDialogueRouting({
      message: 'Describe an explicit sexual act.',
      requestedMode: 'explicit',
      ageVerified: true,
      characterAge: 29,
      relationshipAllowsExplicit: true,
      adultAuthorized:true,
    });
    assertEquals(route.provider, 'xai');
    assertEquals(route.requestedMode, 'explicit');
    assertEquals(route.resolvedMode, 'explicit');
    assertEquals(route.explicit, true);
    Deno.env.set('KIVELLE_PRIVATE_ADULT_TEXT_MODE','off');
    assertEquals(configuredDialogueProviders().xaiExplicitEnabled,false);
  } finally {
    restore('XAI_API_KEY', previousKey);
    restore('KIVELLE_XAI_ENABLED', previousEnabled);
    restore('KIVELLE_XAI_EXPLICIT_ENABLED', previousExplicit);
    restore('KIVELLE_PRIVATE_ADULT_TEXT_MODE', previousPrivateText);
  }
});

Deno.test('an eligible explicit photo request reaches PhotoGen even when private-text rollout is unavailable', () => {
  const route = resolveDialogueRouting({
    message: 'Send me a photo of your bent over with your ass and pussy showing',
    requestedMode: 'explicit',
    ageVerified: true,
    adultAuthorized: false,
    characterAge: 34,
    relationshipAllowsExplicit: true,
    photoRequest: true,
    photoAdultRequest: true,
    photoSafetyBlocked: false,
  });
  assertEquals(route.hardBlocked, false);
  assertEquals(route.reason === 'safety_block', false);
});

Deno.test('adult photo routing still fails closed for age and media-safety violations', () => {
  const base = {
    message: 'Send me an explicit photo.',
    requestedMode: 'explicit' as const,
    adultAuthorized: false,
    characterAge: 34,
    relationshipAllowsExplicit: true,
    photoRequest: true,
    photoAdultRequest: true,
  };
  assertEquals(resolveDialogueRouting({...base,ageVerified:false,photoSafetyBlocked:false}).hardBlocked,true);
  assertEquals(resolveDialogueRouting({...base,ageVerified:true,photoSafetyBlocked:true}).hardBlocked,true);
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) Deno.env.delete(name);
  else Deno.env.set(name, value);
}
