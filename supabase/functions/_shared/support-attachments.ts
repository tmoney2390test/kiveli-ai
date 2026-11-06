import type { adminClient } from './context.ts';
import { enforceRateLimit } from './context.ts';
import { AppError } from './types.ts';
type Db = ReturnType<typeof adminClient>;
export const SUPPORT_BUCKET = 'kivelli-support-attachments';
const fields =
  'id,user_id,storage_path,byte_size,width,height,status,ticket_id,reply_id,expires_at';
type Attachment = {
  id: string;
  user_id: string;
  storage_path: string;
  byte_size: number;
  width: number;
  height: number;
  status: string;
  ticket_id: string | null;
  reply_id: string | null;
  expires_at: string;
};
const unavailable = () =>
  new AppError('NOT_FOUND', 'That screenshot is unavailable. Remove it and attach it again.', 404);
const storageError = () =>
  new AppError('INTERNAL_ERROR', 'The screenshot could not be loaded. Try again.', 500, true);

/** Bounds-checked JPEG dimensions. HTML/SVG, truncated files and huge images fail closed. */
export function supportJpegDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (
    bytes.length < 12 || bytes.length > 5242880 || bytes[0] !== 255 || bytes[1] !== 216 ||
    bytes.at(-2) !== 255 || bytes.at(-1) !== 217
  ) throw new Error('INVALID_SCREENSHOT');
  let i = 2;
  while (i + 4 < bytes.length) {
    if (bytes[i++] !== 255) throw new Error('INVALID_SCREENSHOT');
    while (bytes[i] === 255) i++;
    const marker = bytes[i++];
    if (marker === undefined || i + 1 >= bytes.length) throw new Error('INVALID_SCREENSHOT');
    if (marker === 218 || marker === 217) break;
    const length = bytes[i]! * 256 + bytes[i + 1]!;
    if (length < 2 || i + length > bytes.length) throw new Error('INVALID_SCREENSHOT');
    if ([192, 193, 194].includes(marker)) {
      if (length < 8) throw new Error('INVALID_SCREENSHOT');
      const height = bytes[i + 3]! * 256 + bytes[i + 4]!,
        width = bytes[i + 5]! * 256 + bytes[i + 6]!;
      if (!width || !height || width > 2048 || height > 2048) throw new Error('INVALID_SCREENSHOT');
      return { width, height };
    }
    i += length;
  }
  throw new Error('INVALID_SCREENSHOT');
}

async function present(db: Db, row: Attachment) {
  let url: string | null = null;
  if (row.status === 'ready') {
    const signed = await db.storage.from(SUPPORT_BUCKET).createSignedUrl(row.storage_path, 900);
    // A storage outage must not hide the support conversation or block replies.
    url = signed.error ? null : signed.data?.signedUrl ?? null;
  }
  return {
    id: row.id,
    status: row.status,
    width: row.width,
    height: row.height,
    url,
    replyId: row.reply_id,
  };
}

export async function supportAttachmentAction(
  db: Db,
  userId: string,
  input: {
    operation: 'prepare' | 'confirm' | 'remove' | 'list';
    id?: string;
    ids?: string[];
    byteSize?: number;
    width?: number;
    height?: number;
  },
) {
  if (input.operation === 'list') {
    const rows = await db.from('together_support_attachments').select(fields).eq('user_id', userId)
      .in('id', input.ids ?? []).is('ticket_id', null).neq('status', 'removed').gt(
        'expires_at',
        new Date().toISOString(),
      );
    if (rows.error) throw storageError();
    return {
      attachments: await Promise.all(
        (rows.data ?? []).map((row) => present(db, row as Attachment)),
      ),
    };
  }
  if (!input.id) throw unavailable();
  let found = await db.from('together_support_attachments').select(fields).eq('id', input.id).eq(
    'user_id',
    userId,
  ).maybeSingle();
  if (found.error) throw storageError();
  if (input.operation === 'prepare' && !found.data) {
    if (!input.byteSize || !input.width || !input.height) {
      throw new AppError('VALIDATION_ERROR', 'Choose a screenshot first.', 400);
    }
    await enforceRateLimit(db, userId, 'support_screenshot', 24, 3600);
    const inserted = await db.from('together_support_attachments').insert({
      id: input.id,
      user_id: userId,
      request_id: input.id,
      storage_path: `${userId}/${input.id}.jpg`,
      byte_size: input.byteSize,
      width: input.width,
      height: input.height,
    });
    if (inserted.error && inserted.error.code !== '23505') throw storageError();
    found = await db.from('together_support_attachments').select(fields).eq('id', input.id).eq(
      'user_id',
      userId,
    ).maybeSingle();
  }
  const row = found.data as Attachment | null;
  if (
    !row || row.ticket_id || row.status === 'removed' || Date.parse(row.expires_at) <= Date.now()
  ) throw unavailable();
  if (input.operation === 'remove') {
    // Leave a tombstone until any issued upload token has expired. Cleanup also
    // removes a late upload that completed after the user removed the preview.
    const removed = await db.from('together_support_attachments').update({
      status: 'removed',
      expires_at: new Date(Date.now() + 3 * 3600000).toISOString(),
    }).eq('id', row.id).eq('user_id', userId).is('ticket_id', null);
    if (removed.error) throw storageError();
    return { removed: true };
  }
  if (input.operation === 'prepare') {
    if (
      row.byte_size !== input.byteSize || row.width !== input.width || row.height !== input.height
    ) throw new AppError('CONFLICT', 'Attach this screenshot again before sending.', 409);
    if (row.status === 'ready') return { attachment: await present(db, row) };
    const signed = await db.storage.from(SUPPORT_BUCKET).createSignedUploadUrl(row.storage_path, {
      upsert: false,
    });
    if (signed.error || !signed.data?.token) throw storageError();
    return {
      attachment: await present(db, row),
      upload: { bucket: SUPPORT_BUCKET, path: row.storage_path, token: signed.data.token },
    };
  }
  if (row.status !== 'ready') {
    const object = await db.storage.from(SUPPORT_BUCKET).download(row.storage_path);
    if (object.error || !object.data) throw storageError();
    try {
      if (object.data.size !== row.byte_size) throw new Error('INVALID_SCREENSHOT');
      const size = supportJpegDimensions(new Uint8Array(await object.data.arrayBuffer()));
      if (size.width !== row.width || size.height !== row.height) {
        throw new Error('INVALID_SCREENSHOT');
      }
    } catch {
      throw new AppError(
        'VALIDATION_ERROR',
        'That screenshot could not be read. Remove it and choose it again.',
        400,
      );
    }
    const updated = await db.from('together_support_attachments').update({ status: 'ready' }).eq(
      'id',
      row.id,
    ).eq('status', 'pending').is('ticket_id', null).select(fields).maybeSingle();
    if (updated.error) throw storageError();
    if (!updated.data) throw unavailable();
    return { attachment: await present(db, updated.data as Attachment) };
  }
  return { attachment: await present(db, row) };
}

/** Caller must first verify ticket ownership or the support operations role. */
export async function supportTicketAttachments(db: Db, ticketId: string) {
  const rows = await db.from('together_support_attachments').select(fields).eq(
    'ticket_id',
    ticketId,
  ).eq('status', 'ready').order('created_at');
  if (rows.error) throw storageError();
  return await Promise.all((rows.data ?? []).map((row) => present(db, row as Attachment)));
}
