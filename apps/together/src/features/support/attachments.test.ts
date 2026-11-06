import { afterEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ invoke: vi.fn(), upload: vi.fn() }));
vi.mock('../../lib/api', () => ({ invoke: api.invoke }));
vi.mock('../../lib/supabase', () => ({ supabase: { storage: { from: vi.fn() } } }));
vi.mock('../../lib/chatPhotoStorageUpload', () => ({ uploadPreparedChatPhoto: api.upload }));
import { finishSupportScreenshots, parseScreenshots, screenshotIds, uploadSupportScreenshot } from './attachments';
const id = '9e0cc390-fef9-4f65-b1c8-aa6414a3fb17';
const row = { id, width: 768, height: 1024, byteSize: 100, uri: 'blob:local', ready: false };
afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); vi.useRealTimers(); });
describe('support screenshot drafts', () => {
  it('restores only bounded local image metadata and deduplicates attachments', () => {
    expect(parseScreenshots('broken')).toEqual([]);
    expect(parseScreenshots(JSON.stringify([row, row, { ...row, id: 'bad' }]))).toEqual([row]);
    expect(
      parseScreenshots(
        JSON.stringify([{ ...row, uri: 'https://untrusted.invalid' }, { ...row, width: 99999 }]),
      ),
    ).toEqual([]);
    expect(screenshotIds(JSON.stringify([row]))).toEqual([]);
    expect(screenshotIds(JSON.stringify([{ ...row, ready: true }]))).toEqual([id]);
  });
  it('recovers a completed upload after losing the confirm response without fetching an expired local blob', async () => {
    api.invoke.mockResolvedValueOnce({
      attachment: { id, status: 'ready', url: 'https://storage.invalid/signed' },
    });
    const fetch = vi.spyOn(globalThis, 'fetch');
    const result = await uploadSupportScreenshot(row, 'owner');
    expect(result.status).toBe('ready');
    expect(fetch).not.toHaveBeenCalled();
    expect(api.upload).not.toHaveBeenCalled();
    expect(api.invoke).toHaveBeenCalledWith(
      'together-ops',
      expect.objectContaining({ id, expectedUserId: 'owner' }),
    );
    fetch.mockRestore();
  });
  it('recovers stale pending screenshots on send without uploading them twice', async () => {
    api.invoke.mockResolvedValueOnce({ attachment: { id, status: 'ready', url: null } });
    const fetch = vi.spyOn(globalThis, 'fetch');
    const another = { ...row, id: '1e0cc390-fef9-4f65-b1c8-aa6414a3fb17', ready: true };
    expect(await finishSupportScreenshots([row, another], 'owner')).toEqual([{ ...row, ready: true }, another]);
    expect(api.invoke).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(api.upload).not.toHaveBeenCalled();
  });
  it('keeps a failed screenshot in the draft instead of silently sending without it', async () => {
    api.invoke.mockRejectedValueOnce(new Error('Upload unavailable'));
    await expect(finishSupportScreenshots([row], 'owner')).rejects.toThrow('Upload unavailable');
    expect(row.ready).toBe(false);
  });
  it('releases a stalled upload and can retry the same attachment after the server accepted it', async () => {
    vi.useFakeTimers();
    api.invoke.mockImplementationOnce(() => new Promise(() => {}));
    const failed = expect(uploadSupportScreenshot(row, 'owner')).rejects.toThrow('Screenshot upload took too long');
    await vi.advanceTimersByTimeAsync(30000);
    await failed;
    api.invoke.mockResolvedValueOnce({ attachment: { id, status: 'ready', url: null } });
    expect((await uploadSupportScreenshot(row, 'owner')).status).toBe('ready');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('only treats a confirmed screenshot as attached', async () => {
    api.invoke.mockResolvedValueOnce({ attachment: { id, status: 'pending' }, upload: { bucket: 'support', path: id, token: 'fixture' } });
    api.invoke.mockResolvedValueOnce({ attachment: { id, status: 'pending' } });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Blob(['fixture'])));
    api.upload.mockResolvedValue(undefined);
    await expect(uploadSupportScreenshot(row, 'owner')).rejects.toThrow('Screenshot is not ready');
  });
});
