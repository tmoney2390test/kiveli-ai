import { z } from 'zod';
import { validPersonalPlaceHours } from '../../../packages/together-domain/src/place-hours.ts';
import { AppError } from './types.ts';

export const personalPlaceImage = z.object({ path: z.string().max(300), width: z.number().int().positive().max(8192), height: z.number().int().positive().max(8192) });
export const personalPlaceFields = z.object({
  name: z.string().trim().min(2).max(80), description: z.string().trim().min(12).max(1000),
  activities: z.array(z.string().trim().min(2).max(64)).min(1).max(8),
  hours: z.record(z.string(), z.unknown()).refine(validPersonalPlaceHours, 'Choose valid opening and closing hours.').optional(),
});
export const createPersonalPlaceInput = personalPlaceFields.extend({
  action: z.literal('create'), locationId: z.string().uuid(), worldId: z.string().uuid(), parentLocationId: z.string().uuid().optional(),
  kind: z.enum(['home', 'bar', 'restaurant', 'hotel', 'outdoors', 'other']), image: personalPlaceImage,
});

export async function validatePersonalPlaceImage(db: any, userId: string, locationId: string, path: string): Promise<Blob> {
  const prefix = `${userId}/places/${locationId}/`;
  if (!path.startsWith(prefix) || !/^[0-9a-f-]{36}\.jpg$/i.test(path.slice(prefix.length))) throw new AppError('VALIDATION_FAILED', 'That image does not belong to this place.', 400);
  const { data: file, error } = await db.storage.from('together-user-media').download(path);
  if (error || !file) throw new AppError('VALIDATION_FAILED', 'Upload the image before saving your place.', 400);
  if (file.size > 10_000_000 || file.size < 1000) throw new AppError('VALIDATION_FAILED', 'Choose an image under 10 MB.', 400);
  const signature = new Uint8Array(await file.slice(0, 3).arrayBuffer());
  if (signature[0] !== 0xff || signature[1] !== 0xd8 || signature[2] !== 0xff) throw new AppError('VALIDATION_FAILED', 'That file is not a JPEG image.', 400);
  return file;
}
