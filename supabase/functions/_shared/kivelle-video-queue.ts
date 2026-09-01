export type QueuedVideo = {
  id: string;
  created_at: string;
  queue_priority?: number | null;
  next_attempt_at?: string | null;
};

export function effectiveVideoQueuePriority(row: QueuedVideo, now = Date.now()): number {
  const ageMinutes = Math.max(0, Math.floor((now - new Date(row.created_at).getTime()) / 60_000));
  return Number(row.queue_priority ?? 0) + Math.min(40, ageMinutes);
}

export function orderedVideoQueue(rows: QueuedVideo[], now = Date.now()): QueuedVideo[] {
  return [...rows].sort((left, right) => {
    const priority = effectiveVideoQueuePriority(right, now) - effectiveVideoQueuePriority(left, now);
    if (priority) return priority;
    const created = new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    return created || left.id.localeCompare(right.id);
  });
}

export function estimatedVideoQueueWaitSeconds(position: number, medianGenerationSeconds: number, globalInflight: number): number {
  if (position <= 0) return 0;
  const waves = Math.ceil(position / Math.max(1, globalInflight));
  return Math.max(15, waves * Math.max(15, medianGenerationSeconds));
}

export function videoQueueProgressLabel(input: { position: number; estimatedWaitSeconds: number }): string {
  const ahead = Math.max(0, input.position - 1);
  const wait = input.estimatedWaitSeconds < 90
    ? 'about a minute'
    : input.estimatedWaitSeconds < 3_600
    ? `about ${Math.max(2, Math.round(input.estimatedWaitSeconds / 60))} minutes`
    : `about ${Math.round(input.estimatedWaitSeconds / 3_600)} hours`;
  return `${ahead === 0 ? 'Next in queue' : `${ahead} ahead`} · ${wait}`;
}
