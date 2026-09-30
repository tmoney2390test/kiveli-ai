import { assertEquals } from 'jsr:@std/assert@1';
import { mediaProgressStage, withMediaProgress } from './media-progress.ts';

Deno.test('media stages follow authoritative state and never turn an old job into a failure', () => {
  const now = Date.parse('2026-09-29T12:00:00Z');
  assertEquals(mediaProgressStage({ status: 'queued', created_at: '2020-01-01' }), 'queued');
  assertEquals(mediaProgressStage({ status: 'queued', next_attempt_at: '2026-09-29T12:01:00Z' }, undefined, now), 'retrying');
  assertEquals(mediaProgressStage({ status: 'generating' }), 'preparing');
  assertEquals(mediaProgressStage({ status: 'generating' }, { status: 'submitting' }), 'generating');
  assertEquals(mediaProgressStage({ status: 'generating' }, { status: 'processing' }), 'generating');
  assertEquals(mediaProgressStage({ status: 'generating' }, { status: 'processing', finalization_lease_expires_at: '2026-09-29T12:01:00Z' }, now), 'finalizing');
  assertEquals(mediaProgressStage({ status: 'ready' }, { status: 'processing' }), 'ready');
  assertEquals(mediaProgressStage({ status: 'failed' }, { provider_completed_at: '2026-09-29' }), 'failed');
});

Deno.test('batch progress uses newest owner-scoped job, returns no provider details, and skips reads for finished media', async () => {
  const calls: unknown[][] = [];
  const query: any = { select: (...args: unknown[]) => { calls.push(['select', ...args]); return query; },
    eq: (...args: unknown[]) => { calls.push(['eq', ...args]); return query; },
    in: (...args: unknown[]) => { calls.push(['in', ...args]); return query; },
    order: () => Promise.resolve({ data: [
      { generated_media_id: 'photo', status: 'processing', provider_completed_at: '2026-09-29' },
      { generated_media_id: 'photo', status: 'failed' },
    ] }) };
  const db = { from: () => query };
  assertEquals(await withMediaProgress(db, 'owner', [{ id: 'photo', status: 'generating' }]), [{ id: 'photo', status: 'generating', progress_stage: 'finalizing' }]);
  assertEquals(calls.some(call => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'owner'), true);
  calls.length = 0;
  await withMediaProgress(db, 'owner', [{ id: 'photo', status: 'ready' }]);
  assertEquals(calls.length, 0);
});
