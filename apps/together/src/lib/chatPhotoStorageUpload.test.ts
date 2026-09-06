import { describe, expect, it, vi } from 'vitest';
import { uploadPreparedChatPhoto, type ChatPhotoStorageBucket } from './chatPhotoStorageUpload';

const body = new Blob(['photo'], { type: 'image/jpeg' });

function storage(input: {
  signed?: Array<{ error: unknown }>;
  direct?: Array<{ error: unknown }>;
}) {
  const signed = vi.fn(() => Promise.resolve(input.signed?.shift() ?? { error: null }));
  const direct = vi.fn(() => Promise.resolve(input.direct?.shift() ?? { error: null }));
  return {
    client: { uploadToSignedUrl: signed, upload: direct } as ChatPhotoStorageBucket,
    signed,
    direct,
  };
}

describe('chat photo storage upload', () => {
  it('uses the server-issued signed upload token when available', async () => {
    const target = storage({});
    await uploadPreparedChatPhoto({ storage: target.client, upload: { bucket: 'private', path: 'user/photo.jpg', token: 'signed-token' }, body, contentType: 'image/jpeg' });
    expect(target.signed).toHaveBeenCalledWith('user/photo.jpg', 'signed-token', body, { contentType: 'image/jpeg' });
    expect(target.direct).not.toHaveBeenCalled();
  });

  it('uses an insert-only upload with an older prepare response', async () => {
    const target = storage({});
    await uploadPreparedChatPhoto({ storage: target.client, upload: { bucket: 'private', path: 'user/photo.jpg' }, body, contentType: 'image/jpeg' });
    expect(target.direct).toHaveBeenCalledWith('user/photo.jpg', body, { contentType: 'image/jpeg', upsert: false });
  });

  it('retries one interrupted upload and accepts an idempotent duplicate', async () => {
    const target = storage({ signed: [{ error: new TypeError('Failed to fetch') }, { error: { statusCode: 409, message: 'The resource already exists' } }] });
    await uploadPreparedChatPhoto({ storage: target.client, upload: { bucket: 'private', path: 'user/photo.jpg', token: 'signed-token' }, body, contentType: 'image/jpeg', retryDelayMs: 0 });
    expect(target.signed).toHaveBeenCalledTimes(2);
  });

  it('does not retry a permissions failure', async () => {
    const target = storage({ signed: [{ error: { statusCode: 403, message: 'Forbidden' } }] });
    await expect(uploadPreparedChatPhoto({ storage: target.client, upload: { bucket: 'private', path: 'user/photo.jpg', token: 'signed-token' }, body, contentType: 'image/jpeg', retryDelayMs: 0 })).rejects.toThrow('Check your connection');
    expect(target.signed).toHaveBeenCalledTimes(1);
  });
});
