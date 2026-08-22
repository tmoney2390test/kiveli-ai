import { configuredSpeechToTextProvider } from './kivelle-multimodal.ts';
import { OpenAiSpeechToTextProvider } from './openai-speech-to-text.ts';

Deno.test('OpenAI speech-to-text sends multipart audio without exposing the server key', async () => {
  let url = '', authorization = '', model = '', fileName = '';
  const provider = new OpenAiSpeechToTextProvider('server-secret', 'gpt-4o-mini-transcribe', 'https://openai.test/v1', 1_000, async (input, init) => {
    url = String(input);
    authorization = new Headers(init?.headers).get('authorization') ?? '';
    const form = init?.body as FormData;
    model = String(form.get('model'));
    const file = form.get('file') as File;
    fileName = file.name;
    return new Response(JSON.stringify({ text: '  Hello   from voice.  ' }), { status: 200, headers: { 'x-request-id': 'stt-1' } });
  });
  const result = await provider.transcribe({ bytes: new Uint8Array([1, 2, 3, 4]), contentType: 'audio/webm', fileName: 'dictation.webm' });
  assert(url === 'https://openai.test/v1/audio/transcriptions');
  assert(authorization === 'Bearer server-secret' && model === 'gpt-4o-mini-transcribe' && fileName === 'dictation.webm');
  assert(result.text === 'Hello from voice.' && result.providerRequestId === 'stt-1');
  assert(!JSON.stringify(result).includes('server-secret'));
});

Deno.test('OpenAI speech-to-text does not retry invalid audio', async () => {
  let calls = 0;
  const provider = new OpenAiSpeechToTextProvider('secret', undefined, 'https://openai.test/v1', 500, async () => {
    calls += 1;
    return new Response('{}', { status: 400 });
  });
  let rejected = false;
  try {
    await provider.transcribe({ bytes: new Uint8Array([1]), contentType: 'audio/mp4', fileName: 'dictation.m4a' });
  } catch {
    rejected = true;
  }
  assert(rejected && calls === 1);
});

Deno.test('configured OpenAI speech-to-text fails closed without both flag and key', () => {
  const names = ['OPENAI_API_KEY', 'KIVELLE_STT_PROVIDER', 'KIVELLE_OPENAI_TRANSCRIPTION_ENABLED'] as const;
  const previous = Object.fromEntries(names.map((name) => [name, Deno.env.get(name)]));
  try {
    Deno.env.set('KIVELLE_STT_PROVIDER', 'openai');
    Deno.env.set('KIVELLE_OPENAI_TRANSCRIPTION_ENABLED', 'true');
    Deno.env.delete('OPENAI_API_KEY');
    assert(configuredSpeechToTextProvider() === null);
    Deno.env.set('OPENAI_API_KEY', 'secret');
    Deno.env.set('KIVELLE_OPENAI_TRANSCRIPTION_ENABLED', 'false');
    assert(configuredSpeechToTextProvider() === null);
    Deno.env.set('KIVELLE_OPENAI_TRANSCRIPTION_ENABLED', 'true');
    assert(configuredSpeechToTextProvider()?.id === 'openai');
  } finally {
    for (const name of names) restore(name, previous[name]);
  }
});

function assert(value: unknown): asserts value {
  if (!value) throw new Error('assertion_failed');
}

function restore(name: string, value: string|undefined): void {
  if (value == null) Deno.env.delete(name);
  else Deno.env.set(name, value);
}
