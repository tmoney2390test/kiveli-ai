import { invoke } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import {
  type PreparedChatPhotoUpload,
  uploadPreparedChatPhoto,
} from '../../lib/chatPhotoStorageUpload';
import type { SupportAttachment } from '../../lib/operations';

export type DraftScreenshot = {
  id: string;
  width: number;
  height: number;
  byteSize: number;
  uri: string;
  ready: boolean;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseScreenshots(raw: string): DraftScreenshot[] {
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const result: DraftScreenshot[] = [];
    for (const value of data) {
      if (!value || typeof value !== 'object') continue;
      const row = value as DraftScreenshot;
      if (
        !uuid.test(row.id) || result.some((item) => item.id === row.id) ||
        !Number.isInteger(row.width) || row.width < 1 || row.width > 2048 ||
        !Number.isInteger(row.height) || row.height < 1 || row.height > 2048 ||
        !Number.isInteger(row.byteSize) || row.byteSize < 1 || row.byteSize > 5242880 ||
        typeof row.uri !== 'string' || !/^(file:|blob:|data:image\/jpeg|$)/.test(row.uri)
      ) continue;
      result.push({
        id: row.id,
        width: row.width,
        height: row.height,
        byteSize: row.byteSize,
        uri: row.uri,
        ready: row.ready === true,
      });
      if (result.length === 3) break;
    }
    return result;
  } catch {
    return [];
  }
}
export function screenshotIds(raw: string) {
  return parseScreenshots(raw).filter((row) => row.ready).map((row) => row.id).sort();
}
// A dropped storage/confirmation response must release the form. Retrying uses
// the same attachment ID, so an upload already accepted by the server is reused.
export async function withScreenshotTimeout<T>(operation: Promise<T>, message = 'Screenshot upload took too long. Tap Retry upload, or remove it to send without it.'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), 30000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export function uploadSupportScreenshot(row: DraftScreenshot, expectedUserId: string) {
  return withScreenshotTimeout(uploadScreenshot(row, expectedUserId));
}
async function uploadScreenshot(row: DraftScreenshot, expectedUserId: string) {
  const prepared = await invoke<
    { attachment: SupportAttachment; upload?: PreparedChatPhotoUpload }
  >('together-ops', {
    action: 'support_attachment',
    operation: 'prepare',
    id: row.id,
    byteSize: row.byteSize,
    width: row.width,
    height: row.height,
    expectedUserId,
  });
  if (prepared.attachment.status === 'ready') return prepared.attachment;
  if (!prepared.upload) throw new Error('Screenshot upload could not start. Try again.');
  let body: Blob;
  try {
    body = await (await fetch(row.uri)).blob();
  } catch {
    throw new Error('This screenshot is no longer on this device. Remove it and attach it again.');
  }
  try {
    await uploadPreparedChatPhoto({
      storage: supabase.storage.from(prepared.upload.bucket),
      upload: prepared.upload,
      body,
      contentType: 'image/jpeg',
    });
  } catch {
    throw new Error('Screenshot upload was interrupted. Tap Retry upload, or remove it to send without it.');
  }
  const result = await invoke<{ attachment: SupportAttachment }>('together-ops', {
    action: 'support_attachment',
    operation: 'confirm',
    id: row.id,
    expectedUserId,
  });
  if (result.attachment.status !== 'ready') throw new Error('Screenshot is not ready. Tap Retry upload.');
  return result.attachment;
}
export async function finishSupportScreenshots(rows: DraftScreenshot[], expectedUserId: string) {
  return await Promise.all(rows.map(async (row) => {
    if (!row.ready) await uploadSupportScreenshot(row, expectedUserId);
    return { ...row, ready: true };
  }));
}
export const refreshScreenshots = (ids: string[], expectedUserId: string) =>
  invoke<{ attachments: SupportAttachment[] }>('together-ops', {
    action: 'support_attachment',
    operation: 'list',
    ids,
    expectedUserId,
  });
export const removeScreenshot = (id: string, expectedUserId: string) =>
  invoke('together-ops', { action: 'support_attachment', operation: 'remove', id, expectedUserId });
