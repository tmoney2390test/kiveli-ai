import { z } from 'zod';
import { AppError } from './types.ts';

export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let input: unknown;
  try { input = await request.json(); } catch { throw new AppError('VALIDATION_FAILED', 'Expected a JSON request body.', 400); }
  const result = schema.safeParse(input);
  if (!result.success) throw new AppError('VALIDATION_FAILED', result.error.issues[0]?.message ?? 'Invalid request.', 400);
  return result.data;
}
