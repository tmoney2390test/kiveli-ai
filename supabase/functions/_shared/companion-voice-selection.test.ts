import { applyCompanionVoicePreset, chatVoicePreset } from './companion-voice-selection.ts';

Deno.test('chat voice presets remain provider-neutral until voice resolution', () => {
  const voice = applyCompanionVoicePreset({
    characterTemplateId: 'character-1',
    voiceKey: 'character-1-default',
    characteristics: { warmth: .8 },
    providerMappings: { future_provider: 'voice-7', xai: 'eve' },
  }, 'warm');
  assert(voice.providerMappings?.xai === 'ara');
  assert(voice.providerMappings?.future_provider === 'voice-7');
  assert(chatVoicePreset({ chatPreferences: { voicePreset: 'strong' } }) === 'strong');
  assert(chatVoicePreset({ chatPreferences: { voicePreset: 'invalid' } }) === null);
});

function assert(value: unknown): asserts value {
  if (!value) throw new Error('assertion_failed');
}
