import type { DialogueGenerationResult, DialogueStreamEvent } from './together-ai.ts';
import { takeModerationSegments } from './adult-dialogue-stream.ts';

/** Only approved cumulative text is exposed. Canonical completion replaces the draft. */
export async function collectApprovedReply(input: {
  events: AsyncIterable<DialogueStreamEvent>;
  approve: (text: string) => Promise<boolean>;
  onDelta: (text: string, sequence: number) => void;
  signal?: AbortSignal;
}): Promise<DialogueGenerationResult & { approved: boolean }> {
  let pending = '', text = '', sequence = 0, approved = true;
  let metadata: DialogueGenerationResult['metadata'] | undefined;
  const flush = async (final = false) => {
    const chunks = takeModerationSegments(pending, { flush: final });
    pending = chunks.remainder;
    for (const segment of chunks.segments) {
      input.signal?.throwIfAborted();
      if (approved && !await input.approve(text + segment)) approved = false;
      input.signal?.throwIfAborted();
      text += segment;
      if (approved) input.onDelta(segment, ++sequence);
    }
  };
  for await (const event of input.events) {
    input.signal?.throwIfAborted();
    if (event.type === 'complete') metadata = event.metadata;
    else { pending += event.token; await flush(); }
  }
  if (!metadata) throw new Error('The reply stream ended without completion.');
  await flush(true);
  return { text, metadata, approved };
}
