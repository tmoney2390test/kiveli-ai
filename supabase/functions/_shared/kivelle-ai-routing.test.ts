import { assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import { configuredDialogueProviders, resolveDialogueRouting } from './kivelle-ai-routing.ts';

Deno.test('chat keeps xAI explicit routing disabled even when legacy flags exist', () => {
  const previousKey = Deno.env.get('XAI_API_KEY');
  const previousEnabled = Deno.env.get('KIVELLE_XAI_ENABLED');
  const previousExplicit = Deno.env.get('KIVELLE_XAI_EXPLICIT_ENABLED');
  try {
    Deno.env.set('XAI_API_KEY', 'test-key');
    Deno.env.set('KIVELLE_XAI_ENABLED', 'true');
    Deno.env.set('KIVELLE_XAI_EXPLICIT_ENABLED', 'true');
    const providers = configuredDialogueProviders();
    assertEquals(providers.xai, false);
    assertEquals(providers.xaiEnabled, false);
    assertEquals(providers.xaiExplicitEnabled, false);
    const route = resolveDialogueRouting({
      message: 'Describe an explicit sexual act.',
      requestedMode: 'explicit',
      ageVerified: true,
      characterAge: 29,
      relationshipAllowsExplicit: true,
    });
    assertNotEquals(route.provider, 'xai');
    assertEquals(route.requestedMode, 'mature');
    assertEquals(route.resolvedMode, 'mature');
    assertEquals(route.explicit, false);
  } finally {
    restore('XAI_API_KEY', previousKey);
    restore('KIVELLE_XAI_ENABLED', previousEnabled);
    restore('KIVELLE_XAI_EXPLICIT_ENABLED', previousExplicit);
  }
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) Deno.env.delete(name);
  else Deno.env.set(name, value);
}
