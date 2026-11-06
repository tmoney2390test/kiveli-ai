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

/** A rejected streamed draft is never committed. One fresh, non-streamed draft
 * may replace it only after the entire replacement passes the same checks. */
export async function recoverRejectedGroupReply(input: {
  reply: DialogueGenerationResult;
  approved: boolean;
  canRetry: boolean;
  generate: () => Promise<DialogueGenerationResult>;
  approve: (text: string) => Promise<boolean>;
}): Promise<{ reply: DialogueGenerationResult; approved: boolean; attempted: boolean }> {
  if (input.approved || !input.canRetry) return { reply: input.reply, approved: input.approved, attempted: false };
  try {
    const reply = await input.generate();
    if (reply.text.trim() && await input.approve(reply.text)) {
      return { reply, approved: true, attempted: true };
    }
  } catch {
    // A failed repair stays rejected; the caller uses its safe fallback.
  }
  return { reply: input.reply, approved: false, attempted: true };
}
