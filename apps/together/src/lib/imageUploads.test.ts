import { describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ read: vi.fn<() => Promise<ArrayBuffer>>() }));

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-file-system', () => ({ File: class { arrayBuffer() { return native.read(); } } }));
vi.mock('expo-image-manipulator', () => ({ manipulateAsync: vi.fn(), SaveFormat: { JPEG: 'jpeg' } }));
vi.mock('expo-image-picker', () => ({ UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' } }));

import { readNormalizedUserImageBytes } from './imageUploads';

describe('native normalized image bytes', () => {
  it('reads a JPEG from the device file rather than a text/plain fetch Blob', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0x01, 0xff, 0xd9]).buffer;
    native.read.mockResolvedValueOnce(jpeg);
    const fetchImage = vi.spyOn(globalThis, 'fetch');
    expect(await readNormalizedUserImageBytes('file:///photo.jpg')).toBe(jpeg);
    expect(fetchImage).not.toHaveBeenCalled();
    fetchImage.mockRestore();
  });

  it('rejects non-JPEG file contents before dispatching an upload', async () => {
    native.read.mockResolvedValueOnce(new TextEncoder().encode('not an image').buffer);
    await expect(readNormalizedUserImageBytes('file:///photo.jpg')).rejects.toThrow('could not be read');
  });
});
