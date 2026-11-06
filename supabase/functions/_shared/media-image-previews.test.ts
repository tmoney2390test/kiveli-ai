import { assertEquals } from 'jsr:@std/assert@1';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createImagePreviewSigner,
  IMAGE_PREVIEW_TRANSFORM,
  imagePreviewUrl,
} from './media-image-previews.ts';
import { signProjectedAttachments } from './content-projection.ts';

const image = (path: string, overrides: Record<string, unknown> = {}) => ({
  media_type: 'image',
  status: 'ready',
  storage_path: path,
  visibility_scope: 'all',
  content_rating: 'safe',
  created_at: '2026-10-26T00:00:00Z',
  ...overrides,
});
function fakeStorage(
  sign: (path: string) => Promise<{ data: { signedUrl: string } | null; error: unknown }>,
) {
  return {
    storage: {
      from(bucket: string) {
        assertEquals(bucket, 'together-user-media');
        return {
          createSignedUrl(path: string, lifetime: number, options: unknown) {
            assertEquals(lifetime, 900);
            assertEquals(options, { transform: IMAGE_PREVIEW_TRANSFORM });
            return sign(path);
          },
          async createSignedUrls(paths: string[]) {
            return {
              data: paths.map((path) => ({
                path,
                signedUrl: `https://storage.test/original/${path}`,
              })),
            };
          },
        };
      },
    },
  } as unknown as SupabaseClient;
}
const signed = async (path: string) => ({
  data: { signedUrl: `https://storage.test/preview/${path}` },
  error: null,
});

Deno.test('signs ready safe images and uploaded attachments, never restricted or incomplete assets', async () => {
  const paths: string[] = [];
  const db = fakeStorage((path) => {
    paths.push(path);
    return signed(path);
  });
  const result = await createImagePreviewSigner()(db, [
    image('safe'),
    image('safe'),
    image('suggestive', { content_rating: 'suggestive' }),
    image('restricted', { content_rating: 'explicit', visibility_scope: 'web_adult' }),
    image('unknown', { content_rating: null }),
    image('queued', { status: 'queued' }),
    image('video', { media_type: 'video' }),
    image('voice', { media_type: 'voice_note' }),
    {
      kind: 'image',
      upload_status: 'uploaded',
      storage_path: 'upload',
      content_rating: 'safe',
      visibility_scope: 'all',
    },
  ]);
  assertEquals(paths.sort(), ['safe', 'suggestive', 'upload']);
  assertEquals(result.size, 3);
});

Deno.test('deduplicates signing across refreshes and rotates previews before their URLs expire', async () => {
  const calls: string[] = [];
  const db = fakeStorage(async (path) => {
    calls.push(path);
    await Promise.resolve();
    return signed(`${path}/${calls.length}`);
  });
  const sign = createImagePreviewSigner();
  const rows = [image('same')];
  const [a, b] = await Promise.all([sign(db, rows, 0), sign(db, rows, 0)]);
  assertEquals(calls.length, 1);
  assertEquals(a.get('same'), b.get('same'));
  await sign(db, rows, 9 * 60_000);
  assertEquals(calls.length, 1);
  await sign(db, rows, 10 * 60_000);
  assertEquals(calls.length, 2);
  await sign(db, [image('same', { metadata: { providerJobId: 'replacement' } })], 10 * 60_000);
  assertEquals(calls.length, 3, 'Replacement bytes require a new preview');
});

Deno.test('limits signing concurrency and tolerates transformation failures', async () => {
  let active = 0, peak = 0;
  const db = fakeStorage(async (path) => {
    active++;
    peak = Math.max(active, peak);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    if (path === '0') throw new Error('Unavailable');
    if (path === '1') return { data: null, error: { message: 'Transforms unavailable' } };
    return signed(path);
  });
  const result = await createImagePreviewSigner()(
    db,
    Array.from({ length: 24 }, (_, i) => image(String(i))),
  );
  assertEquals(peak, 8);
  assertEquals(result.size, 22);
  assertEquals(result.has('0'), false);
});

Deno.test('restricted previews reuse only a previously authorized grant', () => {
  const restricted = image('private', {
    content_rating: 'explicit',
    visibility_scope: 'web_adult',
  });
  const previews = new Map([['private', 'https://storage.test/should-not-leak']]);
  assertEquals(imagePreviewUrl(restricted, null, previews), null);
  assertEquals(
    imagePreviewUrl(restricted, 'https://storage.test/original/private', previews),
    null,
  );
  const original = 'https://app.test/functions/v1/together-adult-asset?grant=authorized';
  assertEquals(imagePreviewUrl(restricted, original, previews), `${original}&variant=preview`);
  assertEquals(imagePreviewUrl({ ...restricted, media_type: 'video' }, original, previews), null);
});

Deno.test('slow signing cannot block the response or launch an unbounded backlog', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const db = fakeStorage(async (path) => {
    calls++;
    await gate;
    return signed(path);
  });
  const sign = createImagePreviewSigner();
  const rows = Array.from({ length: 24 }, (_, i) => image(`slow-${i}`));
  const result = await sign(db, rows, Date.now(), 1);
  assertEquals(result.size, 0, 'Originals can be returned while the preview service is slow');
  assertEquals(calls, 8);
  release();
  const warmed = await sign(db, rows.slice(0, 8));
  assertEquals(warmed.size, 8);
  assertEquals(calls, 8, 'The timed-out request must not launch its remaining queue');
  assertEquals(
    result.size,
    0,
    'Returned results must remain stable after background signing finishes',
  );
});

Deno.test('attachment projection preserves the original, strips private paths, and fails closed', async () => {
  const db = fakeStorage(signed);
  const rows = [{
    id: 'message',
    together_conversation_attachments: [
      image('attachment', { id: 'safe', kind: 'image', upload_status: 'uploaded' }),
      image('restricted', {
        id: 'adult',
        kind: 'image',
        upload_status: 'uploaded',
        content_rating: 'explicit',
        visibility_scope: 'web_adult',
        preview_url: 'https://untrusted.test/leak',
      }),
    ],
  }];
  const projected = await signProjectedAttachments(db, rows, false);
  const attachments = projected[0]!.together_conversation_attachments as Record<string, unknown>[];
  assertEquals(attachments.length, 1);
  assertEquals(attachments[0]!.signed_url, 'https://storage.test/original/attachment');
  assertEquals(attachments[0]!.preview_url, 'https://storage.test/preview/attachment');
  assertEquals(attachments[0]!.storage_path, undefined);
});
