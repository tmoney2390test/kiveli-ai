import type { DialogueContext, DialogueRunOptions } from './together-ai.ts';
import { streamTestChatCompletion } from './kivelle-test-chat-completions.ts';
import { parseVeniceChunk } from '../../../packages/together-domain/src/venice-stream.ts';

export function veniceDialogueBody(model: string, prompt: string, maxTokens: number, temperature?: number) {
  return { model, messages: [{ role: 'user', content: prompt }], stream: true, stream_options: { include_usage: true }, max_completion_tokens: maxTokens,
    ...(temperature === undefined ? {} : { temperature }),
    venice_parameters: { include_venice_system_prompt: false, enable_web_search: 'off', enable_web_scraping: false, enable_x_search: false, disable_thinking: true, strip_thinking_response: true },
  };
}

export function streamVeniceDialogue(context: DialogueContext, options: DialogueRunOptions) {
  return streamTestChatCompletion(context, options, {
    provider: 'venice', label: 'Venice', errorPrefix: 'VENICE', apiKeyEnv: 'VENICE_API_KEY',
    endpoint: 'https://api.venice.ai/api/v1/chat/completions',
    buildBody: veniceDialogueBody, parseChunk: parseVeniceChunk,
    modelMatches: (requested, returned) => requested === returned,
  });
}
