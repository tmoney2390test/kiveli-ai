import { z } from 'zod';
import { AppError } from './types.ts';

export const MAX_JSON_BODY_BYTES = 1024 * 1024;

export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let input: unknown;
  try { input = JSON.parse(await readRequestText(request, MAX_JSON_BODY_BYTES)); } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('VALIDATION_FAILED', 'Expected a JSON request body.', 400);
  }
  const result = schema.safeParse(input);
  if (!result.success) throw new AppError('VALIDATION_FAILED', result.error.issues[0]?.message ?? 'Invalid request.', 400);
  return result.data;
}

export async function readRequestText(request: Request, maxBytes = MAX_JSON_BODY_BYTES): Promise<string> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new AppError('VALIDATION_FAILED', 'The request body is too large.', 413);
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new AppError('VALIDATION_FAILED', 'The request body is too large.', 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
