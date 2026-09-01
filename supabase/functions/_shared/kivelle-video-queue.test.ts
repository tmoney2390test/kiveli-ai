import { assertEquals } from 'jsr:@std/assert@1';
import { effectiveVideoQueuePriority, estimatedVideoQueueWaitSeconds, orderedVideoQueue, videoQueueProgressLabel } from './kivelle-video-queue.ts';

Deno.test('video queue orders tier priority first and ages older work', () => {
  const now = Date.parse('2026-09-01T12:30:00Z');
  const rows = [
    { id: 'free-old', created_at: '2026-09-01T12:10:00Z', queue_priority: 0 },
    { id: 'plus-new', created_at: '2026-09-01T12:29:00Z', queue_priority: 10 },
    { id: 'max-new', created_at: '2026-09-01T12:29:30Z', queue_priority: 20 },
  ];
  assertEquals(effectiveVideoQueuePriority(rows[0]!, now), 20);
  assertEquals(orderedVideoQueue(rows, now).map((row) => row.id), ['free-old', 'max-new', 'plus-new']);
});

Deno.test('video queue estimates waves from the global capacity', () => {
  assertEquals(estimatedVideoQueueWaitSeconds(1, 45, 4), 45);
  assertEquals(estimatedVideoQueueWaitSeconds(5, 45, 4), 90);
  assertEquals(videoQueueProgressLabel({ position: 5, estimatedWaitSeconds: 90 }), '4 ahead · about 2 minutes');
});
