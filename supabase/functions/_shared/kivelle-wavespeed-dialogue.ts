import type { DialogueContext, DialogueRunOptions } from './together-ai.ts';
import { streamTestChatCompletion } from './kivelle-test-chat-completions.ts';
import { wavespeedDialogueBody, parseWavespeedChatChunk, wavespeedChatModelMatches } from '../../../packages/together-domain/src/wavespeed-chat.ts';

export function streamWavespeedDialogue(context: DialogueContext, options: DialogueRunOptions) {
  return streamTestChatCompletion(context, options, {
    provider: 'wavespeed', label: 'WaveSpeed', errorPrefix: 'WAVESPEED', apiKeyEnv: 'WAVESPEED_API_KEY',
    endpoint: 'https://llm.wavespeed.ai/v1/chat/completions',
    buildBody: wavespeedDialogueBody, parseChunk: parseWavespeedChatChunk,
    modelMatches: wavespeedChatModelMatches, requireReturnedModel: true,
  });
}
