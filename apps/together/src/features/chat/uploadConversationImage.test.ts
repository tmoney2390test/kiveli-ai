import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  confirm: vi.fn(),
  upload: vi.fn(),
  bucket: vi.fn(),
}));
vi.mock(
  '../../lib/api/multimodal',
  () => ({ prepareUserImage: mocks.prepare, confirmUserImage: mocks.confirm }),
);
vi.mock('../../lib/chatPhotoStorageUpload', () => ({ uploadPreparedChatPhoto: mocks.upload }));
vi.mock('../../lib/supabase', () => ({ supabase: { storage: { from: mocks.bucket } } }));
import { uploadConversationImage } from './uploadConversationImage';
import { createChatRequestScope } from './requestScope';

const image = {
  uri: 'blob:local-photo',
  mimeType: 'image/jpeg' as const,
  byteSize: 1024,
  width: 100,
  height: 100,
  requestId: 'same-upload-request',
};
const prepared = {
  attachment: { id: 'attachment' },
  upload: { bucket: 'private', path: 'owned-path', token: 'signed-upload' },
};
const options = () => ({
  image,
  conversationId: 'conversation',
  characterInstanceId: 'character',
  text: 'caption',
  isCurrent: () => true,
  onPhase: vi.fn(),
  onPrepared: vi.fn(),
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.prepare.mockResolvedValue(prepared);
  mocks.confirm.mockResolvedValue({ attachment: { id: 'attachment', signed_url: null } });
  mocks.bucket.mockReturnValue('owned-storage');
  mocks.upload.mockResolvedValue(undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(new Blob(['photo'], { type: 'image/jpeg' })))),
  );
});
afterEach(() => vi.unstubAllGlobals());

it('uploads with the normalized MIME, signed destination, caption and original request ID', async () => {
  const callbacks = options();
  expect(await uploadConversationImage(callbacks)).toEqual({
    id: 'attachment',
    signed_url: image.uri,
  });
  expect(mocks.prepare).toHaveBeenCalledWith(
    expect.objectContaining({
      mimeType: 'image/jpeg',
      requestId: 'same-upload-request',
      conversationId: 'conversation',
    }),
  );
  expect(mocks.upload).toHaveBeenCalledWith(
    expect.objectContaining({
      storage: 'owned-storage',
      upload: prepared.upload,
      contentType: 'image/jpeg',
      body: expect.any(Blob),
    }),
  );
  expect(mocks.confirm).toHaveBeenCalledWith('attachment', 'caption');
  expect(callbacks.onPhase.mock.calls.flat()).toEqual([
    'preparing',
    'uploading',
    'processing',
    'sending',
  ]);
});

it('does not upload or confirm a photo after the user changes Life during preparation', async () => {
  const scope = createChatRequestScope();
  mocks.prepare.mockImplementation(() => {
    scope.dispose();
    return Promise.resolve(prepared);
  });
  expect(await uploadConversationImage({ ...options(), isCurrent: scope.capture() })).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.confirm).not.toHaveBeenCalled();
});

it('does not confirm under a new account when the old upload finishes', async () => {
  const scope = createChatRequestScope();
  mocks.upload.mockImplementation(() => {
    scope.dispose();
    return Promise.resolve();
  });
  expect(await uploadConversationImage({ ...options(), isCurrent: scope.capture() })).toBeNull();
  expect(mocks.confirm).not.toHaveBeenCalled();
});

it('leaves failure handling to the caller and never retries a charged analysis', async () => {
  mocks.confirm.mockRejectedValue(new Error('analysis unavailable'));
  const callbacks = options();
  await expect(uploadConversationImage(callbacks)).rejects.toThrow('analysis unavailable');
  expect(mocks.confirm).toHaveBeenCalledTimes(1);
  expect(callbacks.onPrepared).toHaveBeenCalledWith('attachment');
  expect(callbacks.onPhase).not.toHaveBeenCalledWith('sending');
});
